using EnglishReadingPlatform.Exceptions;
using EnglishReadingPlatform.Middleware;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace EnglishReadingPlatform.Tests;

/// <summary>
/// KURAL-06 — merkezî çözümün birim testi.
/// Uçtan uca test bir istisnayı KASITLI olarak üretemez (test-only uç açmak
/// üretim yüzeyini genişletir), bu yüzden middleware doğrudan sınanır.
/// </summary>
public class HataMiddlewareTests
{
    private sealed class SahteOrtam : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Production";
        public string ApplicationName { get; set; } = "Test";
        public string ContentRootPath { get; set; } = ".";
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } = null!;
    }

    private static async Task<(int Durum, string Govde)> CalistirAsync(
        Exception firlatilan, string ortam = "Production")
    {
        var ctx = new DefaultHttpContext();
        ctx.Response.Body = new MemoryStream();
        ctx.Request.Path = "/api/test";

        var mw = new HataYakalamaMiddleware(
            _ => throw firlatilan,
            NullLogger<HataYakalamaMiddleware>.Instance,
            new SahteOrtam { EnvironmentName = ortam });

        await mw.InvokeAsync(ctx);

        ctx.Response.Body.Seek(0, SeekOrigin.Begin);
        var govde = await new StreamReader(ctx.Response.Body).ReadToEndAsync();
        return (ctx.Response.StatusCode, govde);
    }

    [Fact]
    [Trait("Category", "HataHijyeni")]
    public async Task Beklenmeyen_istisna_500_ve_olay_kimligi_uretir()
    {
        var (durum, govde) = await CalistirAsync(
            new InvalidOperationException("veritabanı bağlantısı reddedildi: host=10.0.0.5"));

        durum.Should().Be(500);
        govde.Should().Contain("olayKimligi");
        govde.Should().NotContain("10.0.0.5", "iç ayrıntı istemciye gitmemeli");
        govde.Should().NotContain("InvalidOperationException");
    }

    [Fact]
    [Trait("Category", "HataHijyeni")]
    public async Task Development_ortaminda_da_istisna_metni_sizmaz()
    {
        // Bilinçli tercih: ortam ayrımına güvenmiyoruz.
        //
        // DİKKAT — işaretçi ASCII olmak ZORUNDA. System.Text.Json non-ASCII
        // karakterleri kaçırır ("GİZLİ" → "G\u0130ZL\u0130"), yani Türkçe harf
        // içeren bir işaretçi gövdede ASLA düz metin olarak bulunmaz ve bu test
        // istisna metni sızsa bile YEŞİL kalırdı. Mutasyon testi tam olarak bunu
        // ortaya çıkardı.
        var (_, govde) = await CalistirAsync(
            new Exception("GIZLI_AYRINTI_XYZ"), ortam: "Development");

        govde.Should().NotContain("GIZLI_AYRINTI_XYZ");
    }

    [Fact]
    [Trait("Category", "HataHijyeni")]
    public async Task Yigin_izi_yanit_govdesine_girmez()
    {
        // Gerçekten FIRLATILMIŞ bir istisna kullanılır: yalnızca böyle bir
        // istisnanın StackTrace'i doludur. "new Exception(...)" ile üretilen
        // nesnede yığın izi boştur ve test hiçbir şey ölçmez.
        Exception yakalanan;
        try { DerinCagriPatlar(); throw new Exception("ulasilmaz"); }
        catch (Exception ex) { yakalanan = ex; }

        yakalanan.StackTrace.Should().NotBeNullOrEmpty("test ancak dolu bir yığın iziyle anlamlıdır");

        var (durum, govde) = await CalistirAsync(yakalanan);

        durum.Should().Be(500);
        govde.Should().NotContain("DerinCagriPatlar");
        govde.Should().NotContain("   at ");
        govde.Should().NotContain(".cs:line");
    }

    private static void DerinCagriPatlar() => throw new FormatException("BOZUK_BICIM_XYZ");

    [Fact]
    [Trait("Category", "HataHijyeni")]
    public async Task KullaniciHatasi_mesaji_aynen_iletilir()
    {
        var (durum, govde) = await CalistirAsync(
            new KullaniciHatasi("Sadece PDF veya DOCX dosyaları yüklenebilir.", 400));

        durum.Should().Be(400);
        govde.Should().Contain("Sadece PDF veya DOCX");
        govde.Should().NotContain("olayKimligi", "kullanıcı hatası izlenebilirlik kodu gerektirmez");
    }

    [Fact]
    [Trait("Category", "HataHijyeni")]
    public async Task Ic_istisna_metni_de_sizmaz()
    {
        // Tipik tuzak: dış istisnanın mesajı zararsızdır ama iç istisna
        // bağlantı dizesini taşır. ex.ToString() ikisini birden yazar.
        var ic = new Exception("Password=SUPER_GIZLI_PAROLA;Host=10.9.9.9");
        var (_, govde) = await CalistirAsync(new Exception("Veri kaydedilemedi", ic));

        govde.Should().NotContain("SUPER_GIZLI_PAROLA");
        govde.Should().NotContain("10.9.9.9");
    }

    [Fact]
    [Trait("Category", "HataHijyeni")]
    public async Task Yanit_baslamissa_ikinci_istisna_uretmez()
    {
        // Yanıt gövdesi yazılmaya başlandıysa StatusCode atamak InvalidOperationException
        // fırlatır. Kontrol atlanırsa istisna işleyicisinin İÇİNDE istisna doğar ve
        // istemci yarım bir gövde alır — hata da hiç loglanmaz.
        //
        // DefaultHttpContext'in varsayılan yanıt özelliği HasStarted'ı HER ZAMAN false
        // döndürür; o hâliyle bu test hiçbir şey ölçmezdi. Bu yüzden HasStarted'ı
        // gerçekten "true" yapabilen bir özellik takılıyor.
        var ozellik = new SahteYanitOzelligi();
        var ctx = new DefaultHttpContext();
        ctx.Features.Set<IHttpResponseFeature>(ozellik);
        ctx.Features.Set<IHttpResponseBodyFeature>(new StreamResponseBodyFeature(ozellik.Body));
        ctx.Request.Path = "/api/test";

        var mw = new HataYakalamaMiddleware(
            async c =>
            {
                await c.Response.WriteAsync("kismi-govde");
                ozellik.HasStarted = true;                  // gerçek sunucudaki durum
                throw new Exception("YAZDIKTAN_SONRA_PATLADI");
            },
            NullLogger<HataYakalamaMiddleware>.Instance,
            new SahteOrtam());

        var eylem = async () => await mw.InvokeAsync(ctx);
        await eylem.Should().NotThrowAsync("middleware kendi içinde istisna üretmemeli");

        ozellik.GovdeMetni().Should().Be("kismi-govde");
        ozellik.GovdeMetni().Should().NotContain("YAZDIKTAN_SONRA_PATLADI");
        ozellik.StatusCode.Should().Be(200, "yanıt başlamışsa durum kodu değiştirilemez");
    }

    /// <summary>HasStarted'ı gerçekten taşıyabilen asgari yanıt özelliği.</summary>
    private sealed class SahteYanitOzelligi : IHttpResponseFeature
    {
        public MemoryStream Govde { get; } = new();

        public int StatusCode { get; set; } = 200;
        public string? ReasonPhrase { get; set; }
        public IHeaderDictionary Headers { get; set; } = new HeaderDictionary();
        public Stream Body { get => Govde; set { } }
        public bool HasStarted { get; set; }

        public void OnStarting(Func<object, Task> callback, object state) { }
        public void OnCompleted(Func<object, Task> callback, object state) { }

        public string GovdeMetni() => System.Text.Encoding.UTF8.GetString(Govde.ToArray());
    }
}
