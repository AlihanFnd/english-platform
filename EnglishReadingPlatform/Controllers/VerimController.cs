using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using EnglishReadingPlatform.Authorization;
using EnglishReadingPlatform.Data;
using EnglishReadingPlatform.RateLimiting;
using EnglishReadingPlatform.Security;
using EnglishReadingPlatform.Validation;
using System.ComponentModel.DataAnnotations;

namespace EnglishReadingPlatform.Controllers;

/// <summary>
/// KURAL-19: veri sahibinin kendi verisi üzerindeki hakları.
///
/// Kullanıcı bugüne kadar kendi verisinin tamamını göremiyor, dışa
/// aktaramıyor ve hesabını silemiyordu — yalnızca bir yönetici silebiliyordu.
/// </summary>
[Authorize]
[ApiController]
[Route("api/verim")]
public class VerimController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ITokenIptalDeposu _iptalDeposu;
    private readonly ILogger<VerimController> _logger;

    public VerimController(AppDbContext db, ITokenIptalDeposu iptalDeposu,
                           ILogger<VerimController> logger)
    {
        _db = db;
        _iptalDeposu = iptalDeposu;
        _logger = logger;
    }

    private int KullaniciId => this.KullaniciId();

    // GET /api/verim/envanter
    //
    // KURAL-19: "hangi verimi, neden, ne kadar süre tutuyorsunuz?"
    // Envanterden ÜRETİLİR — dokümandaki bir tablo gibi sessizce eskiyemez.
    [HttpGet("envanter")]
    public IActionResult Envanter()
        => Ok(new
        {
            kalemler = KisiselVeriEnvanteri.Kalemler.Select(k => new
            {
                tablo   = k.Tablo,
                alan    = k.Alan,
                sinif   = k.Sinif.ToString(),
                sebep   = k.Sebep,
                saklama = k.SaklamaGunu is int g ? $"{g} gün" : "hesap silinene kadar",
                disaAktarilir = k.DisaAktarilir && k.Sinif != VeriSinifi.Sir,
            })
        });

    // GET /api/verim/disa-aktar
    //
    // KURAL-19: kullanıcı kendi verisinin TAMAMINI alabilmeli.
    //
    // Her sorgu AÇIKÇA kullanıcıya filtrelenir. Bu ucun en tehlikeli hatası
    // filtreyi unutmaktır: o zaman uç, bütün veritabanını dökmüş olur —
    // mümkün olan en büyük sızıntı. Sözleşme testi bunu ayrıca ölçüyor.
    //
    // Include KULLANILMAZ: navigasyon özellikleri User'a döner ve
    // PasswordHash yanıta sızar (KURAL-08'in kapattığı hata). Yalnızca
    // projeksiyon.
    [HttpGet("disa-aktar")]
    [EnableRateLimiting(HizSinirlari.Yazma)]   // pahalı sorgu; dar kotada
    public async Task<IActionResult> DisaAktar()
    {
        var id = KullaniciId;

        var kullanici = await _db.Users
            .Where(u => u.Id == id)
            .Select(u => new { u.Id, u.Username, u.Email, u.Role, u.CreatedAt })
            .FirstOrDefaultAsync();

        if (kullanici is null) return NotFound(new { error = "Kullanıcı bulunamadı." });

        var kelimeler = await _db.WordListItems
            .Where(w => w.UserId == id)
            .Select(w => new { w.Word, w.Translation, w.Context, w.AddedAt })
            .ToListAsync();

        var ilerleme = await _db.ReadingProgresses
            .Where(p => p.UserId == id)
            .Select(p => new { p.BookId, p.CurrentChapter, p.ProgressPercent, p.LastRead })
            .ToListAsync();

        var quizSonuclari = await _db.QuizResults
            .Where(q => q.UserId == id)
            .Select(q => new { q.QuizId, q.Score, q.TotalQuestions, q.TakenAt })
            .ToListAsync();

        var ocrKayitlari = await _db.OcrRecords
            .Where(o => o.UserId == id)
            .Select(o => new { o.ExtractedText, o.ScannedAt })
            .ToListAsync();

        var aktivite = await _db.UserActivityLogs
            .Where(a => a.UserId == id)
            .Select(a => new { a.ActivityType, a.Details, a.DurationSeconds, a.Timestamp })
            .ToListAsync();

        var geriBildirimler = await _db.Feedbacks
            .Where(f => f.UserId == id)
            .Select(f => new { f.Message, f.CreatedAt })
            .ToListAsync();

        _logger.LogInformation("Veri dışa aktarıldı. KullaniciId={Id}", id);

        return Ok(new
        {
            olusturulma = DateTime.UtcNow,
            // Dışa aktarma dosyası kullanıcının indirdiği, paylaştığı bir
            // dosyadır. Neyin İÇİNDE OLMADIĞINI söylemek, "eksik" sanılıp
            // destek talebi açılmasını da önler.
            not = "Şifre hash'i ve hesap kurtarma jetonları güvenlik gereği " +
                  "bu dosyaya DÂHİL EDİLMEZ.",
            kullanici,
            kelimeler,
            ilerleme,
            quizSonuclari,
            ocrKayitlari,
            aktivite,
            geriBildirimler,
        });
    }

    public class HesapSilmeIstegi
    {
        [Required(ErrorMessage = "Şifre zorunludur.")]
        [StringLength(AlanSinirlari.SifreEnCok, MinimumLength = 1,
            ErrorMessage = "Şifre en fazla {1} karakter olabilir.")]
        public string Sifre { get; set; } = "";
    }

    // POST /api/verim/hesabimi-sil
    //
    // 🔴 GERİ ALINAMAZ.
    //
    // Şifre YENİDEN istenir: token çalınmışsa bile saldırgan hesabı
    // silememeli. Kimlik doğrulama ile YETKİLENDİRME farkı burada somutlaşıyor —
    // geçerli bir token "bu kişi giriş yapmış" der, "bu kişi hesabını silmek
    // istiyor" demez.
    [HttpPost("hesabimi-sil")]
    [EnableRateLimiting(HizSinirlari.KimlikDogrulama)]   // şifre denemesi = kimlik ucu
    public async Task<IActionResult> HesabimiSil([FromBody] HesapSilmeIstegi req)
    {
        var id = KullaniciId;
        var kullanici = await _db.Users.FirstOrDefaultAsync(u => u.Id == id);
        if (kullanici is null) return NotFound(new { error = "Kullanıcı bulunamadı." });

        if (!SifreHashleme.Dogrula(req.Sifre, kullanici.PasswordHash))
        {
            _logger.LogWarning("Hesap silme denemesi YANLIŞ şifreyle. KullaniciId={Id}", id);
            return Unauthorized(new { error = "Şifre hatalı." });
        }

        // KURAL-12: Groups.AdminUserId ilişkisi RESTRICT — grup sahibi
        // silinemez. Kontrol edilmezse SaveChanges 500 verir ve kullanıcı
        // sebebini anlamaz. Aynı kısıt yönetici silme ucunda da var.
        var sahipOldugu = await _db.Groups
            .Where(g => g.AdminUserId == id)
            .Select(g => new { g.Id, g.Name })
            .ToListAsync();

        if (sahipOldugu.Count > 0)
            return BadRequest(new
            {
                error = $"{sahipOldugu.Count} grubun yöneticisisiniz. Hesabınızı " +
                        "silmeden önce bu grupları devredin veya silin.",
                gruplar = sahipOldugu,
            });

        _db.Users.Remove(kullanici);   // cascade: KURAL-12'de açıkça tanımlı
        await _db.SaveChangesAsync();

        // Silinen hesabın tokenı hâlâ imzalı ve süresi dolmamış olabilir.
        _iptalDeposu.KullaniciTumTokenlariniIptalEt(id);

        Response.Cookies.Delete("jwt_token");

        _logger.LogInformation("Hesap KULLANICI TALEBİYLE silindi. KullaniciId={Id}", id);
        return Ok(new { success = true, message = "Hesabınız ve tüm verileriniz silindi." });
    }
}
