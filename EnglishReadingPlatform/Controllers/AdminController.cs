using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using EnglishReadingPlatform.Data;
using EnglishReadingPlatform.Models;
using EnglishReadingPlatform.Services;

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

        public AdminController(AppDbContext db, PdfService pdfService, TranslationService transService)
        {
            _db = db;
            _pdfService = pdfService;
            _transService = transService;
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
        public class UpdateRoleRequest { public string Role { get; set; } = ""; }

        [HttpPut("users/{id}/role")]
        public async Task<IActionResult> UpdateRole(int id, [FromBody] UpdateRoleRequest req)
        {
            var allowedRoles = new[] { "student", "teacher", "admin" };
            if (!allowedRoles.Contains(req.Role))
                return BadRequest(new { error = "Geçersiz rol. Geçerli roller: student, teacher, admin" });

            var user = await _db.Users.FindAsync(id);
            if (user == null) return NotFound(new { error = "Kullanıcı bulunamadı." });

            // Güvenlik: kendi hesabının rolünü değiştiremez
            var callerId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            if (user.Id == callerId)
                return BadRequest(new { error = "Kendi hesabınızın rolünü değiştiremezsiniz." });

            user.Role = req.Role;
            await _db.SaveChangesAsync();
            return Ok(new { success = true, userId = id, newRole = req.Role });
        }

        // ── DELETE /api/admin/users/{id} ────────────────────────
        /// <summary>Kullanıcıyı sil (kendi hesabını silemez)</summary>
        [HttpDelete("users/{id}")]
        public async Task<IActionResult> DeleteUser(int id)
        {
            var callerId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            if (id == callerId)
                return BadRequest(new { error = "Kendi hesabınızı silemezsiniz." });

            var user = await _db.Users.FindAsync(id);
            if (user == null) return NotFound(new { error = "Kullanıcı bulunamadı." });

            _db.Users.Remove(user);
            await _db.SaveChangesAsync();
            return Ok(new { success = true });
        }

        // ── GET /api/admin/books ─────────────────────────────────
        /// <summary>Tüm kitapları admin görünümüyle listele</summary>
        [HttpGet("books")]
        public async Task<IActionResult> GetBooks()
        {
            var books = await _db.Books
                .Include(b => b.Chapters)
                .Select(b => new
                {
                    b.Id,
                    b.Title,
                    b.Author,
                    b.Description,
                    b.Language,
                    b.CreatedAt,
                    ChapterCount = b.Chapters.Count
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
            public string Title { get; set; } = "";
            public string Author { get; set; } = "";
            public string Description { get; set; } = "";
            public string Language { get; set; } = "en";
            public string CoverColor { get; set; } = "#6366f1";
            public string? PageSelection { get; set; }
        }

        [HttpPost("books/upload")]
        [RequestSizeLimit(52_428_800)] // 50 MB
        public async Task<IActionResult> UploadBook(
            [FromForm] BookUploadRequest meta,
            IFormFile file)
        {
            if (file == null || file.Length == 0)
                return BadRequest(new { error = "PDF veya DOCX dosyası seçilmedi." });

            if (string.IsNullOrWhiteSpace(meta.Title))
                return BadRequest(new { error = "Kitap başlığı zorunludur." });

            PdfExtractResult pdfData;
            try
            {
                pdfData = await _pdfService.ExtractAndSplitAsync(file, meta.PageSelection);
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "Dosya işlenirken hata oluştu: " + ex.Message });
            }

            if (string.IsNullOrWhiteSpace(pdfData.FullText))
                return BadRequest(new { error = "Dosyadan metin çıkarılamadı. Dosya görsel tabanlı (taranmış) olabilir." });

            // Kitabı DB'ye kaydet
            var book = new Book
            {
                Title = meta.Title.Trim(),
                Author = meta.Author.Trim(),
                Description = meta.Description.Trim(),
                Language = meta.Language,
                CoverColor = meta.CoverColor,
                CreatedAt = DateTime.UtcNow
            };

            _db.Books.Add(book);
            await _db.SaveChangesAsync();

            // Bölümleri kaydet
            var chapters = pdfData.Chapters.Select(c => new Chapter
            {
                BookId = book.Id,
                ChapterNumber = c.Number,
                Title = c.Title,
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
            public string Title { get; set; } = "";
            public string Author { get; set; } = "";
            public string Description { get; set; } = "";
            public string Language { get; set; } = "en";
            public string CoverColor { get; set; } = "#6366f1";
            public string SelectedPages { get; set; } = ""; // Comma-separated
        }

        [HttpPost("books/upload-pages")]
        [RequestSizeLimit(52_428_800)] // 50 MB
        public async Task<IActionResult> UploadBookPages(
            [FromForm] BookUploadPagesRequest meta,
            IFormFile file)
        {
            if (file == null || file.Length == 0)
                return BadRequest(new { error = "PDF veya DOCX dosyası seçilmedi." });

            if (string.IsNullOrWhiteSpace(meta.Title))
                return BadRequest(new { error = "Kitap başlığı zorunludur." });

            if (string.IsNullOrWhiteSpace(meta.SelectedPages))
                return BadRequest(new { error = "Lütfen yüklenecek sayfaları seçin." });

            var selectedPageNumbers = meta.SelectedPages.Split(',')
                .Select(p => p.Trim())
                .Where(p => int.TryParse(p, out _))
                .Select(int.Parse)
                .OrderBy(p => p)
                .Distinct()
                .ToList();

            if (!selectedPageNumbers.Any())
                return BadRequest(new { error = "Geçerli bir sayfa seçilmedi." });

            var book = new Book
            {
                Title = meta.Title.Trim(),
                Author = meta.Author.Trim(),
                Description = meta.Description.Trim(),
                Language = meta.Language,
                CoverColor = meta.CoverColor,
                CreatedAt = DateTime.UtcNow
            };

            _db.Books.Add(book);
            await _db.SaveChangesAsync();

            var bookPages = new List<BookPage>();
            int displayPageNumber = 1;

            foreach (var pageNum in selectedPageNumbers)
            {
                string pageText = "";
                try
                {
                    pageText = _pdfService.ExtractSinglePageText(file, pageNum);
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[PDF UPLOAD ERROR] Sayfa {pageNum} okunurken hata: {ex.ToString()}");
                    return BadRequest(new { error = $"{pageNum}. sayfa okunurken hata oluştu: {ex.Message}" });
                }

                if (string.IsNullOrWhiteSpace(pageText))
                {
                    Console.WriteLine($"[PDF UPLOAD WARNING] Sayfa {pageNum} bos veya metin cikarilamadi.");
                    continue;
                }

                bookPages.Add(new BookPage
                {
                    BookId = book.Id,
                    PageNumber = displayPageNumber++,
                    Content = pageText.Trim(),
                    SentencesJson = "[]" // JIT çeviri için boş bırakıyoruz
                });
            }

            if (!bookPages.Any())
            {
                _db.Books.Remove(book);
                await _db.SaveChangesAsync();
                Console.WriteLine("[PDF UPLOAD ERROR] Secilen sayfalarin hicbirinden metin cikarilamadi.");
                return BadRequest(new { error = "Seçilen sayfaların hiçbirinden metin çıkarılamadı. PDF dosyanız taranmış/görsel tabanlı olabilir." });
            }

            _db.BookPages.AddRange(bookPages);
            await _db.SaveChangesAsync();

            return Ok(new
            {
                success = true,
                bookId = book.Id,
                title = book.Title,
                pagesCreated = bookPages.Count
            });
        }

        // ── DELETE /api/admin/books/{id} ────────────────────────
        /// <summary>Kitabı ve tüm ilişkili verilerini (bölümler, sayfalar, quizler, ilerlemeler) sil</summary>
        [HttpDelete("books/{id}")]
        public async Task<IActionResult> DeleteBook(int id)
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
            var groups = await _db.Groups
                .Include(g => g.Members)
                .Select(g => new
                {
                    g.Id,
                    g.Name,
                    g.Description,
                    g.InviteCode,
                    g.CreatedAt,
                    MemberCount = g.Members.Count
                })
                .ToListAsync();

            return Ok(groups);
        }
    }
}
