using System.Net;
using System.Net.Http.Json;
using EnglishReadingPlatform.Configuration;
using EnglishReadingPlatform.Security;
using EnglishReadingPlatform.Tests.Infrastructure;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace EnglishReadingPlatform.Tests;

/// <summary>
/// KURAL-14 sözleşme testleri — eksik yapılandırmada KAPALI kal.
///
/// Bu dosya silinir ya da içindeki testlerden biri kaldırılırsa
/// scripts/guard/14-yapilandirma.sh kırmızı verir.
/// </summary>
[Collection("api")]
public class YapilandirmaSozlesmesiTests
{
    private readonly TestAppFactory _fabrika;
    public YapilandirmaSozlesmesiTests(TestAppFactory fabrika) => _fabrika = fabrika;

    // ─── Kapalı dal: sızıntı yerine açık ret ──────────────────────

    /// <summary>
    /// ANA REGRESYON. Testlerde Resend anahtarı YOKTUR (TestAppFactory bunu
    /// açıkça temizler) — yani bu ortam, üretimin anahtarsız hâlini birebir
    /// taklit eder. Bağlantının loga yazıldığı eski davranışta uç 200 dönerdi.
    /// </summary>
    [Fact]
    [Trait("Category", "Yapilandirma")]
    public async Task Eposta_servisi_kapaliyken_sifirlama_ucu_503_DONER()
    {
        var client = _fabrika.CreateClient();

        var yanit = await client.PostAsJsonAsync("/api/auth/forgot-password",
            new { eposta = "kimse@test.local" });

        yanit.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable,
            "gönderemiyorsak sessizce loga yazmak yerine açıkça kapalı demeliyiz");
    }

    /// <summary>
    /// ASIL İDDİA: 503 dönmek yetmez — JETON DA ÜRETİLMEMELİ.
    ///
    /// Kendi testi olması bilinçli (faz 1 dersi 3): 503'ün kaybolması ile
    /// "jeton sızdı" İKİ AYRI hatadır. Tek testte toplanırsa, ilk başarısız
    /// iddiada durulacağı için raporda yalnızca biri görünür.
    /// </summary>
    [Fact]
    [Trait("Category", "Yapilandirma")]
    public async Task Servis_kapaliyken_sifirlama_jetonu_URETILMEZ()
    {
        var client = _fabrika.CreateClient();
        var ek = Guid.NewGuid().ToString("N")[..8];
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client, ek);

        var oncekiJetonSayisi = await JetonSayisiAsync(_fabrika, o.UserId);

        await client.PostAsJsonAsync("/api/auth/forgot-password",
            new { eposta = $"ogr_{ek}@test.local" });

        (await JetonSayisiAsync(_fabrika, o.UserId)).Should().Be(oncekiJetonSayisi,
            "gönderilemeyecek bir bağlantı için jeton üretmek, veritabanında " +
            "sahibinin bilmediği geçerli bir anahtar bırakır");
    }

    /// <summary>
    /// TUZAK KONTROLÜ (KURAL-14 tuzak tablosu, birinci satır): 503 kontrolü
    /// kullanıcı aramasından SONRA konursa, "servis kapalı" yanıtı yalnızca
    /// KAYITLI e-postalarda döner ve KURAL-09'un kapattığı hesap enumerasyonu
    /// bu kez DURUM KODU üzerinden geri gelir.
    ///
    /// Yalnızca "bilinmeyen e-postada 503" testi bu hatayı YAKALAYAMAZ.
    /// </summary>
    [Fact]
    [Trait("Category", "Yapilandirma")]
    public async Task Kapali_uc_KAYITLI_ve_KAYITSIZ_epostada_AYNI_yaniti_verir()
    {
        var client = _fabrika.CreateClient();
        var ek = Guid.NewGuid().ToString("N")[..8];
        await AuthHelper.OgrenciOlarakGirisYapAsync(client, ek);

        var kayitli = await client.PostAsJsonAsync("/api/auth/forgot-password",
            new { eposta = $"ogr_{ek}@test.local" });
        var kayitsiz = await client.PostAsJsonAsync("/api/auth/forgot-password",
            new { eposta = $"yok_{ek}@test.local" });

        kayitli.StatusCode.Should().Be(kayitsiz.StatusCode,
            "durum kodu, e-postanın kayıtlı olup olmadığını SIZDIRMAMALI");
        kayitli.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
    }

    /// <summary>
    /// Kapalı gönderici, bağlantıyı ASLA dışarı vermemeli — ne loga, ne yanıta,
    /// ne de istisna mesajına. Merkezî HataYakalamaMiddleware yakalanmamış
    /// istisnaları tam ayrıntısıyla logladığı için mesaj da bir sızıntı yüzeyidir.
    /// </summary>
    [Fact]
    [Trait("Category", "Yapilandirma")]
    public async Task Kapali_gonderici_baglantiyi_ISTISNAYA_koymaz()
    {
        var gonderici = new KapaliEpostaGondericisi(
            NullLogger<KapaliEpostaGondericisi>.Instance);

        const string gizliBaglanti = "https://x.app/reset-password?token=COKGIZLIJETON";

        Func<Task> eylem = () =>
            gonderici.SifreSifirlamaGonderAsync("a@b.local", gizliBaglanti);

        var istisna = await eylem.Should().ThrowAsync<EpostaServisiKapaliException>(
            "gönderemediğini SÖYLEMELİ — sessizce başarılı dönmek çağıranı yanıltır");

        istisna.And.Message.Should().NotContain("COKGIZLIJETON",
            "istisna mesajı da bir sızıntı yüzeyidir");
    }

    // ─── Açık dal: "her zaman 503" da bir hatadır ─────────────────

    /// <summary>
    /// TUZAK KONTROLÜ (KURAL-14 tuzak tablosu, "yalnızca kapalıyken test etmek"):
    /// yukarıdaki testlerin hepsi, HER KOŞULDA 503 dönen bozuk bir uçla da
    /// yeşil kalırdı. Bu test, servis yapılandırılmışken ucun GERÇEKTEN
    /// çalıştığını sabitler: 200 döner, jeton üretilir ve bağlantı
    /// YAPILANDIRILAN tabana kurulur.
    /// </summary>
    [Fact]
    [Trait("Category", "Yapilandirma")]
    public async Task Servis_ACIKKEN_jeton_uretilir_ve_baglanti_GONDERILIR()
    {
        using var acik = EpostaTestFabrikasi.Acik();
        var client = acik.CreateClient();
        var ek = Guid.NewGuid().ToString("N")[..8];
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client, ek);

        var yanit = await client.PostAsJsonAsync("/api/auth/forgot-password",
            new { eposta = $"ogr_{ek}@test.local" });

        yanit.StatusCode.Should().Be(HttpStatusCode.OK,
            "yapılandırma tamamken uç çalışmalı — aksi hâlde 'her zaman 503 dönen' " +
            "bir uç yazılmış olurdu ve kapalı-dal testleri bunu görmezdi");

        acik.Gonderici.GonderimSayisi.Should().Be(1, "e-posta gerçekten gönderilmeli");
        (await JetonSayisiAsync(acik, o.UserId)).Should().Be(1, "jeton üretilmeli");

        acik.Gonderici.SonBaglanti.Should()
            .StartWith($"{EpostaTestFabrikasi.TabanAdres}/reset-password?token=")
            .And.NotContain("localhost", "bağlantı yapılandırılan tabana kurulmalı");
    }

    /// <summary>
    /// Taban adres tanımlı DEĞİLKEN uç 503 dönmeli.
    ///
    /// Eski kodda burada <c>?? "http://localhost:3000"</c> vardı: jeton üretilir,
    /// e-posta gönderilir, ama içindeki bağlantı kullanıcının açamayacağı bir
    /// adrese gider. Hata değil, SESSİZ bir bozukluk — kullanıcı "bağlantı
    /// çalışmıyor" der, kimse sebebini bulamaz.
    ///
    /// NOT: fabrika ortam değişkenini SİLİYOR, boş dizeye ayarlamıyor. Eski
    /// varsayılan yalnızca null'da devreye giriyordu; boş dize verilseydi bu
    /// test mutasyonu uyandıramazdı.
    /// </summary>
    [Fact]
    [Trait("Category", "Yapilandirma")]
    public async Task Sifirlama_baglantisi_localhost_a_URETILEMEZ_uretimde()
    {
        using var tabansiz = EpostaTestFabrikasi.TabanAdresiYok();
        var client = tabansiz.CreateClient();
        var ek = Guid.NewGuid().ToString("N")[..8];
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client, ek);

        var yanit = await client.PostAsJsonAsync("/api/auth/forgot-password",
            new { eposta = $"ogr_{ek}@test.local" });

        yanit.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable,
            "taban adres yokken kullanılamaz bir bağlantı üretmektense uç kapanmalı");
        tabansiz.Gonderici.GonderimSayisi.Should().Be(0, "hiç e-posta gönderilmemeli");
        (await JetonSayisiAsync(tabansiz, o.UserId)).Should().Be(0, "jeton da üretilmemeli");
    }

    // ─── Sözleşmenin kendisi ──────────────────────────────────────

    [Fact]
    [Trait("Category", "Yapilandirma")]
    public void Her_dis_servis_SINIFLANDIRILMIS_olmali()
    {
        DisServisSozlesmesi.Servisler.Should().NotBeEmpty();
        DisServisSozlesmesi.Servisler.Should().OnlyContain(
            s => !string.IsNullOrWhiteSpace(s.YapilandirmaAnahtari)
              && !string.IsNullOrWhiteSpace(s.EksikseNeOlur),
            "sınıflandırma, 'eksikse ne olur' cevabını da içermeli — " +
            "yoksa operatör kararı veremez");

        DisServisSozlesmesi.Servisler
            .Select(s => s.YapilandirmaAnahtari).Should().OnlyHaveUniqueItems(
                "aynı anahtar iki kez sınıflandırılırsa hangisinin geçerli " +
                "olduğu okuyucuya göre değişir");
    }

    /// <summary>
    /// Sözleşme yalnızca bir liste değil, ÇALIŞAN bir sorgudur: eksik olan
    /// "özellik kapanır" servisleri açılış raporuna bu metot besliyor.
    /// </summary>
    [Fact]
    [Trait("Category", "Yapilandirma")]
    public void Kapali_ozellikler_raporu_EKSIK_olani_bulur()
    {
        var bos = new ConfigurationBuilder().Build();

        DisServisSozlesmesi.KapaliOzellikler(bos)
            .Select(s => s.YapilandirmaAnahtari)
            .Should().BeEquivalentTo(new[] { "Resend:ApiKey", "App:FrontendUrl" },
                "eksik yapılandırma operatöre AÇILIŞTA bildirilmeli");

        var dolu = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Resend:ApiKey"]   = "x",
                ["App:FrontendUrl"] = "https://y.app",
            }).Build();

        DisServisSozlesmesi.KapaliOzellikler(dolu).Should().BeEmpty(
            "yapılandırma tamamken rapor sessiz olmalı — sürekli uyarı veren " +
            "bir rapor okunmaz hâle gelir");
    }

    private static async Task<int> JetonSayisiAsync(TestAppFactory fabrika, int kullaniciId)
    {
        using var kapsam = fabrika.Services.CreateScope();
        var db = kapsam.ServiceProvider.GetRequiredService<EnglishReadingPlatform.Data.AppDbContext>();
        return await db.SifreSifirlamaJetonlari.CountAsync(j => j.UserId == kullaniciId);
    }
}
