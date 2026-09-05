using System.Net;
using EnglishReadingPlatform.Configuration;
using EnglishReadingPlatform.Tests.Infrastructure;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace EnglishReadingPlatform.Tests;

/// <summary>
/// KURAL-13 sözleşme testleri — köken ve kaynak denetimi.
///
/// Bu dosya silinirse scripts/guard/13-koken.sh kırmızı verir.
/// </summary>
[Collection("api")]
public class KokenSozlesmesiTests
{
    private readonly TestAppFactory _fabrika;
    public KokenSozlesmesiTests(TestAppFactory fabrika) => _fabrika = fabrika;

    /// <summary>
    /// ANA REGRESYON: yabancı bir köken, kimlik bilgisi taşıyan bir CORS
    /// yanıtı ALMAMALI. Bu test kırmızıysa herhangi bir web sitesi API'ye
    /// kullanıcı adına istek atıp yanıtı okuyabilir.
    /// </summary>
    [Fact]
    [Trait("Category", "Koken")]
    public async Task Yabanci_koken_CORS_izni_ALAMAZ()
    {
        var client = _fabrika.CreateClient();

        using var istek = new HttpRequestMessage(HttpMethod.Options, "/api/books");
        istek.Headers.Add("Origin", "https://kotu-site.example");
        istek.Headers.Add("Access-Control-Request-Method", "GET");

        var yanit = await client.SendAsync(istek);

        yanit.Headers.Contains("Access-Control-Allow-Origin").Should().BeFalse(
            "yabancı kökene Access-Control-Allow-Origin verilmemeli");
    }

    [Fact]
    [Trait("Category", "Koken")]
    public async Task Yabanci_kokene_kimlik_bilgisi_izni_VERILMEZ()
    {
        var client = _fabrika.CreateClient();

        using var istek = new HttpRequestMessage(HttpMethod.Options, "/api/books");
        istek.Headers.Add("Origin", "https://kotu-site.example");
        istek.Headers.Add("Access-Control-Request-Method", "POST");

        var yanit = await client.SendAsync(istek);

        yanit.Headers.Contains("Access-Control-Allow-Credentials").Should().BeFalse(
            "kimlik bilgisi izni yalnızca beyaz listedeki kökene verilir");
    }

    /// <summary>
    /// TUZAK KONTROLÜ (KURAL-13 tuzak tablosu, "yalnızca OPTIONS denemesi"):
    /// basit istekler (GET) ön-uçuş YAPMAZ — tarayıcı doğrudan gerçek isteği
    /// atar ve yanıttaki Access-Control-Allow-Origin'e bakar. Yalnızca
    /// preflight'ı test etmek, gerçek istek yolunu denetimsiz bırakır.
    /// </summary>
    [Fact]
    [Trait("Category", "Koken")]
    public async Task Yabanci_koken_GERCEK_istekte_de_izin_ALAMAZ()
    {
        var client = _fabrika.CreateClient();

        using var istek = new HttpRequestMessage(HttpMethod.Get, "/api/books");
        istek.Headers.Add("Origin", "https://kotu-site.example");

        var yanit = await client.SendAsync(istek);

        yanit.Headers.Contains("Access-Control-Allow-Origin").Should().BeFalse(
            "ön-uçuşsuz gerçek istekte de yabancı kökene başlık dönmemeli");
    }

    /// <summary>
    /// TUZAK KONTROLÜ: "her kökeni reddet" de bir hatadır ve yukarıdaki
    /// testleri yeşil bırakır. Bu test, beyaz listedeki kökenin GERÇEKTEN
    /// çalıştığını kanıtlar — aksi hâlde istemciler sessizce kırılır.
    /// </summary>
    [Fact]
    [Trait("Category", "Koken")]
    public async Task Beyaz_listedeki_koken_izin_ALIR()
    {
        var client = _fabrika.CreateClient();

        using var istek = new HttpRequestMessage(HttpMethod.Options, "/api/books");
        istek.Headers.Add("Origin", "http://localhost:3000");   // TestAppFactory'nin verdiği
        istek.Headers.Add("Access-Control-Request-Method", "GET");

        var yanit = await client.SendAsync(istek);

        yanit.Headers.GetValues("Access-Control-Allow-Origin")
            .Should().ContainSingle().Which.Should().Be("http://localhost:3000");
        yanit.Headers.GetValues("Access-Control-Allow-Credentials")
            .Should().ContainSingle().Which.Should().Be("true");
    }

    [Fact]
    [Trait("Category", "Koken")]
    public void Uretimde_koken_listesi_bos_birakILAMAZ()
    {
        var yapilandirma = new ConfigurationBuilder().Build();     // boş
        var ortam = new SahteOrtam("Production");

        var eylem = () => GuvenilirKokenler.Oku(yapilandirma, ortam);

        eylem.Should().Throw<InvalidOperationException>()
            .WithMessage("*CorsOrigins*");
    }

    [Fact]
    [Trait("Category", "Koken")]
    public void Joker_koken_yapilandirmadan_da_GECEMEZ()
    {
        var yapilandirma = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["CorsOrigins"] = "*" })
            .Build();

        var eylem = () => GuvenilirKokenler.Oku(yapilandirma, new SahteOrtam("Production"));

        eylem.Should().Throw<InvalidOperationException>().WithMessage("*joker*");
    }

    /// <summary>
    /// Tuzak tablosundaki Vercel önizleme senaryosu: her PR ayrı bir
    /// *.vercel.app alt alan adı üretir. "Hepsini kapsasın" diye joker yazmak
    /// en olası hatadır — beyaz listenin anlamını yok eder.
    ///
    /// NOT: bu değeri iki bağımsız katman reddediyor — joker kontrolü ve
    /// Uri doğrulaması (.NET, host içinde '*' kabul etmiyor). Test hangisinin
    /// yakaladığını değil, DEĞERİN GEÇMEDİĞİNİ sabitler.
    /// </summary>
    [Fact]
    [Trait("Category", "Koken")]
    public void Joker_ALT_ALAN_ADI_de_GECEMEZ()
    {
        var yapilandirma = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
                { ["CorsOrigins"] = "https://*.vercel.app" })
            .Build();

        var eylem = () => GuvenilirKokenler.Oku(yapilandirma, new SahteOrtam("Production"));

        eylem.Should().Throw<InvalidOperationException>();
    }

    [Fact]
    [Trait("Category", "Koken")]
    public void Uretimde_http_koken_KABUL_EDILMEZ()
    {
        var yapilandirma = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
                { ["CorsOrigins"] = "http://linguza.example" })
            .Build();

        var eylem = () => GuvenilirKokenler.Oku(yapilandirma, new SahteOrtam("Production"));

        eylem.Should().Throw<InvalidOperationException>().WithMessage("*http*");
    }

    // ─── Host başlığı doğrulaması (envanter ihlal 3) ───────────────
    // Bu iki test ÜRETİM ortamında koşar: Host filtresi geliştirmede
    // bilerek uygulanmıyor (yerelde 127.0.0.1, ::1, makine adı serbest).

    /// <summary>
    /// Host zehirlenmesi regresyonu: saldırganın gönderdiği Host başlığı
    /// kabul edilirse, mutlak URL üreten her yer (şifre sıfırlama bağlantısı)
    /// saldırganın alan adına üretilir.
    /// </summary>
    [Fact]
    [Trait("Category", "Koken")]
    public async Task Uretimde_YABANCI_Host_basligi_REDDEDILIR()
    {
        using var uretim = new UretimTestFabrikasi();
        var client = uretim.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false
        });

        using var istek = new HttpRequestMessage(HttpMethod.Get, "http://kotu.example/api/books");
        istek.Headers.Add("X-Forwarded-Proto", "https");

        var yanit = await client.SendAsync(istek);

        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest,
            "beyaz listede olmayan Host başlığı taşıyan istek işlenmemeli");
    }

    /// <summary>
    /// TUZAK KONTROLÜ: Host filtresini "her şeyi reddet" hâline getirmek de
    /// bir hatadır ve yukarıdaki testi yeşil bırakır. Bu test, meşru ana
    /// bilgisayarın GERÇEKTEN geçtiğini kanıtlar.
    /// </summary>
    [Fact]
    [Trait("Category", "Koken")]
    public async Task Uretimde_BEYAZ_LISTEDEKI_Host_basligi_GECER()
    {
        using var uretim = new UretimTestFabrikasi();
        var client = uretim.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false
        });

        using var istek = new HttpRequestMessage(
            HttpMethod.Get, $"http://{UretimTestFabrikasi.UretimAnaBilgisayari}/api/books");
        istek.Headers.Add("X-Forwarded-Proto", "https");

        var yanit = await client.SendAsync(istek);

        yanit.StatusCode.Should().Be(HttpStatusCode.Unauthorized,
            "meşru ana bilgisayar Host filtresinden geçip yetkilendirmeye ulaşmalı");
    }

    private sealed class SahteOrtam : IHostEnvironment
    {
        public SahteOrtam(string ad) => EnvironmentName = ad;
        public string EnvironmentName { get; set; }
        public string ApplicationName { get; set; } = "test";
        public string ContentRootPath { get; set; } = ".";
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } = null!;
    }
}
