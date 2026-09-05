using System.Net;
using EnglishReadingPlatform.Configuration;
using EnglishReadingPlatform.Tests.Infrastructure;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace EnglishReadingPlatform.Tests;

/// <summary>
/// KURAL-15 sözleşme testleri — dağıtım kapısı.
///
/// Bu dosya silinir ya da içindeki testlerden biri kaldırılırsa
/// scripts/guard/15-dagitim.sh kırmızı verir.
/// </summary>
[Collection("api")]
public class DagitimSozlesmesiTests
{
    private readonly TestAppFactory _fabrika;
    public DagitimSozlesmesiTests(TestAppFactory fabrika) => _fabrika = fabrika;

    // ─── Sağlık ucu ───────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Dagitim")]
    public async Task Saglik_ucu_anonim_erisilebilir_ve_200_doner()
    {
        var yanit = await _fabrika.CreateClient().GetAsync("/health");

        yanit.StatusCode.Should().Be(HttpStatusCode.OK,
            "platformun sağlık yoklaması token gönderemez; uç [Authorize] " +
            "arkasında olsaydı her dağıtım 'sağlıksız' görünürdü");
    }

    /// <summary>
    /// Sağlık ucu bir BİLGİ SIZINTISI yüzeyidir ve anonimdir. Varsayılan yanıt
    /// yazıcısı kontrol adlarını, kütüphane adlarını ve istisna metinlerini
    /// döker — KURAL-06'nın kapattığı iç detay sızıntısının geri gelmesi olurdu.
    /// </summary>
    [Fact]
    [Trait("Category", "Dagitim")]
    public async Task Saglik_ucu_ic_detay_SIZDIRMAZ()
    {
        var govde = await _fabrika.CreateClient().GetStringAsync("/health");

        govde.Should().Be("OK");
        govde.Should().NotContainAny("Npgsql", "EntityFramework", "Exception", "at ",
            "sağlık ucu anonimdir; gövdesine düşen her iç detay herkese açıktır");
    }

    /// <summary>
    /// ASIL İDDİA: sağlık ucu veritabanını GERÇEKTEN yoklamalı.
    ///
    /// Yalnızca "ayaktayım" diyen bir uç, Database.Migrate()'i düşmüş bir
    /// örneği de sağlıklı gösterir — yani kötü dağıtımın geri alınmasını
    /// tam da gerektiği anda engeller.
    ///
    /// Kendi testi olması bilinçli (faz 1 dersi 3): "uç 200 dönüyor" ile
    /// "uç veritabanını ölçüyor" iki AYRI davranıştır.
    /// </summary>
    [Fact]
    [Trait("Category", "Dagitim")]
    public void Saglik_kontrolu_veritabanini_da_KAPSAR()
    {
        var kayitli = _fabrika.Services
            .GetService(typeof(Microsoft.Extensions.Diagnostics.HealthChecks.HealthCheckService));

        kayitli.Should().NotBeNull("sağlık kontrolü servisi hiç kayıtlı değil");

        var secenekler = (Microsoft.Extensions.Options.IOptions<
                Microsoft.Extensions.Diagnostics.HealthChecks.HealthCheckServiceOptions>)
            _fabrika.Services.GetService(typeof(Microsoft.Extensions.Options.IOptions<
                Microsoft.Extensions.Diagnostics.HealthChecks.HealthCheckServiceOptions>))!;

        secenekler.Value.Registrations.Select(r => r.Name)
            .Should().Contain("veritabani",
                "veritabanına ulaşamayan bir örnek 'sağlıklı' görünmemeli");
    }

    // ─── Ortam sözleşmesi ─────────────────────────────────────────

    [Fact]
    [Trait("Category", "Dagitim")]
    public void Uretimde_eksik_zorunlu_degisken_uygulamayi_DURDURUR()
    {
        var bos = new ConfigurationBuilder().Build();

        var eylem = () => OrtamSozlesmesi.UretimdeDogrula(bos, new SahteOrtam("Production"));

        eylem.Should().Throw<InvalidOperationException>()
            .WithMessage("*Dağıtım eksik*");
    }

    /// <summary>
    /// Hata mesajı SORUNU ÇÖZEBİLİR olmalı: hangi değişken, ortam değişkeni
    /// adı ne, eksikse ne olur. "Yapılandırma hatası" diyen bir mesaj
    /// operatörü koda bakmaya zorlar ve gece yarısı kimse koda bakmaz.
    /// </summary>
    [Fact]
    [Trait("Category", "Dagitim")]
    public void Eksik_degisken_mesaji_YOL_GOSTERIR()
    {
        var bos = new ConfigurationBuilder().Build();

        var istisna = Assert.Throws<InvalidOperationException>(
            () => OrtamSozlesmesi.UretimdeDogrula(bos, new SahteOrtam("Production")));

        istisna.Message.Should().Contain("Jwt__Key", "ortam değişkeni biçimi verilmeli");
        istisna.Message.Should().Contain("Eksikse:", "sonucu da söylemeli");
        istisna.Message.Should().Contain("on-kontrol.sh", "bir sonraki adımı göstermeli");
    }

    [Fact]
    [Trait("Category", "Dagitim")]
    public void Gelistirmede_eksik_degisken_uygulamayi_DURDURMAZ()
    {
        var bos = new ConfigurationBuilder().Build();

        var eylem = () => OrtamSozlesmesi.UretimdeDogrula(bos, new SahteOrtam("Development"));

        eylem.Should().NotThrow("geliştirme ortamı eksik yapılandırmayla çalışabilmeli");
    }

    /// <summary>
    /// Sessiz eksiklikler bu kuralın varlık sebebi. Seed:AdminEmail ve
    /// PublicHost tanımlı değilken uygulama eskiden sorunsuz açılıyordu:
    /// biri yönetici panelini boş bırakıyor, diğeri Host doğrulamasını
    /// sessizce düşürüyordu.
    /// </summary>
    [Fact]
    [Trait("Category", "Dagitim")]
    public void Sessiz_bozulan_degiskenler_URETIMDE_ZORUNLU()
    {
        var zorunlular = OrtamSozlesmesi.Degiskenler
            .Where(d => d.UretimdeZorunlu).Select(d => d.Anahtar);

        zorunlular.Should().Contain(new[] { "Seed:AdminEmail", "PublicHost", "CorsOrigins" });
    }

    /// <summary>
    /// TUZAK KONTROLÜ: KURAL-15'in taslağı Resend:ApiKey ve App:FrontendUrl'ü
    /// "üretimde zorunlu" yapıyordu. Bu, KURAL-14'ün kararını iptal ederdi —
    /// orada bu iki anahtar bilerek "özellik kapanır" sınıfına konmuştu:
    /// uygulama AÇILIR, yalnızca şifre sıfırlama 503 döner.
    ///
    /// Zorunlu yapılsalardı, anahtar gelene kadar üretime hiç dağıtılamazdı.
    /// Bu test o kararı sabitler; biri sözleşmeyi elle sıkılaştırırsa kırılır.
    /// </summary>
    [Fact]
    [Trait("Category", "Dagitim")]
    public void Ozellik_kapanir_sinifi_dagitimi_ENGELLEMEZ()
    {
        var kapanabilirler = DisServisSozlesmesi.Servisler
            .Where(s => s.Sinif == ServisSinifi.OzellikKapanir)
            .Select(s => s.YapilandirmaAnahtari);

        foreach (var anahtar in kapanabilirler)
        {
            OrtamSozlesmesi.Degiskenler.Should().Contain(
                d => d.Anahtar == anahtar && !d.UretimdeZorunlu,
                "{0} eksikken uygulama AÇILMALI, yalnızca bağlı özellik 503 dönmeli (KURAL-14)",
                anahtar);
        }
    }

    /// <summary>
    /// İki sözleşme (KURAL-14 dış servisler, KURAL-15 ortam) ayrışmamalı.
    /// Ayrışırlarsa biri güncellenir, diğeri unutulur — ve unutulan taraf
    /// her zaman gevşek olandır.
    /// </summary>
    [Fact]
    [Trait("Category", "Dagitim")]
    public void Her_dis_servis_ortam_sozlesmesinde_de_VAR()
    {
        var ortamAnahtarlari = OrtamSozlesmesi.Degiskenler.Select(d => d.Anahtar);

        DisServisSozlesmesi.Servisler.Select(s => s.YapilandirmaAnahtari)
            .Should().BeSubsetOf(ortamAnahtarlari,
                "dağıtım sözleşmesi, dış servis sözleşmesinden TÜRETİLİYOR");

        OrtamSozlesmesi.Degiskenler.Select(d => d.Anahtar)
            .Should().OnlyHaveUniqueItems("aynı anahtar iki kez sınıflandırılamaz");
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
