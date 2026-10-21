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
            "/api/books/words/calisma?adet=20&mod=serbest");

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

    // ══════════════════════════════════════════════════════════════
    //  YH-06: LEITNER ARALIKLI TEKRAR TESTLERİ
    // ══════════════════════════════════════════════════════════════

    [Fact]
    [Trait("Category", "KelimeCalismasi")]
    public async Task Bilince_kutu_ARTAR_tekrar_zamani_ILERI_gider()
    {
        var client = await OgrenciIstemcisiAsync(_fabrika);
        await KelimeEkleAsync(client, "leitner1");

        var kart = (await client.GetFromJsonAsync<List<CalismaKartiYaniti>>(
            "/api/books/words/calisma?adet=10"))!.Single(x => x.Word == "leitner1");

        var baslangic = DateTime.UtcNow;
        (await client.PostAsJsonAsync("/api/books/words/calisma-sonucu",
            new { kelimeId = kart.Id, bildim = true })).EnsureSuccessStatusCode();

        using (var scope = _fabrika.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var item = await db.WordListItems.FindAsync(kart.Id);
            item!.Kutu.Should().Be(1, "1. kez bilince kutu 1 olur");
            item.SonrakiTekrarAt.Should().NotBeNull();
            item.SonrakiTekrarAt!.Value.Should().BeAfter(baslangic.AddHours(23));
        }

        (await client.PostAsJsonAsync("/api/books/words/calisma-sonucu",
            new { kelimeId = kart.Id, bildim = true })).EnsureSuccessStatusCode();

        using (var scope = _fabrika.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var item = await db.WordListItems.FindAsync(kart.Id);
            item!.Kutu.Should().Be(2, "2. kez bilince kutu 2 olur");
            item.SonrakiTekrarAt!.Value.Should().BeAfter(baslangic.AddDays(1).AddHours(23));
        }
    }

    [Fact]
    [Trait("Category", "KelimeCalismasi")]
    public async Task Bilemeyince_kutu_BIRE_duser()
    {
        var client = await OgrenciIstemcisiAsync(_fabrika);
        await KelimeEkleAsync(client, "leitner2");

        var kart = (await client.GetFromJsonAsync<List<CalismaKartiYaniti>>(
            "/api/books/words/calisma?adet=10"))!.Single(x => x.Word == "leitner2");

        using (var scope = _fabrika.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var item = await db.WordListItems.FindAsync(kart.Id);
            item!.Kutu = 5;
            item.SonrakiTekrarAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
        }

        var simdi = DateTime.UtcNow;
        (await client.PostAsJsonAsync("/api/books/words/calisma-sonucu",
            new { kelimeId = kart.Id, bildim = false })).EnsureSuccessStatusCode();

        using (var scope = _fabrika.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var item = await db.WordListItems.FindAsync(kart.Id);
            item!.Kutu.Should().Be(1, "bilemeyince kutu 1'e düşer");
            item.SonrakiTekrarAt.Should().NotBeNull();
            item.SonrakiTekrarAt!.Value.Should().BeAfter(simdi.AddMinutes(8));
        }
    }

    [Fact]
    [Trait("Category", "KelimeCalismasi")]
    public async Task Kutu_TAVANI_asilamaz()
    {
        var client = await OgrenciIstemcisiAsync(_fabrika);
        await KelimeEkleAsync(client, "leitner3");

        var kart = (await client.GetFromJsonAsync<List<CalismaKartiYaniti>>(
            "/api/books/words/calisma?adet=10"))!.Single(x => x.Word == "leitner3");

        using (var scope = _fabrika.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var item = await db.WordListItems.FindAsync(kart.Id);
            item!.Kutu = 7;
            await db.SaveChangesAsync();
        }

        (await client.PostAsJsonAsync("/api/books/words/calisma-sonucu",
            new { kelimeId = kart.Id, bildim = true })).EnsureSuccessStatusCode();

        using (var scope = _fabrika.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var item = await db.WordListItems.FindAsync(kart.Id);
            item!.Kutu.Should().Be(7, "kutu tavanı 7'dir");
        }
    }

    [Fact]
    [Trait("Category", "KelimeCalismasi")]
    public async Task Tekrar_modu_VAKTI_GELMEYENI_getirmez()
    {
        var client = await OgrenciIstemcisiAsync(_fabrika);
        await KelimeEkleAsync(client, "gelecekKelime");

        var kart = (await client.GetFromJsonAsync<List<CalismaKartiYaniti>>(
            "/api/books/words/calisma?adet=10"))!.Single(x => x.Word.Equals("gelecekKelime", StringComparison.OrdinalIgnoreCase));

        using (var scope = _fabrika.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var item = await db.WordListItems.FindAsync(kart.Id);
            item!.Kutu = 2;
            item.SonCalismaAt = DateTime.UtcNow;
            item.SonrakiTekrarAt = DateTime.UtcNow.AddDays(1); // Yarın vadeli
            await db.SaveChangesAsync();
        }

        var liste = await client.GetFromJsonAsync<List<CalismaKartiYaniti>>(
            "/api/books/words/calisma?adet=10&mod=tekrar");

        liste.Should().NotContain(x => x.Id == kart.Id, "vakti gelmeyen kelime tekrar modunda gelmez");
    }

    [Fact]
    [Trait("Category", "KelimeCalismasi")]
    public async Task Tekrar_modu_once_VADESI_EN_ESKIYI_getirir()
    {
        var client = await OgrenciIstemcisiAsync(_fabrika);
        await KelimeEkleAsync(client, "eski1", "eski2");

        int id1, id2;
        using (var scope = _fabrika.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var k1 = await db.WordListItems.SingleAsync(w => w.Word == "eski1");
            var k2 = await db.WordListItems.SingleAsync(w => w.Word == "eski2");
            id1 = k1.Id; id2 = k2.Id;

            k1.Kutu = 1;
            k1.SonCalismaAt = DateTime.UtcNow.AddDays(-5);
            k1.SonrakiTekrarAt = DateTime.UtcNow.AddHours(-10); // Daha eski vadesi var

            k2.Kutu = 1;
            k2.SonCalismaAt = DateTime.UtcNow.AddDays(-2);
            k2.SonrakiTekrarAt = DateTime.UtcNow.AddHours(-2);

            await db.SaveChangesAsync();
        }

        var liste = await client.GetFromJsonAsync<List<CalismaKartiYaniti>>(
            "/api/books/words/calisma?adet=10&mod=tekrar");

        var idx1 = liste!.FindIndex(x => x.Id == id1);
        var idx2 = liste.FindIndex(x => x.Id == id2);

        idx1.Should().BeGreaterThanOrEqualTo(0);
        idx2.Should().BeGreaterThanOrEqualTo(0);
        idx1.Should().BeLessThan(idx2, "vadesi daha eski olan önce gelir");
    }

    [Fact]
    [Trait("Category", "KelimeCalismasi")]
    public async Task Gunluk_yeni_kelime_SINIRI()
    {
        var client = await OgrenciIstemcisiAsync(_fabrika);
        var kelimeler = Enumerable.Range(1, 15).Select(i => $"sinirKelime{i}").ToArray();
        await KelimeEkleAsync(client, kelimeler);

        var liste = await client.GetFromJsonAsync<List<CalismaKartiYaniti>>(
            "/api/books/words/calisma?adet=20&mod=tekrar");

        var yeniKelimeSayisi = liste!.Count(x => kelimeler.Contains(x.Word));
        yeniKelimeSayisi.Should().BeLessOrEqualTo(10, "günde en fazla 10 yeni hiç çalışılmamış kelime getirilir");
    }

    [Fact]
    [Trait("Category", "KelimeCalismasi")]
    public async Task Istemci_kutu_ve_zaman_YAZAMAZ()
    {
        var client = await OgrenciIstemcisiAsync(_fabrika);
        await KelimeEkleAsync(client, "hileliKutu");

        var kart = (await client.GetFromJsonAsync<List<CalismaKartiYaniti>>(
            "/api/books/words/calisma?adet=10"))!.Single(x => x.Word.Equals("hileliKutu", StringComparison.OrdinalIgnoreCase));

        var yanit = await client.PostAsJsonAsync("/api/books/words/calisma-sonucu",
            new { kelimeId = kart.Id, bildim = true, kutu = 7, sonrakiTekrarAt = DateTime.UtcNow.AddYears(10) });
        yanit.EnsureSuccessStatusCode();

        using (var scope = _fabrika.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var item = await db.WordListItems.FindAsync(kart.Id);
            item!.Kutu.Should().Be(1, "kutu sunucuda hesaplanır, istemciden kabul edilmez");
        }
    }

    [Fact]
    [Trait("Category", "KelimeCalismasi")]
    public async Task Ozet_bugun_tekrar_sayisi_DOGRU()
    {
        var client = await OgrenciIstemcisiAsync(_fabrika);
        await KelimeEkleAsync(client, "ozet1", "ozet2", "ozet3", "ozet4", "ozet5");

        using (var scope = _fabrika.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var items = await db.WordListItems.Where(w => w.Word.StartsWith("ozet")).ToListAsync();
            for (int i = 0; i < items.Count; i++)
            {
                items[i].Kutu = 1;
                items[i].SonCalismaAt = DateTime.UtcNow.AddDays(-2);
                if (i < 3)
                {
                    items[i].SonrakiTekrarAt = DateTime.UtcNow.AddHours(-1); // 3 bugün vadeli
                }
                else
                {
                    items[i].SonrakiTekrarAt = DateTime.UtcNow.AddDays(1); // 2 yarın vadeli
                }
            }
            await db.SaveChangesAsync();
        }

        var ozet = await client.GetFromJsonAsync<KelimeOzetiYaniti>("/api/books/words/ozet");
        ozet.Should().NotBeNull();
        ozet!.BugunTekrar.Should().Be(3, "bugün vadeli 3 kelime var");
        ozet.YarinTekrar.Should().Be(2, "yarın vadeli 2 kelime var");
        ozet.KutuDagilimi[1].Should().Be(5, "5 kelime de 1. kutuda");
    }

    /// <summary>
    /// Kelime listesi "öğrenildi" rozetini SUNUCUDAN almalı. Yanıtta bayrak yoktu;
    /// istemciler <c>(kayit as any).dogruSeri &gt;= 3</c> ile hesaplıyordu — alan hiç
    /// gelmediği için rozet HİÇBİR kelimede görünmüyordu. Eşik özetle aynı olmalı:
    /// LeitnerHesaplayici.OgrenildiEsigiKutu.
    /// </summary>
    [Fact]
    [Trait("Category", "KelimeCalismasi")]
    public async Task Kelime_listesi_OGRENILDI_bayragini_ozetle_AYNI_esikle_dondurur()
    {
        var client = await OgrenciIstemcisiAsync(_fabrika);
        var ek = Guid.NewGuid().ToString("N")[..6];
        string esikAlti = $"esikalti{ek}", esikte = $"esikte{ek}";
        await KelimeEkleAsync(client, esikAlti, esikte);

        using (var scope = _fabrika.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            foreach (var (kelime, kutu) in new[]
                     {
                         (esikAlti, LeitnerHesaplayici.OgrenildiEsigiKutu - 1),
                         (esikte, LeitnerHesaplayici.OgrenildiEsigiKutu),
                     })
            {
                var satir = await db.WordListItems.SingleAsync(w => w.Word == kelime);
                satir.Kutu = kutu;
                satir.SonCalismaAt = DateTime.UtcNow.AddDays(-1);
            }
            await db.SaveChangesAsync();
        }

        var liste = (await client.GetFromJsonAsync<List<System.Text.Json.JsonElement>>("/api/books/words"))!;
        bool Bayrak(string kelime) => liste
            .Single(x => x.GetProperty("word").GetString() == kelime)
            .GetProperty("ogrenildi").GetBoolean();

        Bayrak(esikAlti).Should().BeFalse("eşiğin bir altındaki kutu öğrenilmiş sayılmaz");
        Bayrak(esikte).Should().BeTrue("eşikteki kutu öğrenilmiştir — rozet görünmeli");

        var ozet = (await client.GetFromJsonAsync<KelimeOzetiYaniti>("/api/books/words/ozet"))!;
        ozet.OgrenildiEsigi.Should().Be(LeitnerHesaplayici.OgrenildiEsigiKutu);
        ozet.Ogrenildi.Should().Be(1, "listede rozetli görünen kelime sayısıyla aynı olmalı");
    }
}
