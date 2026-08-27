using EnglishReadingPlatform.Models;

namespace EnglishReadingPlatform.Authorization;

/// <summary>
/// KURAL-08: Grup bağlamında hangi verinin KİME görünür olduğunu belirleyen TEK kaynak.
///
/// KARAR (00-BASLA-BURADAN.md madde 6, varsayılan A uygulandı):
/// Yalnızca gruba ATANMIŞ kitaplara ait ilerleme ve quiz sonuçları görünür.
/// Üyenin kişisel okumaları — gruba atanmamış kitaplar — gizli kalır.
/// Kullanıcı B veya C seçeneğini seçerse değişecek TEK yer burasıdır.
///
/// NOT: [Authorize] "kim erişebilir" sorusunu yanıtlar (KURAL-03).
/// Bu sınıf "eriştiğinde ne görür" sorusunu yanıtlar. İkisi birlikte gerekir:
/// üyelik kontrolü doğruyken bile dönen verinin fazlası bir sızıntıdır.
/// </summary>
public static class GrupKapsami
{
    /// <summary>Bu kullanıcı grubun sahibi mi? (davet kodunu görme yetkisi)</summary>
    public static bool SahipMi(Group grup, int kullaniciId) => grup.AdminUserId == kullaniciId;

    /// <summary>
    /// Bu kullanıcı grubu görüntüleyebilir mi?
    /// <c>grup.Members</c> yüklenmemişse üyelik sessizce "hayır" görünür —
    /// çağıran taraf Include etmek zorundadır.
    /// </summary>
    public static bool GorebilirMi(Group grup, int kullaniciId)
        => grup.AdminUserId == kullaniciId || grup.Members.Any(m => m.UserId == kullaniciId);

    /// <summary>
    /// Grup bağlamında görünür kitap kimlikleri — atanmış kitaplarla sınırlı.
    /// TUZAK: <c>grup.BookAssignments</c> Include edilmezse boş liste döner,
    /// hiçbir ilerleme görünmez ve "düzelttim" sanılır. Test bunu yakalar.
    /// </summary>
    public static IReadOnlyList<int> GorunurKitapIdleri(Group grup)
        => grup.BookAssignments.Select(a => a.BookId).Distinct().ToList();

    /// <summary>Davet kodu yalnızca sahibe döner; diğerlerine null.</summary>
    public static string? DavetKodu(Group grup, int kullaniciId)
        => SahipMi(grup, kullaniciId) ? grup.InviteCode : null;
}
