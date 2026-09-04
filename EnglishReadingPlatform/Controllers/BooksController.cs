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

        public BooksController(AppDbContext db, QuizGeneratorService quizGen, TranslationService transService)
        {
            _db = db;
            _quizGen = quizGen;
            _transService = transService;
        }

        // KURAL-05: claim de bir GİRDİDİR. int.Parse(...!) bozuk bir claim'de
        // FormatException/NullReferenceException fırlatıp 500 üretirdi.
        private int CurrentUserId => this.KullaniciId();

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
        private async Task IlerlemeyiYazAsync(int kitapId, int konum, float yuzde)
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

                if (await _db.BenzersizKaydetAsync()) return;

                // Yarışı kaybettik: satırı bu arada başka bir istek açtı.
                ilerleme = await _db.ReadingProgresses
                    .FirstOrDefaultAsync(p => p.UserId == kullaniciId && p.BookId == kitapId);
                if (ilerleme is null) return;   // araya silme girdiyse sessizce geç
            }

            ilerleme.CurrentChapter = konum;
            ilerleme.ProgressPercent = yuzde;
            ilerleme.LastRead = DateTime.UtcNow;
            await _db.SaveChangesAsync();
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
        [HttpGet("{id}/read")]
        [EnableRateLimiting(HizSinirlari.Okuma)]   // KURAL-07: elle yazılan sayaçtan devralındı
        public async Task<IActionResult> Read(
            [Range(1, int.MaxValue, ErrorMessage = "Geçersiz kayıt numarası.")] int id,
            [FromQuery] [Range(1, int.MaxValue, ErrorMessage = "Bölüm numarası 1'den küçük olamaz.")] int chapter = 1,
            [FromQuery] [Range(1, int.MaxValue, ErrorMessage = "Sayfa numarası 1'den küçük olamaz.")] int page = 1,
            [FromQuery] bool reanalyze = false)
        {
            var book = await _db.Books
                .Include(b => b.Chapters)
                .Include(b => b.Pages)
                .FirstOrDefaultAsync(b => b.Id == id);

            if (book == null) return NotFound(new { error = "Kitap bulunamadı." });

            var hasPages = book.Pages.Any();

            if (hasPages)
            {
                var currentPage = book.Pages.FirstOrDefault(p => p.PageNumber == page)
                    ?? book.Pages.FirstOrDefault();

                if (currentPage == null) return NotFound(new { error = "Sayfa bulunamadı." });

                // KURAL-12: (UserId, BookId) artık veritabanında TEKİL.
                // Konum, sayfa numarasıyla eşlenir (ilerleme sözleşmesi korunur).
                await IlerlemeyiYazAsync(id, page, (float)page / book.Pages.Count * 100);

                // JIT (Just-In-Time) Translation or Forced Re-analysis
                if (reanalyze || string.IsNullOrWhiteSpace(currentPage.SentencesJson) || currentPage.SentencesJson == "[]")
                {
                    var sentencesData = await _transService.AnalyzeTextAsync(currentPage.Content);
                    if (sentencesData.Any())
                    {
                        currentPage.SentencesJson = System.Text.Json.JsonSerializer.Serialize(sentencesData);
                    }
                }

                await _db.SaveChangesAsync();

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
                    PageNumber = page
                });
            }
            else
            {
                var currentChapter = book.Chapters.FirstOrDefault(c => c.ChapterNumber == chapter)
                    ?? book.Chapters.FirstOrDefault();

                if (currentChapter == null) return NotFound(new { error = "Bölüm bulunamadı." });

                // KURAL-12: (UserId, BookId) artık veritabanında TEKİL.
                await IlerlemeyiYazAsync(id, chapter, (float)chapter / book.Chapters.Count * 100);

                await _db.SaveChangesAsync();

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
                    ChapterNumber = chapter
                });
            }
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

            var userId = CurrentUserId;

            // KURAL-05: kolon sınırına yazılmadan önce SON savunma hattı.
            // Kırpma, benzersizlik kontrolünden ÖNCE yapılır: veritabanına giden
            // değer neyse tekillik de onun üzerinden ölçülmelidir.
            var kelime = req.Word.KirpEnCok(AlanSinirlari.Kelime);

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
                await _db.BenzersizKaydetAsync();
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
                .Select(w => new KelimeYaniti(w.Id, w.Word, w.Translation, w.Context, w.AddedAt))
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

            var item = await _db.WordListItems
                .FirstOrDefaultAsync(w => w.Id == id && w.UserId == CurrentUserId);
            if (item == null)
            {
                return NotFound(new { error = "Kelime bulunamadı." });
            }

            // KURAL-05: AddWord ile aynı kolonlara yazan KARDEŞ YOL — aynı kırpma uygulanır.
            // Tek yolu düzeltip bunu atlamak, açığın yarısını açık bırakırdı.
            item.Word = req.Word.KirpEnCok(AlanSinirlari.Kelime);
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
        [HttpGet("words/calisma")]
        public async Task<IActionResult> CalismaSeansi(
            [FromQuery]
            [Range(KelimeCalismasi.EnAzSeansBoyu, KelimeCalismasi.EnCokSeansBoyu,
                   ErrorMessage = "Seans boyu {1} ile {2} arasında olmalıdır.")]
            int adet = KelimeCalismasi.VarsayilanSeansBoyu)
        {
            var userId = CurrentUserId;

            // Sahiplik SORGUNUN İÇİNDE: başkasının kelimesi hiç okunmaz.
            var kartlar = await _db.WordListItems
                .Where(w => w.UserId == userId)
                .OrderBy(w => w.SonCalismaAt == null ? 0
                            : w.DogruSeri < KelimeCalismasi.OgrenildiEsigi ? 1 : 2)
                .ThenBy(w => w.SonCalismaAt)
                .ThenBy(w => EF.Functions.Random())
                .Take(adet)
                .Select(w => new CalismaKartiYaniti(
                    w.Id, w.Word, w.Translation, w.Context,
                    w.DogruSeri,
                    w.DogruSeri >= KelimeCalismasi.OgrenildiEsigi))
                .ToListAsync();

            return Ok(kartlar);
        }

        // GET /api/books/words/ozet
        //
        // "Kaç kelime biliyorum?" sorusunun tek cevabı. Sayım SQL'de yapılır:
        // 200 satırı belleğe çekip saymak, listeyi büyüten kullanıcıyı
        // cezalandırırdı.
        [HttpGet("words/ozet")]
        public async Task<IActionResult> KelimeOzeti()
        {
            var userId = CurrentUserId;
            const int esik = KelimeCalismasi.OgrenildiEsigi;

            var ozet = await _db.WordListItems
                .Where(w => w.UserId == userId)
                .GroupBy(_ => 1)
                .Select(g => new KelimeOzetiYaniti(
                    g.Count(),
                    g.Count(w => w.DogruSeri >= esik),
                    g.Count(w => w.SonCalismaAt != null && w.DogruSeri < esik),
                    g.Count(w => w.SonCalismaAt == null),
                    esik))
                .FirstOrDefaultAsync();

            // Hiç kelimesi olmayan kullanıcıda GroupBy boş döner.
            return Ok(ozet ?? new KelimeOzetiYaniti(0, 0, 0, 0, esik));
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
        // KÜTLE ATAMA YOK: istek yalnızca "hangi kelime" ve "bildim mi" taşır.
        // Sayaçları sunucu hesaplar — istemci DogruSeri'yi doğrudan yazamaz,
        // yoksa "öğrenildi" rozeti tek bir istekle satın alınabilirdi.
        [HttpPost("words/calisma-sonucu")]
        [EnableRateLimiting(HizSinirlari.Yazma)]
        public async Task<IActionResult> CalismaSonucu([FromBody] CalismaSonucuIstegi req)
        {
            if (req == null) return BadRequest(new { error = "Geçersiz veri." });

            var userId = CurrentUserId;

            // Sahiplik sorgunun İÇİNDE (IDOR): sıradaki kayıt numarası
            // denenerek başkasının kelime ilerlemesi bozulamaz.
            var kelime = await _db.WordListItems
                .FirstOrDefaultAsync(w => w.Id == req.KelimeId && w.UserId == userId);

            if (kelime is not null)
            {
                if (req.Bildim)
                {
                    kelime.DogruSayisi++;
                    kelime.DogruSeri++;
                }
                else
                {
                    kelime.YanlisSayisi++;
                    kelime.DogruSeri = 0;   // seri kırılır — ezber öğrenme sayılmaz
                }

                kelime.SonCalismaAt = DateTime.UtcNow;
                await _db.SaveChangesAsync();
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
        [HttpGet("quiz/{chapterId}")]
        public async Task<IActionResult> GetQuiz([Range(1, int.MaxValue, ErrorMessage = "Geçersiz kayıt numarası.")] int chapterId)
        {
            var chapter = await _db.Chapters.Include(c => c.Book).FirstOrDefaultAsync(c => c.Id == chapterId);
            if (chapter == null) return NotFound(new { error = "Bölüm bulunamadı." });

            // Mevcut quiz var mı?
            var quiz = await _db.Quizzes
                .Include(q => q.Questions)
                .FirstOrDefaultAsync(q => q.ChapterId == chapterId);

            if (quiz == null)
            {
                var yeniQuiz = new Quiz
                {
                    BookId = chapter.BookId,
                    ChapterId = chapterId,
                    Title = $"{chapter.Book.Title} — {chapter.Title} Quiz",
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

            return Ok(new {
                quiz.Id,
                quiz.Title,
                quiz.BookId,
                quiz.ChapterId,
                Questions = quiz.Questions.Select(q => new {
                    q.Id,
                    q.QuestionText,
                    Options = new[] { q.OptionA, q.OptionB, q.OptionC, q.OptionD }
                })
            });
        }

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

            return Ok(new {
                Score = correct,
                Total = quiz.Questions.Count,
                Evaluation = evaluation
            });
        }
    }
}
