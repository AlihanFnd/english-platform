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
    public class GroupsController : ControllerBase
    {
        private readonly AppDbContext _db;

        public GroupsController(AppDbContext db)
        {
            _db = db;
        }

        private int CurrentUserId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        // GET /api/groups
        [HttpGet]
        public async Task<IActionResult> Index()
        {
            var userId = CurrentUserId;
            var myGroups = await _db.GroupMembers
                .Where(gm => gm.UserId == userId)
                .Include(gm => gm.Group)
                    .ThenInclude(g => g.Members)
                .Include(gm => gm.Group)
                    .ThenInclude(g => g.BookAssignments)
                        .ThenInclude(a => a.Book)
                .Select(gm => gm.Group)
                .ToListAsync();

            var adminGroups = await _db.Groups
                .Where(g => g.AdminUserId == userId)
                .Include(g => g.Members)
                    .ThenInclude(m => m.User)
                .Include(g => g.BookAssignments)
                    .ThenInclude(a => a.Book)
                .ToListAsync();

            return Ok(new
            {
                MyGroups = myGroups.Select(g => new
                {
                    g.Id,
                    g.Name,
                    g.Description,
                    g.InviteCode,
                    MembersCount = g.Members.Count,
                    Assignments = g.BookAssignments.Select(a => new { a.BookId, a.Book.Title })
                }),
                AdminGroups = adminGroups.Select(g => new
                {
                    g.Id,
                    g.Name,
                    g.Description,
                    g.InviteCode,
                    MembersCount = g.Members.Count,
                    Assignments = g.BookAssignments.Select(a => new { a.BookId, a.Book.Title })
                })
            });
        }

        public class CreateGroupRequest
        {
            public string Name { get; set; } = "";
            public string Description { get; set; } = "";
        }

        // POST /api/groups
        [HttpPost]
        public async Task<IActionResult> Create([FromBody] CreateGroupRequest req)
        {
            if (req == null || string.IsNullOrWhiteSpace(req.Name))
            {
                return BadRequest(new { error = "Grup adı zorunludur." });
            }

            var group = new Group
            {
                Name = req.Name.Trim(),
                Description = req.Description?.Trim() ?? "",
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

            return Ok(group);
        }

        public class JoinGroupRequest
        {
            public string InviteCode { get; set; } = "";
        }

        // POST /api/groups/join
        [HttpPost("join")]
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
                await _db.SaveChangesAsync();
            }

            return Ok(new { success = true, groupId = group.Id, groupName = group.Name });
        }

        // GET /api/groups/{id}
        [HttpGet("{id}")]
        public async Task<IActionResult> GetGroupDetails(int id)
        {
            var userId = CurrentUserId;
            var group = await _db.Groups
                .Include(g => g.Members).ThenInclude(m => m.User)
                .Include(g => g.BookAssignments).ThenInclude(a => a.Book)
                .FirstOrDefaultAsync(g => g.Id == id);

            if (group == null) return NotFound(new { error = "Grup bulunamadı." });

            // Sadece grup üyeleri veya admin erişebilir
            var isMember = group.Members.Any(m => m.UserId == userId) || group.AdminUserId == userId;
            if (!isMember) return Forbid();

            var books = await _db.Books.ToListAsync();
            
            // Üye ilerlemeleri
            var memberIds = group.Members.Select(m => m.UserId).ToList();
            var progresses = await _db.ReadingProgresses
                .Where(p => memberIds.Contains(p.UserId))
                .Include(p => p.Book)
                .Include(p => p.User)
                .ToListAsync();

            // Quiz sonuçları
            var quizResults = await _db.QuizResults
                .Where(r => memberIds.Contains(r.UserId))
                .Include(r => r.User)
                .Include(r => r.Quiz).ThenInclude(q => q.Book)
                .ToListAsync();

            return Ok(new
            {
                Group = new
                {
                    group.Id,
                    group.Name,
                    group.Description,
                    group.InviteCode,
                    group.AdminUserId,
                    Members = group.Members.Select(m => new { m.UserId, m.User.Username, m.Role })
                },
                AllBooks = books.Select(b => new { b.Id, b.Title }),
                Progresses = progresses.Select(p => new
                {
                    p.UserId,
                    p.User.Username,
                    BookTitle = p.Book.Title,
                    p.ProgressPercent,
                    p.CurrentChapter,
                    p.LastRead
                }),
                QuizResults = quizResults.Select(r => new
                {
                    r.User.Username,
                    BookTitle = r.Quiz.Book.Title,
                    QuizTitle = r.Quiz.Title,
                    r.Score,
                    r.TotalQuestions,
                    r.TakenAt
                })
            });
        }

        public class AssignBookRequest
        {
            public int GroupId { get; set; }
            public int BookId { get; set; }
        }

        // POST /api/groups/assignbook
        [HttpPost("assignbook")]
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
                await _db.SaveChangesAsync();
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

        public TranslateController(TranslationService transService)
        {
            _transService = transService;
        }

        public record TReq(string Text);

        [HttpPost("word")]
        public async Task<IActionResult> Word([FromBody] TReq req)
        {
            if (string.IsNullOrWhiteSpace(req.Text)) return Ok(new { translation = "" });
            var r = await _transService.TranslateWordAsync(req.Text.Trim());
            return Ok(new { translation = r.Tr, type = r.Type });
        }

        [HttpPost("sentence")]
        public async Task<IActionResult> Sentence([FromBody] TReq req)
        {
            if (string.IsNullOrWhiteSpace(req.Text)) return Ok(new { translation = "" });
            var tr = await _transService.TranslateSentenceAsync(req.Text.Trim());
            return Ok(new { translation = tr });
        }

        [HttpPost("analyze")]
        public async Task<IActionResult> Analyze([FromBody] TReq req)
        {
            if (string.IsNullOrWhiteSpace(req.Text)) return BadRequest(new { error = "Metin boş." });
            try
            {
                var sentences = await _transService.AnalyzeTextAsync(req.Text.Trim());
                if (!sentences.Any()) return BadRequest(new { error = "Metinde cümle bulunamadı." });

                return Ok(new { sentences });
            }
            catch (Exception ex) { return StatusCode(500, new { error = "Çeviri hatası: " + ex.Message }); }
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

        private int CurrentUserId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        // GET /api/dashboard/stats
        [HttpGet("stats")]
        public async Task<IActionResult> Stats()
        {
            var userId = CurrentUserId;
            var user = await _db.Users.FindAsync(userId);
            if (user == null) return NotFound(new { error = "Kullanıcı bulunamadı." });

            var recentProgress = await _db.ReadingProgresses
                .Where(p => p.UserId == userId)
                .Include(p => p.Book)
                .OrderByDescending(p => p.LastRead)
                .Take(3)
                .ToListAsync();

            var wordCount = await _db.WordListItems.CountAsync(w => w.UserId == userId);
            var quizCount = await _db.QuizResults.CountAsync(r => r.UserId == userId);

            return Ok(new
            {
                User = new { user.Id, user.Username, user.Email, user.Role },
                RecentProgress = recentProgress.Select(p => new
                {
                    p.BookId,
                    BookTitle = p.Book.Title,
                    p.ProgressPercent,
                    p.CurrentChapter,
                    p.LastRead
                }),
                WordCount = wordCount,
                QuizCount = quizCount
            });
        }

        // GET /api/dashboard/ocr
        [HttpGet("ocr")]
        public async Task<IActionResult> OCR()
        {
            var userId = CurrentUserId;
            var records = await _db.OcrRecords
                .Where(r => r.UserId == userId)
                .OrderByDescending(r => r.ScannedAt)
                .ToListAsync();
            return Ok(records);
        }

        public class SaveOcrRequest
        {
            public string Text { get; set; } = "";
        }

        // POST /api/dashboard/ocr
        [HttpPost("ocr")]
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
            return Ok(record);
        }
    }
}
