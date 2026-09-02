namespace EnglishReadingPlatform.Middleware;

/// <summary>
/// KURAL-11: Her yanıta güvenlik başlıklarını ekler.
///
/// Başlık listesi TEK yerde durur; yeni bir uç eklendiğinde otomatik kapsanır.
/// Tek tek controller'lara başlık eklemek, altı aydır kaybedilen oyundur:
/// unutulan bir uç sessizce korumasız kalır ve bunu kimse fark etmez.
///
/// SIRA: HataYakalamaMiddleware'den SONRA gelmek zorunda. Hata işleyicisi
/// yanıtı <c>Response.Clear()</c> ile temizliyor — bu başlıkları da siler.
/// Başlıklar <c>OnStarting</c> geri çağrısında, yani yanıt gövdesi yazılmaya
/// başlamadan hemen önce ekleniyor; böylece Clear() sonrasında da dururlar.
/// <c>GuvenlikBasliklariTests.Hata_yaniti_da_baslik_tasir</c> bunu koruyor.
/// </summary>
public class GuvenlikBasliklariMiddleware
{
    private readonly RequestDelegate _sonraki;

    public GuvenlikBasliklariMiddleware(RequestDelegate sonraki) => _sonraki = sonraki;

    public Task InvokeAsync(HttpContext ctx)
    {
        // Başlıklar yanıt yazılmadan ÖNCE eklenmeli. Doğrudan eklemek yetmez:
        // gövde yazılmaya başlandıysa başlık koleksiyonu salt-okunur olur ve
        // ekleme sessizce düşer (KURAL-06 §6: sessiz başarısızlık bir açıktır).
        ctx.Response.OnStarting(static durum =>
        {
            var httpCtx   = (HttpContext)durum;
            var basliklar = httpCtx.Response.Headers;

            // MIME türü tahminini kapat — yüklenen içerik script olarak yorumlanamaz.
            basliklar["X-Content-Type-Options"] = "nosniff";

            // Clickjacking: bu API hiçbir çerçeveye gömülmemeli.
            // (frame-ancestors CSP'de de var; X-Frame-Options eski tarayıcılar için.)
            basliklar["X-Frame-Options"] = "DENY";

            // Tam URL'i (token taşıyabilir) dış sitelere sızdırma.
            basliklar["Referrer-Policy"] = "strict-origin-when-cross-origin";

            // Tarayıcı özellikleri: bu bir API, hiçbirine ihtiyacı yok.
            basliklar["Permissions-Policy"] =
                "camera=(), microphone=(), geolocation=(), payment=(), usb=()";

            // API yanıtları için en katı CSP: hiçbir alt kaynak yüklenmesin,
            // sayfa çerçevelenmesin, form gönderilmesin.
            // (HTML sunulmuyor; Views/ ve wwwroot/js ölü kod — bkz. CLAUDE.md)
            basliklar["Content-Security-Policy"] =
                "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

            // Kimlik doğrulanmış yanıtlar ara belleklerde durmasın.
            // Paylaşılan bir bilgisayarda "geri" tuşu başkasının verisini göstermemeli.
            if (httpCtx.User?.Identity?.IsAuthenticated == true)
            {
                basliklar["Cache-Control"] = "no-store, no-cache, must-revalidate";
                basliklar["Pragma"] = "no-cache";
            }

            // Sunucu parmak izi. Kestrel'in kendi başlığı ConfigureKestrel'de
            // (AddServerHeader = false) kapatıldı; buradaki temizlik ters proxy
            // ya da başka bir katman eklerse diye ikinci hattır.
            basliklar.Remove("Server");
            basliklar.Remove("X-Powered-By");

            return Task.CompletedTask;
        }, ctx);

        return _sonraki(ctx);
    }
}

public static class GuvenlikBasliklariUzantilari
{
    public static IApplicationBuilder GuvenlikBasliklariniKullan(this IApplicationBuilder app)
        => app.UseMiddleware<GuvenlikBasliklariMiddleware>();
}
