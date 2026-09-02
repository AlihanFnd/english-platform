using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using EnglishReadingPlatform.Authorization;
using EnglishReadingPlatform.Contracts;
using EnglishReadingPlatform.Data;
using EnglishReadingPlatform.Models;
using EnglishReadingPlatform.RateLimiting;
using EnglishReadingPlatform.Services;
using EnglishReadingPlatform.Validation;
using System.ComponentModel.DataAnnotations;

namespace EnglishReadingPlatform.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class GroupsController : ControllerBase
    {
        private readonly AppDbContext _db;

        public GroupsController(AppDbContext db)
        {
            _db = db;
        }

        // KURAL-05: claim de bir GİRDİDİR. int.Parse(...!) bozuk bir claim'de
        // FormatException/NullReferenceException fırlatıp 500 üretirdi.
        private int CurrentUserId => this.KullaniciId();

        // GET /api/groups
        [HttpGet]
        public async Task<IActionResult> Index()
        {
            var userId = CurrentUserId;

            // KURAL-08: davet kodu SORGUDA koşullanır. "Önce hepsini çek, sonra
            // gereksizi ayıkla" deseni unutulmaya açıktır; koşul projeksiyonda
            // olduğunda kod, sahibi olmayan kullanıcı için veritabanından hiç okunmaz.
            // Include + bellek içi Select yerine .Select() projeksiyonu: yalnızca
            // gereken kolonlar SQL'e iner, entity graf'ı belleğe hiç gelmez.
            var myGroups = await _db.GroupMembers
                .Where(gm => gm.UserId == userId)
                .Select(gm => gm.Group)
                .Select(g => new GrupOzetYaniti(
                    g.Id,
                    g.Name,
                    g.Description,
                    g.AdminUserId == userId ? g.InviteCode : null,
                    g.AdminUserId == userId,
                    g.Members.Count,
                    g.BookAssignments
                        .Select(a => new AtananKitapYaniti(a.BookId, a.Book.Title))
                        .ToList()))
                .ToListAsync();

            var adminGroups = await _db.Groups
                .Where(g => g.AdminUserId == userId)
                .Select(g => new GrupOzetYaniti(
                    g.Id,
                    g.Name,
                    g.Description,
                    // Bu sorgu zaten yalnızca sahibi olunan grupları döner; koşul yine de
                    // SATIR İÇİNDE tekrarlanıyor ki kapı (08-veri-minimizasyonu.sh)
                    // "koşulsuz davet kodu" aramasını makineyle yapabilsin. Bir gün
                    // yukarıdaki Where kaldırılırsa kod yine de sızmaz.
                    g.AdminUserId == userId ? g.InviteCode : null,
                    true,
                    g.Members.Count,
                    g.BookAssignments
                        .Select(a => new AtananKitapYaniti(a.BookId, a.Book.Title))
                        .ToList()))
                .ToListAsync();

            return Ok(new { MyGroups = myGroups, AdminGroups = adminGroups });
        }

        public class CreateGroupRequest
        {
            [Required(ErrorMessage = "Grup adı zorunludur.")]
            [StringLength(AlanSinirlari.GrupAdi, MinimumLength = 1,
                ErrorMessage = "Grup adı en fazla {1} karakter olabilir.")]
            public string Name { get; set; } = "";

            [StringLength(AlanSinirlari.GrupAciklama,
                ErrorMessage = "Açıklama en fazla {1} karakter olabilir.")]
            public string Description { get; set; } = "";
        }

        // POST /api/groups
        [HttpPost]
        [EnableRateLimiting(HizSinirlari.Yazma)]   // KURAL-07: YENİ — sınırsız grup açılabiliyordu
        public async Task<IActionResult> Create([FromBody] CreateGroupRequest req)
        {
            if (req == null || string.IsNullOrWhiteSpace(req.Name))
            {
                return BadRequest(new { error = "Grup adı zorunludur." });
            }

            var group = new Group
            {
                Name = req.Name.KirpEnCok(AlanSinirlari.GrupAdi),
                Description = req.Description.KirpEnCok(AlanSinirlari.GrupAciklama),
                AdminUserId = CurrentUserId,
                InviteCode = Guid.NewGuid().ToString("N")[..8].ToUpper(),
                CreatedAt = DateTime.UtcNow
            };

            _db.Groups.Add(group);
            await _db.SaveChangesAsync();

            // Admin'i üye olarak da ekle
            _db.GroupMembers.Add(new GroupMember
            {
                GroupId = group.Id,
                UserId = CurrentUserId,
                Role = "admin",
                JoinedAt = DateTime.UtcNow
            });
            await _db.SaveChangesAsync();

            // KURAL-08: entity yerine DTO. Group entity'si AdminUserId ve Admin
            // navigasyonunu taşır; kuruculuk bilgisi bayrakla, kimlikle değil verilir.
            return Ok(new GrupOzetYaniti(
                group.Id, group.Name, group.Description,
                GrupKapsami.DavetKodu(group, CurrentUserId),   // kurucu = sahip, kodu görmeli
                true,
                1,
                Array.Empty<AtananKitapYaniti>()));
        }

        public class JoinGroupRequest
        {
            // Üretilen kod 8 karakterlik hex; 32 rahat bir üst sınır.
            [Required(ErrorMessage = "Davet kodu zorunludur.")]
            [StringLength(AlanSinirlari.DavetKodu, MinimumLength = 1,
                ErrorMessage = "Davet kodu en fazla {1} karakter olabilir.")]
            public string InviteCode { get; set; } = "";
        }

        // POST /api/groups/join
        //
        // KURAL-07 ANA REGRESYON: burada HİÇ sınır yoktu. Davet kodu 8 karakterlik
        // hex (Guid'in ilk 8 hanesi) — sınırsız deneme hakkıyla kaba kuvvetle
        // bulunabilir ve saldırgan bir sınıfın grubuna sızabilirdi.
        [HttpPost("join")]
        [EnableRateLimiting(HizSinirlari.DavetKodu)]   // KURAL-07: YENİ KORUMA
        public async Task<IActionResult> Join([FromBody] JoinGroupRequest req)
        {
            if (req == null || string.IsNullOrWhiteSpace(req.InviteCode))
            {
                return BadRequest(new { error = "Davet kodu zorunludur." });
            }

            var group = await _db.Groups.FirstOrDefaultAsync(g => g.InviteCode == req.InviteCode.Trim().ToUpper());
            if (group == null)
            {
                return BadRequest(new { error = "Geçersiz davet kodu." });
            }

            var userId = CurrentUserId;
            var alreadyMember = await _db.GroupMembers.AnyAsync(m => m.GroupId == group.Id && m.UserId == userId);
            if (!alreadyMember)
            {
                _db.GroupMembers.Add(new GroupMember
                {
                    GroupId = group.Id,
                    UserId = userId,
                    Role = "member",
                    JoinedAt = DateTime.UtcNow
                });

                // KURAL-12: (GroupId, UserId) artık veritabanında TEKİL. Yukarıdaki
                // AnyAsync yarışta yanılır; aynı davet kodunu iki kez tıklayan
                // kullanıcı eskiden gruba İKİ kez üye oluyordu (üye sayısı şişiyor,
                // grup listesinde grup iki kez görünüyordu). Katılım idempotenttir.
                await _db.BenzersizKaydetAsync();
            }

            return Ok(new { success = true, groupId = group.Id, groupName = group.Name });
        }

        // GET /api/groups/{id}
        [HttpGet("{id}")]
        public async Task<IActionResult> GetGroupDetails([Range(1, int.MaxValue, ErrorMessage = "Geçersiz kayıt numarası.")] int id)
        {
            var kullaniciId = CurrentUserId;

            // TUZAK: BookAssignments Include EDİLMEZSE GrupKapsami.GorunurKitapIdleri
            // boş liste döner, hiçbir ilerleme görünmez ve "düzelttim" sanılır.
            // Members da GorebilirMi için şart.
            //
            // KURAL-08: ThenInclude(m => m.User) KASTEN YOK. Onunla birlikte üretilen
            // SQL, her üyenin User satırını — PasswordHash kolonu dâhil — sunucu
            // belleğine çekiyordu. Yanıta girmiyordu ama minimizasyon "sızdırma"
            // değil "gereksizi hiç alma" kuralıdır. Kullanıcı adları aşağıda ayrı
            // bir projeksiyonla, yalnızca Username kolonu okunarak alınıyor.
            var grup = await _db.Groups
                .Include(g => g.Members)           // UserId + Role: yetki ve kapsam için yeter
                .Include(g => g.BookAssignments)   // BookId: kapsam için yeter
                .FirstOrDefaultAsync(g => g.Id == id);

            if (grup == null) return NotFound(new { error = "Grup bulunamadı." });

            // KURAL-03: kim erişebilir. KURAL-08: eriştiğinde ne görür.
            if (!GrupKapsami.GorebilirMi(grup, kullaniciId)) return Forbid();

            // ── KURAL-08 KAPSAM FİLTRESİ ────────────────────────────────
            // Eskiden burada YALNIZCA "memberIds.Contains(...)" vardı: gruba katılan
            // herkes, diğer üyelerin gruptan bağımsız KİŞİSEL okuma geçmişini
            // görüyordu. Davet kodunu ele geçiren biri tüm sınıfın verisini
            // toplayabilirdi. Artık yalnızca gruba ATANMIŞ kitaplar görünür.
            var gorunurKitaplar = GrupKapsami.GorunurKitapIdleri(grup);
            var uyeIdleri = grup.Members.Select(m => m.UserId).ToList();
            var sahipMi = GrupKapsami.SahipMi(grup, kullaniciId);

            var ilerlemeler = await _db.ReadingProgresses
                .Where(p => uyeIdleri.Contains(p.UserId)
                         && gorunurKitaplar.Contains(p.BookId))          // ← KAPSAM
                .Select(p => new GrupIlerlemeYaniti(
                    p.UserId, p.User.Username, p.Book.Title,
                    p.ProgressPercent, p.CurrentChapter, p.LastRead))
                .ToListAsync();

            var quizSonuclari = await _db.QuizResults
                .Where(r => uyeIdleri.Contains(r.UserId)
                         && gorunurKitaplar.Contains(r.Quiz.BookId))     // ← KAPSAM
                .Select(r => new GrupQuizYaniti(
                    r.User.Username, r.Quiz.Book.Title, r.Quiz.Title,
                    r.Score, r.TotalQuestions, r.TakenAt))
                .ToListAsync();

            // AllBooks kasten kapsam DIŞIDIR: sahibin kitap atayabilmesi için tüm
            // katalogu görmesi gerekir ve başlıklar zaten /api/books ile açıktır.
            // Ama sıradan üyenin bu listeye grup bağlamında ihtiyacı yok — atama
            // formunu yalnızca sahip görüyor.
            var tumKitaplar = sahipMi
                ? await _db.Books
                    .OrderBy(b => b.Title)
                    .Select(b => new AtananKitapYaniti(b.Id, b.Title))
                    .ToListAsync()
                : new List<AtananKitapYaniti>();

            // Üye adları: yalnızca Username kolonu okunur (PasswordHash asla).
            var uyeler = await _db.GroupMembers
                .Where(m => m.GroupId == grup.Id)
                .Select(m => new UyeYaniti(m.UserId, m.User.Username, m.Role))
                .ToListAsync();

            var atananKitaplar = await _db.GroupBookAssignments
                .Where(a => a.GroupId == grup.Id)
                .Select(a => new AtananKitapYaniti(a.BookId, a.Book.Title))
                .ToListAsync();

            var ozet = new GrupOzetYaniti(
                grup.Id, grup.Name, grup.Description,
                GrupKapsami.DavetKodu(grup, kullaniciId),   // ← yalnızca sahibe
                sahipMi,
                grup.Members.Count,
                atananKitaplar);

            return Ok(new GrupDetayYaniti(
                ozet, uyeler, tumKitaplar, ilerlemeler, quizSonuclari));
        }

        public class AssignBookRequest
        {
            [Range(1, int.MaxValue, ErrorMessage = "Geçersiz grup.")]
            public int GroupId { get; set; }

            [Range(1, int.MaxValue, ErrorMessage = "Geçersiz kitap.")]
            public int BookId { get; set; }
        }

        // POST /api/groups/assignbook
        [HttpPost("assignbook")]
        [EnableRateLimiting(HizSinirlari.Yazma)]   // KURAL-07: YENİ
        public async Task<IActionResult> AssignBook([FromBody] AssignBookRequest req)
        {
            if (req == null) return BadRequest(new { error = "Geçersiz veri." });
            
            var userId = CurrentUserId;
            var group = await _db.Groups.FirstOrDefaultAsync(g => g.Id == req.GroupId && g.AdminUserId == userId);
            if (group == null) return Forbid();

            var already = await _db.GroupBookAssignments.AnyAsync(a => a.GroupId == req.GroupId && a.BookId == req.BookId);
            if (!already)
            {
                _db.GroupBookAssignments.Add(new GroupBookAssignment
                {
                    GroupId = req.GroupId,
                    BookId = req.BookId,
                    AssignedAt = DateTime.UtcNow
                });

                // KURAL-12: (GroupId, BookId) artık veritabanında TEKİL.
                // Atama idempotenttir: aynı kitabı iki kez atamak hata değildir.
                await _db.BenzersizKaydetAsync();
            }

            return Ok(new { success = true });
        }
    }

    // ─── Translate Controller ─────────────────────────────────────────────────
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class TranslateController : ControllerBase
    {
        private readonly TranslationService _transService;
        private readonly AppDbContext _db;

        public TranslateController(TranslationService transService, AppDbContext db)
        {
            _transService = transService;
            _db = db;
        }

        // KURAL-05: claim de bir GİRDİDİR. int.Parse(...!) bozuk bir claim'de
        // FormatException/NullReferenceException fırlatıp 500 üretirdi.
        private int CurrentUserId => this.KullaniciId();

        // KURAL-05: tek paylasilan record uc ucta birden kullaniliyordu. Tek sinir
        // koymak ya kelime ucuna 20.000 karakter kabul ettirir ya analiz ucunu
        // 300'de keser. Ayrica konumsal record parametrelerine oznitelik yazmak
        // ([property: ...]) okunmaz; dogrulanacak DTO'lar normal sinif yapildi.

        /// <summary>POST /api/translate/word — tek kelime veya kısa kalıp.</summary>
        public class KelimeCeviriIstegi
        {
            // Sınır TranslationCache.QueryText kolonundan (255) küçük seçildi:
            // bu değer önbelleğe ANAHTAR olarak yazılıyor.
            [Required(ErrorMessage = "Metin zorunludur.")]
            [StringLength(AlanSinirlari.CeviriKelime, MinimumLength = 1,
                ErrorMessage = "Kelime en fazla {1} karakter olabilir.")]
            public string Text { get; set; } = "";

            [StringLength(AlanSinirlari.CeviriBaglami,
                ErrorMessage = "Bağlam cümlesi en fazla {1} karakter olabilir.")]
            public string? Context { get; set; }

            public bool UseAI { get; set; }
        }

        /// <summary>POST /api/translate/sentence — tek cümle.</summary>
        public class CumleCeviriIstegi
        {
            [Required(ErrorMessage = "Metin zorunludur.")]
            [StringLength(AlanSinirlari.CeviriMetni, MinimumLength = 1,
                ErrorMessage = "Metin en fazla {1} karakter olabilir.")]
            public string Text { get; set; } = "";
        }

        /// <summary>POST /api/translate/analyze — sayfa/paragraf analizi (LLM maliyeti).</summary>
        public class MetinAnaliziIstegi
        {
            [Required(ErrorMessage = "Metin zorunludur.")]
            [StringLength(AlanSinirlari.CeviriMetni, MinimumLength = 1,
                ErrorMessage = "Metin en fazla {1} karakter olabilir.")]
            public string Text { get; set; } = "";
        }

        [HttpPost("word")]
        [EnableRateLimiting(HizSinirlari.Ceviri)]   // KURAL-07: elle yazılan sayaçtan devralındı
        public async Task<IActionResult> Word([FromBody] KelimeCeviriIstegi req)
        {
            if (string.IsNullOrWhiteSpace(req.Text)) return Ok(new { translation = "" });

            var clean = System.Text.RegularExpressions.Regex.Replace(req.Text, @"[^a-zA-Z0-9'\ -]", "").Trim().ToLower();
            var cleanContext = req.Context?.Trim().ToLower();

            // Eğer yapay zeka zorlandıysa (UseAI = true) ve bu kelime önbellekte yoksa günlük limiti sorgula
            if (req.UseAI && !string.IsNullOrWhiteSpace(req.Context))
            {
                var cachedExists = await _db.TranslationCaches.AnyAsync(tc => tc.QueryText == clean && tc.ContextText == cleanContext);
                if (!cachedExists)
                {
                    var todayUtc = DateTime.UtcNow.Date;
                    var aiCount = await _db.UserActivityLogs.CountAsync(log => 
                        log.UserId == CurrentUserId && 
                        log.ActivityType == "ai_word_translation" && 
                        log.Timestamp >= todayUtc);

                    if (aiCount >= 30)
                    {
                        return BadRequest(new { error = "Günlük 30 olan yapay zeka bağlamsal kelime çeviri limitinizi doldurdunuz." });
                    }

                    // Limit aşılmadıysa yeni log ekle
                    var activityLog = new UserActivityLog
                    {
                        UserId = CurrentUserId,
                        ActivityType = "ai_word_translation",
                        // KURAL-06: kullanıcının HANGİ kelimeleri bilmediği bir öğrenme
                        // profilidir — kişisel veridir ve kalıcı olarak saklanmasının
                        // hiçbir işlevsel karşılığı yoktu. Kota sayacı yalnızca
                        // ActivityType'a bakıyor (yukarıdaki CountAsync), Details'e değil.
                        // KURAL-05: sabit metin olduğu için varchar(200) taşması da imkânsız.
                        Details = "ai_kelime_cevirisi",
                        Timestamp = DateTime.UtcNow
                    };
                    _db.UserActivityLogs.Add(activityLog);
                    await _db.SaveChangesAsync();
                }
            }

            var r = await _transService.TranslateWordAsync(req.Text.Trim(), req.Context?.Trim(), req.UseAI);
            return Ok(new { 
                translation = r.Translation, 
                generalMeaning = r.GeneralMeaning,
                contextualMeaning = r.ContextualMeaning,
                synonyms = r.Synonyms,
                type = r.Type 
            });
        }

        [HttpPost("sentence")]
        [EnableRateLimiting(HizSinirlari.Ceviri)]   // KURAL-07: word ucuyla AYNI kovayı paylaşır
        public async Task<IActionResult> Sentence([FromBody] CumleCeviriIstegi req)
        {
            if (string.IsNullOrWhiteSpace(req.Text)) return Ok(new { translation = "", ceviriBasarili = true, kaynak = "yok" });

            // KURAL-06: çeviri başarısızsa servis ARTIK bunu söylüyor. Eskiden
            // İngilizce metin, Türkçe çevirisiymiş gibi 200 ile geri dönüyordu.
            var sonuc = await _transService.TranslateSentenceAsync(req.Text.Trim());
            return Ok(new { translation = sonuc.Metin, ceviriBasarili = sonuc.Basarili, kaynak = sonuc.Kaynak });
        }

        [HttpPost("analyze")]
        [EnableRateLimiting(HizSinirlari.AgirAnaliz)]   // KURAL-07: LLM maliyeti — en dar kova
        public async Task<IActionResult> Analyze([FromBody] MetinAnaliziIstegi req)
        {
            if (string.IsNullOrWhiteSpace(req.Text)) return BadRequest(new { error = "Metin boş." });

            // KURAL-06: buradaki catch, TranslationService'in fırlattığı
            // $"HTTP {durum} from Groq: {errContent}" metnini — yani Groq'un HAM
            // yanıt gövdesini — doğrudan istemciye yazıyordu. İstisna artık merkezî
            // HataYakalamaMiddleware'e gidiyor: kullanıcı genel mesaj + olay kimliği
            // alıyor, ayrıntı yalnızca sunucu loguna düşüyor.
            var sentences = await _transService.AnalyzeTextAsync(req.Text.Trim());
            if (!sentences.Any()) return BadRequest(new { error = "Metinde cümle bulunamadı." });

            return Ok(new { sentences });
        }
    }


    // ─── Dashboard (Home) Controller ──────────────────────────────────────────
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class DashboardController : ControllerBase
    {
        private readonly AppDbContext _db;

        public DashboardController(AppDbContext db)
        {
            _db = db;
        }

        // KURAL-05: claim de bir GİRDİDİR. int.Parse(...!) bozuk bir claim'de
        // FormatException/NullReferenceException fırlatıp 500 üretirdi.
        private int CurrentUserId => this.KullaniciId();

        // GET /api/dashboard/stats
        [HttpGet("stats")]
        public async Task<IActionResult> Stats()
        {
            var userId = CurrentUserId;
            var user = await _db.Users.FindAsync(userId);
            if (user == null) return NotFound(new { error = "Kullanıcı bulunamadı." });

            // KURAL-08: Include(p => p.Book) tüm Book satırını (açıklama dâhil)
            // belleğe çekiyordu; gereken tek alan başlıktı.
            var recentProgress = await _db.ReadingProgresses
                .Where(p => p.UserId == userId)
                .OrderByDescending(p => p.LastRead)
                .Take(3)
                .Select(p => new
                {
                    p.BookId,
                    BookTitle = p.Book.Title,
                    p.ProgressPercent,
                    p.CurrentChapter,
                    p.LastRead
                })
                .ToListAsync();

            var wordCount = await _db.WordListItems.CountAsync(w => w.UserId == userId);
            var quizCount = await _db.QuizResults.CountAsync(r => r.UserId == userId);

            return Ok(new
            {
                // KURAL-08: kendi bilgisi — DTO ile. Entity'nin PasswordHash'i
                // buraya kazayla bile giremez.
                User = new KullaniciYaniti(user.Id, user.Username, user.Email, user.Role),
                RecentProgress = recentProgress,
                WordCount = wordCount,
                QuizCount = quizCount
            });
        }

        // GET /api/dashboard/ocr
        [HttpGet("ocr")]
        public async Task<IActionResult> OCR()
        {
            var userId = CurrentUserId;

            // KURAL-08: OcrRecord entity'si User navigasyonu ve ImagePath (sunucu
            // dosya yolu) taşır. Projeksiyon SQL'e iner: o kolonlar hiç okunmaz.
            var kayitlar = await _db.OcrRecords
                .Where(r => r.UserId == userId)
                .OrderByDescending(r => r.ScannedAt)
                .Select(r => new OcrYaniti(r.Id, r.ExtractedText, r.ScannedAt))
                .ToListAsync();
            return Ok(kayitlar);
        }

        public class SaveOcrRequest
        {
            // Kolon 'text' — taşma yok, ama sınırsız gövde bellek/depolama tüketir.
            [Required(ErrorMessage = "Metin boş olamaz.")]
            [StringLength(AlanSinirlari.OcrMetni, MinimumLength = 1,
                ErrorMessage = "Metin en fazla {1} karakter olabilir.")]
            public string Text { get; set; } = "";
        }

        // POST /api/dashboard/ocr
        [HttpPost("ocr")]
        [EnableRateLimiting(HizSinirlari.Yazma)]   // KURAL-07: YENİ — 50.000 karakterlik metin sınırsız kaydedilebiliyordu
        public async Task<IActionResult> SaveOcr([FromBody] SaveOcrRequest req)
        {
            if (req == null || string.IsNullOrWhiteSpace(req.Text))
            {
                return BadRequest(new { error = "Metin boş olamaz." });
            }

            var userId = CurrentUserId;
            var record = new OcrRecord
            {
                UserId = userId,
                ExtractedText = req.Text.Trim(),
                ScannedAt = DateTime.UtcNow
            };

            _db.OcrRecords.Add(record);
            await _db.SaveChangesAsync();

            // KURAL-08: entity yerine DTO — ImagePath ve User navigasyonu dönmez.
            return Ok(new OcrYaniti(record.Id, record.ExtractedText, record.ScannedAt));
        }

        // DELETE /api/dashboard/ocr/{id}
        //
        // KURAL-12: OCR kayıtları kullanıcının taradığı HAM METİNDİR — ders notu,
        // kimlik fotokopisi, bir mektup olabilir. Bu veriyi silmenin hiçbir yolu
        // yoktu: ne kullanıcı için bir uç, ne otomatik bir saklama süresi.
        // "Kullanıcı kendi verisini silebilir" bir saklama gereğidir.
        //
        // Sahiplik SORGUNUN İÇİNDE: Id tek başına yeterli olsaydı, sıradaki
        // sayı denenerek başkasının taradığı metin silinebilirdi (IDOR).
        [HttpDelete("ocr/{id}")]
        [EnableRateLimiting(HizSinirlari.Yazma)]
        public async Task<IActionResult> OcrSil(
            [Range(1, int.MaxValue, ErrorMessage = "Geçersiz kayıt numarası.")] int id)
        {
            var userId = CurrentUserId;
            var kayit = await _db.OcrRecords
                .FirstOrDefaultAsync(r => r.Id == id && r.UserId == userId);

            if (kayit is not null)
            {
                _db.OcrRecords.Remove(kayit);
                await _db.SaveChangesAsync();
            }

            // Idempotent VE kasıtlı olarak ayrım yapmaz: "kayıt yok" ile
            // "kayıt başkasının" aynı yanıtı döner. Farklı yanıtlar, başkasının
            // kaç kaydı olduğunu sayan bir numaralandırma aracı olurdu.
            return Ok(new { success = true });
        }
    }
}
