using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using EnglishReadingPlatform.Contracts;
using EnglishReadingPlatform.Data;
using EnglishReadingPlatform.Models;
using EnglishReadingPlatform.Tests.Infrastructure;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace EnglishReadingPlatform.Tests;

/// <summary>
/// YH-05: Cümlelerim sunucuya taşınır test kümesi.
/// </summary>
[Collection("api")]
public class CumlelerTests
{
    private readonly TestAppFactory _fabrika;
    public CumlelerTests(TestAppFactory fabrika) => _fabrika = fabrika;

    private static async Task<HttpClient> OgrenciIstemcisiAsync(TestAppFactory f)
    {
        var client = f.CreateClient();
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        return client.TokenIle(o.Token);
    }

    [Fact]
    [Trait("Category", "Cumleler")]
    public async Task Baskasinin_cumlesini_GOREMEZ_GUNCELLEYEMEZ_SILEMEZ()
    {
        var aIstemci = await OgrenciIstemcisiAsync(_fabrika);
        var bIstemci = await OgrenciIstemcisiAsync(_fabrika);

        // A bir cümle ekler
        var ekleYanit = await aIstemci.PostAsJsonAsync("/api/cumleler", new CumleIstegi("Alice was sitting on the bank.", "Alice kıyıda oturuyordu.", "Alice"));
        ekleYanit.StatusCode.Should().Be(HttpStatusCode.OK);
        var aCumle = await ekleYanit.Content.ReadFromJsonAsync<CumleYaniti>();

        // B kullanıcısı A'nın cümlesini göremez
        var bListYanit = await bIstemci.GetAsync("/api/cumleler");
        bListYanit.StatusCode.Should().Be(HttpStatusCode.OK);
        var bCumleler = await bListYanit.Content.ReadFromJsonAsync<List<CumleYaniti>>();
        bCumleler.Should().NotContain(c => c.Id == aCumle!.Id);

        // B kullanıcısı A'nın cümlesini güncelleyemez (404)
        var bGuncelleYanit = await bIstemci.PutAsJsonAsync($"/api/cumleler/{aCumle!.Id}", new CumleIstegi("Hacked sentence", "Çeviri", ""));
        bGuncelleYanit.StatusCode.Should().Be(HttpStatusCode.NotFound);

        // B kullanıcısı A'nın cümlesini silmeye çalışır (Idempotent 200 döner ama A'nın cümlesi SİLİNMEZ)
        var bSilYanit = await bIstemci.DeleteAsync($"/api/cumleler/{aCumle.Id}");
        bSilYanit.StatusCode.Should().Be(HttpStatusCode.OK);

        // A'nın cümlesi hala duruyor mu?
        var aListYanit = await aIstemci.GetAsync("/api/cumleler");
        var aCumleler = await aListYanit.Content.ReadFromJsonAsync<List<CumleYaniti>>();
        aCumleler.Should().Contain(c => c.Id == aCumle.Id && c.Cumle == "Alice was sitting on the bank.");
    }

    [Fact]
    [Trait("Category", "Cumleler")]
    public async Task Baskasinin_cumlesiyle_calisma_SAYACI_degistirmez()
    {
        var aIstemci = await OgrenciIstemcisiAsync(_fabrika);
        var bIstemci = await OgrenciIstemcisiAsync(_fabrika);

        var ekleYanit = await aIstemci.PostAsJsonAsync("/api/cumleler", new CumleIstegi("The sun was setting low.", "Güneş batıyordu.", ""));
        var aCumle = await ekleYanit.Content.ReadFromJsonAsync<CumleYaniti>();

        // B kullanıcısı A'nın cümlesi üzerinde çalışma sonucu gönderir
        var calismaYanit = await bIstemci.PostAsJsonAsync("/api/cumleler/calisma-sonucu", new CalismaSonucuCumleIstegi(aCumle!.Id, true));
        calismaYanit.StatusCode.Should().Be(HttpStatusCode.OK);

        // A'nın cümlesindeki sayaçlar değişmemiş olmalı
        using var scope = _fabrika.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var dbCumle = await db.CumleKayitlari.FirstOrDefaultAsync(c => c.Id == aCumle.Id);
        dbCumle!.DogruSayisi.Should().Be(0);
        dbCumle.DogruSeri.Should().Be(0);
    }

    [Fact]
    [Trait("Category", "Cumleler")]
    public async Task Istemci_sayaclari_DOGRUDAN_yazamaz()
    {
        var client = await OgrenciIstemcisiAsync(_fabrika);

        // İstemci gövdeye hileli sayaç koyar
        var json = JsonSerializer.Serialize(new
        {
            cumle = "Knowledge is power.",
            ceviri = "Bilgi güçtür.",
            baglam = "",
            dogruSeri = 99,
            dogruSayisi = 100
        });

        var content = new StringContent(json, System.Text.Encoding.UTF8, "application/json");
        var res = await client.PostAsync("/api/cumleler", content);
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var cumle = await res.Content.ReadFromJsonAsync<CumleYaniti>();

        cumle!.DogruSeri.Should().Be(0);
        cumle.DogruSayisi.Should().Be(0);
        cumle.Ogrenildi.Should().BeFalse();
    }

    [Fact]
    [Trait("Category", "Cumleler")]
    public async Task Ayni_cumle_farkli_harfle_TEK_kayit()
    {
        var client = await OgrenciIstemcisiAsync(_fabrika);

        var r1 = await client.PostAsJsonAsync("/api/cumleler", new CumleIstegi("Tom loves Mary.", "Tom Mary'yi seviyor.", ""));
        r1.StatusCode.Should().Be(HttpStatusCode.OK);
        var c1 = await r1.Content.ReadFromJsonAsync<CumleYaniti>();

        var r2 = await client.PostAsJsonAsync("/api/cumleler", new CumleIstegi("  tom LOVES   mary.  ", "Tom Mary'yi seviyor.", ""));
        r2.StatusCode.Should().Be(HttpStatusCode.OK);
        var c2 = await r2.Content.ReadFromJsonAsync<CumleYaniti>();

        // Aynı kayıt döndürülmeli
        c2!.Id.Should().Be(c1!.Id);

        var listRes = await client.GetAsync("/api/cumleler");
        var list = await listRes.Content.ReadFromJsonAsync<List<CumleYaniti>>();
        list!.Count(c => c.Id == c1.Id).Should().Be(1);
    }

    [Fact]
    [Trait("Category", "Cumleler")]
    public async Task Yeni_cumle_puan_verir_tekrari_VERMEZ()
    {
        var client = await OgrenciIstemcisiAsync(_fabrika);

        var ozet1Res = await client.GetAsync("/api/seri");
        var ozet1 = await ozet1Res.Content.ReadFromJsonAsync<SeriOzetiResponse>();
        int xp1 = ozet1!.Bugun.Kirilim.Cumle;

        // Yeni cümle -> +3 CumleXp
        var r1 = await client.PostAsJsonAsync("/api/cumleler", new CumleIstegi("Unique sentence 1", "Çeviri 1", ""));
        r1.StatusCode.Should().Be(HttpStatusCode.OK);

        var ozet2Res = await client.GetAsync("/api/seri");
        var ozet2 = await ozet2Res.Content.ReadFromJsonAsync<SeriOzetiResponse>();
        int xp2 = ozet2!.Bugun.Kirilim.Cumle;
        (xp2 - xp1).Should().Be(3);

        // Aynı cümle tekrar ekleniyor -> Puan artmamalı
        var r2 = await client.PostAsJsonAsync("/api/cumleler", new CumleIstegi("unique SENTENCE 1", "Çeviri 1", ""));
        r2.StatusCode.Should().Be(HttpStatusCode.OK);

        var ozet3Res = await client.GetAsync("/api/seri");
        var ozet3 = await ozet3Res.Content.ReadFromJsonAsync<SeriOzetiResponse>();
        int xp3 = ozet3!.Bugun.Kirilim.Cumle;
        xp3.Should().Be(xp2);
    }

    [Fact]
    [Trait("Category", "Cumleler")]
    public async Task Toplu_ekleme_PUAN_VERMEZ()
    {
        var client = await OgrenciIstemcisiAsync(_fabrika);

        var ozet1Res = await client.GetAsync("/api/seri");
        var ozet1 = await ozet1Res.Content.ReadFromJsonAsync<SeriOzetiResponse>();
        int xp1 = ozet1!.Bugun.Kirilim.Cumle;

        var toplu = new TopluCumleIstegi(new List<TopluCumleOgesi>
        {
            new("Bulk sentence one.", "Toplu 1", ""),
            new("Bulk sentence two.", "Toplu 2", "")
        });

        var res = await client.PostAsJsonAsync("/api/cumleler/toplu", toplu);
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var sonuc = await res.Content.ReadFromJsonAsync<TopluCumleSonucYaniti>();
        sonuc!.Eklenen.Should().Be(2);

        var ozet2Res = await client.GetAsync("/api/seri");
        var ozet2 = await ozet2Res.Content.ReadFromJsonAsync<SeriOzetiResponse>();
        int xp2 = ozet2!.Bugun.Kirilim.Cumle;
        xp2.Should().Be(xp1); // Puan VERMEMELİ
    }

    [Fact]
    [Trait("Category", "Cumleler")]
    public async Task Toplu_ekleme_SINIRI_asilamaz()
    {
        var client = await OgrenciIstemcisiAsync(_fabrika);

        var liste = Enumerable.Range(1, 201)
            .Select(i => new TopluCumleOgesi($"Sentence number {i}", $"Çeviri {i}", ""))
            .ToList();

        var res = await client.PostAsJsonAsync("/api/cumleler/toplu", new TopluCumleIstegi(liste));
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    [Trait("Category", "Cumleler")]
    public async Task Uzun_cumle_REDDEDILIR()
    {
        var client = await OgrenciIstemcisiAsync(_fabrika);

        string cokUzunCumle = new string('a', 501);
        var res = await client.PostAsJsonAsync("/api/cumleler", new CumleIstegi(cokUzunCumle, "Çeviri", ""));
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    [Trait("Category", "Cumleler")]
    public async Task Cumle_GET_YAZMAZ()
    {
        var client = await OgrenciIstemcisiAsync(_fabrika);

        using (var scope = _fabrika.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            int onceSayi = await db.CumleKayitlari.CountAsync();

            await client.GetAsync("/api/cumleler");
            await client.GetAsync("/api/cumleler/ozet");
            await client.GetAsync("/api/cumleler/calisma?adet=10");

            int sonraSayi = await db.CumleKayitlari.CountAsync();
            sonraSayi.Should().Be(onceSayi);
        }
    }

    [Fact]
    [Trait("Category", "Cumleler")]
    public async Task Disa_aktarma_cumleleri_ICERIR_baskasininkini_ICERMEZ()
    {
        var aIstemci = await OgrenciIstemcisiAsync(_fabrika);
        var bIstemci = await OgrenciIstemcisiAsync(_fabrika);

        await aIstemci.PostAsJsonAsync("/api/cumleler", new CumleIstegi("User A sentence.", "A çevirisi", ""));
        await bIstemci.PostAsJsonAsync("/api/cumleler", new CumleIstegi("User B sentence.", "B çevirisi", ""));

        var res = await aIstemci.GetAsync("/api/verim/disa-aktar");
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var doc = await res.Content.ReadFromJsonAsync<JsonDocument>();
        var root = doc!.RootElement;

        root.TryGetProperty("cumleler", out var cumlelerProp).Should().BeTrue();
        string rawJson = cumlelerProp.GetRawText();
        rawJson.Should().Contain("User A sentence.");
        rawJson.Should().NotContain("User B sentence.");
    }

    [Fact]
    [Trait("Category", "Cumleler")]
    public async Task Hesap_silinince_cumleler_GIDER()
    {
        var client = _fabrika.CreateClient();
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(o.Token);
        int kullaniciId = o.UserId;

        await client.PostAsJsonAsync("/api/cumleler", new CumleIstegi("Sentence to be deleted.", "Silinecek cümle", ""));

        using (var scope = _fabrika.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            (await db.CumleKayitlari.CountAsync(c => c.UserId == kullaniciId)).Should().Be(1);
        }

        // Hesabı sil
        var silRes = await client.TazeIpIlePostAsync("/api/verim/hesabimi-sil", new { sifre = "TestSifre123!" });
        silRes.StatusCode.Should().Be(HttpStatusCode.OK);

        using (var scope = _fabrika.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            (await db.CumleKayitlari.CountAsync(c => c.UserId == kullaniciId)).Should().Be(0);
        }
    }

    // ══════════════════════════════════════════════════════════════
    //  YH-06: CÜMLELER LEITNER ARALIKLI TEKRAR TESTLERİ
    // ══════════════════════════════════════════════════════════════

    [Fact]
    [Trait("Category", "Cumleler")]
    public async Task Bilince_kutu_ARTAR_cumle()
    {
        var client = await OgrenciIstemcisiAsync(_fabrika);
        var ekleRes = await client.PostAsJsonAsync("/api/cumleler", new CumleIstegi("This is a sentence.", "Bu bir cümledir.", ""));
        var cumle = await ekleRes.Content.ReadFromJsonAsync<CumleYaniti>();

        (await client.PostAsJsonAsync("/api/cumleler/calisma-sonucu", new CalismaSonucuCumleIstegi(cumle!.Id, true)))
            .EnsureSuccessStatusCode();

        using (var scope = _fabrika.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var dbCumle = await db.CumleKayitlari.FindAsync(cumle.Id);
            dbCumle!.Kutu.Should().Be(1, "1. kez bilince cümle kutusu 1 olur");
            dbCumle.SonrakiTekrarAt.Should().NotBeNull();
        }
    }

    [Fact]
    [Trait("Category", "Cumleler")]
    public async Task Bilemeyince_kutu_BIRE_duser_cumle()
    {
        var client = await OgrenciIstemcisiAsync(_fabrika);
        var ekleRes = await client.PostAsJsonAsync("/api/cumleler", new CumleIstegi("Another sentence here.", "Başka bir cümle.", ""));
        var cumle = await ekleRes.Content.ReadFromJsonAsync<CumleYaniti>();

        using (var scope = _fabrika.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var dbCumle = await db.CumleKayitlari.FindAsync(cumle!.Id);
            dbCumle!.Kutu = 4;
            dbCumle.SonrakiTekrarAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
        }

        (await client.PostAsJsonAsync("/api/cumleler/calisma-sonucu", new CalismaSonucuCumleIstegi(cumle.Id, false)))
            .EnsureSuccessStatusCode();

        using (var scope = _fabrika.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var dbCumle = await db.CumleKayitlari.FindAsync(cumle.Id);
            dbCumle!.Kutu.Should().Be(1, "bilemeyince cümle kutusu 1'e düşer");
        }
    }

    [Fact]
    [Trait("Category", "Cumleler")]
    public async Task Cumle_ozet_bugun_ve_kutu_dagilimi()
    {
        var client = await OgrenciIstemcisiAsync(_fabrika);
        await client.PostAsJsonAsync("/api/cumleler", new CumleIstegi("Sentence 1.", "Çeviri 1", ""));
        await client.PostAsJsonAsync("/api/cumleler", new CumleIstegi("Sentence 2.", "Çeviri 2", ""));

        using (var scope = _fabrika.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var items = await db.CumleKayitlari.Where(c => c.Cumle.StartsWith("Sentence")).ToListAsync();
            items[0].Kutu = 2;
            items[0].SonCalismaAt = DateTime.UtcNow.AddDays(-3);
            items[0].SonrakiTekrarAt = DateTime.UtcNow.AddHours(-1); // bugün vadeli

            items[1].Kutu = 1;
            items[1].SonCalismaAt = DateTime.UtcNow.AddDays(-1);
            items[1].SonrakiTekrarAt = DateTime.UtcNow.AddDays(1); // yarın vadeli

            await db.SaveChangesAsync();
        }

        var ozet = await client.GetFromJsonAsync<CumleOzetiYaniti>("/api/cumleler/ozet");
        ozet.Should().NotBeNull();
        ozet!.BugunTekrar.Should().Be(1);
        ozet.YarinTekrar.Should().Be(1);
        ozet.KutuDagilimi[2].Should().Be(1);
        ozet.KutuDagilimi[1].Should().Be(1);
    }

    /// <summary>
    /// TUTARLILIK: bir cümlenin "öğrenildi" bayrağı listede, çalışma kartında ve
    /// özette AYNI eşikle hesaplanmalı. Controller'da ayrı bir sabit (3) duruyordu;
    /// özet ise LeitnerHesaplayici.OgrenildiEsigiKutu (4) kullanıyordu — kutu 3'teki
    /// bir cümle listede "öğrenildi", özette "çalışılıyor" görünüyordu.
    /// </summary>
    [Fact]
    [Trait("Category", "Cumleler")]
    public async Task Ogrenildi_bayragi_LISTE_KART_ve_OZETTE_ayni_esigi_kullanir()
    {
        var client = await OgrenciIstemcisiAsync(_fabrika);
        var r3 = await client.PostAsJsonAsync("/api/cumleler", new CumleIstegi("Threshold three.", "Eşik üç.", ""));
        var r4 = await client.PostAsJsonAsync("/api/cumleler", new CumleIstegi("Threshold four.", "Eşik dört.", ""));
        var c3 = (await r3.Content.ReadFromJsonAsync<CumleYaniti>())!;
        var c4 = (await r4.Content.ReadFromJsonAsync<CumleYaniti>())!;

        using (var scope = _fabrika.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            foreach (var (id, kutu) in new[]
                     {
                         (c3.Id, LeitnerHesaplayici.OgrenildiEsigiKutu - 1),
                         (c4.Id, LeitnerHesaplayici.OgrenildiEsigiKutu),
                     })
            {
                var satir = await db.CumleKayitlari.FindAsync(id);
                satir!.Kutu = kutu;
                satir.SonCalismaAt = DateTime.UtcNow.AddDays(-1);
                satir.SonrakiTekrarAt = DateTime.UtcNow.AddHours(-1);   // çalışma kartına da düşsün
            }
            await db.SaveChangesAsync();
        }

        var liste = (await client.GetFromJsonAsync<List<CumleYaniti>>("/api/cumleler"))!;
        liste.Single(c => c.Id == c3.Id).Ogrenildi.Should().BeFalse("eşiğin bir altındaki kutu öğrenilmiş sayılmaz");
        liste.Single(c => c.Id == c4.Id).Ogrenildi.Should().BeTrue();

        var kartlar = (await client.GetFromJsonAsync<List<CumleYaniti>>("/api/cumleler/calisma?adet=50&mod=tekrar"))!;
        kartlar.Single(c => c.Id == c3.Id).Ogrenildi.Should().BeFalse();
        kartlar.Single(c => c.Id == c4.Id).Ogrenildi.Should().BeTrue();

        var ozet = (await client.GetFromJsonAsync<CumleOzetiYaniti>("/api/cumleler/ozet"))!;
        ozet.OgrenildiEsigi.Should().Be(LeitnerHesaplayici.OgrenildiEsigiKutu);
        ozet.Ogrenildi.Should().Be(1, "listede öğrenilmiş görünen cümle sayısıyla aynı olmalı");
    }

    /// <summary>
    /// Cihazdan sunucuya göçte TEK bir uzun cümle bütün parçayı 400 ile düşürüyordu:
    /// göç hiç bitmiyor, her açılışta yeniden deneniyordu. Uç geçersiz öğeyi ATLAR
    /// (atlanan sayısıyla bildirir), geçerli olanları ekler.
    /// </summary>
    [Fact]
    [Trait("Category", "Cumleler")]
    public async Task Toplu_eklemede_TEK_gecersiz_oge_BUTUN_istegi_DUSURMEZ()
    {
        var client = await OgrenciIstemcisiAsync(_fabrika);
        var istek = new TopluCumleIstegi(new List<TopluCumleOgesi>
        {
            new("A perfectly valid sentence.", "Geçerli cümle.", ""),
            new(new string('x', EnglishReadingPlatform.Validation.AlanSinirlari.Cumle + 1), "Çok uzun", ""),
        });

        var res = await client.PostAsJsonAsync("/api/cumleler/toplu", istek);

        res.StatusCode.Should().Be(HttpStatusCode.OK, "tek bir geçersiz öğe bütün parçayı reddetmemeli");
        var sonuc = (await res.Content.ReadFromJsonAsync<TopluCumleSonucYaniti>())!;
        sonuc.Eklenen.Should().Be(1);
        sonuc.Atlanan.Should().Be(1);
    }

    /// <summary>
    /// Göç gövdesi eski yerel veriden gelir: boş, null ya da kolonu aşan öğe olağandır.
    /// Her biri TEK BAŞINA atlanmalı; ne 400 (öznitelik) ne 500 (null öğe, kolon taşması).
    /// Ham JSON gönderilir — null öğe ve null alan C# kaydıyla ifade edilemiyor.
    /// </summary>
    [Fact]
    [Trait("Category", "Cumleler")]
    public async Task Toplu_eklemede_BOS_NULL_ve_KOLONU_ASAN_ogeler_tek_tek_ATLANIR()
    {
        var client = await OgrenciIstemcisiAsync(_fabrika);
        var sinir = EnglishReadingPlatform.Validation.AlanSinirlari.Cumle;

        // Ham hâli kolonu aşıyor ama kırpılmış hâli (yazılacak olan) sığıyor → kabul.
        var dolgulu = "   " + new string('y', sinir - 2) + "   ";

        var govde = JsonSerializer.Serialize(new
        {
            cumleler = new object?[]
            {
                null,
                new { cumle = (string?)null, ceviri = "x", baglam = "" },
                new { cumle = "", ceviri = "x", baglam = "" },
                new { cumle = "   ", ceviri = "x", baglam = "" },
                new { cumle = "Translation is too long.", ceviri = new string('c', EnglishReadingPlatform.Validation.AlanSinirlari.CumleCevirisi + 1), baglam = "" },
                new { cumle = "Context is too long.", ceviri = "x", baglam = new string('b', EnglishReadingPlatform.Validation.AlanSinirlari.CumleBaglami + 1) },
                new { cumle = "A valid bulk sentence.", ceviri = "Geçerli.", baglam = "" },
                new { cumle = dolgulu, ceviri = "Dolgulu", baglam = "" },
            },
        });

        var res = await client.PostAsync("/api/cumleler/toplu",
            new StringContent(govde, System.Text.Encoding.UTF8, "application/json"));

        res.StatusCode.Should().Be(HttpStatusCode.OK, await res.Content.ReadAsStringAsync());
        var sonuc = (await res.Content.ReadFromJsonAsync<TopluCumleSonucYaniti>())!;
        sonuc.Eklenen.Should().Be(2);
        sonuc.Atlanan.Should().Be(6);

        var liste = (await client.GetFromJsonAsync<List<CumleYaniti>>("/api/cumleler"))!;
        liste.Select(c => c.Cumle).Should().BeEquivalentTo(
            new[] { "A valid bulk sentence.", new string('y', sinir - 2) },
            "yalnızca geçerli öğeler, kırpılmış hâlleriyle yazılmalı");
    }
}
