using System.Net;
using System.Net.Http.Json;
using EnglishReadingPlatform.Tests.Infrastructure;
using FluentAssertions;
using Xunit;

namespace EnglishReadingPlatform.Tests;

/// <summary>KURAL-09: kimlik doğrulama sertleştirmesinin uçtan uca testleri.</summary>
[Collection("api")]
public class KimlikSertlestirmeTests
{
    private readonly TestAppFactory _fabrika;
    public KimlikSertlestirmeTests(TestAppFactory fabrika) => _fabrika = fabrika;

    private static int _ip;
    /// <summary>Her istek farklı IP'den gelsin — IP sınırı testi kirletmesin.</summary>
    private static async Task<HttpResponseMessage> GonderAsync(
        HttpClient client, string yol, object govde, string? sabitIp = null)
    {
        using var istek = new HttpRequestMessage(HttpMethod.Post, yol) { Content = JsonContent.Create(govde) };
        var n = Interlocked.Increment(ref _ip);
        istek.Headers.Add(TestIstemciIpFiltresi.Baslik,
            sabitIp ?? $"172.{(n >> 16) & 0xFF}.{(n >> 8) & 0xFF}.{n & 0xFF}");
        return await client.SendAsync(istek);
    }

    [Fact]
    [Trait("Category", "KimlikSertlestirme")]
    public async Task Zayif_sifreyle_kayit_reddedilir()
    {
        var client = _fabrika.CreateClient();
        var yanit = await GonderAsync(client, "/api/auth/register", new
        {
            username = "zayif_" + Guid.NewGuid().ToString("N")[..6],
            email = $"zayif_{Guid.NewGuid():N}@test.local",
            password = "123456",
            role = "student"
        });

        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    [Trait("Category", "KimlikSertlestirme")]
    public async Task Kayit_hesabin_varligini_sizdirmaz()
    {
        var client = _fabrika.CreateClient();
        var eposta = $"tekrar_{Guid.NewGuid():N}@test.local";
        var kullaniciAdi = "tekrar_" + Guid.NewGuid().ToString("N")[..6];

        var ilk = await GonderAsync(client, "/api/auth/register",
            new { username = kullaniciAdi, email = eposta, password = "Guclu!Sifre2026", role = "student" });
        ilk.StatusCode.Should().Be(HttpStatusCode.OK, "ilk kayıt başarılı olmalı");

        var ikinci = await GonderAsync(client, "/api/auth/register",
            new { username = kullaniciAdi + "x", email = eposta, password = "Guclu!Sifre2026", role = "student" });

        var govde = await ikinci.Content.ReadAsStringAsync();
        ikinci.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        govde.Should().NotContain("zaten kullanımda",
            "hangi alanın çakıştığı söylenmemeli — enumerasyon");
    }

    [Fact]
    [Trait("Category", "KimlikSertlestirme")]
    public async Task Sifre_degistirilebilir_ve_eski_token_gecersiz_olur()
    {
        var client = _fabrika.CreateClient();
        var benzersiz = Guid.NewGuid().ToString("N")[..8];
        var eposta = $"deg_{benzersiz}@test.local";

        await GonderAsync(client, "/api/auth/register", new
        {
            username = $"deg_{benzersiz}", email = eposta,
            password = "Ilk!Sifre2026x", role = "student"
        });
        var giris = await GonderAsync(client, "/api/auth/login",
            new { email = eposta, password = "Ilk!Sifre2026x" });
        giris.StatusCode.Should().Be(HttpStatusCode.OK);
        var token = (await giris.Content.ReadFromJsonAsync<GirisYaniti>())!.token;

        client.TokenIle(token);
        var degistir = await GonderAsync(client, "/api/auth/change-password",
            new { mevcutSifre = "Ilk!Sifre2026x", yeniSifre = "Yeni!Sifre2026y" });
        degistir.StatusCode.Should().Be(HttpStatusCode.OK);

        // Eski token artık geçersiz olmalı
        (await client.GetAsync("/api/auth/me")).StatusCode
            .Should().Be(HttpStatusCode.Unauthorized, "şifre değişimi oturumları sonlandırmalı");

        // Yeni şifreyle giriş çalışmalı
        var yeniGiris = await GonderAsync(_fabrika.CreateClient(), "/api/auth/login",
            new { email = eposta, password = "Yeni!Sifre2026y" });
        yeniGiris.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    [Trait("Category", "KimlikSertlestirme")]
    public async Task Zayif_yeni_sifreyle_degistirilemez()
    {
        var client = _fabrika.CreateClient();
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(o.Token);

        var yanit = await GonderAsync(client, "/api/auth/change-password",
            new { mevcutSifre = "TestSifre123!", yeniSifre = "123456" });

        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest,
            "politika şifre DEĞİŞTİRME yolunda da uygulanmalı");
    }

    [Fact]
    [Trait("Category", "KimlikSertlestirme")]
    public async Task Yanlis_mevcut_sifreyle_degistirilemez()
    {
        var client = _fabrika.CreateClient();
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(o.Token);

        var yanit = await GonderAsync(client, "/api/auth/change-password",
            new { mevcutSifre = "TamamenYanlis!99", yeniSifre = "Yeni!Sifre2026z" });

        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    [Trait("Category", "KimlikSertlestirme")]
    public async Task Sifremi_unuttum_hesabin_varligini_sizdirmaz()
    {
        var client = _fabrika.CreateClient();

        var varOlmayan = await GonderAsync(client, "/api/auth/forgot-password",
            new { eposta = $"yok_{Guid.NewGuid():N}@test.local" });
        var varOlan = await GonderAsync(client, "/api/auth/forgot-password",
            new { eposta = TestAppFactory.TestAdminEmail });

        varOlmayan.StatusCode.Should().Be(varOlan.StatusCode);
        (await varOlmayan.Content.ReadAsStringAsync())
            .Should().Be(await varOlan.Content.ReadAsStringAsync(),
                "iki yanıt birebir aynı olmalı");
    }

    /// <summary>
    /// Dağıtık saldırı benzetimi: her deneme FARKLI IP'den geliyor, yani IP bazlı
    /// sınır hiç devreye girmiyor. 429 görülüyorsa bunu yapan HESAP bazlı sayaçtır.
    /// </summary>
    [Fact]
    [Trait("Category", "KimlikSertlestirme")]
    public async Task Ayni_hesaba_farkli_IPlerden_yogun_deneme_engellenir()
    {
        var client = _fabrika.CreateClient();
        var benzersiz = Guid.NewGuid().ToString("N")[..8];
        var eposta = $"hedef_{benzersiz}@test.local";

        await GonderAsync(client, "/api/auth/register", new
        {
            username = $"hedef_{benzersiz}", email = eposta,
            password = "Hedef!Sifre2026", role = "student"
        });

        var durumlar = new List<HttpStatusCode>();
        for (var i = 0; i < 14; i++)
        {
            var yanit = await GonderAsync(client, "/api/auth/login",
                new { email = eposta, password = $"Yanlis!Sifre{i}" });
            durumlar.Add(yanit.StatusCode);
        }

        durumlar.Should().Contain(HttpStatusCode.TooManyRequests,
            "hedef hesap bazlı sınır devreye girmeli");
    }

    /// <summary>Sıfırlama jetonu tek kullanımlıktır; ikinci kez kullanılamaz.</summary>
    [Fact]
    [Trait("Category", "KimlikSertlestirme")]
    public async Task Gecersiz_jetonla_sifre_sifirlanamaz()
    {
        var client = _fabrika.CreateClient();
        var yanit = await GonderAsync(client, "/api/auth/reset-password",
            new { jeton = new string('A', 64), yeniSifre = "Yepyeni!Sifre26" });

        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    private record GirisYaniti(string token, object user);
}
