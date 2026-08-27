using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;

namespace EnglishReadingPlatform.Authorization;

/// <summary>
/// KURAL-03: Kimlik ve sahiplik yardımcıları.
/// Amaç: her controller'da tekrarlanan
///   int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!)
/// deseninin tek bir güvenli noktaya toplanması.
///
/// NOT: [Authorize] "giriş yapmış olmayı" söyler, "bu kayıt sana ait mi" sorusunu
/// yanıtlamaz. Nesne sahipliği kontrollerinin merkezîleştirilmesi KURAL-08'in işidir;
/// burada yalnızca YENİ kodun doğru deseni kullanabilmesi için zemin hazırlanıyor.
/// </summary>
public static class KullaniciExtensions
{
    /// <summary>Oturum açan kullanıcının Id'si. Claim yoksa/bozuksa istisna fırlatmaz.</summary>
    public static bool KullaniciIdAl(this ControllerBase controller, out int kullaniciId)
        => int.TryParse(controller.User.FindFirstValue(ClaimTypes.NameIdentifier), out kullaniciId);

    /// <summary>
    /// Oturum açan kullanıcının Id'si. [Authorize] altındaki uçlarda güvenle kullanılır.
    /// Claim yoksa sessizce 0 dönmek yerine açık bir hata verir — sessiz başarısızlık
    /// bir güvenlik açığıdır.
    /// </summary>
    public static int KullaniciId(this ControllerBase controller)
        => controller.KullaniciIdAl(out var id)
            ? id
            : throw new UnauthorizedAccessException(
                "NameIdentifier claim'i bulunamadı — bu uç [Authorize] ile korunmuyor olabilir.");

    public static bool AdminMi(this ControllerBase controller)
        => controller.User.IsInRole("admin");
}
