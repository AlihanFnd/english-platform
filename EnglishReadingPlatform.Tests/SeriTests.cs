using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using EnglishReadingPlatform.Contracts;
using EnglishReadingPlatform.Data;
using EnglishReadingPlatform.Models;
using EnglishReadingPlatform.Services;
using EnglishReadingPlatform.Tests.Infrastructure;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace EnglishReadingPlatform.Tests;

/// <summary>
/// YH-04: Günlük seri ve günlük hedef testleri.
/// SAF hesaplama işlevleri, API uçları, eşzamanlılık, tavan kısıtları ve veri silme/dışa aktarma kapsamı.
/// </summary>
[Collection("api")]
public class SeriTests
{
    private readonly TestAppFactory _fabrika;
    public SeriTests(TestAppFactory fabrika) => _fabrika = fabrika;

    private static async Task<HttpClient> OgrenciIstemcisiAsync(TestAppFactory f)
    {
        var client = f.CreateClient();
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        return client.TokenIle(o.Token);
    }

    // ══════════════════════════════════════════════════════════════
    //  SAF HESAP İŞLEVLERİ (BİRİM TESTLER)
    // ══════════════════════════════════════════════════════════════

    [Fact]
    [Trait("Category", "Seri")]
    public void Ardisik_gunler_seriyi_UZATIR()
    {
        var bugun = new DateOnly(2026, 9, 13);
        var aktifGunler = new[] { bugun, bugun.AddDays(-1), bugun.AddDays(-2) };

        var (mevcut, enUzun, bugunAktif) = SeriHesabi.Hesapla(aktifGunler, bugun);

        mevcut.Should().Be(3);
        enUzun.Should().Be(3);
        bugunAktif.Should().BeTrue();
    }

    [Fact]
    [Trait("Category", "Seri")]
    public void Bosluk_seriyi_SIFIRLAR()
    {
        var bugun = new DateOnly(2026, 9, 13);
        var aktifGunler = new[] { bugun, bugun.AddDays(-2) };

        var (mevcut, enUzun, bugunAktif) = SeriHesabi.Hesapla(aktifGunler, bugun);

        mevcut.Should().Be(1);
        enUzun.Should().Be(1);
        bugunAktif.Should().BeTrue();
    }

    [Fact]
    [Trait("Category", "Seri")]
    public void Bugun_aktif_degilse_dunku_seri_KORUNUR()
    {
        var bugun = new DateOnly(2026, 9, 13);
        var aktifGunler = new[] { bugun.AddDays(-1), bugun.AddDays(-2) };

        var (mevcut, enUzun, bugunAktif) = SeriHesabi.Hesapla(aktifGunler, bugun);

        mevcut.Should().Be(2);
        enUzun.Should().Be(2);
        bugunAktif.Should().BeFalse();
    }

    [Fact]
    [Trait("Category", "Seri")]
    public void Dun_de_yoksa_seri_SIFIR()
    {
        var bugun = new DateOnly(2026, 9, 13);
        var aktifGunler = new[] { bugun.AddDays(-2), bugun.AddDays(-3) };

        var (mevcut, enUzun, bugunAktif) = SeriHesabi.Hesapla(aktifGunler, bugun);

        mevcut.Should().Be(0);
        enUzun.Should().Be(2);
        bugunAktif.Should().BeFalse();
    }

    [Fact]
    [Trait("Category", "Seri")]
    public void En_uzun_seri_gecmisten_HESAPLANIR()
    {
        var bugun = new DateOnly(2026, 9, 13);
        // Eskiden 5 günlük seri (10-14 gün önce) + yeni 2 günlük seri (bugün ve dün)
        var aktifGunler = new[]
        {
            bugun, bugun.AddDays(-1),
            bugun.AddDays(-10), bugun.AddDays(-11), bugun.AddDays(-12), bugun.AddDays(-13), bugun.AddDays(-14)
        };

        var (mevcut, enUzun, bugunAktif) = SeriHesabi.Hesapla(aktifGunler, bugun);

        mevcut.Should().Be(2);
        enUzun.Should().Be(5);
        bugunAktif.Should().BeTrue();
    }

    [Fact]
    [Trait("Category", "Seri")]
    public void Saat_dilimi_gunu_BELIRLER()
    {
        // 2026-09-13 22:30 UTC -> Istanbul'da 2026-09-14 01:30 (+3), New York'ta 2026-09-13 18:30 (-4)
        var utcAn = new DateTime(2026, 9, 13, 22, 30, 0, DateTimeKind.Utc);
        var tzIstanbul = TimeZoneInfo.FindSystemTimeZoneById("Europe/Istanbul");

        var istanbulGun = SeriHesabi.YerelGun(utcAn, tzIstanbul);

        istanbulGun.Should().Be(new DateOnly(2026, 9, 14));
    }

    [Fact]
    [Trait("Category", "Seri")]
    public void Europe_Istanbul_saat_dilimi_COZULUR()
    {
        var tzExists = TimeZoneInfo.TryFindSystemTimeZoneById("Europe/Istanbul", out var tz);
        tzExists.Should().BeTrue();
        tz.Should().NotBeNull();
    }

    // ══════════════════════════════════════════════════════════════
    //  API SÖZLEŞME VE GÜVENLİK TESTLERİ
    // ══════════════════════════════════════════════════════════════

    [Fact]
    [Trait("Category", "Seri")]
    public async Task Seri_GET_hicbir_satir_YAZMAZ()
    {
        var client = await OgrenciIstemcisiAsync(_fabrika);

        using (var scope = _fabrika.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var etkinlikSayisiOnce = await db.GunlukEtkinlikler.CountAsync();
            var ayarSayisiOnce = await db.OgrenmeAyarlari.CountAsync();

            var res = await client.GetAsync("/api/seri");
            res.StatusCode.Should().Be(HttpStatusCode.OK);

            var ozet = await res.Content.ReadFromJsonAsync<SeriOzetiResponse>();
            ozet.Should().NotBeNull();
            ozet!.MevcutSeri.Should().Be(0);

            var etkinlikSayisiSonra = await db.GunlukEtkinlikler.CountAsync();
            var ayarSayisiSonra = await db.OgrenmeAyarlari.CountAsync();

            etkinlikSayisiSonra.Should().Be(etkinlikSayisiOnce, "GET /api/seri GunlukEtkinlikler yazmamalıdır.");
            ayarSayisiSonra.Should().Be(ayarSayisiOnce, "GET /api/seri OgrenmeAyarlari yazmamalıdır.");
        }
    }

    [Fact]
    [Trait("Category", "Seri")]
    public async Task Seri_ozeti_yalnizca_KENDI_puanini_gosterir()
    {
        var aClient = await OgrenciIstemcisiAsync(_fabrika);
        var bClient = await OgrenciIstemcisiAsync(_fabrika);

        // User A kelime ekleyerek XP kazanır
        await aClient.PostAsJsonAsync("/api/books/addword", new { word = "serikey1", translation = "tr1", context = "" });

        var aOzet = await aClient.GetFromJsonAsync<SeriOzetiResponse>("/api/seri");
        var bOzet = await bClient.GetFromJsonAsync<SeriOzetiResponse>("/api/seri");

        aOzet!.Bugun.Xp.Should().BeGreaterThan(0);
        bOzet!.Bugun.Xp.Should().Be(0);
    }

    [Fact]
    [Trait("Category", "Seri")]
    public async Task Baskasinin_kelimesiyle_calisma_PUAN_VERMEZ()
    {
        var aClient = await OgrenciIstemcisiAsync(_fabrika);
        var bClient = await OgrenciIstemcisiAsync(_fabrika);

        // User B kelime ekler
        var wordRes = await bClient.PostAsJsonAsync("/api/books/addword", new { word = "bword1", translation = "tr1", context = "" });
        wordRes.EnsureSuccessStatusCode();

        int bWordId;
        using (var scope = _fabrika.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var item = await db.WordListItems.FirstAsync(w => w.Word == "bword1");
            bWordId = item.Id;
        }

        // User A, B'nin kelimesiyle çalışma sonucu gönderir (IDOR denemesi)
        var calismaRes = await aClient.PostAsJsonAsync("/api/books/words/calisma-sonucu", new { kelimeId = bWordId, bildim = true });
        calismaRes.StatusCode.Should().Be(HttpStatusCode.OK);

        var aOzet = await aClient.GetFromJsonAsync<SeriOzetiResponse>("/api/seri");
        aOzet!.Bugun.Kirilim.Calisma.Should().Be(0);
        aOzet.Bugun.Xp.Should().Be(0);
    }

    [Fact]
    [Trait("Category", "Seri")]
    public async Task Ayni_sayfayi_tekrar_acmak_PUAN_VERMEZ()
    {
        var client = await OgrenciIstemcisiAsync(_fabrika);

        int kitapId;
        using (var scope = _fabrika.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var book = new Book { Title = "Seri Test Kitabi", Author = "Test", Level = "A1", Description = "Desc" };
            book.Chapters.Add(new Chapter { ChapterNumber = 1, Title = "C1", Content = "Content 1" });
            book.Chapters.Add(new Chapter { ChapterNumber = 2, Title = "C2", Content = "Content 2" });
            db.Books.Add(book);
            await db.SaveChangesAsync();
            kitapId = book.Id;
        }

        // 1. kez konum 1 (kitabı ilk kez açmak) -> satir henüz yoktu, vardi=false -> 0 XP
        await client.PostAsJsonAsync($"/api/books/{kitapId}/progress", new { bookId = kitapId, konum = 1 });

        var ozet1 = await client.GetFromJsonAsync<SeriOzetiResponse>("/api/seri");
        ozet1!.Bugun.Kirilim.Okuma.Should().Be(0);

        // 2. kez konum 2 (konum değişti) -> satir vardi=true, konumDegisti=true -> +5 XP
        await client.PostAsJsonAsync($"/api/books/{kitapId}/progress", new { bookId = kitapId, konum = 2 });

        var ozet2 = await client.GetFromJsonAsync<SeriOzetiResponse>("/api/seri");
        ozet2!.Bugun.Kirilim.Okuma.Should().Be(5);

        // 3. kez aynı konum 2 -> konumDegisti=false -> puan artmaz
        await client.PostAsJsonAsync($"/api/books/{kitapId}/progress", new { bookId = kitapId, konum = 2 });

        var ozet3 = await client.GetFromJsonAsync<SeriOzetiResponse>("/api/seri");
        ozet3!.Bugun.Kirilim.Okuma.Should().Be(5);
    }

    [Fact]
    [Trait("Category", "Seri")]
    public async Task Var_olan_kelimeyi_yeniden_eklemek_PUAN_VERMEZ()
    {
        var client = await OgrenciIstemcisiAsync(_fabrika);

        // 1. kez ekleme -> +2 XP
        await client.PostAsJsonAsync("/api/books/addword", new { word = "unique1", translation = "tr", context = "" });

        var ozet1 = await client.GetFromJsonAsync<SeriOzetiResponse>("/api/seri");
        ozet1!.Bugun.Kirilim.Kelime.Should().Be(2);

        // 2. kez aynı kelime -> idempotent, eklenmez, XP artmaz
        await client.PostAsJsonAsync("/api/books/addword", new { word = "unique1", translation = "tr", context = "" });

        var ozet2 = await client.GetFromJsonAsync<SeriOzetiResponse>("/api/seri");
        ozet2!.Bugun.Kirilim.Kelime.Should().Be(2);
    }

    [Fact]
    [Trait("Category", "Seri")]
    public async Task Gunluk_tavan_ASILAMAZ()
    {
        var client = await OgrenciIstemcisiAsync(_fabrika);

        int kitapId;
        using (var scope = _fabrika.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var book = new Book { Title = "Tavan Test Kitabi", Author = "Test", Level = "A1", Description = "Desc" };
            for (int i = 1; i <= 20; i++)
            {
                book.Chapters.Add(new Chapter { ChapterNumber = i, Title = $"C{i}", Content = $"Content {i}" });
            }
            db.Books.Add(book);
            await db.SaveChangesAsync();
            kitapId = book.Id;
        }

        // Kitabı aç (konum 1)
        await client.PostAsJsonAsync($"/api/books/{kitapId}/progress", new { bookId = kitapId, konum = 1 });

        // 15 sayfa boyunca ilerle: 15 * 5 = 75 XP potansiyel, ama tavan 60
        for (int p = 2; p <= 16; p++)
        {
            await client.PostAsJsonAsync($"/api/books/{kitapId}/progress", new { bookId = kitapId, konum = p });
        }

        var ozet = await client.GetFromJsonAsync<SeriOzetiResponse>("/api/seri");
        ozet!.Bugun.Kirilim.Okuma.Should().Be(60, "Okuma XP tavanı 60'tır ve aşılamaz.");
    }

    [Fact]
    [Trait("Category", "Seri")]
    public async Task Eszamanli_istekler_TEK_satir_uretir_ve_tavani_asmaz()
    {
        var client = await OgrenciIstemcisiAsync(_fabrika);

        int userId;
        using (var scope = _fabrika.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var ozetTemp = await client.GetFromJsonAsync<SeriOzetiResponse>("/api/seri");
            // OgrenciIstemcisiAsync tarafindan olusturulan kullanicinin ID'sini alalim
            var user = await db.Users.OrderByDescending(u => u.Id).FirstAsync();
            userId = user.Id;
        }

        // 25 paralel PuanEkleAsync çağrısı yapalım
        var tasks = Enumerable.Range(1, 25).Select(async _ =>
        {
            using var scope = _fabrika.Services.CreateScope();
            var seriServisi = scope.ServiceProvider.GetRequiredService<ISeriServisi>();
            await seriServisi.PuanEkleAsync(userId, "okuma");
        });
        await Task.WhenAll(tasks);

        using (var scope = _fabrika.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var satirSayisi = await db.GunlukEtkinlikler.CountAsync(g => g.UserId == userId);
            satirSayisi.Should().Be(1, "Bugün için yalnızca TEK satır üretilmelidir.");
        }

        var ozet = await client.GetFromJsonAsync<SeriOzetiResponse>("/api/seri");
        ozet!.Bugun.Kirilim.Okuma.Should().BeLessOrEqualTo(60);
    }

    [Fact]
    [Trait("Category", "Seri")]
    public async Task Hedef_yalnizca_IZINLI_degerleri_kabul_eder()
    {
        var client = await OgrenciIstemcisiAsync(_fabrika);

        // Whitelist dışı (999) -> 400
        var badRes = await client.PutAsJsonAsync("/api/seri/ayarlar", new { gunlukHedefXp = 999 });
        badRes.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        // Whitelist içi (30) -> 200
        var okRes = await client.PutAsJsonAsync("/api/seri/ayarlar", new { gunlukHedefXp = 30 });
        okRes.StatusCode.Should().Be(HttpStatusCode.OK);

        var ozet = await okRes.Content.ReadFromJsonAsync<SeriOzetiResponse>();
        ozet!.GunlukHedefXp.Should().Be(30);
    }

    [Fact]
    [Trait("Category", "Seri")]
    public async Task Gecersiz_saat_dilimi_REDDEDILIR()
    {
        var client = await OgrenciIstemcisiAsync(_fabrika);

        // Bilinmeyen / tehlikeli saat dilimleri -> 400
        var testCases = new[] { "Mars/Olympus", "../../etc/passwd", new string('A', 100) };

        foreach (var tz in testCases)
        {
            var res = await client.PutAsJsonAsync("/api/seri/ayarlar", new { saatDilimi = tz });
            res.StatusCode.Should().Be(HttpStatusCode.BadRequest);

            var body = await res.Content.ReadAsStringAsync();
            body.Should().NotContain(tz, "Hata mesajı kullanıcının girdiği saat dilimini yansıtmamalıdır.");
        }
    }

    [Fact]
    [Trait("Category", "Seri")]
    public async Task Istemci_XP_GONDEREMEZ()
    {
        var client = await OgrenciIstemcisiAsync(_fabrika);

        // Kütle atama denemesi: xp ve gun alanları DTO'da olmadığı için yok sayılır
        var res = await client.PutAsJsonAsync("/api/seri/ayarlar", new
        {
            gunlukHedefXp = 50,
            xp = 999,
            okumaXp = 500,
            gun = "2026-09-13"
        });
        res.StatusCode.Should().Be(HttpStatusCode.OK);

        var ozet = await res.Content.ReadFromJsonAsync<SeriOzetiResponse>();
        ozet!.Bugun.Xp.Should().Be(0, "İstemcinin gönderdiği XP alanları dikkate alınmamalıdır.");
        ozet.GunlukHedefXp.Should().Be(50);
    }

    [Fact]
    [Trait("Category", "Seri")]
    public async Task Hedef_degisimi_BUGUNUN_hedefini_degistirmez()
    {
        var client = await OgrenciIstemcisiAsync(_fabrika);

        // Bugün 1 kelime ekle -> bugünün satırı oluşsun (hedef varsayılan 20)
        await client.PostAsJsonAsync("/api/books/addword", new { word = "todayword", translation = "tr", context = "" });

        var ozetBefore = await client.GetFromJsonAsync<SeriOzetiResponse>("/api/seri");
        ozetBefore!.Bugun.HedefXp.Should().Be(20);

        // Günlük hedefi 10'a düşür
        await client.PutAsJsonAsync("/api/seri/ayarlar", new { gunlukHedefXp = 10 });

        var ozetAfter = await client.GetFromJsonAsync<SeriOzetiResponse>("/api/seri");
        ozetAfter!.GunlukHedefXp.Should().Be(10, "Yeni ayar 10 olmalıdır.");
        ozetAfter.Bugun.HedefXp.Should().Be(20, "Bugünün geçmiş satırındaki HedefXp düşürülmemelidir.");
    }

    [Fact]
    [Trait("Category", "Seri")]
    public async Task Hesap_silinince_seri_verisi_GIDER()
    {
        var client = _fabrika.CreateClient();
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(o.Token);
        int userId = o.UserId;

        // Puan kazan ve ayar yap
        await client.PostAsJsonAsync("/api/books/addword", new { word = "delword", translation = "tr", context = "" });
        await client.PutAsJsonAsync("/api/seri/ayarlar", new { gunlukHedefXp = 30 });

        // Hesabı sil
        var delRes = await client.TazeIpIlePostAsync("/api/verim/hesabimi-sil", new { sifre = "TestSifre123!" });
        delRes.StatusCode.Should().Be(HttpStatusCode.OK);

        using (var scope = _fabrika.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var etkinlikler = await db.GunlukEtkinlikler.Where(g => g.UserId == userId).ToListAsync();
            var ayarlari = await db.OgrenmeAyarlari.Where(a => a.UserId == userId).ToListAsync();

            etkinlikler.Should().BeEmpty("Hesap silinince GunlukEtkinlikler de silinmelidir.");
            ayarlari.Should().BeEmpty("Hesap silinince OgrenmeAyarlari da silinmelidir.");
        }
    }

    [Fact]
    [Trait("Category", "Seri")]
    public async Task Disa_aktarma_seri_gunlerini_ICERIR()
    {
        var client = await OgrenciIstemcisiAsync(_fabrika);

        await client.PostAsJsonAsync("/api/books/addword", new { word = "expword", translation = "tr", context = "" });
        await client.PutAsJsonAsync("/api/seri/ayarlar", new { gunlukHedefXp = 30 });

        var res = await client.GetAsync("/api/verim/disa-aktar");
        res.StatusCode.Should().Be(HttpStatusCode.OK);

        var json = await res.Content.ReadFromJsonAsync<JsonElement>();
        json.TryGetProperty("seriGunleri", out var seriGunleri).Should().BeTrue();
        json.TryGetProperty("ogrenmeAyarlari", out var ogrenmeAyarlari).Should().BeTrue();

        seriGunleri.GetArrayLength().Should().BeGreaterThan(0);
        ogrenmeAyarlari.GetProperty("gunlukHedefXp").GetInt32().Should().Be(30);
    }

    [Fact]
    [Trait("Category", "Seri")]
    public async Task Seviye_yalnizca_IZINLI_degerleri_kabul_eder()
    {
        var client = await OgrenciIstemcisiAsync(_fabrika);

        // İzin verilmeyen seviye -> 400 Bad Request
        var resGecersiz = await client.PutAsJsonAsync("/api/seri/ayarlar", new { seviye = "Z9" });
        resGecersiz.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        // İzinli seviye -> 200 OK
        var resGecerli = await client.PutAsJsonAsync("/api/seri/ayarlar", new { seviye = "B1-B2" });
        resGecerli.StatusCode.Should().Be(HttpStatusCode.OK);

        var ozet = await resGecerli.Content.ReadFromJsonAsync<SeriOzetiResponse>();
        ozet!.Seviye.Should().Be("B1-B2");
    }

    [Fact]
    [Trait("Category", "Seri")]
    public async Task Ilk_acilis_bayragi_GERI_ALINAMAZ()
    {
        var client = await OgrenciIstemcisiAsync(_fabrika);

        // İlk açılış tamamlandı olarak ayarla
        var res1 = await client.PutAsJsonAsync("/api/seri/ayarlar", new { ilkAcilisTamamlandi = true });
        res1.StatusCode.Should().Be(HttpStatusCode.OK);
        var ozet1 = await res1.Content.ReadFromJsonAsync<SeriOzetiResponse>();
        ozet1!.IlkAcilisTamamlandi.Should().BeTrue();

        // false gönderilse bile geri alınamamalı
        var res2 = await client.PutAsJsonAsync("/api/seri/ayarlar", new { ilkAcilisTamamlandi = false });
        res2.StatusCode.Should().Be(HttpStatusCode.OK);
        var ozet2 = await res2.Content.ReadFromJsonAsync<SeriOzetiResponse>();
        ozet2!.IlkAcilisTamamlandi.Should().BeTrue("İlk açılış bayrağı bir kez true olunca geri alınamamalıdır.");
    }

    [Fact]
    [Trait("Category", "Seri")]
    public async Task Adimlari_atlamak_VERI_yazmaz()
    {
        var client = await OgrenciIstemcisiAsync(_fabrika);

        // Yalnızca ilkAcilisTamamlandi = true gönderilir (seviye seçilmeden atlandı)
        var res = await client.PutAsJsonAsync("/api/seri/ayarlar", new { ilkAcilisTamamlandi = true });
        res.StatusCode.Should().Be(HttpStatusCode.OK);

        var ozet = await res.Content.ReadFromJsonAsync<SeriOzetiResponse>();
        ozet!.IlkAcilisTamamlandi.Should().BeTrue();
        ozet.Seviye.Should().BeNull("Adımlar atlanınca varsayılan hariç seviye verisi yazılmamalıdır.");
    }

    /// <summary>
    /// KAYIP GÜNCELLEME: puan "oku → topla → yaz" ile yazılıyordu. Aynı anda gelen
    /// iki olay aynı eski değeri okuyup biri diğerini eziyordu; kullanıcı kazandığı
    /// puanı kaybediyordu. Artış tek SQL cümlesiyle (INSERT … ON CONFLICT … DO UPDATE)
    /// veritabanında atomik yapılır. (Yukarıdaki eşzamanlılık testi yalnızca TEK satır
    /// ve TAVAN ölçüyordu; kaybolan puanı görmüyordu.)
    /// </summary>
    [Fact]
    [Trait("Category", "Seri")]
    public async Task Eszamanli_puanlar_KAYBOLMAZ()
    {
        var client = _fabrika.CreateClient();
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(o.Token);

        const int olay = 30;   // CalismaXp 1 · günlük tavan 40 → tavana takılmadan 30 beklenir
        await Task.WhenAll(Enumerable.Range(0, olay).Select(async _ =>
        {
            using var scope = _fabrika.Services.CreateScope();
            await scope.ServiceProvider.GetRequiredService<ISeriServisi>().PuanEkleAsync(o.UserId, "calisma");
        }));

        var ozet = await client.GetFromJsonAsync<SeriOzetiResponse>("/api/seri");
        ozet!.Bugun.Kirilim.Calisma.Should().Be(olay * SeriKurallari.CalismaXp,
            "eşzamanlı her olayın puanı yazılmalı; biri diğerini ezmemeli");
    }

    /// <summary>
    /// Puan yazımı ana işlemin YAN etkisidir: seri tablosuna yazılamazsa kelime/quiz
    /// kaydı zaten yapılmış olur ve uç 500 dönmemeli. Hata yutulur ama sessiz değil —
    /// uyarı günlüğüne yazılır.
    /// </summary>
    [Fact]
    [Trait("Category", "Seri")]
    public async Task Puan_yazilamazsa_ISTISNA_FIRLATMAZ()
    {
        using var scope = _fabrika.Services.CreateScope();
        var servis = scope.ServiceProvider.GetRequiredService<ISeriServisi>();

        // Var olmayan kullanıcı → yabancı anahtar ihlali: gerçek bir veritabanı hatası.
        var yazim = async () => await servis.PuanEkleAsync(int.MaxValue - 11, "okuma");

        await yazim.Should().NotThrowAsync("puan yazımı hatası çağıran ucu düşürmemeli");
    }
}
