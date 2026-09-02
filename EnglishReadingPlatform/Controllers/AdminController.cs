using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using EnglishReadingPlatform.Contracts;
using EnglishReadingPlatform.Authorization;
using EnglishReadingPlatform.Data;
using EnglishReadingPlatform.Exceptions;
using EnglishReadingPlatform.Files;
using EnglishReadingPlatform.Models;
using EnglishReadingPlatform.RateLimiting;
using EnglishReadingPlatform.Security;
using EnglishReadingPlatform.Services;
using EnglishReadingPlatform.Validation;
using System.ComponentModel.DataAnnotations;

namespace EnglishReadingPlatform.Controllers
{
    /// <summary>
    /// Admin-only controller. Tüm endpoint'ler JWT "admin" rolü gerektirir.
    /// Route prefix: /api/admin/
    /// Normal kullanıcı tokenları bu controller'a erişemez (403 Forbidden).
    /// </summary>
    [Authorize(Roles = "admin")]
    [ApiController]
    [Route("api/admin")]
    public class AdminController : ControllerBase
    {
        private readonly AppDbContext _db;
        private readonly PdfService _pdfService;
        private readonly TranslationService _transService;
        private readonly ITokenIptalDeposu _iptalDeposu;   // KURAL-04
        private readonly ILogger<AdminController> _logger;  // KURAL-06
        private readonly DosyaDogrulayici _dogrulayici;     // KURAL-10
        private readonly AgirIsKapisi _agirIsKapisi;        // KURAL-07

        public AdminController(AppDbContext db, PdfService pdfService, TranslationService transService,
                               ITokenIptalDeposu iptalDeposu, ILogger<AdminController> logger,
                               DosyaDogrulayici dogrulayici, AgirIsKapisi agirIsKapisi)
        {
            _db = db;
            _pdfService = pdfService;
            _transService = transService;
            _iptalDeposu = iptalDeposu;
            _logger = logger;
            _dogrulayici = dogrulayici;
            _agirIsKapisi = agirIsKapisi;
        }


        // ── GET /api/admin/stats ────────────────────────────────
        /// <summary>Platform geneli istatistikler</summary>
        [HttpGet("stats")]
        public async Task<IActionResult> Stats()
        {
            var totalUsers = await _db.Users.CountAsync(u => u.Role != "admin");
            var totalBooks = await _db.Books.CountAsync();
            var totalGroups = await _db.Groups.CountAsync();
            var totalQuizResults = await _db.QuizResults.CountAsync();

            var recentUsers = await _db.Users
                .Where(u => u.Role != "admin")
                .OrderByDescending(u => u.CreatedAt)
                .Take(5)
                .Select(u => new { u.Id, u.Username, u.Email, u.Role, u.CreatedAt })
                .ToListAsync();

            return Ok(new
            {
                TotalUsers = totalUsers,
                TotalBooks = totalBooks,
                TotalGroups = totalGroups,
                TotalQuizResults = totalQuizResults,
                RecentUsers = recentUsers
            });
        }

        // ── GET /api/admin/users ────────────────────────────────
        /// <summary>Tüm kullanıcıları listele (şifresiz)</summary>
        [HttpGet("users")]
        public async Task<IActionResult> GetUsers()
        {
            var users = await _db.Users
                .Select(u => new
                {
                    u.Id,
                    u.Username,
                    u.Email,
                    u.Role,
                    u.CreatedAt,
                    ReadingCount = u.ReadingProgresses.Count,
                    WordCount = u.WordListItems.Count,
                    QuizCount = u.QuizResults.Count
                })
                .ToListAsync();

            return Ok(users);
        }

        // ── PUT /api/admin/users/{id}/role ──────────────────────
        /// <summary>Kullanıcı rolünü değiştir (student/teacher/admin)</summary>
        public class UpdateRoleRequest
        {
            [IzinliDeger(nameof(IzinliDegerler.Roller))]
            public string Role { get; set; } = "";
        }

        [HttpPut("users/{id}/role")]
        [EnableRateLimiting(HizSinirlari.Yazma)]   // KURAL-07: YENİ
        public async Task<IActionResult> UpdateRole([Range(1, int.MaxValue, ErrorMessage = "Geçersiz kayıt numarası.")] int id, [FromBody] UpdateRoleRequest req)
        {
            // KURAL-05: whitelist artık DTO'da [IzinliDeger] ile — elle tutulan
            // ikinci bir kopya IzinliDegerler.Roller'den sessizce ayrışırdı.

            var user = await _db.Users.FindAsync(id);
            if (user == null) return NotFound(new { error = "Kullanıcı bulunamadı." });

            // Güvenlik: kendi hesabının rolünü değiştiremez
            var callerId = this.KullaniciId();   // KURAL-05: TryParse tabanlı
            if (user.Id == callerId)
                return BadRequest(new { error = "Kendi hesabınızın rolünü değiştiremezsiniz." });

            user.Role = req.Role;
            await _db.SaveChangesAsync();

            // ── KURAL-04: eski rolle üretilmiş tokenları geçersiz kıl ──
            // Önce kaydet, sonra iptal et: kayıt başarısız olursa oturum boşuna düşmesin.
            _iptalDeposu.KullaniciTumTokenlariniIptalEt(id);

            return Ok(new { success = true, userId = id, newRole = req.Role });
        }

        // ── DELETE /api/admin/users/{id} ────────────────────────
        /// <summary>Kullanıcıyı sil (kendi hesabını silemez)</summary>
        [HttpDelete("users/{id}")]
        [EnableRateLimiting(HizSinirlari.Yazma)]   // KURAL-07: YENİ
        public async Task<IActionResult> DeleteUser([Range(1, int.MaxValue, ErrorMessage = "Geçersiz kayıt numarası.")] int id)
        {
            var callerId = this.KullaniciId();   // KURAL-05: TryParse tabanlı
            if (id == callerId)
                return BadRequest(new { error = "Kendi hesabınızı silemezsiniz." });

            var user = await _db.Users.FindAsync(id);
            if (user == null) return NotFound(new { error = "Kullanıcı bulunamadı." });

            // ── KURAL-12: sahip olduğu gruplar SESSİZCE silinmesin ──
            //
            // Group.AdminUserId zorunlu bir ilişkiydi; EF varsayılanı (Cascade)
            // yüzünden bir öğretmen hesabını silmek, yönettiği bütün grupları,
            // üyeliklerini ve kitap atamalarını da siliyordu. Yöneticiye hiçbir
            // uyarı çıkmıyordu — silinen tek şeyin "bir kullanıcı" olduğunu
            // sanıyordu. Şema artık Restrict; burada o kısıt, kullanıcıya NE
            // YAPMASI GEREKTİĞİNİ söyleyen bir 400'e çevriliyor. Kısıt tek
            // başına bırakılsaydı yönetici anlaşılmaz bir 500 görürdü.
            var sahipOldugu = await _db.Groups
                .Where(g => g.AdminUserId == id)
                .Select(g => new { g.Id, g.Name })
                .ToListAsync();

            if (sahipOldugu.Count > 0)
            {
                _logger.LogInformation(
                    "Kullanıcı silme reddedildi: grup yöneticisi. KullaniciId={Id} GrupSayisi={Sayi}",
                    id, sahipOldugu.Count);

                return BadRequest(new
                {
                    error = $"Bu kullanıcı {sahipOldugu.Count} grubun yöneticisi. " +
                            "Silmeden önce grupları başka bir yöneticiye devredin veya grupları silin.",
                    gruplar = sahipOldugu
                });
            }

            _db.Users.Remove(user);
            await _db.SaveChangesAsync();

            // ── KURAL-04: silinen kullanıcının tokenları anında geçersiz ──
            _iptalDeposu.KullaniciTumTokenlariniIptalEt(id);

            return Ok(new { success = true });
        }

        // ── GET /api/admin/books ─────────────────────────────────
        /// <summary>Tüm kitapları admin görünümüyle listele</summary>
        [HttpGet("books")]
        public async Task<IActionResult> GetBooks()
        {
            // KURAL-08: Include(b => b.Chapters) projeksiyonun yanında GEREKSİZDİ —
            // bölüm metinlerini belleğe çekiyordu, oysa yalnızca adet lazım.
            var books = await _db.Books
                .Select(b => new
                {
                    b.Id,
                    b.Title,
                    b.Author,
                    b.Description,
                    b.Language,
                    b.Level,
                    b.Category,
                    b.CreatedAt,
                    ChapterCount = b.Chapters.Count,
                    PageCount = b.Pages.Count
                })
                .ToListAsync();

            return Ok(books);
        }

        // ── POST /api/admin/books/upload ────────────────────────
        /// <summary>
        /// PDF dosyası yükle — metin çıkarılır, bölümlere ayrılır, DB'ye kaydedilir.
        /// Güvenlik: sadece PDF MIME türü, max 50MB, sadece admin erişebilir.
        /// </summary>
        public class BookUploadRequest
        {
            [Required(ErrorMessage = "Kitap başlığı zorunludur.")]
            [StringLength(AlanSinirlari.KitapBasligi, MinimumLength = 1,
                ErrorMessage = "Başlık en fazla {1} karakter olabilir.")]
            public string Title { get; set; } = "";

            [StringLength(AlanSinirlari.KitapYazari,
                ErrorMessage = "Yazar en fazla {1} karakter olabilir.")]
            public string? Author { get; set; }

            [StringLength(AlanSinirlari.KitapAciklama,
                ErrorMessage = "Açıklama en fazla {1} karakter olabilir.")]
            public string? Description { get; set; }

            [IzinliDeger(nameof(IzinliDegerler.Diller))]
            public string Language { get; set; } = "en";

            // Bu değer istemciye stil olarak geri dönüyor — serbest metin olmamalı.
            [StringLength(AlanSinirlari.KapakRengi)]
            [RegularExpression("^#[0-9a-fA-F]{6}$",
                ErrorMessage = "Kapak rengi #rrggbb biçiminde olmalıdır.")]
            public string CoverColor { get; set; } = "#6366f1";

            [IzinliDeger(nameof(IzinliDegerler.Seviyeler))]
            public string Level { get; set; } = "A1";

            [IzinliDeger(nameof(IzinliDegerler.Kategoriler))]
            public string Category { get; set; } = "story";

            // "1,3,5-12" — rakam, virgül, tire ve boşluk dışına izin yok.
            [StringLength(AlanSinirlari.SayfaSecimiMetni)]
            [RegularExpression(@"^[0-9,\s-]*$",
                ErrorMessage = "Sayfa seçimi yalnızca rakam, virgül ve tire içerebilir.")]
            public string? PageSelection { get; set; }
        }

        [HttpPost("books/upload")]
        [RequestSizeLimit(DosyaDogrulayici.EnBuyukBoyut)]   // KURAL-10: sabit tek kaynaktan
        [EnableRateLimiting(HizSinirlari.DosyaYukleme)]   // KURAL-07: YENİ — 50 MB × N eşzamanlı PDF ayrıştırma
        public async Task<IActionResult> UploadBook(
            [FromForm] BookUploadRequest meta,
            IFormFile file)
        {
            // KURAL-10: tür İÇERİKTEN doğrulanır — dosya adından değil.
            // Ağır iş kapısına girmeden ÖNCE elenir: geçersiz bir dosya, meşru
            // yüklemelerin sırasını işgal etmemeli.
            _dogrulayici.Dogrula(file);

            if (string.IsNullOrWhiteSpace(meta.Title))
                return BadRequest(new { error = "Kitap başlığı zorunludur." });

            // KURAL-06: istisna metni yanıta KONMAZ.
            // PdfService, kullanıcıya gösterilebilir hataları (yanlış uzantı, boyut
            // aşımı, bozuk dosya) KullaniciHatasi olarak fırlatır; merkezî
            // HataYakalamaMiddleware onları aynen 400 ile iletir. Beklenmeyen her
            // şeyi de aynı middleware yakalar ve olay kimliğiyle 500 döner.
            // Eskiden buradaki iki catch, Groq/Npgsql istisna metnini gövdeye yazıyordu.
            var pdfData = await _pdfService.ExtractAndSplitAsync(file, meta.PageSelection);

            if (string.IsNullOrWhiteSpace(pdfData.FullText))
                return BadRequest(new { error = "Dosyadan metin çıkarılamadı. Dosya görsel tabanlı (taranmış) olabilir." });

            // Kitabı DB'ye kaydet
            var book = new Book
            {
                Title = meta.Title.KirpEnCok(AlanSinirlari.KitapBasligi),
                Author = meta.Author.KirpEnCok(AlanSinirlari.KitapYazari),
                Description = meta.Description.KirpEnCok(AlanSinirlari.KitapAciklama),
                Language = meta.Language,
                CoverColor = meta.CoverColor,
                Level = meta.Level ?? "A1",
                Category = meta.Category ?? "story",
                CreatedAt = DateTime.UtcNow
            };

            _db.Books.Add(book);
            await _db.SaveChangesAsync();

            // Bölümleri kaydet
            var chapters = pdfData.Chapters.Select(c => new Chapter
            {
                BookId = book.Id,
                ChapterNumber = c.Number,
                // KURAL-05: bölüm başlığı PDF içeriğinden/LLM yanıtından TÜRETİLİYOR,
                // yani sınırsız. Chapter.Title varchar(200) — kırpılmazsa yükleme 500 verir.
                Title = c.Title.KirpEnCok(AlanSinirlari.BolumBasligi),
                Content = c.Content
            }).ToList();

            _db.Chapters.AddRange(chapters);
            await _db.SaveChangesAsync();

            return Ok(new
            {
                success = true,
                bookId = book.Id,
                title = book.Title,
                chaptersCreated = chapters.Count,
                pageCount = pdfData.PageCount
            });
        }

        // ── POST /api/admin/books/upload-pages ──────────────────
        public class BookUploadPagesRequest
        {
            [Required(ErrorMessage = "Kitap başlığı zorunludur.")]
            [StringLength(AlanSinirlari.KitapBasligi, MinimumLength = 1,
                ErrorMessage = "Başlık en fazla {1} karakter olabilir.")]
            public string Title { get; set; } = "";

            [StringLength(AlanSinirlari.KitapYazari,
                ErrorMessage = "Yazar en fazla {1} karakter olabilir.")]
            public string? Author { get; set; }

            [StringLength(AlanSinirlari.KitapAciklama,
                ErrorMessage = "Açıklama en fazla {1} karakter olabilir.")]
            public string? Description { get; set; }

            [IzinliDeger(nameof(IzinliDegerler.Diller))]
            public string Language { get; set; } = "en";

            [StringLength(AlanSinirlari.KapakRengi)]
            [RegularExpression("^#[0-9a-fA-F]{6}$",
                ErrorMessage = "Kapak rengi #rrggbb biçiminde olmalıdır.")]
            public string CoverColor { get; set; } = "#6366f1";

            [IzinliDeger(nameof(IzinliDegerler.Seviyeler))]
            public string Level { get; set; } = "A1";

            [IzinliDeger(nameof(IzinliDegerler.Kategoriler))]
            public string Category { get; set; } = "story";

            [Required(ErrorMessage = "Lütfen yüklenecek sayfaları seçin.")]
            [StringLength(AlanSinirlari.SayfaSecimiMetni, MinimumLength = 1)]
            [RegularExpression(@"^[0-9,\s-]+$",
                ErrorMessage = "Sayfa seçimi yalnızca rakam, virgül ve tire içerebilir.")]
            public string SelectedPages { get; set; } = ""; // Comma-separated
        }

        [HttpPost("books/upload-pages")]
        [RequestSizeLimit(DosyaDogrulayici.EnBuyukBoyut)]   // KURAL-10: sabit tek kaynaktan
        [EnableRateLimiting(HizSinirlari.DosyaYukleme)]   // KURAL-07: YENİ
        public async Task<IActionResult> UploadBookPages(
            [FromForm] BookUploadPagesRequest meta,
            IFormFile file,
            CancellationToken iptal)
        {
            // ── KURAL-10, 1. adım: tür İÇERİKTEN belirlenir ──
            // Fırlatılan KullaniciHatasi'yı KURAL-06 middleware'i 400 + temiz
            // mesaja çevirir; iç detay sızmaz.
            var tur = _dogrulayici.Dogrula(file);

            if (string.IsNullOrWhiteSpace(meta.Title))
                return BadRequest(new { error = "Kitap başlığı zorunludur." });

            // ── 2. adım: UCUZ eleme, dosya HİÇ açılmadan ──
            // Sayfa üst sınırı ayrıştırıcıdan ÖNCE uygulanır. Tersi sırada
            // "100.000 sayfa seç" isteği önce ayrıştırıcıyı meşgul eder,
            // sınır ancak ondan sonra devreye girerdi.
            //
            // DOCX'te sayfa seçimi OKUNMAZ: bir Word belgesinin sayfa sonları
            // yazıcıya ve yazı tipine göre değişir, istemci onları bilemez.
            // Belge sunucuda sabit uzunlukta sayfalara bölünür ve TAMAMI kaydedilir.
            // (Panel de bu yüzden DOCX'te sayfa seçici göstermiyor.)
            var istenenSayfalar = tur == DosyaTuru.Docx
                ? Array.Empty<int>()
                : _dogrulayici.SecimiCoz(meta.SelectedPages);

            // ── 3. adım: PAHALI iş, tamamı ağır iş kapısının içinde (KURAL-07) ──
            // Sayfa sayısını okumak da dosyayı ayrıştırmak demektir; kapının
            // dışında bırakılırsa korumanın bir kanadı açık kalırdı.
            var metinler = await _agirIsKapisi.CalistirAsync(async () =>
            {
                if (tur == DosyaTuru.Docx)
                    return await _pdfService.DocxTumSayfalariniCikarAsync(file, iptal);

                var toplamSayfa = _pdfService.SayfaSayisiniOku(file);
                var sayfalar = _dogrulayici.AraligaKirp(istenenSayfalar, toplamSayfa);
                return await _pdfService.SayfalariCikarAsync(file, sayfalar, iptal);
            }, iptal);

            if (metinler.Count == 0)
            {
                _logger.LogInformation("Seçilen sayfaların hiçbirinden metin çıkarılamadı. SayfaSayisi={SayfaSayisi}",
                    istenenSayfalar.Count);
                return BadRequest(new { error = "Seçilen sayfaların hiçbirinden metin çıkarılamadı. Dosyanız taranmış/görsel tabanlı olabilir." });
            }

            // ── 4. adım: kitap ANCAK metin çıkarıldıktan SONRA oluşturulur ──
            // Eski akış kitabı önce yaratıp hata hâlinde "geri siliyordu"; her
            // yeni hata dalı o temizliği tekrar yazmayı gerektiriyordu ve biri
            // zaten unutulmuştu. Yetim kayıt riski artık tasarımdan kalktı.
            var book = new Book
            {
                Title = meta.Title.KirpEnCok(AlanSinirlari.KitapBasligi),
                Author = meta.Author.KirpEnCok(AlanSinirlari.KitapYazari),
                Description = meta.Description.KirpEnCok(AlanSinirlari.KitapAciklama),
                Language = meta.Language,
                CoverColor = meta.CoverColor,
                Level = meta.Level ?? "A1",
                Category = meta.Category ?? "story",
                CreatedAt = DateTime.UtcNow
            };

            _db.Books.Add(book);
            await _db.SaveChangesAsync();

            var gorunenNo = 1;
            var bookPages = metinler
                .OrderBy(g => g.Key)
                .Select(g => new BookPage
                {
                    BookId = book.Id,
                    PageNumber = gorunenNo++,
                    Content = g.Value,
                    SentencesJson = "[]"   // JIT çeviri için boş bırakıyoruz
                })
                .ToList();

            _db.BookPages.AddRange(bookPages);
            await _db.SaveChangesAsync();

            _logger.LogInformation("Kitap sayfalarıyla yüklendi. KitapId={KitapId} Sayfa={Sayfa}",
                book.Id, bookPages.Count);

            return Ok(new
            {
                success = true,
                bookId = book.Id,
                title = book.Title,
                pagesCreated = bookPages.Count
            });
        }

        // ── PUT /api/admin/books/{id} ────────────────────────
        public class BookUpdateRequest
        {
            [Required(ErrorMessage = "Kitap başlığı zorunludur.")]
            [StringLength(AlanSinirlari.KitapBasligi, MinimumLength = 1,
                ErrorMessage = "Başlık en fazla {1} karakter olabilir.")]
            public string Title { get; set; } = "";

            [StringLength(AlanSinirlari.KitapYazari,
                ErrorMessage = "Yazar en fazla {1} karakter olabilir.")]
            public string? Author { get; set; }

            [StringLength(AlanSinirlari.KitapAciklama,
                ErrorMessage = "Açıklama en fazla {1} karakter olabilir.")]
            public string? Description { get; set; }

            [IzinliDeger(nameof(IzinliDegerler.Diller))]
            public string Language { get; set; } = "en";

            [IzinliDeger(nameof(IzinliDegerler.Seviyeler))]
            public string Level { get; set; } = "A1";

            [IzinliDeger(nameof(IzinliDegerler.Kategoriler))]
            public string Category { get; set; } = "story";
        }

        [HttpPut("books/{id}")]
        [EnableRateLimiting(HizSinirlari.Yazma)]   // KURAL-07: YENİ
        public async Task<IActionResult> UpdateBook([Range(1, int.MaxValue, ErrorMessage = "Geçersiz kayıt numarası.")] int id, [FromBody] BookUpdateRequest request)
        {
            var book = await _db.Books.FirstOrDefaultAsync(b => b.Id == id);
            if (book == null)
                return NotFound(new { error = "Kitap bulunamadı." });

            if (string.IsNullOrWhiteSpace(request.Title))
                return BadRequest(new { error = "Kitap başlığı zorunludur." });

            book.Title = request.Title.KirpEnCok(AlanSinirlari.KitapBasligi);
            book.Author = request.Author.KirpEnCok(AlanSinirlari.KitapYazari);
            book.Description = request.Description.KirpEnCok(AlanSinirlari.KitapAciklama);
            book.Language = request.Language ?? "en";
            book.Level = request.Level ?? "A1";
            book.Category = request.Category ?? "story";

            await _db.SaveChangesAsync();

            // KURAL-08: Book entity'si Chapters/Pages navigasyonlarını taşır ve
            // ileride biri Include eklerse tüm kitap metni yanıta girer.
            var bolumSayisi = await _db.Chapters.CountAsync(c => c.BookId == id);
            var sayfaSayisi = await _db.BookPages.CountAsync(p => p.BookId == id);
            return Ok(new
            {
                success = true,
                book = new KitapYaniti(
                    book.Id, book.Title, book.Author, book.CoverColor, book.Description,
                    book.Level, book.Category, bolumSayisi, sayfaSayisi, 0f, 1)
            });
        }

        // ── DELETE /api/admin/books/{id} ────────────────────────
        /// <summary>Kitabı ve tüm ilişkili verilerini (bölümler, sayfalar, quizler, ilerlemeler) sil</summary>
        [HttpDelete("books/{id}")]
        [EnableRateLimiting(HizSinirlari.Yazma)]   // KURAL-07: YENİ
        public async Task<IActionResult> DeleteBook([Range(1, int.MaxValue, ErrorMessage = "Geçersiz kayıt numarası.")] int id)
        {
            var book = await _db.Books
                .Include(b => b.Chapters)
                .Include(b => b.Pages)
                .FirstOrDefaultAsync(b => b.Id == id);

            if (book == null)
                return NotFound(new { error = "Kitap bulunamadı." });

            // 1. İlişkili Quiz ve Soruları temizle
            var quizzes = await _db.Quizzes
                .Include(q => q.Questions)
                .Where(q => q.BookId == id)
                .ToListAsync();
            foreach (var q in quizzes)
            {
                if (q.Questions != null && q.Questions.Any())
                {
                    _db.QuizQuestions.RemoveRange(q.Questions);
                }
            }
            if (quizzes.Any())
            {
                _db.Quizzes.RemoveRange(quizzes);
            }

            // 2. İlişkili Grup Kitap Atamalarını sil
            var assignments = await _db.GroupBookAssignments.Where(a => a.BookId == id).ToListAsync();
            if (assignments.Any())
            {
                _db.GroupBookAssignments.RemoveRange(assignments);
            }

            // 3. Okuma İlerlemelerini temizle
            var progresses = await _db.ReadingProgresses.Where(p => p.BookId == id).ToListAsync();
            if (progresses.Any())
            {
                _db.ReadingProgresses.RemoveRange(progresses);
            }

            // 4. Kitabı sil (Chapters ve Pages cascade olarak silinir)
            _db.Books.Remove(book);
            
            await _db.SaveChangesAsync();

            return Ok(new { success = true, deletedBookId = id });
        }

        // ── GET /api/admin/groups ───────────────────────────────
        /// <summary>Tüm grupları listele</summary>
        [HttpGet("groups")]
        public async Task<IActionResult> GetGroups()
        {
            // KURAL-08 KARDEŞ YOL: bu uç her grubun davet kodunu döndürüyordu.
            // Yönetici panelinde kod hiçbir yerde KULLANILMIYOR (grep: admin-panel
            // içinde inviteCode geçmiyor) — yani saf fazla veriydi. Kodu görmenin
            // tek meşru sahibi grubun kendi sahibidir.
            // Include(g => g.Members) da projeksiyonun yanında gereksizdi.
            var groups = await _db.Groups
                .Select(g => new
                {
                    g.Id,
                    g.Name,
                    g.Description,
                    g.CreatedAt,
                    MemberCount = g.Members.Count
                })
                .ToListAsync();

            return Ok(groups);
        }
    }
}
