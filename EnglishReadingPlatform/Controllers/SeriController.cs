using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using System.Text.RegularExpressions;
using EnglishReadingPlatform.Authorization;
using EnglishReadingPlatform.Contracts;
using EnglishReadingPlatform.RateLimiting;
using EnglishReadingPlatform.Services;
using EnglishReadingPlatform.Validation;

namespace EnglishReadingPlatform.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class SeriController : ControllerBase
    {
        private readonly ISeriServisi _seriServisi;
        private static readonly Regex SaatDilimiDesen = new(@"^[A-Za-z_]+(/[A-Za-z0-9_+\-]+){0,2}$", RegexOptions.Compiled);

        public SeriController(ISeriServisi seriServisi)
        {
            _seriServisi = seriServisi;
        }

        private int CurrentUserId => this.KullaniciId();

        /// <summary>
        /// GET /api/seri — Kullanıcının seri ve hedef durumunu döner.
        /// KURAL-17: Salt okunurdur, hiçbir veritabanı satırı yazmaz veya değiştirmez.
        /// </summary>
        [HttpGet]
        public async Task<IActionResult> Index()
        {
            var ozet = await _seriServisi.OzetGetirAsync(CurrentUserId);
            return Ok(ozet);
        }

        /// <summary>
        /// PUT /api/seri/ayarlar — Günlük hedef ve saat dilimi ayarlarını günceller.
        /// KÜTLE ATAMA YOKTUR: Yalnızca GünlükHedefXp ve SaatDilimi alınır.
        /// Hedef değişikliği bugünün hedefini değil, yarından itibaren geçerli olan hedefi değiştirir.
        /// </summary>
        [HttpPut("ayarlar")]
        [EnableRateLimiting(HizSinirlari.Yazma)]
        public async Task<IActionResult> AyarlariGuncelle([FromBody] GuncelleAyarlarRequest req)
        {
            if (req == null || (!req.GunlukHedefXp.HasValue && string.IsNullOrWhiteSpace(req.SaatDilimi) && string.IsNullOrWhiteSpace(req.Seviye) && !req.IlkAcilisTamamlandi.HasValue))
            {
                return BadRequest(new { error = "En az bir ayar gönderilmelidir." });
            }

            if (req.GunlukHedefXp.HasValue && !IzinliDegerler.GunlukHedefXp.Contains(req.GunlukHedefXp.Value))
            {
                return BadRequest(new { error = "Günlük hedef 10, 20, 30 ya da 50 XP olabilir." });
            }

            if (!string.IsNullOrWhiteSpace(req.SaatDilimi))
            {
                var tzStr = req.SaatDilimi.Trim();
                if (tzStr.Length > AlanSinirlari.SaatDilimi ||
                    !SaatDilimiDesen.IsMatch(tzStr) ||
                    !TimeZoneInfo.TryFindSystemTimeZoneById(tzStr, out _))
                {
                    return BadRequest(new { error = "Saat dilimi tanınmadı." });
                }
            }

            if (!string.IsNullOrWhiteSpace(req.Seviye))
            {
                var sStr = req.Seviye.Trim();
                if (sStr.Length > AlanSinirlari.KullaniciSeviye ||
                    !IzinliDegerler.KullaniciSeviyeleri.Contains(sStr))
                {
                    return BadRequest(new { error = "Geçersiz seviye." });
                }
            }

            var guncelOzet = await _seriServisi.AyarGuncelleAsync(CurrentUserId, req.GunlukHedefXp, req.SaatDilimi?.Trim(), req.Seviye?.Trim(), req.IlkAcilisTamamlandi);
            return Ok(guncelOzet);
        }
    }
}
