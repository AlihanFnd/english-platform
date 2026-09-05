using EnglishReadingPlatform.Configuration;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Hosting;

namespace EnglishReadingPlatform.Tests.Infrastructure;

/// <summary>
/// Uygulamayı ÜRETİM ortamında ayağa kaldıran test fabrikası.
///
/// Neden ayrı bir fabrika: bazı savunmalar geliştirmede bilerek kapalı
/// (HTTPS yönlendirmesi, HSTS, Host başlığı doğrulaması). Onları yalnızca
/// Development fabrikasıyla sınamak, "kod yazıldı ama üretimde çalışıyor mu?"
/// sorusunu açık bırakır.
///
/// Neden TEK yerde: KURAL-11 (başlıklar) ve KURAL-13 (köken/Host) aynı üretim
/// dalını kullanıyor. İki ayrı kopya bırakılsa biri güncellenir, diğeri
/// unutulur — faz 1'in tekrar tekrar düzelttiği hata budur.
/// </summary>
public class UretimTestFabrikasi : TestAppFactory
{
    /// <summary>
    /// Üretim testlerinin kullandığı köken. Testler bu ana bilgisayara istek atar;
    /// hem CORS beyaz listesi hem AllowedHosts bu değerden türetilir.
    /// </summary>
    public const string UretimKokeni = "https://linguza.test";

    /// <summary>Yukarıdaki kökenin ana bilgisayar adı — Host başlığı testlerinde kullanılır.</summary>
    public static string UretimAnaBilgisayari => new Uri(UretimKokeni).Host;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);
        builder.UseEnvironment("Production");   // base'in Development'ını EZER
    }

    /// <summary>
    /// KURAL-13: üretim dalına GEÇERLİ bir köken yapılandırması verir.
    ///
    /// Neden gerekli: TestAppFactory'nin süreç ortamına yazdığı
    /// CorsOrigins=http://localhost:3000 değeri geliştirme içindir. Üretimde
    /// http köken ve joker kabul edilmiyor (GuvenilirKokenler.Oku), bu yüzden
    /// burada üretimde geçerli olan https kökeni verilir.
    ///
    /// Neden ORTAM DEĞİŞKENİ: TestAppFactory'nin başındaki açıklamanın aynısı —
    /// Program.cs, builder.Build() çağrılmadan ÖNCE yapılandırmayı okuyor;
    /// ConfigureAppConfiguration değerleri o an henüz görünmüyor.
    ///
    /// Neden GERİ YÜKLENİYOR: ortam değişkeni süreç geneli. Kalıcı bırakılsa
    /// paylaşılan Development fabrikası da https kökeniyle açılır ve
    /// KokenSozlesmesiTests.Beyaz_listedeki_koken_izin_ALIR kırmızıya döner.
    /// "api" koleksiyonu sıralı koştuğu için bu pencere başka bir kurulumla çakışmaz.
    /// </summary>
    protected override IHost CreateHost(IHostBuilder builder)
    {
        var oncekiKoken = Environment.GetEnvironmentVariable(GuvenilirKokenler.Anahtar);
        var oncekiHost  = Environment.GetEnvironmentVariable("PublicHost");

        Environment.SetEnvironmentVariable(GuvenilirKokenler.Anahtar, UretimKokeni);
        Environment.SetEnvironmentVariable("PublicHost", UretimAnaBilgisayari);
        try
        {
            return base.CreateHost(builder);
        }
        finally
        {
            Environment.SetEnvironmentVariable(GuvenilirKokenler.Anahtar, oncekiKoken);
            Environment.SetEnvironmentVariable("PublicHost", oncekiHost);
        }
    }
}
