using System.Text.Json;
using EnglishReadingPlatform.Exceptions;

namespace EnglishReadingPlatform.Middleware;

/// <summary>
/// KURAL-06: Tüm yakalanmamış istisnaları tek noktada yakalar.
/// İstemciye: genel mesaj + olay kimliği.  Loga: tam ayrıntı + aynı olay kimliği.
/// Böylece kullanıcı "olay kimliği ABC123" der, geliştirici logda o kaydı bulur.
///
/// Zincirin EN BAŞINDA durur: routing, model binding ve CORS sırasında oluşan
/// istisnalar da buraya düşer. UseRouting'den sonra konursa o istisnalar
/// ASP.NET Core'un varsayılan işleyicisine gider ve geliştirme ortamında
/// yığın izi (stack trace) döner.
/// </summary>
public class HataYakalamaMiddleware
{
    private readonly RequestDelegate _sonraki;
    private readonly ILogger<HataYakalamaMiddleware> _logger;
    private readonly IHostEnvironment _ortam;

    public HataYakalamaMiddleware(RequestDelegate sonraki,
                                  ILogger<HataYakalamaMiddleware> logger,
                                  IHostEnvironment ortam)
    {
        _sonraki = sonraki;
        _logger  = logger;
        _ortam   = ortam;
    }

    public async Task InvokeAsync(HttpContext ctx)
    {
        try
        {
            await _sonraki(ctx);
        }
        catch (KullaniciHatasi kh)
        {
            // Mesaj kasten kullanıcıya yönelik yazılmış; olduğu gibi iletilir.
            // Olay kimliği verilmez: izlenecek bir "arıza" yok, kullanıcı hatası var.
            // Mesajı loglamak GÜVENLİ: KullaniciHatasi'nın sözleşmesi gereği bu metin
            // elle yazılmıştır, istisna metni birleştirmesi değildir.
            // Yol = Request.Path — sorgu dizesi DEĞİL. Sorgu dizesi kullanıcı girdisi
            // taşıyabilir (arama metni), Path taşımaz.
            _logger.LogInformation("Kullanıcı hatası. Durum={Durum} Yol={Yol} Mesaj={Mesaj}",
                kh.DurumKodu, ctx.Request.Path, kh.Message);

            if (!YanitaYazilabilirMi(ctx, "-")) return;

            ctx.Response.StatusCode  = kh.DurumKodu;
            ctx.Response.ContentType = "application/json; charset=utf-8";
            await ctx.Response.WriteAsync(JsonSerializer.Serialize(new { error = kh.Message }));
        }
        catch (OperationCanceledException) when (ctx.RequestAborted.IsCancellationRequested)
        {
            // İstemci bağlantıyı kapattı. Bu bir arıza değildir; hata olarak
            // loglanırsa gerçek arızalar bu gürültünün içinde kaybolur.
            _logger.LogDebug("İstek istemci tarafından iptal edildi. Yol={Yol}", ctx.Request.Path);
        }
        catch (Exception ex)
        {
            var olayKimligi = Guid.NewGuid().ToString("N")[..8].ToUpperInvariant();

            _logger.LogError(ex,
                "İşlenmemiş istisna. OlayKimligi={OlayKimligi} Yol={Yol} Metot={Metot} KullaniciId={KullaniciId} Ortam={Ortam}",
                olayKimligi,
                ctx.Request.Path,
                ctx.Request.Method,
                ctx.User?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? "-",
                _ortam.EnvironmentName);

            if (!YanitaYazilabilirMi(ctx, olayKimligi)) return;

            ctx.Response.StatusCode  = StatusCodes.Status500InternalServerError;
            ctx.Response.ContentType = "application/json; charset=utf-8";

            // KURAL-06: istisna metni ASLA gövdeye girmez — Development'ta bile.
            // Ortam adı yalnızca LOGA yazılır, yanıta DEĞİL: "geliştirmede açık,
            // üretimde kapalı" ayrımı, yanlış yapılandırılmış tek bir ortam
            // değişkeniyle üretime sızabilecek bir tercihtir. Bilinçli olarak
            // her ortamda kapalı tutuluyor; geliştirici ayrıntıyı logdan okur.
            var govde = new
            {
                error = "Beklenmeyen bir hata oluştu. Sorun sürerse bu kodu iletin: " + olayKimligi,
                olayKimligi
            };

            await ctx.Response.WriteAsync(JsonSerializer.Serialize(govde));
        }
    }

    /// <summary>
    /// Yanıt gövdesi yazılmaya başlandıysa StatusCode atamak istisna fırlatır —
    /// yani istisna işleyicisinin içinde ikinci bir istisna doğar ve asıl hata kaybolur.
    /// </summary>
    private bool YanitaYazilabilirMi(HttpContext ctx, string olayKimligi)
    {
        if (!ctx.Response.HasStarted)
        {
            ctx.Response.Clear();
            return true;
        }

        _logger.LogWarning("Yanıt zaten başlamış, hata gövdesi yazılamadı. OlayKimligi={OlayKimligi}", olayKimligi);
        return false;
    }
}

public static class HataYakalamaMiddlewareUzantilari
{
    public static IApplicationBuilder HataYakalamayiKullan(this IApplicationBuilder app)
        => app.UseMiddleware<HataYakalamaMiddleware>();
}
