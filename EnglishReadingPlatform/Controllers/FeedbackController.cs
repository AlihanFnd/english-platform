using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using EnglishReadingPlatform.Authorization;
using EnglishReadingPlatform.Data;
using EnglishReadingPlatform.Models;
using EnglishReadingPlatform.RateLimiting;
using EnglishReadingPlatform.Validation;
using System.ComponentModel.DataAnnotations;

namespace EnglishReadingPlatform.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class FeedbackController : ControllerBase
    {
        private readonly AppDbContext _db;

        public FeedbackController(AppDbContext db)
        {
            _db = db;
        }

        public class CreateFeedbackRequest
        {
            [Required(ErrorMessage = "Mesaj içeriği boş olamaz.")]
            [StringLength(AlanSinirlari.GeriBildirim, MinimumLength = 1,
                ErrorMessage = "Mesaj en fazla {1} karakter olabilir.")]
            public string Message { get; set; } = "";
        }

        // POST /api/feedback
        [HttpPost]
        [EnableRateLimiting(HizSinirlari.Yazma)]   // KURAL-07: YENİ — spam
        public async Task<IActionResult> CreateFeedback([FromBody] CreateFeedbackRequest req)
        {
            if (req == null || string.IsNullOrWhiteSpace(req.Message))
            {
                return BadRequest(new { error = "Mesaj içeriği boş olamaz." });
            }

            // KURAL-05: claim'in VARLIĞI yetmez, SAYIYA ÇEVRİLEBİLİR olması da gerekir.
            // int.Parse bozuk bir claim'de 500 üretirdi.
            if (!this.KullaniciIdAl(out var userId))
            {
                return Unauthorized(new { error = "Oturum bilgisi geçersiz." });
            }

            var feedback = new Feedback
            {
                UserId = userId,
                Message = req.Message.Trim(),
                CreatedAt = DateTime.UtcNow
            };

            _db.Feedbacks.Add(feedback);
            await _db.SaveChangesAsync();

            return Ok(new { success = true });
        }

        // GET /api/feedback/list
        [HttpGet("list")]
        [Authorize(Policy = "AdminOnly")]
        public async Task<IActionResult> GetFeedbackList()
        {
            // KURAL-08: Include(f => f.User) projeksiyonun yanında ÖLÜ KODDU —
            // EF onu zaten yok sayıyor. Bırakılması "burada tüm User yükleniyor"
            // yanılgısı yaratır; kaldırıldı.
            var feedbacks = await _db.Feedbacks
                .OrderByDescending(f => f.CreatedAt)
                .Select(f => new
                {
                    f.Id,
                    f.Message,
                    f.CreatedAt,
                    Username = f.User.Username,
                    Email = f.User.Email
                })
                .ToListAsync();

            return Ok(feedbacks);
        }
    }
}
