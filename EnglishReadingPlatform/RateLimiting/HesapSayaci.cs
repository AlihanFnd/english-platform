using System.Threading.RateLimiting;

namespace EnglishReadingPlatform.RateLimiting;

/// <summary>
/// KURAL-07: HEDEF (e-posta) bazlı başarısız giriş sayacı.
///
/// NEDEN AYRI BİR MEKANİZMA: IP bazlı sınır, her IP'den 10 deneme yapan dağıtık
/// bir credential-stuffing saldırısını durdurmaz. İkinci savunma hattı hedefi
/// (hesabı) sayar. Bu, middleware ile yapılamaz — e-posta istek GÖVDESİNDEDİR ve
/// middleware gövdeyi okursa akış tüketilir, controller boş gövde görür.
/// Bu yüzden sayaç bilinçli olarak AuthController içinde çağrılır.
///
/// BELLEK: <see cref="PartitionedRateLimiter"/> boşta kalan bölümleri kendi
/// zamanlayıcısıyla serbest bırakır. Saldırgan kontrolündeki anahtar (e-posta)
/// bellekte SÜRESİZ tutulmaz — KURAL-07'nin İhlal 1'i tam olarak buydu.
///
/// YALNIZCA BAŞARISIZ DENEMELER SAYILIR:
/// Kontrol (<see cref="IzinVar"/>) kimlik doğrulamasından ÖNCE yapılır — yani
/// bütçe dolduysa DOĞRU şifre bile kabul edilmez (gerçek hesap kilidi davranışı).
/// Ama permit yalnızca deneme BAŞARISIZ olduğunda tüketilir
/// (<see cref="BasarisizDenemeKaydet"/>). Başarılı girişleri de saymak, üç
/// cihazdan giren meşru bir kullanıcıyı kilitler ve saldırgana hiçbir maliyet
/// getirmez: brute-force zaten yanlış şifrelerden oluşur.
/// </summary>
public sealed class HesapSayaci : IDisposable
{
    private readonly PartitionedRateLimiter<string> _sinirlayici;

    public HesapSayaci()
    {
        _sinirlayici = PartitionedRateLimiter.Create<string, string>(anahtar =>
            RateLimitPartition.GetFixedWindowLimiter(anahtar, _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = HizSinirlari.GirisHedefEnCokBasarisiz,
                Window = HizSinirlari.GirisHedefPenceresi,
                QueueLimit = 0
            }));
    }

    /// <summary>Anahtarı normalize eder: büyük/küçük harf ve boşluk farkı ayrı kova AÇMAMALI.</summary>
    public static string GirisAnahtari(string? eposta)
        => "giris_hedef:" + (eposta ?? "").Trim().ToLowerInvariant();

    /// <summary>
    /// Bütçe kaldı mı? PERMIT TÜKETMEZ — yalnızca okur.
    /// false dönerse çağıran 429 döndürmeli ve şifreyi HİÇ doğrulamamalıdır.
    /// </summary>
    public bool IzinVar(string anahtar)
        => (_sinirlayici.GetStatistics(anahtar)?.CurrentAvailablePermits ?? long.MaxValue) > 0;

    /// <summary>Başarısız denemeyi işler — bir permit tüketir.</summary>
    public void BasarisizDenemeKaydet(string anahtar)
    {
        using var kiralama = _sinirlayici.AttemptAcquire(anahtar);
        // Kiralamanın alınıp alınmadığı önemsiz: alınamadıysa bütçe zaten dolmuş.
    }

    /// <summary>Kalan deneme hakkı — testler ve teşhis içindir.</summary>
    public long KalanHak(string anahtar)
        => _sinirlayici.GetStatistics(anahtar)?.CurrentAvailablePermits ?? -1;

    public void Dispose() => _sinirlayici.Dispose();
}
