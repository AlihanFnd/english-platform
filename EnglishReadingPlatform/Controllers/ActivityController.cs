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
    public class ActivityController : ControllerBase
    {
        private readonly AppDbContext _db;

        public ActivityController(AppDbContext db)
        {
            _db = db;
        }

        // KURAL-05: üç alan da istemci kontrollü ve doğrudan varchar kolonlara yazılıyordu.
        public class LogActivityRequest
        {
            [Required(ErrorMessage = "Aktivite tipi zorunludur.")]
            [StringLength(AlanSinirlari.AktiviteTipi)]
            [IzinliDeger(nameof(IzinliDegerler.AktiviteTipleri))]
            public string ActivityType { get; set; } = "";

            [StringLength(AlanSinirlari.AktiviteDetay,
                ErrorMessage = "Aktivite detayı en fazla {1} karakter olabilir.")]
            public string Details { get; set; } = "";

            // Yeni koruma: istemci 999999999 gönderip istatistikleri bozabiliyordu.
            [Range(0, AlanSinirlari.AktiviteSuresiEnCok,
                ErrorMessage = "Süre 0-{2} saniye arasında olmalıdır.")]
            public int DurationSeconds { get; set; }
        }

        // POST /api/activity/log
        // Arayüzdeki useActivityTracker 30 saniyede bir gönderiyor (dakikada 2) —
        // 60/dk sınırı meşru akışın çok üstünde, kötüye kullanımın altında.
        [HttpPost("log")]
        [EnableRateLimiting(HizSinirlari.Yazma)]   // KURAL-07: YENİ — log tablosu şişirilebiliyordu
        public async Task<IActionResult> LogActivity([FromBody] LogActivityRequest req)
        {
            // KURAL-05: claim'in VARLIĞI yetmez, SAYIYA ÇEVRİLEBİLİR olması da gerekir.
            // int.Parse bozuk bir claim'de 500 üretirdi.
            if (!this.KullaniciIdAl(out var userId))
            {
                return Unauthorized(new { error = "Oturum bilgisi geçersiz." });
            }

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
        //
        // KURAL-03: Bu uç TÜM kullanıcıların adını, okuduğu kitabı, harcadığı süreyi
        // ve "Word: {kelime}" biçiminde bilmediği kelimeleri döndürüyor. Sınıf
        // düzeyindeki [Authorize] yalnızca "giriş yapmış olmayı" şart koştuğu için
        // herhangi bir öğrenci tokenıyla erişilebiliyordu. Meşru tüketicisi zaten
        // yönetici paneli dashboard'u (admin-panel/app/dashboard/page.tsx).
        [HttpGet("stats")]
        [Authorize(Policy = "AdminOnly")]
        public async Task<IActionResult> GetStats()
        {
            // KURAL-08: Include(l => l.User) projeksiyonun yanında ÖLÜ KODDU.
            var stats = await _db.UserActivityLogs
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
