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
    public class BooksController : ControllerBase
    {
        private readonly AppDbContext _db;
        private readonly QuizGeneratorService _quizGen;
        private readonly TranslationService _transService;
        private readonly ISeriServisi _seriServisi;

        public BooksController(AppDbContext db, QuizGeneratorService quizGen, TranslationService transService, ISeriServisi seriServisi)
        {
            _db = db;
            _quizGen = quizGen;
            _transService = transService;
            _seriServisi = seriServisi;
        }

        // KURAL-05: claim de bir GİRDİDİR. int.Parse(...!) bozuk bir claim'de
        // FormatException/NullReferenceException fırlatıp 500 üretirdi.
        private int CurrentUserId => this.KullaniciId();

        /// <summary>
        /// Sayfanın analizi henüz üretilmemiş mi? Boş metin ya da "[]". Okuma ucu,
        /// boşluğu dolduran analiz ucu ve çevrimdışı toplu uç bu kuralı TEK yerden alır.
        /// (Toplu uç yalnızca boş metne bakıyordu; "[]" taşıyan analizsiz sayfalar —
        /// geliştirme verisinde 819 sayfanın 756'sı — çevrimdışına "hazır" diye iniyordu.)
        /// </summary>
        internal static bool AnalizBekliyorMu(string? sentencesJson)
            => string.IsNullOrWhiteSpace(sentencesJson) || sentencesJson.Trim() == "[]";

        /// <summary>
        /// KURAL-12: okuma ilerlemesini TEK satır olacak şekilde yazar.
        ///
        /// Eskiden bu mantık Read() içinde iki kez kopyalanmıştı ve tek savunması
        /// "önce FirstOrDefault, yoksa Add" idi. Aynı kullanıcı iki sekmede aynı
        /// kitabı açtığında iki istek de 'yok' cevabını alıp İKİ ilerleme satırı
        /// açıyordu; kitap panoda iki kez görünüyor, yüzdeler birbirini eziyordu.
        ///
        /// Artık (UserId, BookId) veritabanında tekil. Yarışı kaybeden istek
        /// benzersizlik ihlali alır, satırını izlemeden çıkarır ve kazananın
        /// açtığı satırı GÜNCELLEYEREK devam eder — kullanıcı hiçbir hata görmez.
        /// </summary>
        private async Task<(bool satirVardi, bool konumDegisti)> IlerlemeyiYazAsync(int kitapId, int konum, float yuzde)
        {
            var kullaniciId = CurrentUserId;

            var ilerleme = await _db.ReadingProgresses
                .FirstOrDefaultAsync(p => p.UserId == kullaniciId && p.BookId == kitapId);

            if (ilerleme is null)
            {
                _db.ReadingProgresses.Add(new ReadingProgress
                {
                    UserId = kullaniciId,
                    BookId = kitapId,
                    CurrentChapter = konum,
                    ProgressPercent = yuzde,
                    LastRead = DateTime.UtcNow
                });

                if (await _db.BenzersizKaydetAsync()) return (false, true);

                // Yarışı kaybettik: satırı bu arada başka bir istek açtı.
                ilerleme = await _db.ReadingProgresses
                    .FirstOrDefaultAsync(p => p.UserId == kullaniciId && p.BookId == kitapId);
                if (ilerleme is null) return (false, false);   // araya silme girdiyse sessizce geç
            }

            var konumDegisti = ilerleme.CurrentChapter != konum;
            ilerleme.CurrentChapter = konum;
            ilerleme.ProgressPercent = yuzde;
            ilerleme.LastRead = DateTime.UtcNow;
            await _db.SaveChangesAsync();

            return (true, konumDegisti);
        }

        // GET /api/books — Kitaplık
        [HttpGet]
        public async Task<IActionResult> Index()
        {
            var userId = CurrentUserId;

            // KURAL-08: Include(b => b.Chapters) tüm bölüm METİNLERİNİ belleğe
            // çekiyordu — kitaplık listesi için gereken tek şey adetti. Sayım
            // artık SQL'de yapılıyor: içerik hiç okunmuyor.
            var kitaplar = await _db.Books
                .Select(b => new
                {
                    b.Id, b.Title, b.Author, b.CoverColor, b.Description,
                    b.Level, b.Category,
                    ChaptersCount = b.Chapters.Count,
                    // PagesCount YENİ: sayfa modundaki kitapların Chapters'ı boştur;
                    // arayüz onları "1 Bölüm" diye gösteriyordu.
                    PagesCount = b.Pages.Count
                })
                .ToListAsync();

            var ilerlemeler = await _db.ReadingProgresses
                .Where(p => p.UserId == userId)
                .Select(p => new { p.BookId, p.ProgressPercent, p.CurrentChapter })
                .ToListAsync();

            var sonuc = kitaplar.Select(b =>
            {
                var i = ilerlemeler.FirstOrDefault(p => p.BookId == b.Id);
                return new KitapYaniti(
                    b.Id, b.Title, b.Author, b.CoverColor, b.Description,
                    b.Level, b.Category, b.ChaptersCount, b.PagesCount,
                    i?.ProgressPercent ?? 0f, i?.CurrentChapter ?? 1);
            });

            return Ok(sonuc);
        }

        // GET /api/books/taxonomy — seviye/kategori/dil listeleri
        //
        // KURAL-05: taksonomi üç yerde ayrı tanımlıydı (backend whitelist,
        // frontend LEVELS, admin-panel <option>). Ayrıştığı an yöneticinin
        // tamamen meşru bir seçimi 400 alır ve panel kitap kaydedemez hâle gelir.
        // Bu uç, whitelist'in KENDİSİNİ yayımlar: istemciler artık kopya tutmaz.
        //
        // Yetki: [Authorize] yeterli — burada kullanıcıya özel veri yok, yalnızca
        // istemcinin zaten göndermek zorunda olduğu sabit değer kümeleri var.
        [HttpGet("taxonomy")]
        public IActionResult Taxonomy() => Ok(new
        {
            Levels     = IzinliDegerler.Seviyeler,
            Categories = IzinliDegerler.Kategoriler,
            Languages  = IzinliDegerler.Diller
        });

        // GET /api/books/{id} — Kitap Detayı
        [HttpGet("{id}")]
        public async Task<IActionResult> GetBook([Range(1, int.MaxValue, ErrorMessage = "Geçersiz kayıt numarası.")] int id)
        {
            var book = await _db.Books
                .Include(b => b.Chapters)
                .Include(b => b.Pages)
                .FirstOrDefaultAsync(b => b.Id == id);

            if (book == null) return NotFound(new { error = "Kitap bulunamadı." });

            var hasPages = book.Pages.Any();
            return Ok(new {
                book.Id,
                book.Title,
                book.Author,
                book.CoverColor,
                book.Description,
                book.Level,
                book.Category,
                HasPages = hasPages,
                Chapters = book.Chapters.OrderBy(c => c.ChapterNumber).Select(c => new {
                    c.Id,
                    c.ChapterNumber,
                    c.Title
                }),
                Pages = book.Pages.OrderBy(p => p.PageNumber).Select(p => new {
                    p.Id,
                    p.PageNumber
                })
            });
        }

        // GET /api/books/{id}/read?chapter=1&page=1
        //
        // KURAL-05: SORGU PARAMETRESİ DE İSTEMCİ GİRDİSİDİR.
        // Bu iki değer doğrudan aritmetiğe girip ReadingProgress'e YAZILIYOR:
        //   ProgressPercent = (float)page / toplam * 100
        // Doğrulama olmadan ?chapter=-999999 isteği 200 dönüyor ve veritabanına
        // progressPercent = -49999950 yazıyordu. Envanterde olmayan bir noktaydı.
        // 'chapter' ve 'page' artık NULLABLE: verilmezse KALDIĞI YERDEN devam eder.
        //
        // Eskiden ikisi de 1 varsayılanıyla geliyordu; yani ilerleme her okumada
        // KAYDEDİLİYOR ama hiç OKUNMUYORDU. 300 sayfalık bir kitabı 120. sayfada
        // bırakan kullanıcı, kitabı her açtığında 1. sayfayı görüyordu.
        // GET /api/books/{id}/read?chapter=1&page=1
        //
        // ── KURAL-17: bu uç artık SALT OKUNUR. ──
        // Eskiden üç iş birden yapıyordu ve üçü de bir GET'in içindeydi:
        //   1) okuma ilerlemesini YAZIYORDU        → POST {id}/progress'e taşındı
        //   2) 'reanalyze=true' ile LLM ÇAĞIRIYORDU → POST {id}/reanalyze'a taşındı
        //   3) analiz boşsa LLM çağırıp PAYLAŞILAN satıra yazıyordu
        //                                          → POST {id}/analyze-page'e taşındı
        //
        // Neden önemli: çerez SameSite=Lax, üst düzey GET gezinmesinde gönderilir.
        // Kurbanı bir bağlantıyla bu uca yönlendirmek, onun hesabından Groq
        // maliyeti yaratmaya yetiyordu.
        [HttpGet("{id}/read")]
        [EnableRateLimiting(HizSinirlari.Okuma)]
        public async Task<IActionResult> Read(
            [Range(1, int.MaxValue, ErrorMessage = "Geçersiz kayıt numarası.")] int id,
            [FromQuery] [Range(1, int.MaxValue, ErrorMessage = "Bölüm numarası 1'den küçük olamaz.")] int? chapter = null,
            [FromQuery] [Range(1, int.MaxValue, ErrorMessage = "Sayfa numarası 1'den küçük olamaz.")] int? page = null)
        {
            var book = await _db.Books
                .Include(b => b.Chapters)
                .Include(b => b.Pages)
                .FirstOrDefaultAsync(b => b.Id == id);

            if (book == null) return NotFound(new { error = "Kitap bulunamadı." });

            var hasPages = book.Pages.Any();

            // ── Kaldığı yeri çöz ──
            // Kaydedilen konum CurrentChapter'da tutuluyor; sayfa modundaki
            // kitaplarda bu alan SAYFA numarasını taşır (Read'in kendi yazdığı
            // değer). Kullanıcı açıkça bir konum verdiyse ona saygı gösterilir.
            var okunanId = CurrentUserId;
            var kayitliKonum = await _db.ReadingProgresses
                .Where(p => p.UserId == okunanId && p.BookId == id)
                .Select(p => (int?)p.CurrentChapter)
                .FirstOrDefaultAsync();

            // Sınır dışına düşen kayıtlı konum sessizce kırpılır: kitap
            // yeniden yüklenip sayfa sayısı azalmış olabilir. Kırpmazsak
            // "Sayfa bulunamadı" ile kitabı hiç açamaz hâle gelir.
            static int Kirp(int deger, int enCok) => Math.Clamp(deger, 1, Math.Max(enCok, 1));

            if (hasPages)
                page ??= kayitliKonum is int k ? Kirp(k, book.Pages.Count) : 1;
            else
                chapter ??= kayitliKonum is int b ? Kirp(b, book.Chapters.Count) : 1;

            if (hasPages)
            {
                var sayfaNo = page!.Value;
                var currentPage = book.Pages.FirstOrDefault(p => p.PageNumber == sayfaNo)
                    ?? book.Pages.FirstOrDefault();

                if (currentPage == null) return NotFound(new { error = "Sayfa bulunamadı." });

                // KURAL-17: burada HİÇBİR ŞEY YAZILMAZ. İlerleme POST {id}/progress,
                // analiz POST {id}/analyze-page ile kaydedilir.
                return Ok(new {
                    BookId = book.Id,
                    BookTitle = book.Title,
                    HasPages = true,
                    CurrentPage = new {
                        currentPage.Id,
                        currentPage.PageNumber,
                        currentPage.Content,
                        currentPage.SentencesJson
                    },
                    TotalPages = book.Pages.Count,
                    // İstemci bu değerle adres çubuğunu eşitler; kaldığı yer
                    // buradan öğrenilir.
                    PageNumber = currentPage.PageNumber,
                    // KURAL-17: analiz artık bu uçta ÜRETİLMİYOR. İstemci bu
                    // bayrağı görünce POST {id}/analyze-page çağırır. Sessizce
                    // boş dizi döndürmek yerine SÖYLEMEK bilinçli: istemci
                    // "analiz yok" ile "analiz henüz üretilmedi"yi ayırt edebilmeli.
                    AnalizBekliyor = AnalizBekliyorMu(currentPage.SentencesJson)
                });
            }
            else
            {
                var bolumNo = chapter!.Value;
                var currentChapter = book.Chapters.FirstOrDefault(c => c.ChapterNumber == bolumNo)
                    ?? book.Chapters.FirstOrDefault();

                if (currentChapter == null) return NotFound(new { error = "Bölüm bulunamadı." });

                // KURAL-17: ilerleme burada YAZILMAZ — POST {id}/progress.
                return Ok(new {
                    BookId = book.Id,
                    BookTitle = book.Title,
                    HasPages = false,
                    CurrentChapter = new {
                        currentChapter.Id,
                        currentChapter.ChapterNumber,
                        currentChapter.Title,
                        currentChapter.Content
                    },
                    TotalChapters = book.Chapters.Count,
                    ChapterNumber = currentChapter.ChapterNumber
                });
            }
        }

        // GET /api/books/{id}/sayfalar?bas=1&son=50 — YH-13 Çevrimdışı okuma için toplu sayfa ucu
        // Salt okunurdur. İlerleme YAZMAZ, LLM çağırmaz / analiz ÜRETMET (KURAL-17).
        [HttpGet("{id}/sayfalar")]
        [EnableRateLimiting(HizSinirlari.Okuma)]
        public async Task<IActionResult> GetPagesBulk(
            [Range(1, int.MaxValue, ErrorMessage = "Geçersiz kayıt numarası.")] int id,
            [FromQuery] [Range(1, int.MaxValue, ErrorMessage = "Başlangıç sayfası 1'den küçük olamaz.")] int bas = 1,
            [FromQuery] [Range(1, int.MaxValue, ErrorMessage = "Bitiş sayfası 1'den küçük olamaz.")] int son = 50)
        {
            if (bas > son)
            {
                return BadRequest(new { error = "Başlangıç sayfası bitiş sayfasından büyük olamaz." });
            }

            if (son - bas + 1 > 50)
            {
                return BadRequest(new { error = "En fazla 50 sayfa birden istenebilir." });
            }

            var bookExists = await _db.Books.AnyAsync(b => b.Id == id);
            if (!bookExists)
            {
                return NotFound(new { error = "Kitap bulunamadı." });
            }

            var sayfalar = await _db.BookPages
                .Where(p => p.BookId == id && p.PageNumber >= bas && p.PageNumber <= son)
                .OrderBy(p => p.PageNumber)
                .Select(p => new { p.PageNumber, p.Content, p.SentencesJson })
                .ToListAsync();

            // En çok 50 satır: kural bellekte uygulanır ki okuma ucuyla TEK yerden gelsin.
            // Bekleyen sayfanın analiz alanı gönderilmez; istemci onu çevrimdışına kaydetmez.
            return Ok(sayfalar.Select(p =>
            {
                var bekliyor = AnalizBekliyorMu(p.SentencesJson);
                return new
                {
                    pageNumber = p.PageNumber,
                    content = p.Content,
                    sentencesJson = bekliyor ? null : p.SentencesJson,
                    analizBekliyor = bekliyor,
                };
            }));
        }

        public class IlerlemeIstegi
        {
            [Range(1, int.MaxValue, ErrorMessage = "Geçersiz kayıt numarası.")]
            public int BookId { get; set; }

            /// <summary>Sayfa modunda sayfa, bölüm modunda bölüm numarası.</summary>
            [Range(1, int.MaxValue, ErrorMessage = "Konum 1'den küçük olamaz.")]
            public int Konum { get; set; }
        }

        // POST /api/books/{id}/progress
        //
        // KURAL-17: okuma ilerlemesi artık AYRI bir yazma ucudur.
        // 'GET {id}/read' salt okunur olduğu için istemci sayfayı gösterdikten
        // sonra bunu çağırır.
        //
        // Yüzde istemciden ALINMAZ, sunucuda hesaplanır: istemciden gelen bir
        // yüzde, panodaki ilerlemeyi istediği gibi yazdırabilirdi.
        [HttpPost("{id}/progress")]
        [EnableRateLimiting(HizSinirlari.Yazma)]
        public async Task<IActionResult> IlerlemeKaydet(
            [Range(1, int.MaxValue, ErrorMessage = "Geçersiz kayıt numarası.")] int id,
            [FromBody] IlerlemeIstegi req)
        {
            // KURAL-08: Include yerine PROJEKSİYON. Burada gereken tek şey
            // iki SAYI; bütün sayfa ve bölüm gövdelerini belleğe çekmenin
            // (yüzlerce KB) hiçbir gerekçesi yok.
            var olcu = await _db.Books
                .Where(b => b.Id == id)
                .Select(b => new { SayfaSayisi = b.Pages.Count, BolumSayisi = b.Chapters.Count })
                .FirstOrDefaultAsync();

            if (olcu == null) return NotFound(new { error = "Kitap bulunamadı." });

            var toplam = olcu.SayfaSayisi > 0 ? olcu.SayfaSayisi : olcu.BolumSayisi;
            if (toplam == 0) return BadRequest(new { error = "Kitapta okunacak içerik yok." });

            // Kitabın dışına taşan konum kırpılır — istemci hatası yüzünden
            // %400 ilerleme kaydı oluşmasın.
            var konum = Math.Clamp(req.Konum, 1, toplam);

            var (satirVardi, konumDegisti) = await IlerlemeyiYazAsync(id, konum, (float)konum / toplam * 100);
            if (satirVardi && konumDegisti)
            {
                await _seriServisi.PuanEkleAsync(CurrentUserId, "okuma");
            }

            return Ok(new { success = true, konum, yuzde = (float)konum / toplam * 100 });
        }

        // POST /api/books/{id}/analyze-page?page=1
        //
        // ── KURAL-17: BOŞ analizi doldurur, dolu olanı ASLA değiştirmez. ──
        //
        // Neden ayrı bir uç ve neden herkese açık:
        // Sayfaların büyük çoğunluğu yüklenirken analiz edilmiyor; analiz ilk
        // okumada üretiliyordu. O iş 'GET {id}/read' içindeydi — yani bir GET
        // hem para harcıyor hem paylaşılan satıra yazıyordu. Buraya taşındı.
        //
        // Yetki kısıtı YOK ama etki yarıçapı da yok: bu uç yalnızca BOŞ alanı
        // doldurur. Bir öğrencinin başka kullanıcıların gördüğü bir analizi
        // BOZMASI mümkün değil — üzerine yazan yol ayrı bir uçta ve
        // öğretmen/yönetici yetkisine bağlı.
        //
        // Para harcadığı için en dar kotada (AgirAnaliz).
        [HttpPost("{id}/analyze-page")]
        [EnableRateLimiting(HizSinirlari.AgirAnaliz)]
        [ParaHarcar("Groq", "yalnızca analiz BOŞKEN")]
        [PaylasilanVeriYazar("BookPages.SentencesJson", PaylasilanYazmaBicimi.BosAlaniDoldurur)]
        public async Task<IActionResult> SayfayiAnalizEt(
            [Range(1, int.MaxValue, ErrorMessage = "Geçersiz kayıt numarası.")] int id,
            [FromQuery] [Range(1, int.MaxValue, ErrorMessage = "Sayfa numarası 1'den küçük olamaz.")] int page = 1)
        {
            var sayfa = await _db.BookPages
                .FirstOrDefaultAsync(p => p.BookId == id && p.PageNumber == page);

            if (sayfa is null) return NotFound(new { error = "Sayfa bulunamadı." });

            // Zaten analizliyse PARA HARCAMADAN döner. Bu kontrol bir
            // maliyet savunmasıdır: aksi hâlde uç, dolu bir sayfa için de
            // Groq'a gidip sonucu atardı.
            if (!AnalizBekliyorMu(sayfa.SentencesJson))
                return Ok(new { success = true, sentencesJson = sayfa.SentencesJson, uretildi = false });

            var cumleler = await _transService.AnalyzeTextAsync(sayfa.Content);

            // Boş sonuç YAZILMAZ: başarısız bir LLM çağrısı "analiz denendi ve
            // boş" diye kalıcılaşırsa sayfa bir daha hiç analiz edilmez.
            if (cumleler.Count == 0)
                return StatusCode(502, new { error = "Analiz şu anda yapılamadı. Lütfen tekrar deneyin." });

            sayfa.SentencesJson = System.Text.Json.JsonSerializer.Serialize(cumleler);
            await _db.SaveChangesAsync();

            return Ok(new { success = true, sentencesJson = sayfa.SentencesJson, uretildi = true });
        }

        // POST /api/books/{id}/reanalyze?page=1
        //
        // ── KURAL-17 — üç ayrı sebep, tek uçta: ──
        //   1) PARA HARCAR              → en dar kotaya (AgirAnaliz) bağlandı
        //   2) PAYLAŞILAN VERİ ÜZERİNE YAZAR → BookPage global; yetki gerekir
        //   3) DURUM DEĞİŞTİRİR         → GET değil POST
        //
        // 00-BASLA-BURADAN madde 3 kararı: seçenek A (yalnızca öğretmen/yönetici).
        // Kullanıcı ayrıca kayıtta rol seçimini kaldırmayı seçti; aksi hâlde bu
        // politika göstermelik olurdu (herkes kendini öğretmen kaydedebiliyordu).
        [HttpPost("{id}/reanalyze")]
        [Authorize(Policy = "EgitmenVeyaAdmin")]
        [EnableRateLimiting(HizSinirlari.AgirAnaliz)]
        [ParaHarcar("Groq", "her istekte")]
        [PaylasilanVeriYazar("BookPages.SentencesJson", PaylasilanYazmaBicimi.UzerineYazar)]
        public async Task<IActionResult> YenidenAnalizEt(
            [Range(1, int.MaxValue, ErrorMessage = "Geçersiz kayıt numarası.")] int id,
            [FromQuery] [Range(1, int.MaxValue, ErrorMessage = "Sayfa numarası 1'den küçük olamaz.")] int page = 1)
        {
            var sayfa = await _db.BookPages
                .FirstOrDefaultAsync(p => p.BookId == id && p.PageNumber == page);

            if (sayfa is null) return NotFound(new { error = "Sayfa bulunamadı." });

            var cumleler = await _transService.AnalyzeTextAsync(sayfa.Content);

            // Boş sonuç mevcut analizi EZMEZ: başarısız bir LLM çağrısı,
            // HERKESİN okuduğu içeriği silmemeli. Eski kod bunu 'if (Any())'
            // ile sağlıyordu ama sessizce — kullanıcı başarılı sanıyordu.
            if (cumleler.Count == 0)
                return StatusCode(502, new { error = "Analiz şu anda yapılamadı. Lütfen tekrar deneyin." });

            sayfa.SentencesJson = System.Text.Json.JsonSerializer.Serialize(cumleler);
            await _db.SaveChangesAsync();

            return Ok(new { success = true, sentencesJson = sayfa.SentencesJson });
        }

        public class AddWordRequest
        {
            [Required(ErrorMessage = "Kelime zorunludur.")]
            [StringLength(AlanSinirlari.Kelime, MinimumLength = 1,
                ErrorMessage = "Kelime en fazla {1} karakter olabilir.")]
            public string Word { get; set; } = "";

            [Required(ErrorMessage = "Çeviri zorunludur.")]
            [StringLength(AlanSinirlari.Ceviri, MinimumLength = 1,
                ErrorMessage = "Çeviri en fazla {1} karakter olabilir.")]
            public string Translation { get; set; } = "";

            // Bağlam KULLANICI YAZISI DEĞİL, okuyucudaki cümle seçiminden TÜRETİLİR.
            // 200 karakterlik kolona 300 karakterlik bir cümle gelmesi normaldir;
            // kullanıcıya "cümlen çok uzun" demek özelliği kullanılamaz kılar.
            // Bu yüzden girdi sınırı BaglamGirdi (400), kayıt sırasında Baglam'a (200)
            // KirpEnCok ile kırpılır. 400'ün üstü ise artık kaza değil, kötüye kullanımdır.
            [StringLength(AlanSinirlari.BaglamGirdi,
                ErrorMessage = "Bağlam en fazla {1} karakter olabilir.")]
            public string Context { get; set; } = "";
        }

        // POST /api/books/addword — Kelime ekle
        [HttpPost("addword")]
        [EnableRateLimiting(HizSinirlari.Yazma)]   // KURAL-07: YENİ — sınırsız satır yazımı → disk
        public async Task<IActionResult> AddWord([FromBody] AddWordRequest req)
        {
            if (req == null || string.IsNullOrWhiteSpace(req.Word) || string.IsNullOrWhiteSpace(req.Translation))
            {
                return BadRequest(new { error = "Kelime ve çeviri zorunludur." });
            }

            // YH-11: Kelime listesine giden her kelime sunucuda normalleştirilir.
            var kelime = KelimeNormallestirici.Normallestir(req.Word);
            if (string.IsNullOrWhiteSpace(kelime))
            {
                return BadRequest(new { error = "Geçerli bir kelime değil." });
            }

            var userId = CurrentUserId;

            var existing = await _db.WordListItems
                .AnyAsync(w => w.UserId == userId && w.Word == kelime);

            if (!existing)
            {
                _db.WordListItems.Add(new WordListItem
                {
                    UserId = userId,
                    Word = kelime,
                    Translation = req.Translation.KirpEnCok(AlanSinirlari.Ceviri),
                    Context = req.Context.KirpEnCok(AlanSinirlari.Baglam),
                    AddedAt = DateTime.UtcNow
                });

                // KURAL-12: (UserId, Word) artık veritabanında TEKİL. Yukarıdaki
                // AnyAsync yarışta yanılabilir; çakışma sessizce yutulur çünkü
                // bu ucun sözleşmesi IDEMPOTENT: "kelime listende olsun".
                if (await _db.BenzersizKaydetAsync())
                {
                    await _seriServisi.PuanEkleAsync(userId, "kelime");
                }
            }

            return Ok(new { success = true });
        }

        // GET /api/books/words — Kelime listesi
        [HttpGet("words")]
        public async Task<IActionResult> Words()
        {
            // KURAL-08: WordListItem entity'si User navigasyonu taşır. Bugün
            // Include edilmediği için PasswordHash sızmıyor — ama bu bir tesadüf.
            // DTO ile bu risk tasarımdan kalkar.
            var kelimeler = await _db.WordListItems
                .Where(w => w.UserId == CurrentUserId)
                .OrderByDescending(w => w.AddedAt)
                .Select(w => new KelimeYaniti(w.Id, w.Word, w.Translation, w.Context, w.AddedAt,
                    w.Kutu, w.Kutu >= LeitnerHesaplayici.OgrenildiEsigiKutu))
                .ToListAsync();
            return Ok(kelimeler);
        }

        // PUT /api/books/words/{id} — Kelime güncelleme
        [HttpPut("words/{id}")]
        [EnableRateLimiting(HizSinirlari.Yazma)]   // KURAL-07: YENİ
        public async Task<IActionResult> UpdateWord([Range(1, int.MaxValue, ErrorMessage = "Geçersiz kayıt numarası.")] int id, [FromBody] AddWordRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.Word) || string.IsNullOrWhiteSpace(req.Translation))
            {
                return BadRequest(new { error = "Kelime ve çeviri alanları boş olamaz." });
            }

            var kelime = KelimeNormallestirici.Normallestir(req.Word);
            if (string.IsNullOrWhiteSpace(kelime))
            {
                return BadRequest(new { error = "Geçerli bir kelime değil." });
            }

            var item = await _db.WordListItems
                .FirstOrDefaultAsync(w => w.Id == id && w.UserId == CurrentUserId);
            if (item == null)
            {
                return NotFound(new { error = "Kelime bulunamadı." });
            }

            item.Word = kelime;
            item.Translation = req.Translation.KirpEnCok(AlanSinirlari.Ceviri);
            if (req.Context != null)
            {
                item.Context = req.Context.KirpEnCok(AlanSinirlari.Baglam);
            }

            await _db.SaveChangesAsync();
            return Ok(new { success = true });
        }

        // ─── Kelime çalışma seansı ────────────────────────────────────────

        // GET /api/books/words/calisma?adet=20
        //
        // Neden ayrı bir uç: kullanıcının 200 kelimesi varsa tek oturumda
        // bitmiyor. Liste ucu (GET words) her şeyi döndürür; bu uç SEANSLIK
        // bir dilim verir ve dilimi RASTGELE değil, ÖNCELİKLİ seçer.
        //
        // Öncelik sırası:
        //   1) hiç çalışılmamışlar   → kapsama garantisi (asıl şikâyet buydu)
        //   2) çalışılmış ama öğrenilmemişler, en eskiden başlayarak
        //   3) öğrenilmişler, tekrar için
        // Aynı bant içinde sıra RASTGELEDİR — yani hiç çalışılmamış 200
        // kelimeden her seferinde farklı 20'si gelir, ama liste bitmeden
        // hiçbiri iki kez gelmez.
        // GET /api/books/words/calisma?adet=20&mod=tekrar
        //
        // YH-06: Leitner aralıklı tekrar algoritması.
        // mod=tekrar (varsayılan): Önce SonrakiTekrarAt <= now olanlar (eskiden yeniye).
        // Yetersizse, günde en fazla 10 yeni (hiç çalışılmamış) kelime eklenir.
        // mod=serbest: Vadeye bakmaksızın kutu sırasına göre serbest çalışma.
        [HttpGet("words/calisma")]
        public async Task<IActionResult> CalismaSeansi(
            [FromQuery]
            [Range(KelimeCalismasi.EnAzSeansBoyu, KelimeCalismasi.EnCokSeansBoyu,
                   ErrorMessage = "Seans boyu {1} ile {2} arasında olmalıdır.")]
            int adet = KelimeCalismasi.VarsayilanSeansBoyu,
            [FromQuery] string mod = "tekrar")
        {
            var userId = CurrentUserId;
            var now = DateTime.UtcNow;
            const int esik = LeitnerHesaplayici.OgrenildiEsigiKutu;

            List<WordListItem> secilenler;

            if (string.Equals(mod, "serbest", StringComparison.OrdinalIgnoreCase))
            {
                secilenler = await _db.WordListItems
                    .Where(w => w.UserId == userId)
                    .OrderBy(w => w.Kutu)
                    .ThenBy(w => w.SonrakiTekrarAt ?? DateTime.MinValue)
                    .ThenBy(w => w.Id)
                    .Take(adet)
                    .ToListAsync();
            }
            else
            {
                // mod=tekrar: önce vadesi gelenler
                var vadesiGelenler = await _db.WordListItems
                    .Where(w => w.UserId == userId && w.SonrakiTekrarAt != null && w.SonrakiTekrarAt <= now)
                    .OrderBy(w => w.SonrakiTekrarAt)
                    .ThenBy(w => w.Kutu)
                    .Take(adet)
                    .ToListAsync();

                secilenler = new List<WordListItem>(vadesiGelenler);

                if (secilenler.Count < adet)
                {
                    int kalanAdet = adet - secilenler.Count;
                    int yeniSinir = Math.Min(kalanAdet, LeitnerHesaplayici.GunlukYeniSiniri);

                    var vadesiGelenIdler = secilenler.Select(s => s.Id).ToList();

                    var yeniKelimeler = await _db.WordListItems
                        .Where(w => w.UserId == userId && (w.SonCalismaAt == null || w.Kutu == 0) && !vadesiGelenIdler.Contains(w.Id))
                        .OrderBy(w => w.AddedAt)
                        .ThenBy(w => w.Id)
                        .Take(yeniSinir)
                        .ToListAsync();

                    secilenler.AddRange(yeniKelimeler);
                }
            }

            var kartlar = secilenler.Select(w => new CalismaKartiYaniti(
                w.Id, w.Word, w.Translation, w.Context,
                w.DogruSeri,
                w.Kutu,
                w.SonrakiTekrarAt,
                w.Kutu >= esik
            )).ToList();

            return Ok(kartlar);
        }

        // GET /api/books/words/ozet
        //
        // YH-06: Leitner kutu dağılımı ve vadesi gelen tekrar sayıları.
        [HttpGet("words/ozet")]
        public async Task<IActionResult> KelimeOzeti()
        {
            var userId = CurrentUserId;
            var now = DateTime.UtcNow;
            var yarin = now.AddDays(1);
            const int esik = LeitnerHesaplayici.OgrenildiEsigiKutu;

            var tumu = await _db.WordListItems
                .Where(w => w.UserId == userId)
                .Select(w => new { w.Kutu, w.SonCalismaAt, w.SonrakiTekrarAt })
                .ToListAsync();

            int toplam = tumu.Count;
            int ogrenildi = tumu.Count(w => w.Kutu >= esik);
            int calisiliyor = tumu.Count(w => w.SonCalismaAt != null && w.Kutu < esik);
            int hicCalisilmadi = tumu.Count(w => w.SonCalismaAt == null);
            int bugunTekrar = tumu.Count(w => w.SonrakiTekrarAt != null && w.SonrakiTekrarAt <= now);
            int yarinTekrar = tumu.Count(w => w.SonrakiTekrarAt != null && w.SonrakiTekrarAt > now && w.SonrakiTekrarAt <= yarin);

            int[] kutuDagilimi = new int[8];
            foreach (var w in tumu)
            {
                int k = Math.Clamp(w.Kutu, 0, 7);
                kutuDagilimi[k]++;
            }

            var ozet = new KelimeOzetiYaniti(
                toplam,
                ogrenildi,
                calisiliyor,
                hicCalisilmadi,
                bugunTekrar,
                yarinTekrar,
                kutuDagilimi,
                esik
            );

            return Ok(ozet);
        }

        public class CalismaSonucuIstegi
        {
            [Range(1, int.MaxValue, ErrorMessage = "Geçersiz kayıt numarası.")]
            public int KelimeId { get; set; }

            /// <summary>Kullanıcı bildi mi?</summary>
            public bool Bildim { get; set; }
        }

        // POST /api/books/words/calisma-sonucu
        //
        // YH-06: Leitner kutu ve sonraki tekrar zamanı güncellenir.
        [HttpPost("words/calisma-sonucu")]
        [EnableRateLimiting(HizSinirlari.Yazma)]
        public async Task<IActionResult> CalismaSonucu([FromBody] CalismaSonucuIstegi req)
        {
            if (req == null) return BadRequest(new { error = "Geçersiz veri." });

            var userId = CurrentUserId;

            var kelime = await _db.WordListItems
                .FirstOrDefaultAsync(w => w.Id == req.KelimeId && w.UserId == userId);

            if (kelime is not null)
            {
                var now = DateTime.UtcNow;
                if (req.Bildim)
                {
                    kelime.DogruSayisi++;
                    kelime.DogruSeri++;
                    (kelime.Kutu, kelime.SonrakiTekrarAt) = LeitnerHesaplayici.Bildi(kelime.Kutu, now);
                }
                else
                {
                    kelime.YanlisSayisi++;
                    kelime.DogruSeri = 0;
                    (kelime.Kutu, kelime.SonrakiTekrarAt) = LeitnerHesaplayici.Bilemedi(kelime.Kutu, now);
                }

                kelime.SonCalismaAt = now;
                await _db.SaveChangesAsync();

                await _seriServisi.PuanEkleAsync(userId, "calisma");
            }

            // Idempotent ve kasıtlı olarak AYRIM YAPMAZ: "kelime yok" ile
            // "kelime başkasının" aynı yanıtı döner. Farklı yanıtlar, hangi
            // kayıt numaralarının var olduğunu sayan bir araç olurdu.
            // Ayrıca çalışma sırasında silinen bir kelime hata üretmemeli.
            return Ok(new { success = true });
        }

        // DELETE /api/books/words/{id}
        [HttpDelete("words/{id}")]
        [EnableRateLimiting(HizSinirlari.Yazma)]   // KURAL-07: YENİ
        public async Task<IActionResult> DeleteWord([Range(1, int.MaxValue, ErrorMessage = "Geçersiz kayıt numarası.")] int id)
        {
            var item = await _db.WordListItems
                .FirstOrDefaultAsync(w => w.Id == id && w.UserId == CurrentUserId);
            if (item != null)
            {
                _db.WordListItems.Remove(item);
                await _db.SaveChangesAsync();
            }
            return Ok(new { success = true });
        }

        // GET /api/books/quiz/{chapterId}
        // GET /api/books/quiz/{chapterId} — SALT OKUNUR.
        //
        // KURAL-17: quiz ÜRETİMİ bu uçtan çıkarıldı. Üretmek bir yazma
        // işlemidir ve GET, üst düzey gezinmeyle tetiklenebilir
        // (çerez SameSite=Lax olduğu için gönderilir).
        // Quiz yoksa 404 döner; üretmek için POST quiz/{chapterId}.
        [HttpGet("quiz/{chapterId}")]
        public async Task<IActionResult> GetQuiz([Range(1, int.MaxValue, ErrorMessage = "Geçersiz kayıt numarası.")] int chapterId)
        {
            var quiz = await _db.Quizzes
                .Include(q => q.Questions)
                .FirstOrDefaultAsync(q => q.ChapterId == chapterId);

            if (quiz == null)
                return NotFound(new { error = "Bu bölüm için henüz quiz üretilmemiş." });

            return Ok(QuizYaniti(quiz));
        }

        // POST /api/books/quiz/{chapterId}
        //
        // KURAL-17: quiz üretimi bir YAZMA işlemidir; kendi ucu ve kotası var.
        // Zaten varsa yenisini üretmez — mevcut olanı döner (idempotent).
        [HttpPost("quiz/{chapterId}")]
        [EnableRateLimiting(HizSinirlari.Yazma)]
        public async Task<IActionResult> QuizUret([Range(1, int.MaxValue, ErrorMessage = "Geçersiz kayıt numarası.")] int chapterId)
        {
            var chapter = await _db.Chapters.FirstOrDefaultAsync(c => c.Id == chapterId);
            if (chapter == null) return NotFound(new { error = "Bölüm bulunamadı." });

            // KURAL-08: Include(c => c.Book) yerine tek alan projeksiyonu.
            // Başlıktan başka hiçbir şeye ihtiyaç yok; kitabın tamamını
            // (bölümleriyle birlikte) belleğe almanın gerekçesi yoktu.
            var kitapAdi = await _db.Books
                .Where(b => b.Id == chapter.BookId)
                .Select(b => b.Title)
                .FirstOrDefaultAsync() ?? "";

            var quiz = await _db.Quizzes
                .Include(q => q.Questions)
                .FirstOrDefaultAsync(q => q.ChapterId == chapterId);

            if (quiz == null)
            {
                var yeniQuiz = new Quiz
                {
                    BookId = chapter.BookId,
                    ChapterId = chapterId,
                    Title = $"{kitapAdi} — {chapter.Title} Quiz",
                    CreatedAt = DateTime.UtcNow
                };
                _db.Quizzes.Add(yeniQuiz);

                // KURAL-12: ChapterId artık TEKİL. İki eşzamanlı istek eskiden
                // aynı bölüm için İKİ quiz üretiyordu — kullanıcı kendi sorularını
                // ikinci kez çözdüğünde farklı sorularla karşılaşıyordu.
                if (await _db.BenzersizKaydetAsync())
                {
                    _db.QuizQuestions.AddRange(_quizGen.GenerateQuestions(chapter, yeniQuiz.Id, 5));
                    await _db.SaveChangesAsync();
                }

                // Yarışı kaybettiysek kazananın quiz'i okunur; kazandıysak kendimizinki.
                quiz = await _db.Quizzes.Include(q => q.Questions)
                    .FirstOrDefaultAsync(q => q.ChapterId == chapterId);

                if (quiz == null) return NotFound(new { error = "Quiz oluşturulamadı." });
            }

            return Ok(QuizYaniti(quiz));
        }

        /// <summary>Quiz yanıt biçimi TEK yerde — iki uç da aynı gövdeyi döner.</summary>
        private static object QuizYaniti(Quiz quiz) => new
        {
            quiz.Id,
            quiz.Title,
            quiz.BookId,
            quiz.ChapterId,
            Questions = quiz.Questions.Select(q => new {
                q.Id,
                q.QuestionText,
                Options = new[] { q.OptionA, q.OptionB, q.OptionC, q.OptionD }
            })
        };

        public class SubmitQuizRequest
        {
            [Range(1, int.MaxValue, ErrorMessage = "Geçersiz quiz.")]
            public int QuizId { get; set; }

            // Bir koleksiyon alanı İKİ sınır ister:
            //   [MaxLength]      → kaç eleman (sınırsız sözlük belleği tüketir)
            //   [OgeIzinliDeger] → her elemanın İÇERİĞİ
            // İkincisi eksikti: "en fazla 100 cevap" kuralı varken tek bir cevabın
            // 200.000 karakter olmasını hiçbir şey engellemiyordu. Değer
            // kaydedilmiyordu ama sunucu onu okuyup ayrıştırmak zorunda kalıyordu.
            //
            // Whitelist zaten bir uzunluk tavanıdır (en uzun şık 1 karakter), bu
            // yüzden ayrıca [OgeUzunlugu] gerekmez. Boş değere izin verilir:
            // cevapsız soru bir hata değildir.
            [Required]
            [MaxLength(AlanSinirlari.QuizCevapSayisi, ErrorMessage = "Çok fazla cevap gönderildi.")]
            [OgeIzinliDeger(nameof(IzinliDegerler.QuizSiklari))]
            public Dictionary<int, string> Answers { get; set; } = new();
        }

        // POST /api/books/submitquiz
        [HttpPost("submitquiz")]
        [EnableRateLimiting(HizSinirlari.Yazma)]   // KURAL-07: YENİ
        public async Task<IActionResult> SubmitQuiz([FromBody] SubmitQuizRequest req)
        {
            if (req == null) return BadRequest(new { error = "Geçersiz istek verisi." });

            var quiz = await _db.Quizzes.Include(q => q.Questions).FirstOrDefaultAsync(q => q.Id == req.QuizId);
            if (quiz == null) return NotFound(new { error = "Quiz bulunamadı." });

            int correct = 0;
            var evaluation = new List<object>();

            foreach (var q in quiz.Questions)
            {
                req.Answers.TryGetValue(q.Id, out var ans);
                // KURAL-05: whitelist — A/B/C/D dışı bir şık "cevaplanmadı" sayılır.
                if (ans is not null && !IzinliDegerler.QuizSiklari.Contains(ans, StringComparer.Ordinal))
                    ans = null;
                bool isCorrect = ans == q.CorrectAnswer;
                if (isCorrect) correct++;

                evaluation.Add(new {
                    QuestionId = q.Id,
                    QuestionText = q.QuestionText,
                    UserAnswer = ans,
                    CorrectAnswer = q.CorrectAnswer,
                    IsCorrect = isCorrect
                });
            }

            var result = new QuizResult
            {
                UserId = CurrentUserId,
                QuizId = req.QuizId,
                Score = correct,
                TotalQuestions = quiz.Questions.Count,
                TakenAt = DateTime.UtcNow
            };
            _db.QuizResults.Add(result);
            await _db.SaveChangesAsync();

            await _seriServisi.PuanEkleAsync(CurrentUserId, "quiz");

            return Ok(new {
                Score = correct,
                Total = quiz.Questions.Count,
                Evaluation = evaluation
            });
        }
    }
}
