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
    public class ActivityController : ControllerBase
    {
        private readonly AppDbContext _db;

        public ActivityController(AppDbContext db)
        {
            _db = db;
        }

        public class LogActivityRequest
        {
            public string ActivityType { get; set; } = "";
            public string Details { get; set; } = "";
            public int DurationSeconds { get; set; }
        }

        // POST /api/activity/log
        [HttpPost("log")]
        public async Task<IActionResult> LogActivity([FromBody] LogActivityRequest req)
        {
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier);
            if (userIdClaim == null)
            {
                return Unauthorized(new { error = "Oturum açılmamış." });
            }

            var userId = int.Parse(userIdClaim.Value);

            // Son 5 dakika içinde aynı aktivite var mı kontrol et (varsa süreyi arttır)
            var threshold = DateTime.UtcNow.AddMinutes(-5);
            var existingLog = await _db.UserActivityLogs
                .FirstOrDefaultAsync(l => l.UserId == userId 
                                          && l.ActivityType == req.ActivityType 
                                          && l.Details == req.Details 
                                          && l.Timestamp >= threshold);

            if (existingLog != null)
            {
                existingLog.DurationSeconds += req.DurationSeconds;
                existingLog.Timestamp = DateTime.UtcNow;
                _db.UserActivityLogs.Update(existingLog);
            }
            else
            {
                var newLog = new UserActivityLog
                {
                    UserId = userId,
                    ActivityType = req.ActivityType,
                    Details = req.Details,
                    DurationSeconds = req.DurationSeconds,
                    Timestamp = DateTime.UtcNow
                };
                _db.UserActivityLogs.Add(newLog);
            }

            await _db.SaveChangesAsync();
            return Ok(new { success = true });
        }

        // GET /api/activity/stats
        [HttpGet("stats")]
        public async Task<IActionResult> GetStats()
        {
            // İleride admin kontrolü de eklenebilir, şu an genel liste dönüyoruz
            var stats = await _db.UserActivityLogs
                .Include(l => l.User)
                .OrderByDescending(l => l.Timestamp)
                .Take(100)
                .Select(l => new {
                    l.Id,
                    l.UserId,
                    Username = l.User.Username,
                    l.ActivityType,
                    l.Details,
                    l.DurationSeconds,
                    l.Timestamp
                })
                .ToListAsync();

            return Ok(stats);
        }
    }
}
