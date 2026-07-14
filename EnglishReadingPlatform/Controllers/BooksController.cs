using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using EnglishReadingPlatform.Data;
using EnglishReadingPlatform.Models;
using EnglishReadingPlatform.Services;

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

        private int CurrentUserId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        // GET /api/books — Kitaplık
        [HttpGet]
        public async Task<IActionResult> Index()
        {
            var books = await _db.Books.Include(b => b.Chapters).ToListAsync();
            var userId = CurrentUserId;
            var progresses = await _db.ReadingProgresses
                .Where(p => p.UserId == userId)
                .ToListAsync();

            var result = books.Select(b => new {
                b.Id,
                b.Title,
                b.Author,
                b.CoverColor,
                b.Description,
                ChaptersCount = b.Chapters.Count,
                Progress = progresses.FirstOrDefault(p => p.BookId == b.Id)?.ProgressPercent ?? 0f,
                CurrentChapter = progresses.FirstOrDefault(p => p.BookId == b.Id)?.CurrentChapter ?? 1
            });

            return Ok(result);
        }

        // GET /api/books/{id} — Kitap Detayı
        [HttpGet("{id}")]
        public async Task<IActionResult> GetBook(int id)
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
        [HttpGet("{id}/read")]
        public async Task<IActionResult> Read(int id, [FromQuery] int chapter = 1, [FromQuery] int page = 1)
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

                var userId = CurrentUserId;
                var progress = await _db.ReadingProgresses
                    .FirstOrDefaultAsync(p => p.UserId == userId && p.BookId == id);

                if (progress == null)
                {
                    progress = new ReadingProgress
                    {
                        UserId = userId,
                        BookId = id,
                        CurrentChapter = page, // map page to currentChapter for progress compatibility
                        ProgressPercent = (float)page / book.Pages.Count * 100,
                        LastRead = DateTime.UtcNow
                    };
                    _db.ReadingProgresses.Add(progress);
                }
                else
                {
                    progress.CurrentChapter = page;
                    progress.ProgressPercent = (float)page / book.Pages.Count * 100;
                    progress.LastRead = DateTime.UtcNow;
                }

                // JIT (Just-In-Time) Translation
                if (string.IsNullOrWhiteSpace(currentPage.SentencesJson) || currentPage.SentencesJson == "[]")
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

                var userId = CurrentUserId;
                var progress = await _db.ReadingProgresses
                    .FirstOrDefaultAsync(p => p.UserId == userId && p.BookId == id);

                if (progress == null)
                {
                    progress = new ReadingProgress
                    {
                        UserId = userId,
                        BookId = id,
                        CurrentChapter = chapter,
                        ProgressPercent = (float)chapter / book.Chapters.Count * 100,
                        LastRead = DateTime.UtcNow
                    };
                    _db.ReadingProgresses.Add(progress);
                }
                else
                {
                    progress.CurrentChapter = chapter;
                    progress.ProgressPercent = (float)chapter / book.Chapters.Count * 100;
                    progress.LastRead = DateTime.UtcNow;
                }

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
            public string Word { get; set; } = "";
            public string Translation { get; set; } = "";
            public string Context { get; set; } = "";
        }

        // POST /api/books/addword — Kelime ekle
        [HttpPost("addword")]
        public async Task<IActionResult> AddWord([FromBody] AddWordRequest req)
        {
            if (req == null || string.IsNullOrWhiteSpace(req.Word) || string.IsNullOrWhiteSpace(req.Translation))
            {
                return BadRequest(new { error = "Kelime ve çeviri zorunludur." });
            }

            var userId = CurrentUserId;
            var existing = await _db.WordListItems
                .AnyAsync(w => w.UserId == userId && w.Word == req.Word);

            if (!existing)
            {
                _db.WordListItems.Add(new WordListItem
                {
                    UserId = userId,
                    Word = req.Word.Trim(),
                    Translation = req.Translation.Trim(),
                    Context = req.Context?.Trim() ?? "",
                    AddedAt = DateTime.UtcNow
                });
                await _db.SaveChangesAsync();
            }

            return Ok(new { success = true });
        }

        // GET /api/books/words — Kelime listesi
        [HttpGet("words")]
        public async Task<IActionResult> Words()
        {
            var words = await _db.WordListItems
                .Where(w => w.UserId == CurrentUserId)
                .OrderByDescending(w => w.AddedAt)
                .ToListAsync();
            return Ok(words);
        }

        // PUT /api/books/words/{id} — Kelime güncelleme
        [HttpPut("words/{id}")]
        public async Task<IActionResult> UpdateWord(int id, [FromBody] AddWordRequest req)
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

            item.Word = req.Word.Trim();
            item.Translation = req.Translation.Trim();
            if (req.Context != null)
            {
                item.Context = req.Context.Trim();
            }

            await _db.SaveChangesAsync();
            return Ok(new { success = true });
        }

        // DELETE /api/books/words/{id}
        [HttpDelete("words/{id}")]
        public async Task<IActionResult> DeleteWord(int id)
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
        public async Task<IActionResult> GetQuiz(int chapterId)
        {
            var chapter = await _db.Chapters.Include(c => c.Book).FirstOrDefaultAsync(c => c.Id == chapterId);
            if (chapter == null) return NotFound(new { error = "Bölüm bulunamadı." });

            // Mevcut quiz var mı?
            var quiz = await _db.Quizzes
                .Include(q => q.Questions)
                .FirstOrDefaultAsync(q => q.ChapterId == chapterId);

            if (quiz == null)
            {
                quiz = new Quiz
                {
                    BookId = chapter.BookId,
                    ChapterId = chapterId,
                    Title = $"{chapter.Book.Title} — {chapter.Title} Quiz",
                    CreatedAt = DateTime.UtcNow
                };
                _db.Quizzes.Add(quiz);
                await _db.SaveChangesAsync();

                var questions = _quizGen.GenerateQuestions(chapter, quiz.Id, 5);
                _db.QuizQuestions.AddRange(questions);
                await _db.SaveChangesAsync();

                quiz = await _db.Quizzes.Include(q => q.Questions).FirstAsync(q => q.Id == quiz.Id);
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
            public int QuizId { get; set; }
            public Dictionary<int, string> Answers { get; set; } = new();
        }

        // POST /api/books/submitquiz
        [HttpPost("submitquiz")]
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
