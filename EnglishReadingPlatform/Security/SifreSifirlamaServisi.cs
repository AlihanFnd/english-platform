using System.Security.Cryptography;
using System.Text;
using EnglishReadingPlatform.Data;
using EnglishReadingPlatform.Models;
using Microsoft.EntityFrameworkCore;

namespace EnglishReadingPlatform.Security;

/// <summary>
/// KURAL-09: Şifre sıfırlama jetonlarını üretir ve tüketir.
///
/// Tasarım kararları:
///  • Jeton <see cref="RandomNumberGenerator"/> ile üretilir — Guid.NewGuid()
///    kriptografik rastgelelik garantisi vermez.
///  • Veritabanına yalnızca SHA-256 HASH yazılır. Ham jeton hiç saklanmaz.
///  • Tek kullanımlık: tüketilince KullanildiAt işaretlenir.
///  • Yeni jeton üretilince kullanıcının bekleyen jetonları geçersiz kılınır.
/// </summary>
public class SifreSifirlamaServisi
{
    private readonly AppDbContext _db;
    private readonly ILogger<SifreSifirlamaServisi> _logger;

    public static readonly TimeSpan Gecerlilik = TimeSpan.FromMinutes(30);

    public SifreSifirlamaServisi(AppDbContext db, ILogger<SifreSifirlamaServisi> logger)
    {
        _db = db;
        _logger = logger;
    }

    /// <summary>Kriptografik olarak güvenli jeton üretir ve HASH'ini saklar. Ham jetonu döner.</summary>
    public async Task<string> JetonUretAsync(int kullaniciId)
    {
        // Tek aktif jeton: eski bekleyenler geçersiz kılınır. Aksi halde
        // e-posta kutusundaki her eski bağlantı hâlâ çalışırdı.
        var eskiler = await _db.SifreSifirlamaJetonlari
            .Where(j => j.UserId == kullaniciId && j.KullanildiAt == null)
            .ToListAsync();
        foreach (var e in eskiler) e.KullanildiAt = DateTime.UtcNow;

        var hamJeton = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));

        _db.SifreSifirlamaJetonlari.Add(new SifreSifirlamaJetonu
        {
            UserId         = kullaniciId,
            JetonHash      = Hashle(hamJeton),
            GecerlilikSonu = DateTime.UtcNow.Add(Gecerlilik)
        });
        await _db.SaveChangesAsync();

        return hamJeton;   // yalnızca burada görünür; DB'de yalnızca hash var
    }

    /// <summary>Jetonu doğrular ve tüketir. Geçersiz/kullanılmış/süresi dolmuşsa null döner.</summary>
    public async Task<User?> JetonuTuketAsync(string? hamJeton)
    {
        if (string.IsNullOrWhiteSpace(hamJeton)) return null;

        var hash = Hashle(hamJeton);
        var kayit = await _db.SifreSifirlamaJetonlari
            .Include(j => j.User)
            .FirstOrDefaultAsync(j => j.JetonHash == hash);

        if (kayit is null)
        {
            _logger.LogWarning("Bilinmeyen şifre sıfırlama jetonu denendi.");
            return null;
        }
        if (kayit.KullanildiAt is not null)
        {
            _logger.LogWarning("Kullanılmış sıfırlama jetonu tekrar denendi. KullaniciId={Id}", kayit.UserId);
            return null;
        }
        if (kayit.GecerlilikSonu < DateTime.UtcNow)
        {
            _logger.LogInformation("Süresi dolmuş sıfırlama jetonu. KullaniciId={Id}", kayit.UserId);
            return null;
        }

        kayit.KullanildiAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return kayit.User;
    }

    private static string Hashle(string ham)
        => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(ham)));
}
