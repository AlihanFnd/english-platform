using System.Net;
using EnglishReadingPlatform.Tests.Infrastructure;
using FluentAssertions;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace EnglishReadingPlatform.Tests;

/// <summary>
/// KURAL-11: sunucu, tarayıcıya kendini nasıl koruyacağını söylemeli.
///
/// Bu testler başlıkların TEK TEK uçlarda değil, ZİNCİRDE eklendiğini doğrular:
/// başarı, hata (404) ve kimlik doğrulanmış yanıtların hepsi aynı korumayı taşır.
/// Yeni bir uç eklendiğinde hiçbir şey yapılması gerekmez — kapsam otomatiktir.
/// </summary>
[Collection("api")]
public class GuvenlikBasliklariTests
{
    private readonly TestAppFactory _fabrika;
    public GuvenlikBasliklariTests(TestAppFactory fabrika) => _fabrika = fabrika;

    /// <summary>
    /// Zorunlu başlıklar ve her birinde aranan parça.
    /// Liste burada TEK yerde durur; yeni bir başlık eklenince bütün testler
    /// otomatik olarak onu da arar.
    /// </summary>
    public static readonly (string Ad, string BeklenenParca)[] ZorunluBasliklar =
    {
        ("X-Content-Type-Options",  "nosniff"),
        ("X-Frame-Options",         "DENY"),
        ("Referrer-Policy",         "strict-origin"),
        ("Content-Security-Policy", "frame-ancestors 'none'"),
        ("Permissions-Policy",      "camera=()"),
    };

    private static void BasliklariDogrula(HttpResponseMessage yanit)
    {
        foreach (var (ad, parca) in ZorunluBasliklar)
        {
            yanit.Headers.TryGetValues(ad, out var degerler)
                 .Should().BeTrue($"{ad} başlığı eksik ({yanit.RequestMessage?.RequestUri})");
            string.Join(" ", degerler!).Should().Contain(parca);
        }
    }

    [Theory]
    [Trait("Category", "TarayiciSavunmasi")]
    [InlineData("/api/books")]      // 401 dönecek
    [InlineData("/api/auth/me")]    // 401
    public async Task Her_yanit_guvenlik_basliklarini_tasir(string yol)
    {
        var client = _fabrika.CreateClient();
        var yanit = await client.GetAsync(yol);

        yanit.StatusCode.Should().Be(HttpStatusCode.Unauthorized,
            "bu testin ölçtüğü şey durum kodu değil ama beklenen akış budur");
        BasliklariDogrula(yanit);
    }

    [Fact]
    [Trait("Category", "TarayiciSavunmasi")]
    public async Task Basarili_yanit_da_baslik_tasir()
    {
        var client = _fabrika.CreateClient();
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(o.Token);

        var yanit = await client.GetAsync("/api/books");
        yanit.IsSuccessStatusCode.Should().BeTrue();

        BasliklariDogrula(yanit);
    }

    [Fact]
    [Trait("Category", "TarayiciSavunmasi")]
    public async Task Eslesmeyen_yol_yaniti_da_baslik_tasir()
    {
        // Controller'ın hiç çalışmadığı yanıtlar. KURAL-03'ün FallbackPolicy'si
        // yüzünden bu 404 değil 401 döner (eşleşmeyen yol da yetki ister) —
        // ölçülen şey durum kodu değil, başlıkların controller'dan bağımsız
        // olarak zincirde eklendiğidir.
        var client = _fabrika.CreateClient();
        var yanit = await client.GetAsync("/api/bulunmayan-uc");

        yanit.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        BasliklariDogrula(yanit);
    }

    [Fact]
    [Trait("Category", "TarayiciSavunmasi")]
    public async Task Istisna_500_yaniti_da_baslik_tasir()
    {
        // EN KRİTİK TEST. KURAL-06 middleware'i hata yolunda Response.Clear()
        // çağırıyor — o çağrı, önceden EKLENMİŞ başlıkları da siler. Başlıklar
        // OnStarting geri çağrısında, yani gövde yazılmadan hemen önce (yani
        // Clear()'dan SONRA) eklendiği için hayatta kalır.
        //
        // İki middleware'in sırası ters çevrilirse ya da başlıklar OnStarting
        // yerine doğrudan eklenirse bu test kırmızıya döner.
        using var fabrika = new HataFirlatanFabrika();
        var client = fabrika.CreateClient();

        // Eşleşmeyen yol da yetki istiyor (FallbackPolicy); istisnayı fırlatan
        // son halkaya ulaşmak için kimlik gerekiyor.
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(o.Token);

        var yanit = await client.GetAsync(HataFirlatanFabrika.Yol);

        yanit.StatusCode.Should().Be(HttpStatusCode.InternalServerError);
        (await yanit.Content.ReadAsStringAsync()).Should().Contain("olayKimligi");
        BasliklariDogrula(yanit);
    }

    /// <summary>
    /// Zincirin EN SONUNA istisna fırlatan bir halka ekleyen test fabrikası.
    ///
    /// Neden test-only bir UÇ açılmadı: uç açmak üretim yüzeyini genişletir
    /// (bkz. HataMiddlewareTests). IStartupFilter'da <c>next(app)</c> ÇAĞRILDIKTAN
    /// SONRA eklenen halka, hiçbir endpoint ile eşleşmeyen isteklerin düştüğü
    /// yerdir — üretim kodunda ne bu sınıf ne de bu yol vardır.
    /// </summary>
    private sealed class HataFirlatanFabrika : TestAppFactory
    {
        public const string Yol = "/test-icin-istisna-firlat";

        private sealed class Filtre : IStartupFilter
        {
            public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> sonraki) => app =>
            {
                sonraki(app);                       // önce uygulamanın kendi zinciri
                app.Run(ctx => ctx.Request.Path == Yol
                    ? throw new InvalidOperationException("test istisnası — iç ayrıntı: host=10.0.0.5")
                    : Task.CompletedTask);
            };
        }

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);
            builder.ConfigureTestServices(s => s.AddSingleton<IStartupFilter, Filtre>());
        }
    }

    [Fact]
    [Trait("Category", "TarayiciSavunmasi")]
    public async Task Sunucu_parmak_izi_donmez()
    {
        var client = _fabrika.CreateClient();
        var yanit = await client.GetAsync("/api/books");

        yanit.Headers.TryGetValues("Server", out _).Should().BeFalse();
        yanit.Headers.TryGetValues("X-Powered-By", out _).Should().BeFalse();
    }

    [Fact]
    [Trait("Category", "TarayiciSavunmasi")]
    public async Task Kimlikli_yanit_onbellege_alinmaz()
    {
        var client = _fabrika.CreateClient();
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(o.Token);

        var yanit = await client.GetAsync("/api/books/words");

        yanit.IsSuccessStatusCode.Should().BeTrue();
        yanit.Headers.CacheControl?.NoStore.Should().BeTrue(
            "kimlik doğrulanmış yanıt paylaşılan bir bilgisayarın önbelleğinde durmamalı");
    }

    [Fact]
    [Trait("Category", "TarayiciSavunmasi")]
    public async Task Kimliksiz_yanitta_no_store_zorlanmaz()
    {
        // Karşı örnek: no-store'u KOŞULSUZ eklemek, herkese açık ve değişmeyen
        // yanıtların (ör. taksonomi) önbelleğe alınmasını da engellerdi.
        // Bu test, koşulun gerçekten "kimlik doğrulanmışsa" olduğunu ölçer.
        var client = _fabrika.CreateClient();
        var yanit = await client.GetAsync("/api/bulunmayan-uc");

        (yanit.Headers.CacheControl?.NoStore ?? false).Should().BeFalse();
    }
}

/// <summary>
/// KURAL-11'in ÜRETİM dalı. Diğer testler Development ortamında koşuyor;
/// HSTS ve HTTPS yönlendirmesi orada bilerek kapalı (localhost'u HTTPS'e
/// zorlamak geliştirmeyi durdurur). Bu yüzden o dal, kendi ortamıyla ayrıca
/// sınanır — yoksa "kod yazıldı ama üretimde çalışıyor mu?" sorusu açık kalır.
///
/// Aynı "api" koleksiyonunda: test veritabanına paralel erişimi önler.
/// </summary>
[Collection("api")]
public class UretimGuvenlikBasliklariTests : IDisposable
{
    private sealed class UretimFabrikasi : TestAppFactory
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);
            builder.UseEnvironment("Production");   // base'in Development'ını EZER
        }
    }

    private readonly UretimFabrikasi _uretim = new();

    public void Dispose() => _uretim.Dispose();

    [Fact]
    [Trait("Category", "TarayiciSavunmasi")]
    public async Task Uretimde_http_istegi_https_e_yonlendirilir()
    {
        var client = _uretim.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false
        });

        using var istek = new HttpRequestMessage(HttpMethod.Get, "http://linguza.test/api/books");
        istek.Headers.Add("X-Forwarded-Proto", "http");

        var yanit = await client.SendAsync(istek);

        ((int)yanit.StatusCode).Should().BeInRange(300, 399,
            "üretimde düz HTTP isteği HTTPS'e yönlendirilmeli");
        yanit.Headers.Location!.Scheme.Should().Be("https");
    }

    [Fact]
    [Trait("Category", "TarayiciSavunmasi")]
    public async Task Uretimde_iletilen_https_semasi_dongu_yaratmaz_ve_hsts_doner()
    {
        // Ters proxy TLS'i sonlandırıp uygulamaya HTTP gönderiyor ve
        // X-Forwarded-Proto: https ekliyor. ForwardedHeaders okunmazsa istek
        // "HTTP" sanılır, yönlendirilir, proxy tekrar iletir → SONSUZ DÖNGÜ.
        // Bu test o döngünün oluşmadığını kanıtlar.
        var client = _uretim.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false
        });

        using var istek = new HttpRequestMessage(HttpMethod.Get, "http://linguza.test/api/books");
        istek.Headers.Add("X-Forwarded-Proto", "https");

        var yanit = await client.SendAsync(istek);

        ((int)yanit.StatusCode).Should().NotBeInRange(300, 399,
            "proxy zaten HTTPS sonlandırdı — tekrar yönlendirmek sonsuz döngü demek");
        yanit.StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        yanit.Headers.TryGetValues("Strict-Transport-Security", out var hsts)
             .Should().BeTrue("HTTPS üzerinden gelen üretim yanıtı HSTS taşımalı");
        string.Join(" ", hsts!).Should().Contain("max-age=2592000")     // 30 gün
                                .And.Contain("includeSubDomains");
        string.Join(" ", hsts!).Should().NotContain("preload",
            "preload listesine girmek geri alınamaz — bilinçli olarak kapalı");
    }

    [Fact]
    [Trait("Category", "TarayiciSavunmasi")]
    public async Task Uretim_yaniti_da_guvenlik_basliklarini_tasir()
    {
        var client = _uretim.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false
        });

        using var istek = new HttpRequestMessage(HttpMethod.Get, "http://linguza.test/api/books");
        istek.Headers.Add("X-Forwarded-Proto", "https");
        var yanit = await client.SendAsync(istek);

        foreach (var (ad, parca) in GuvenlikBasliklariTests.ZorunluBasliklar)
        {
            yanit.Headers.TryGetValues(ad, out var degerler).Should().BeTrue($"{ad} başlığı eksik");
            string.Join(" ", degerler!).Should().Contain(parca);
        }
    }
}
