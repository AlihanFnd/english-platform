using System.Globalization;
using System.Security.Claims;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;

namespace EnglishReadingPlatform.RateLimiting;

/// <summary>
/// KURAL-07: Hız sınırlamanın MERKEZÎ kurulumu.
///
/// .NET 8'in yerleşik <c>Microsoft.AspNetCore.RateLimiting</c> middleware'i kullanılır;
/// elle yazılmış eski sayaç servisinin yerine geçer.
///
/// BELLEK SIZINTISI NEDEN TASARIM GEREĞİ KAPANIYOR:
/// Eski çözüm <c>ConcurrentDictionary&lt;string, ConcurrentQueue&lt;DateTime&gt;&gt;</c> tutuyordu
/// ve anahtarları (login_{ip}, register_{ip}) ASLA silmiyordu. IPv6 ile pratikte
/// sınırsız anahtar üretilebildiği için bu, yavaş ama kesin bir OOM yoluydu.
/// <see cref="PartitionedRateLimiter"/> kendi zamanlayıcısıyla boşta kalan
/// bölümleri serbest bırakır — silinecek bir şey kalmaz.
/// </summary>
public static class HizSinirlamaKurulumu
{
    public static IServiceCollection HizSinirlamaEkle(this IServiceCollection services)
    {
        services.AddRateLimiter(secenekler =>
        {
            secenekler.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

            // ── 429 yanıtı projenin { error } sözleşmesine uyar ──
            // İstemciler (frontend/app/api.ts, admin-panel) errorData.error okuyor.
            // Boş gövde dönmek kullanıcıya "HTTP error! status: 429" gösterirdi.
            secenekler.OnRejected = async (ctx, iptal) =>
            {
                if (ctx.Lease.TryGetMetadata(MetadataName.RetryAfter, out var sure))
                {
                    // En az 1 saniye: 0 saniyelik Retry-After istemciyi hemen tekrar
                    // denemeye çağırır ve sınırı anlamsızlaştırır.
                    var saniye = Math.Max(1, (int)Math.Ceiling(sure.TotalSeconds));
                    ctx.HttpContext.Response.Headers.RetryAfter =
                        saniye.ToString(NumberFormatInfo.InvariantInfo);
                }

                if (ctx.HttpContext.Response.HasStarted) return;

                ctx.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
                ctx.HttpContext.Response.ContentType = "application/json; charset=utf-8";
                await ctx.HttpContext.Response.WriteAsync(
                    """{"error":"Çok fazla istek gönderdiniz. Lütfen biraz bekleyip tekrar deneyin."}""",
                    iptal);
            };

            // ── Global taban sınır ──
            // Politikası olmayan uçlar (GET'ler dahil) için kör sel koruması.
            secenekler.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx =>
                RateLimitPartition.GetFixedWindowLimiter(
                    partitionKey: "genel:" + KullaniciVeyaIp(ctx),
                    factory: _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = HizSinirlari.GlobalTabanDk,
                        Window = TimeSpan.FromMinutes(1),
                        // KUYRUK YOK: kuyruk, reddedilmesi gereken istekleri bellekte
                        // tutar — korunmak istenen şeyin ta kendisi.
                        QueueLimit = 0
                    }));

            Politika(secenekler, HizSinirlari.KimlikDogrulama, HizSinirlari.KimlikDogrulamaDk, IpAnahtari);
            Politika(secenekler, HizSinirlari.DavetKodu,       HizSinirlari.DavetKoduDk,       KullaniciVeyaIp);
            Politika(secenekler, HizSinirlari.Okuma,           HizSinirlari.OkumaDk,           KullaniciVeyaIp);
            Politika(secenekler, HizSinirlari.Ceviri,          HizSinirlari.CeviriDk,          KullaniciVeyaIp);
            Politika(secenekler, HizSinirlari.AgirAnaliz,      HizSinirlari.AgirAnalizDk,      KullaniciVeyaIp);
            Politika(secenekler, HizSinirlari.Yazma,           HizSinirlari.YazmaDk,           KullaniciVeyaIp);
            Politika(secenekler, HizSinirlari.DosyaYukleme,    HizSinirlari.DosyaYuklemeDk,    KullaniciVeyaIp);
        });

        return services;
    }

    private static void Politika(RateLimiterOptions secenekler, string ad, int dakikaBasina,
                                 Func<HttpContext, string> anahtarUretici)
        => secenekler.AddPolicy(ad, ctx =>
            RateLimitPartition.GetFixedWindowLimiter(
                partitionKey: $"{ad}:{anahtarUretici(ctx)}",
                factory: _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = dakikaBasina,
                    Window = TimeSpan.FromMinutes(1),
                    QueueLimit = 0
                }));

    private static string IpAnahtari(HttpContext ctx)
        => ctx.Connection.RemoteIpAddress?.ToString() ?? "bilinmeyen-ip";

    /// <summary>
    /// Kimliği doğrulanmışsa kullanıcı, değilse IP.
    ///
    /// SIRA TUZAĞI: bu yalnızca <c>UseRateLimiter()</c>, <c>UseAuthentication()</c>
    /// SONRASINDA çağrılırsa çalışır. Önce çağrılırsa <c>ctx.User</c> boştur, tüm
    /// sınırlar IP bazına düşer ve NAT arkasındaki bir sınıfın tüm öğrencileri
    /// birbirinin kotasını tüketir. scripts/guard/07-hiz-siniri.sh sırayı denetler.
    /// </summary>
    private static string KullaniciVeyaIp(HttpContext ctx)
    {
        var id = ctx.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return string.IsNullOrEmpty(id) ? "ip:" + IpAnahtari(ctx) : "kullanici:" + id;
    }
}
