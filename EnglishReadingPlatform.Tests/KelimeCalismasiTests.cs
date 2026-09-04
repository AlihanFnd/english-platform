using System.Net;
using System.Net.Http.Json;
using EnglishReadingPlatform.Contracts;
using EnglishReadingPlatform.Data;
using EnglishReadingPlatform.Tests.Infrastructure;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace EnglishReadingPlatform.Tests;

/// <summary>
/// Kelime çalışma seansı — kalıcı ilerleme takibi.
///
/// Bu testler yalnızca özelliğin çalıştığını değil, ucun BAŞKASININ verisine
/// dokunamadığını ve istemcinin kendi ilerlemesini uyduramadığını ölçer.
/// </summary>
[Collection("api")]
public class KelimeCalismasiTests
{
    private readonly TestAppFactory _fabrika;
    public KelimeCalismasiTests(TestAppFactory fabrika) => _fabrika = fabrika;

    private static async Task<HttpClient> OgrenciIstemcisiAsync(TestAppFactory f)
    {
        var client = f.CreateClient();
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        return client.TokenIle(o.Token);
    }

    private static async Task KelimeEkleAsync(HttpClient client, params string[] kelimeler)
    {
        foreach (var kelime in kelimeler)
            (await client.PostAsJsonAsync("/api/books/addword",
                new { word = kelime, translation = $"{kelime}-tr", context = "" }))
                .EnsureSuccessStatusCode();
    }

    // ══════════════════════════════════════════════════════════════
    //  GÜVENLİK
    // ══════════════════════════════════════════════════════════════

    /// <summary>
    /// IDOR: A, B'nin kelimesinin ilerlemesini bozamamalı.
    /// Sahiplik sorgunun İÇİNDE olmasaydı, sıradaki kayıt numarası denenerek
    /// başkasının çalışma geçmişi bozulabilirdi.
    /// </summary>
    [Fact]
    [Trait("Category", "KelimeCalismasi")]
    public async Task Baskasinin_kelimesinin_ilerlemesi_BOZULAMAZ()
    {
        var aClient = await OgrenciIstemcisiAsync(_fabrika);
        var bClient = await OgrenciIstemcisiAsync(_fabrika);

        await KelimeEkleAsync(bClient, "bkelime");

        var bKart = (await bClient.GetFromJsonAsync<List<CalismaKartiYaniti>>(
            "/api/books/words/calisma?adet=10"))!.Single(x => x.Word == "bkelime");

        // A, B'nin kartını "bildim" diye işaretlemeye çalışır.
        var yanit = await aClient.PostAsJsonAsync("/api/books/words/calisma-sonucu",
            new { kelimeId = bKart.Id, bildim = true });

        // Numaralandırmayı önlemek için 200 döner — ama VERİ DEĞİŞMEMELİ.
        yanit.StatusCode.Should().Be(HttpStatusCode.OK);

        using var kapsam = _fabrika.Services.CreateScope();
        var db = kapsam.ServiceProvider.GetRequiredService<AppDbContext>();
        var kelime = await db.WordListItems.FindAsync(bKart.Id);

        kelime!.DogruSayisi.Should().Be(0, "başkasının çalışma ilerlemesi değiştirilemez");
        kelime.DogruSeri.Should().Be(0);
        kelime.SonCalismaAt.Should().BeNull();
    }

    /// <summary>
    /// KÜTLE ATAMA: istemci sayaçları doğrudan yazamamalı. Yazabilseydi
    /// "öğrenildi" rozeti tek istekle satın alınabilirdi.
    /// </summary>
    [Fact]
    [Trait("Category", "KelimeCalismasi")]
    public async Task Istemci_sayaclari_DOGRUDAN_yazamaz()
    {
        var client = await OgrenciIstemcisiAsync(_fabrika);
        await KelimeEkleAsync(client, "kutle");

        var kart = (await client.GetFromJsonAsync<List<CalismaKartiYaniti>>(
            "/api/books/words/calisma?adet=10"))!.Single();

        // Sözleşmede olmayan alanlar gönderiliyor.
        var yanit = await client.PostAsJsonAsync("/api/books/words/calisma-sonucu",
            new { kelimeId = kart.Id, bildim = true, dogruSeri = 99, dogruSayisi = 99 });
        yanit.EnsureSuccessStatusCode();

        using var kapsam = _fabrika.Services.CreateScope();
        var db = kapsam.ServiceProvider.GetRequiredService<AppDbContext>();
        var kelime = await db.WordListItems.FindAsync(kart.Id);

        kelime!.DogruSeri.Should().Be(1, "seri sunucuda hesaplanır, istemciden alınmaz");
        kelime.DogruSayisi.Should().Be(1);
    }

    /// <summary>
    /// Girdi sınırı: sınırsız 'adet', tek istekle bütün listeyi belleğe çeker.
    /// </summary>
    [Theory]
    [Trait("Category", "KelimeCalismasi")]
    [InlineData(0)]
    [InlineData(-5)]
    [InlineData(101)]
    [InlineData(999999)]
    public async Task Gecersiz_seans_boyu_REDDEDILIR(int adet)
    {
        var client = await OgrenciIstemcisiAsync(_fabrika);

        var yanit = await client.GetAsync($"/api/books/words/calisma?adet={adet}");

        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest,
            $"adet={adet} sınırların dışında");
    }

    [Fact]
    [Trait("Category", "KelimeCalismasi")]
    public async Task Seans_ve_ozet_YALNIZCA_kendi_kelimelerini_kapsar()
    {
        var aClient = await OgrenciIstemcisiAsync(_fabrika);
        var bClient = await OgrenciIstemcisiAsync(_fabrika);

        await KelimeEkleAsync(aClient, "akelime");
        await KelimeEkleAsync(bClient, "bkelime1", "bkelime2");

        var aKartlar = await aClient.GetFromJsonAsync<List<CalismaKartiYaniti>>(
            "/api/books/words/calisma?adet=50");
        aKartlar!.Select(x => x.Word).Should().NotContain(new[] { "bkelime1", "bkelime2" });

        var aOzet = await aClient.GetFromJsonAsync<KelimeOzetiYaniti>("/api/books/words/ozet");
        aOzet!.Toplam.Should().Be(1, "özet başkasının kelimelerini saymamalı");
    }

    // ══════════════════════════════════════════════════════════════
    //  DAVRANIŞ — kullanıcının istediği özellik
    // ══════════════════════════════════════════════════════════════

    /// <summary>
    /// ANA İSTEK: "20 seçtiğimde 20 kelime üzerinden test yapsın."
    /// </summary>
    [Fact]
    [Trait("Category", "KelimeCalismasi")]
    public async Task Seans_istenen_ADET_kadar_kart_doner()
    {
        var client = await OgrenciIstemcisiAsync(_fabrika);
        await KelimeEkleAsync(client, Enumerable.Range(1, 25).Select(i => $"kel{i}").ToArray());

        var kartlar = await client.GetFromJsonAsync<List<CalismaKartiYaniti>>(
            "/api/books/words/calisma?adet=20");

        kartlar.Should().NotBeNull();
        kartlar!.Should().HaveCount(20);
        kartlar!.Select(x => x.Id).Should().OnlyHaveUniqueItems("aynı kart iki kez gelmemeli");
    }

    /// <summary>
    /// ASIL ŞİKÂYET: "200 kelimeyi tek seferde bitiremiyorum."
    /// Çalışılmış kelimeler seansın SONUNA atılmalı ki liste kapansın.
    /// Rastgele seçim bunu yapmaz — aynı kartlar dönüp durur.
    /// </summary>
    [Fact]
    [Trait("Category", "KelimeCalismasi")]
    public async Task Calisilmis_kelimeler_siranin_SONUNA_gider()
    {
        var client = await OgrenciIstemcisiAsync(_fabrika);
        await KelimeEkleAsync(client, "ilk", "ikinci", "ucuncu", "dorduncu");

        // İlk seans: 2 kart çalış.
        var birinci = await client.GetFromJsonAsync<List<CalismaKartiYaniti>>(
            "/api/books/words/calisma?adet=2");
        foreach (var kart in birinci!)
            (await client.PostAsJsonAsync("/api/books/words/calisma-sonucu",
                new { kelimeId = kart.Id, bildim = true })).EnsureSuccessStatusCode();

        // İkinci seans: HİÇ ÇALIŞILMAMIŞ olanlar gelmeli.
        var ikinci = await client.GetFromJsonAsync<List<CalismaKartiYaniti>>(
            "/api/books/words/calisma?adet=2");

        ikinci!.Select(x => x.Id).Should().NotIntersectWith(birinci!.Select(x => x.Id),
            "çalışılmış kartlar tekrar öne gelirse liste hiç bitmez — asıl şikâyet buydu");
    }

    /// <summary>
    /// "Kaç kelime bildiklerim de bilinsin" — ve bu sayı sayfayı kapatınca
    /// SIFIRLANMAMALI. Eski davranışta sayaç yalnızca ekrandaydı.
    /// </summary>
    [Fact]
    [Trait("Category", "KelimeCalismasi")]
    public async Task Ogrenildi_sayisi_esik_kadar_dogrudan_SONRA_artar()
    {
        var client = await OgrenciIstemcisiAsync(_fabrika);
        await KelimeEkleAsync(client, "ogren");

        var kart = (await client.GetFromJsonAsync<List<CalismaKartiYaniti>>(
            "/api/books/words/calisma?adet=10"))!.Single();

        for (var i = 1; i <= KelimeCalismasi.OgrenildiEsigi; i++)
        {
            (await client.PostAsJsonAsync("/api/books/words/calisma-sonucu",
                new { kelimeId = kart.Id, bildim = true })).EnsureSuccessStatusCode();

            var ara = await client.GetFromJsonAsync<KelimeOzetiYaniti>("/api/books/words/ozet");
            var beklenen = i >= KelimeCalismasi.OgrenildiEsigi ? 1 : 0;
            ara!.Ogrenildi.Should().Be(beklenen,
                $"{i}. doğrudan sonra öğrenildi sayısı {beklenen} olmalı");
        }
    }

    /// <summary>
    /// Bir kez bilememek seriyi sıfırlamalı: 10 kez bilip 10 kez bilememiş
    /// bir kelime "öğrenildi" sayılmamalı.
    /// </summary>
    [Fact]
    [Trait("Category", "KelimeCalismasi")]
    public async Task Bilememek_seriyi_SIFIRLAR()
    {
        var client = await OgrenciIstemcisiAsync(_fabrika);
        await KelimeEkleAsync(client, "seri");

        var kart = (await client.GetFromJsonAsync<List<CalismaKartiYaniti>>(
            "/api/books/words/calisma?adet=10"))!.Single();

        for (var i = 0; i < KelimeCalismasi.OgrenildiEsigi; i++)
            await client.PostAsJsonAsync("/api/books/words/calisma-sonucu",
                new { kelimeId = kart.Id, bildim = true });

        (await client.GetFromJsonAsync<KelimeOzetiYaniti>("/api/books/words/ozet"))!
            .Ogrenildi.Should().Be(1);

        await client.PostAsJsonAsync("/api/books/words/calisma-sonucu",
            new { kelimeId = kart.Id, bildim = false });

        var ozet = await client.GetFromJsonAsync<KelimeOzetiYaniti>("/api/books/words/ozet");
        ozet!.Ogrenildi.Should().Be(0, "seri kırılınca kelime öğrenilmiş sayılmaz");
        ozet.Calisiliyor.Should().Be(1);
    }

    [Fact]
    [Trait("Category", "KelimeCalismasi")]
    public async Task Kelimesi_olmayan_kullanicida_ozet_SIFIRDIR()
    {
        var client = await OgrenciIstemcisiAsync(_fabrika);

        var ozet = await client.GetFromJsonAsync<KelimeOzetiYaniti>("/api/books/words/ozet");

        ozet.Should().NotBeNull("boş liste hata değil");
        ozet!.Toplam.Should().Be(0);
        ozet.OgrenildiEsigi.Should().Be(KelimeCalismasi.OgrenildiEsigi,
            "istemci eşiği sunucudan okur — iki yerde ayrı yazılırsa sayılar ayrışır");
    }

    /// <summary>Silinen bir kelimenin sonucu 500 üretmemeli (seans sürerken silinebilir).</summary>
    [Fact]
    [Trait("Category", "KelimeCalismasi")]
    public async Task Silinmis_kelimenin_sonucu_HATA_vermez()
    {
        var client = await OgrenciIstemcisiAsync(_fabrika);
        await KelimeEkleAsync(client, "silinecek");

        var kart = (await client.GetFromJsonAsync<List<CalismaKartiYaniti>>(
            "/api/books/words/calisma?adet=10"))!.Single();

        (await client.DeleteAsync($"/api/books/words/{kart.Id}")).EnsureSuccessStatusCode();

        var yanit = await client.PostAsJsonAsync("/api/books/words/calisma-sonucu",
            new { kelimeId = kart.Id, bildim = true });

        yanit.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    [Trait("Category", "KelimeCalismasi")]
    public async Task Giris_yapmadan_calisma_ucuna_ERISILEMEZ()
    {
        var client = _fabrika.CreateClient();   // token yok

        (await client.GetAsync("/api/books/words/calisma?adet=10"))
            .StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await client.GetAsync("/api/books/words/ozet"))
            .StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await client.PostAsJsonAsync("/api/books/words/calisma-sonucu",
            new { kelimeId = 1, bildim = true }))
            .StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}
