using EnglishReadingPlatform.Configuration;
using EnglishReadingPlatform.Models;
using Microsoft.EntityFrameworkCore;

namespace EnglishReadingPlatform.Data;

/// <summary>
/// KURAL-02: Yönetici hesabı ortam değişkeninden tohumlanır, koda gömülmez.
/// Değişkenler tanımlı değilse hiçbir yönetici oluşturulmaz (sessizce geçilir),
/// ancak sistemde hiç yönetici yoksa uyarı loglanır.
///
/// Neden EF HasData değil: BCrypt.HashPassword her çağrıda farklı tuz üretir.
/// HasData içinde kullanıldığında her "migrations add" komutu yeni bir
/// UpdateData satırı doğuruyordu — şifre hem koda gömülü kalıyor hem de
/// migration geçmişine tekrar tekrar yazılıyordu.
/// </summary>
public static class YoneticiTohumlayici
{
    public static async Task TohumlaAsync(AppDbContext db, IConfiguration cfg, ILogger logger)
    {
        var email = cfg["Seed:AdminEmail"];
        var sifre = cfg["Seed:AdminPassword"];

        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(sifre))
        {
            if (!await db.Users.AnyAsync(u => u.Role == "admin"))
                logger.LogWarning(
                    "Sistemde hiç yönetici yok ve Seed:AdminEmail/Seed:AdminPassword tanımlı değil. " +
                    "Yönetici paneline giriş yapılamayacak. .env dosyasına Seed__AdminEmail ve " +
                    "Seed__AdminPassword ekleyip uygulamayı yeniden başlatın.");
            return;
        }

        if (SirDogrulayici.YasakliMi(sifre))
            throw new InvalidOperationException(
                "Seed:AdminPassword sürüm kontrolüne sızmış bir değer. Yeni bir şifre belirleyin.");

        var normalize = email.Trim().ToLowerInvariant();
        var existingUser = await db.Users.FirstOrDefaultAsync(u => u.Email == normalize);

        if (existingUser != null)
        {
            if (existingUser.Role != "admin" && !await db.Users.AnyAsync(u => u.Role == "admin" || u.Role == "Admin"))
            {
                existingUser.Role = "admin";
                await db.SaveChangesAsync();
                logger.LogInformation("Sistemde hiç yönetici olmadığı için mevcut kullanıcı ({Email}) yöneticiye yükseltildi.", normalize);
            }
            return;
        }
        db.Users.Add(new User
        {
            Username     = TekilKullaniciAdiUret(db, normalize),
            Email        = normalize,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(sifre),
            Role         = "admin",
            CreatedAt    = DateTime.UtcNow
        });
        await db.SaveChangesAsync();
        logger.LogInformation("Yönetici hesabı tohumlandı: {Email}", normalize);
    }

    /// <summary>
    /// Username sütununda unique index var. "admin" doluysa kayıt patlar ve
    /// uygulama açılışta 500 verir; bu yüzden boş bir ad seçilir.
    /// </summary>
    private static string TekilKullaniciAdiUret(AppDbContext db, string email)
    {
        if (!db.Users.Any(u => u.Username == "admin")) return "admin";

        var taban = new string(email.TakeWhile(c => c != '@').Where(char.IsLetterOrDigit).ToArray());
        if (string.IsNullOrEmpty(taban)) taban = "yonetici";

        var aday = taban;
        var sayac = 1;
        while (db.Users.Any(u => u.Username == aday))
            aday = $"{taban}{++sayac}";
        return aday;
    }
}
