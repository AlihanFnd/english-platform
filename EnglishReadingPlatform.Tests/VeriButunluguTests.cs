using System.Net;
using System.Net.Http.Json;
using EnglishReadingPlatform.Data;
using EnglishReadingPlatform.Models;
using EnglishReadingPlatform.Tests.Infrastructure;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace EnglishReadingPlatform.Tests;

/// <summary>
/// KURAL-12 — veri bütünlüğü ve saklama.
///
/// Bu testler ŞEMAYI ölçer, kodu değil. Uygulama katmanındaki "önce kontrol et,
/// sonra ekle" deseni yarış durumunda yanılır; testin sorduğu soru şudur:
/// <b>kod yanılsa bile veritabanı ikinci satırı reddeder mi?</b>
///
/// Şema, gerçek migration'larla üretilen PostgreSQL klonudur (InMemory DEĞİL) —
/// unique index davranışı ancak orada gerçekten ölçülebilir.
/// </summary>
[Collection("api")]
public class VeriButunluguTests
{
    private readonly TestAppFactory _fabrika;
    public VeriButunluguTests(TestAppFactory fabrika) => _fabrika = fabrika;

    private static AppDbContext Db(IServiceScope kapsam)
        => kapsam.ServiceProvider.GetRequiredService<AppDbContext>();

    /// <summary>Teste özel kullanıcı — tohum kimliğine hiç güvenilmez.</summary>
    private static async Task<User> KullaniciAcAsync(AppDbContext db, string onek)
    {
        var kullanici = new User
        {
            Username = $"{onek}_{Guid.NewGuid():N}"[..20],
            Email    = $"{onek}_{Guid.NewGuid():N}@t.local",
            PasswordHash = "x",
            Role = "student"
        };
        db.Users.Add(kullanici);
        await db.SaveChangesAsync();
        return kullanici;
    }

    /// <summary>
    /// Teste özel kitap. TUZAK: tohum kitap Id'sine (BookId = 1) güvenmek —
    /// KURAL-02 tohumu değiştirdi, yarın yine değişebilir. Kitap yoksa
    /// yabancı anahtar hatası alınır ve test, ölçmek istediği unique index
    /// yüzünden DEĞİL, alakasız bir sebeple kırmızı olur.
    /// </summary>
    private static async Task<Book> KitapAcAsync(AppDbContext db)
    {
        var kitap = new Book { Title = $"BT {Guid.NewGuid():N}"[..20], Author = "t" };
        db.Books.Add(kitap);
        await db.SaveChangesAsync();
        return kitap;
    }

    // ══════════════════════════════════════════════════════════════════
    //  A) ŞEMA: mantıksal tekillik veritabanında zorlanıyor mu?
    // ══════════════════════════════════════════════════════════════════

    [Fact]
    [Trait("Category", "VeriButunlugu")]
    public async Task Ayni_kullanici_kitap_icin_iki_ilerleme_kaydi_ACILAMAZ()
    {
        using var kapsam = _fabrika.Services.CreateScope();
        var db = Db(kapsam);

        var kullanici = await KullaniciAcAsync(db, "bt");
        var kitap = await KitapAcAsync(db);

        db.ReadingProgresses.Add(new ReadingProgress { UserId = kullanici.Id, BookId = kitap.Id });
        await db.SaveChangesAsync();

        db.ReadingProgresses.Add(new ReadingProgress { UserId = kullanici.Id, BookId = kitap.Id });
        var eylem = async () => await db.SaveChangesAsync();

        await eylem.Should().ThrowAsync<DbUpdateException>("(UserId, BookId) tekil olmalı");
    }

    [Fact]
    [Trait("Category", "VeriButunlugu")]
    public async Task Ayni_kullanici_ayni_kelimeyi_iki_kez_KAYDEDEMEZ()
    {
        using var kapsam = _fabrika.Services.CreateScope();
        var db = Db(kapsam);

        var kullanici = await KullaniciAcAsync(db, "bk");

        db.WordListItems.Add(new WordListItem { UserId = kullanici.Id, Word = "gaunt", Translation = "a" });
        await db.SaveChangesAsync();

        db.WordListItems.Add(new WordListItem { UserId = kullanici.Id, Word = "gaunt", Translation = "b" });
        var eylem = async () => await db.SaveChangesAsync();

        await eylem.Should().ThrowAsync<DbUpdateException>("(UserId, Word) tekil olmalı");
    }

    [Fact]
    [Trait("Category", "VeriButunlugu")]
    public async Task Ayni_ceviri_onbellek_kaydi_iki_kez_YAZILAMAZ()
    {
        using var kapsam = _fabrika.Services.CreateScope();
        var db = Db(kapsam);

        var benzersiz = Guid.NewGuid().ToString("N")[..10];
        db.TranslationCaches.Add(new TranslationCache
            { QueryText = benzersiz, ContextText = "bir cümle", Translation = "a|||b|||c" });
        await db.SaveChangesAsync();

        db.TranslationCaches.Add(new TranslationCache
            { QueryText = benzersiz, ContextText = "bir cümle", Translation = "x|||y|||z" });
        var eylem = async () => await db.SaveChangesAsync();

        await eylem.Should().ThrowAsync<DbUpdateException>("(QueryText, ContextText) tekil olmalı");
    }

    [Fact]
    [Trait("Category", "VeriButunlugu")]
    public async Task Ayni_kisi_gruba_iki_kez_UYE_OLAMAZ()
    {
        using var kapsam = _fabrika.Services.CreateScope();
        var db = Db(kapsam);

        var sahip = await KullaniciAcAsync(db, "gs");
        var uye = await KullaniciAcAsync(db, "gu");
        var grup = new Group { Name = "BT Grup", AdminUserId = sahip.Id, InviteCode = Guid.NewGuid().ToString("N")[..8] };
        db.Groups.Add(grup);
        await db.SaveChangesAsync();

        db.GroupMembers.Add(new GroupMember { GroupId = grup.Id, UserId = uye.Id });
        await db.SaveChangesAsync();

        db.GroupMembers.Add(new GroupMember { GroupId = grup.Id, UserId = uye.Id });
        var eylem = async () => await db.SaveChangesAsync();

        await eylem.Should().ThrowAsync<DbUpdateException>("(GroupId, UserId) tekil olmalı");
    }

    [Fact]
    [Trait("Category", "VeriButunlugu")]
    public async Task Ayni_kitap_gruba_iki_kez_ATANAMAZ()
    {
        using var kapsam = _fabrika.Services.CreateScope();
        var db = Db(kapsam);

        var sahip = await KullaniciAcAsync(db, "as");
        var kitap = await KitapAcAsync(db);
        var grup = new Group { Name = "BT Atama", AdminUserId = sahip.Id, InviteCode = Guid.NewGuid().ToString("N")[..8] };
        db.Groups.Add(grup);
        await db.SaveChangesAsync();

        db.GroupBookAssignments.Add(new GroupBookAssignment { GroupId = grup.Id, BookId = kitap.Id });
        await db.SaveChangesAsync();

        db.GroupBookAssignments.Add(new GroupBookAssignment { GroupId = grup.Id, BookId = kitap.Id });
        var eylem = async () => await db.SaveChangesAsync();

        await eylem.Should().ThrowAsync<DbUpdateException>("(GroupId, BookId) tekil olmalı");
    }

    [Fact]
    [Trait("Category", "VeriButunlugu")]
    public async Task Ayni_kitapta_ayni_sayfa_numarasi_IKI_KEZ_OLAMAZ()
    {
        using var kapsam = _fabrika.Services.CreateScope();
        var db = Db(kapsam);

        var kitap = await KitapAcAsync(db);

        db.BookPages.Add(new BookPage { BookId = kitap.Id, PageNumber = 1, Content = "a" });
        await db.SaveChangesAsync();

        db.BookPages.Add(new BookPage { BookId = kitap.Id, PageNumber = 1, Content = "b" });
        var eylem = async () => await db.SaveChangesAsync();

        await eylem.Should().ThrowAsync<DbUpdateException>("(BookId, PageNumber) tekil olmalı");
    }

    [Fact]
    [Trait("Category", "VeriButunlugu")]
    public async Task Bir_bolume_iki_quiz_URETILEMEZ()
    {
        using var kapsam = _fabrika.Services.CreateScope();
        var db = Db(kapsam);

        var kitap = await KitapAcAsync(db);
        var bolum = new Chapter { BookId = kitap.Id, ChapterNumber = 1, Title = "b", Content = "c" };
        db.Chapters.Add(bolum);
        await db.SaveChangesAsync();

        db.Quizzes.Add(new Quiz { BookId = kitap.Id, ChapterId = bolum.Id, Title = "Q1" });
        await db.SaveChangesAsync();

        db.Quizzes.Add(new Quiz { BookId = kitap.Id, ChapterId = bolum.Id, Title = "Q2" });
        var eylem = async () => await db.SaveChangesAsync();

        await eylem.Should().ThrowAsync<DbUpdateException>("ChapterId tekil olmalı");
    }

    // ══════════════════════════════════════════════════════════════════
    //  B) SÖZLEŞME: unique index eklendi ama API hâlâ idempotent mi?
    //     (Bir bütünlük düzeltmesinin en tipik yan hasarı: 200 → 500)
    // ══════════════════════════════════════════════════════════════════

    [Fact]
    [Trait("Category", "VeriButunlugu")]
    public async Task Kelime_ekleme_mukerrer_istekte_hata_VERMEZ()
    {
        var client = _fabrika.CreateClient();
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(o.Token);

        var istek = new { word = "tekrarkelime", translation = "x", context = "" };

        (await client.PostAsJsonAsync("/api/books/addword", istek))
            .StatusCode.Should().Be(HttpStatusCode.OK);
        (await client.PostAsJsonAsync("/api/books/addword", istek))
            .StatusCode.Should().Be(HttpStatusCode.OK, "ikinci istek de 200 dönmeli");

        using var kapsam = _fabrika.Services.CreateScope();
        var adet = await Db(kapsam).WordListItems
            .CountAsync(w => w.UserId == o.UserId && w.Word == "tekrarkelime");
        adet.Should().Be(1, "iki istek TEK satır bırakmalı");
    }

    [Fact]
    [Trait("Category", "VeriButunlugu")]
    public async Task Ayni_kitabi_iki_kez_okumak_TEK_ilerleme_satiri_birakir()
    {
        var client = _fabrika.CreateClient();
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(o.Token);

        var kitaplar = await client.GetFromJsonAsync<List<KitapKisa>>("/api/books");
        kitaplar.Should().NotBeNullOrEmpty();
        var kitapId = kitaplar![0].Id;

        (await client.GetAsync($"/api/books/{kitapId}/read?chapter=1")).EnsureSuccessStatusCode();
        (await client.GetAsync($"/api/books/{kitapId}/read?chapter=2")).EnsureSuccessStatusCode();

        using var kapsam = _fabrika.Services.CreateScope();
        var satirlar = await Db(kapsam).ReadingProgresses
            .CountAsync(p => p.UserId == o.UserId && p.BookId == kitapId);
        satirlar.Should().Be(1, "aynı kitap için tek ilerleme satırı olmalı");
    }

    [Fact]
    [Trait("Category", "VeriButunlugu")]
    public async Task Ayni_gruba_iki_kez_katilmak_hata_VERMEZ_ve_tek_uyelik_birakir()
    {
        var sahipClient = _fabrika.CreateClient();
        var sahip = await AuthHelper.OgrenciOlarakGirisYapAsync(sahipClient);
        sahipClient.TokenIle(sahip.Token);

        var grupYanit = await sahipClient.PostAsJsonAsync("/api/groups",
            new { name = "Katilim Testi", description = "" });
        grupYanit.EnsureSuccessStatusCode();
        var grup = await grupYanit.Content.ReadFromJsonAsync<GrupKisa>();

        var uyeClient = _fabrika.CreateClient();
        var uye = await AuthHelper.OgrenciOlarakGirisYapAsync(uyeClient);
        uyeClient.TokenIle(uye.Token);

        (await uyeClient.PostAsJsonAsync("/api/groups/join", new { inviteCode = grup!.InviteCode }))
            .StatusCode.Should().Be(HttpStatusCode.OK);
        (await uyeClient.PostAsJsonAsync("/api/groups/join", new { inviteCode = grup.InviteCode }))
            .StatusCode.Should().Be(HttpStatusCode.OK, "ikinci katılım da 200 dönmeli");

        using var kapsam = _fabrika.Services.CreateScope();
        var uyelik = await Db(kapsam).GroupMembers
            .CountAsync(m => m.GroupId == grup.Id && m.UserId == uye.UserId);
        uyelik.Should().Be(1, "iki katılım TEK üyelik bırakmalı");
    }

    // ══════════════════════════════════════════════════════════════════
    //  C) SİLME DAVRANIŞI: cascade bilinçli mi?
    // ══════════════════════════════════════════════════════════════════

    [Fact]
    [Trait("Category", "VeriButunlugu")]
    public async Task Grup_yoneticisi_silinemez_once_devredilmeli()
    {
        var sahipClient = _fabrika.CreateClient();
        var sahip = await AuthHelper.OgrenciOlarakGirisYapAsync(sahipClient);
        sahipClient.TokenIle(sahip.Token);
        (await sahipClient.PostAsJsonAsync("/api/groups",
            new { name = "Silme Testi", description = "" })).EnsureSuccessStatusCode();

        var adminClient = _fabrika.CreateClient();
        var admin = await AuthHelper.YeniYoneticiOlarakGirisYapAsync(adminClient, _fabrika);
        adminClient.TokenIle(admin.Token);

        var yanit = await adminClient.DeleteAsync($"/api/admin/users/{sahip.UserId}");

        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest,
            "grup yöneticisi silinmeden önce devredilmeli — sessizce grup silinmemeli");
        (await yanit.Content.ReadAsStringAsync()).Should().Contain("devredin");

        // ASIL İDDİA: grup HÂLÂ DURUYOR. Sadece 400 dönmesi yetmez — eski
        // davranışta 200 dönüp grup sessizce siliniyordu.
        using var kapsam = _fabrika.Services.CreateScope();
        var db = Db(kapsam);
        (await db.Groups.AnyAsync(g => g.AdminUserId == sahip.UserId))
            .Should().BeTrue("grup silinmemeliydi");
        (await db.Users.AnyAsync(u => u.Id == sahip.UserId))
            .Should().BeTrue("kullanıcı da silinmemeliydi");
    }

    [Fact]
    [Trait("Category", "VeriButunlugu")]
    public async Task Grup_sahibi_olmayan_kullanici_SILINEBILIR_ve_verisi_gider()
    {
        // TUZAK KONTROLÜ: Restrict'i eklerken kullanıcı silmeyi TAMAMEN kırmak.
        // Bu test, korumanın yalnızca grup sahiplerini kapsadığını kanıtlar.
        var kurbanClient = _fabrika.CreateClient();
        var kurban = await AuthHelper.OgrenciOlarakGirisYapAsync(kurbanClient);
        kurbanClient.TokenIle(kurban.Token);
        (await kurbanClient.PostAsJsonAsync("/api/books/addword",
            new { word = "silinecek", translation = "x", context = "" })).EnsureSuccessStatusCode();

        var adminClient = _fabrika.CreateClient();
        var admin = await AuthHelper.YeniYoneticiOlarakGirisYapAsync(adminClient, _fabrika);
        adminClient.TokenIle(admin.Token);

        (await adminClient.DeleteAsync($"/api/admin/users/{kurban.UserId}"))
            .StatusCode.Should().Be(HttpStatusCode.OK);

        using var kapsam = _fabrika.Services.CreateScope();
        var db = Db(kapsam);
        (await db.Users.AnyAsync(u => u.Id == kurban.UserId)).Should().BeFalse();
        (await db.WordListItems.AnyAsync(w => w.UserId == kurban.UserId))
            .Should().BeFalse("kişisel veri kullanıcıyla birlikte gitmeli (cascade)");
    }

    // ══════════════════════════════════════════════════════════════════
    //  D) SAKLAMA: kişisel veri süresiz durmuyor mu?
    // ══════════════════════════════════════════════════════════════════

    [Fact]
    [Trait("Category", "VeriButunlugu")]
    public async Task Saklama_temizligi_eski_loglari_siler_yenileri_BIRAKIR()
    {
        using var kapsam = _fabrika.Services.CreateScope();
        var db = Db(kapsam);

        var kullanici = await KullaniciAcAsync(db, "sk");

        db.UserActivityLogs.AddRange(
            new UserActivityLog { UserId = kullanici.Id, ActivityType = "PageView", Details = "eski",
                Timestamp = DateTime.UtcNow.AddDays(-200) },
            new UserActivityLog { UserId = kullanici.Id, ActivityType = "PageView", Details = "yeni",
                Timestamp = DateTime.UtcNow.AddDays(-1) },
            // KOTA SAYACI — bugünün kaydı ASLA silinmemeli. Bu satır silinirse
            // kullanıcının günlük Groq limiti sıfırlanır ve maliyet koruması çöker.
            new UserActivityLog { UserId = kullanici.Id, ActivityType = "ai_word_translation",
                Details = "ai_kelime_cevirisi", Timestamp = DateTime.UtcNow });
        await db.SaveChangesAsync();

        var servis = new SaklamaTemizligiServisi(
            _fabrika.Services.GetRequiredService<IServiceScopeFactory>(),
            NullLogger<SaklamaTemizligiServisi>.Instance);
        await servis.TemizleAsync();

        var kalanlar = await db.UserActivityLogs
            .Where(l => l.UserId == kullanici.Id)
            .Select(l => l.Details).ToListAsync();

        kalanlar.Should().NotContain("eski", "90 günden eski log silinmeli");
        kalanlar.Should().Contain("yeni", "dünkü log durmalı");
        kalanlar.Should().Contain("ai_kelime_cevirisi", "kota sayacı korunmalı");
    }

    /// <summary>
    /// Kota sayacının korunmasını TEK BAŞINA ölçen test.
    ///
    /// NEDEN AYRI: FluentAssertions ilk başarısız iddiada durur. Yukarıdaki
    /// testte kota iddiası ÜÇÜNCÜ sıradadır; saklama süresi bozulduğunda test
    /// "yeni" iddiasından kırılır ve raporda kotanın da sıfırlandığı GÖRÜNMEZ.
    /// Bu MUTASYON C2 ile ortaya çıktı: eşik sıfıra çekildiğinde kalan küme
    /// tamamen boşaldı, ama hata mesajı yalnızca "yeni"den bahsetti.
    /// Kotayı bozan bir değişikliğin, adında kotayı yazan bir testi kırması
    /// gerekir — aksi hâlde neyin bozulduğu ancak kod okunarak anlaşılır.
    /// </summary>
    [Fact]
    [Trait("Category", "VeriButunlugu")]
    public async Task Saklama_temizligi_GROQ_KOTA_SAYACINI_asla_silmez()
    {
        using var kapsam = _fabrika.Services.CreateScope();
        var db = Db(kapsam);

        var kullanici = await KullaniciAcAsync(db, "kt");

        db.UserActivityLogs.Add(new UserActivityLog
        {
            UserId = kullanici.Id,
            ActivityType = "ai_word_translation",
            Details = "ai_kelime_cevirisi",
            Timestamp = DateTime.UtcNow
        });
        await db.SaveChangesAsync();

        var servis = new SaklamaTemizligiServisi(
            _fabrika.Services.GetRequiredService<IServiceScopeFactory>(),
            NullLogger<SaklamaTemizligiServisi>.Instance);
        await servis.TemizleAsync();

        (await db.UserActivityLogs.CountAsync(l =>
                l.UserId == kullanici.Id && l.ActivityType == "ai_word_translation"))
            .Should().Be(1,
                "bugünün 'ai_word_translation' satırı Groq GÜNLÜK KOTA SAYACIDIR; " +
                "silinirse kullanıcı günlük limitini sıfırlar ve maliyet koruması çöker");
    }

    [Fact]
    [Trait("Category", "VeriButunlugu")]
    public async Task Saklama_temizligi_suresi_dolmus_sifirlama_jetonlarini_siler()
    {
        using var kapsam = _fabrika.Services.CreateScope();
        var db = Db(kapsam);

        var kullanici = await KullaniciAcAsync(db, "sj");

        var eskiHash = Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N");
        var yeniHash = Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N");

        db.SifreSifirlamaJetonlari.AddRange(
            new SifreSifirlamaJetonu { UserId = kullanici.Id, JetonHash = eskiHash,
                GecerlilikSonu = DateTime.UtcNow.AddDays(-30), CreatedAt = DateTime.UtcNow.AddDays(-30) },
            new SifreSifirlamaJetonu { UserId = kullanici.Id, JetonHash = yeniHash,
                GecerlilikSonu = DateTime.UtcNow.AddMinutes(30), CreatedAt = DateTime.UtcNow });
        await db.SaveChangesAsync();

        var servis = new SaklamaTemizligiServisi(
            _fabrika.Services.GetRequiredService<IServiceScopeFactory>(),
            NullLogger<SaklamaTemizligiServisi>.Instance);
        await servis.TemizleAsync();

        var kalanlar = await db.SifreSifirlamaJetonlari
            .Where(j => j.UserId == kullanici.Id).Select(j => j.JetonHash).ToListAsync();

        kalanlar.Should().NotContain(eskiHash, "7 günden eski jeton bir kalıntıdır");
        kalanlar.Should().Contain(yeniHash, "taze jeton durmalı — sıfırlama akışı kırılmamalı");
    }

    [Fact]
    [Trait("Category", "VeriButunlugu")]
    public async Task Kullanici_kendi_OCR_kaydini_silebilir_BASKASININKINI_silemez()
    {
        // KURAL-12: "kişisel veri süresiz saklanmaz" ancak kullanıcı kendi
        // verisini silebiliyorsa gerçek olur. Aynı uç bir IDOR yüzeyidir:
        // sahiplik sorgunun İÇİNDE olmazsa sıradaki Id denenerek başkasının
        // taradığı metin silinir.
        var aClient = _fabrika.CreateClient();
        var a = await AuthHelper.OgrenciOlarakGirisYapAsync(aClient);
        aClient.TokenIle(a.Token);

        var bClient = _fabrika.CreateClient();
        var b = await AuthHelper.OgrenciOlarakGirisYapAsync(bClient);
        bClient.TokenIle(b.Token);

        var aKayit = await (await aClient.PostAsJsonAsync("/api/dashboard/ocr", new { text = "A metni" }))
            .Content.ReadFromJsonAsync<OcrKisa>();
        var bKayit = await (await bClient.PostAsJsonAsync("/api/dashboard/ocr", new { text = "B metni" }))
            .Content.ReadFromJsonAsync<OcrKisa>();

        // A, B'nin kaydını silmeye çalışır — 200 döner (numaralandırmayı önlemek
        // için) ama kayıt DURMALIDIR.
        (await aClient.DeleteAsync($"/api/dashboard/ocr/{bKayit!.Id}"))
            .StatusCode.Should().Be(HttpStatusCode.OK);

        using (var kapsam = _fabrika.Services.CreateScope())
        {
            (await Db(kapsam).OcrRecords.AnyAsync(r => r.Id == bKayit.Id))
                .Should().BeTrue("başkasının OCR kaydı silinemez");
        }

        // A kendi kaydını siler — gerçekten gitmeli.
        (await aClient.DeleteAsync($"/api/dashboard/ocr/{aKayit!.Id}"))
            .StatusCode.Should().Be(HttpStatusCode.OK);

        using (var kapsam = _fabrika.Services.CreateScope())
        {
            (await Db(kapsam).OcrRecords.AnyAsync(r => r.Id == aKayit.Id))
                .Should().BeFalse("kullanıcı kendi verisini silebilmeli");
        }
    }

    /// <summary>
    /// KURAL-12 YAN BULGU — yutulan yazma hatası SONRAKİ kaydetmeyi patlatmamalı.
    ///
    /// Başarısız bir SaveChanges, eklenmeye çalışılan satırı ChangeTracker'da
    /// 'Added' durumunda bırakır. Aynı kapsamda ikinci bir SaveChanges o satırı
    /// yeniden dener ve bu kez istisnayı kimse beklemez. Gerçek senaryo:
    /// BooksController.Read → AnalyzeTextAsync → çeviri önbelleği yazımı düşer
    /// (uyarı loglanıp yutulur) → Read kendi SentencesJson'ını kaydetmeye çalışır
    /// → kullanıcı kitabını açamaz, log ise çeviri önbelleğinden bahseder.
    ///
    /// Burada hata GERÇEKTEN üretilir: PostgreSQL btree indeksi ~2704 baytı aşan
    /// bir anahtar satırını reddeder (SQLSTATE 54000). Bu sınır KURAL-12 ile
    /// GELMEDİ — eski non-unique indeks de aynı sınıra tabiydi.
    /// </summary>
    [Fact]
    [Trait("Category", "VeriButunlugu")]
    public async Task Yutulan_onbellek_hatasi_SONRAKI_kaydetmeyi_patlatmaz()
    {
        using var kapsam = _fabrika.Services.CreateScope();
        var db = Db(kapsam);

        // İndeks satırını taşıracak kadar uzun, SIKIŞTIRILAMAZ çok baytlı bağlam.
        var rastgele = new Random(12345);
        var devasaBaglam = string.Concat(Enumerable.Range(0, 2000)
            .Select(_ => (char)(0x4E00 + rastgele.Next(0, 20000))));

        db.TranslationCaches.Add(new TranslationCache
        {
            QueryText = new string('a', 255),
            ContextText = devasaBaglam,
            Translation = "a|||b|||c"
        });

        var patladi = false;
        try
        {
            await db.BenzersizKaydetAsync();
        }
        catch (DbUpdateException)
        {
            patladi = true;
            // ÜRETİM KODUYLA AYNI TEMİZLİK (TranslationService catch bloğu).
            db.ChangeTracker.Entries<TranslationCache>()
                .Where(g => g.State == EntityState.Added)
                .ToList()
                .ForEach(g => g.State = EntityState.Detached);
        }

        patladi.Should().BeTrue(
            "test ancak yazma GERÇEKTEN düşerse anlamlıdır — düşmezse hiçbir şey ölçmez");

        // ASIL İDDİA: aynı kapsamda ALAKASIZ bir kaydetme artık başarılı olmalı.
        var kullanici = await KullaniciAcAsync(db, "yb");
        kullanici.Id.Should().BeGreaterThan(0,
            "yutulan hatanın izi temizlenmezse bu kaydetme de aynı istisnayla düşerdi");
    }

    // ── Test DTO'ları ────────────────────────────────────────────────
    private record KitapKisa(int Id, string Title);
    private record GrupKisa(int Id, string Name, string? InviteCode);
    private record OcrKisa(int Id, string ExtractedText);
}
