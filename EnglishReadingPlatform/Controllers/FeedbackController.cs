using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using EnglishReadingPlatform.Data;
using EnglishReadingPlatform.Models;

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
            public string Message { get; set; } = "";
        }

        // POST /api/feedback
        [HttpPost]
        public async Task<IActionResult> CreateFeedback([FromBody] CreateFeedbackRequest req)
        {
            if (req == null || string.IsNullOrWhiteSpace(req.Message))
            {
                return BadRequest(new { error = "Mesaj içeriği boş olamaz." });
            }

            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier);
            if (userIdClaim == null)
            {
                return Unauthorized(new { error = "Oturum açılmamış." });
            }

            var userId = int.Parse(userIdClaim.Value);

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
            var feedbacks = await _db.Feedbacks
                .Include(f => f.User)
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
