using System.Net.Http.Json;
using System.Text.Json;
using EnglishReadingPlatform.Tests.Infrastructure;
using FluentAssertions;
using Xunit;

namespace EnglishReadingPlatform.Tests;

/// <summary>
/// KURAL-08 DAVRANIŞ TESTİ — sözleşme testi biçimi ölçer, bu test ETKİYİ ölçer.
/// Doğru biçimli bir DTO, sorguda kapsam filtresi yoksa yine de fazla veri taşır.
/// </summary>
[Collection("api")]
public class VeriMinimizasyonuTests
{
    private readonly TestAppFactory _fabrika;
    public VeriMinimizasyonuTests(TestAppFactory fabrika) => _fabrika = fabrika;

    // ─── ANA REGRESYON ────────────────────────────────────────────────
    [Fact]
    [Trait("Category", "VeriMinimizasyonu")]
    public async Task Grup_detayi_atanmamis_kitap_ilerlemesini_GOSTERMEZ()
    {
        var (sahipClient, uyeClient, grupId, atanan, atanmayan) = await SinifKurAsync();

        // Üye İKİ kitabı da okusun: biri gruba atanacak, diğeri kişisel okuma.
        (await uyeClient.GetAsync($"/api/books/{atanan.Id}/read?chapter=1"))
            .EnsureSuccessStatusCode();
        (await uyeClient.GetAsync($"/api/books/{atanmayan.Id}/read?chapter=1"))
            .EnsureSuccessStatusCode();

        // Gruba YALNIZCA bir kitap atansın.
        (await sahipClient.PostAsJsonAsync("/api/groups/assignbook",
            new { groupId = grupId, bookId = atanan.Id })).EnsureSuccessStatusCode();

        var detay = await DetayAlAsync(sahipClient, grupId);

        // 1) Kapsam DIŞI okuma görünmemeli — asıl sızıntı buydu.
        detay.Progresses.Select(p => p.BookTitle).Should().NotContain(atanmayan.Title,
            "gruba atanmamış kitabın okuma verisi kişiseldir, grupta görünmemeli");

        // 2) Kapsam İÇİ okuma GÖRÜNMELİ.
        //    TUZAK: BookAssignments Include edilmezse görünür kitap listesi boş kalır,
        //    hiçbir ilerleme dönmez ve test yalnızca (1) yüzünden yeşil olur —
        //    yani "her şeyi gizle" hatası düzeltme sanılır. Bu iddia onu yakalar.
        detay.Progresses.Select(p => p.BookTitle).Should().Contain(atanan.Title,
            "gruba atanan kitabın ilerlemesi öğretmene görünmeli");
    }

    [Fact]
    [Trait("Category", "VeriMinimizasyonu")]
    public async Task Grup_detayi_atanmamis_kitap_quiz_sonucunu_GOSTERMEZ()
    {
        var (sahipClient, uyeClient, grupId, atanan, atanmayan) = await SinifKurAsync();

        // Üye her iki kitaptan da quiz çözsün.
        await QuizCozAsync(uyeClient, atanan.Id);
        await QuizCozAsync(uyeClient, atanmayan.Id);

        (await sahipClient.PostAsJsonAsync("/api/groups/assignbook",
            new { groupId = grupId, bookId = atanan.Id })).EnsureSuccessStatusCode();

        var detay = await DetayAlAsync(sahipClient, grupId);

        detay.QuizResults.Select(q => q.BookTitle).Should().NotContain(atanmayan.Title,
            "gruba atanmamış kitabın quiz sonucu grupta görünmemeli");
        detay.QuizResults.Select(q => q.BookTitle).Should().Contain(atanan.Title,
            "gruba atanan kitabın quiz sonucu öğretmene görünmeli");
    }

    // ─── DAVET KODU ───────────────────────────────────────────────────
    [Fact]
    [Trait("Category", "VeriMinimizasyonu")]
    public async Task Davet_kodu_yalnizca_grup_sahibine_doner()
    {
        var sahipClient = _fabrika.CreateClient();
        var sahip = await AuthHelper.OgrenciOlarakGirisYapAsync(sahipClient);
        sahipClient.TokenIle(sahip.Token);

        var grupYanit = await sahipClient.PostAsJsonAsync("/api/groups",
            new { name = "Kod Testi", description = "" });
        grupYanit.EnsureSuccessStatusCode();
        var grup = await grupYanit.Content.ReadFromJsonAsync<GrupOzetDto>();
        grup!.InviteCode.Should().NotBeNullOrEmpty("kurucu = sahip, kodu görmeli");

        var uyeClient = _fabrika.CreateClient();
        var uye = await AuthHelper.OgrenciOlarakGirisYapAsync(uyeClient);
        uyeClient.TokenIle(uye.Token);
        (await uyeClient.PostAsJsonAsync("/api/groups/join",
            new { inviteCode = grup.InviteCode })).EnsureSuccessStatusCode();

        // 1) Detay ucunda
        var uyeGorunumGovde = await uyeClient.GetStringAsync($"/api/groups/{grup.Id}");
        uyeGorunumGovde.Should().NotContain(grup.InviteCode!,
            "sıradan üye davet kodunu ham gövdede bile görmemeli");

        var uyeDetay = JsonSerializer.Deserialize<GrupDetayDto>(uyeGorunumGovde, Secenekler)!;
        uyeDetay.Group.InviteCode.Should().BeNull();
        uyeDetay.Group.SahipMiyim.Should().BeFalse();

        // 2) KARDEŞ YOL: liste ucu. Tek uç düzeltip listeyi atlamak açığın
        //    yarısını açık bırakırdı.
        var listeGovde = await uyeClient.GetStringAsync("/api/groups");
        listeGovde.Should().NotContain(grup.InviteCode!,
            "grup listesi de sıradan üyeye davet kodu vermemeli");

        // 3) Sahip hâlâ görebilmeli — "hepsini gizle" bir düzeltme değildir.
        var sahipDetay = await DetayAlAsync(sahipClient, grup.Id);
        sahipDetay.Group.InviteCode.Should().Be(grup.InviteCode);
        sahipDetay.Group.SahipMiyim.Should().BeTrue();
    }

    // ─── ŞİFRE HASH'İ ─────────────────────────────────────────────────
    [Fact]
    [Trait("Category", "VeriMinimizasyonu")]
    public async Task Hicbir_yanit_PasswordHash_icermez()
    {
        // Önce VERİ ÜRET: boş listelerde dolaşan bir test hiçbir şey ölçmez.
        var ogrenciClient = _fabrika.CreateClient();
        var ogrenci = await AuthHelper.OgrenciOlarakGirisYapAsync(ogrenciClient);
        ogrenciClient.TokenIle(ogrenci.Token);

        (await ogrenciClient.PostAsJsonAsync("/api/books/addword",
            new { word = "hashtest", translation = "x", context = "" })).EnsureSuccessStatusCode();
        (await ogrenciClient.PostAsJsonAsync("/api/dashboard/ocr",
            new { text = "ocr metni" })).EnsureSuccessStatusCode();
        (await ogrenciClient.PostAsJsonAsync("/api/groups",
            new { name = "Hash Testi", description = "" })).EnsureSuccessStatusCode();
        (await ogrenciClient.PostAsJsonAsync("/api/feedback",
            new { message = "geri bildirim" })).EnsureSuccessStatusCode();

        var adminClient = _fabrika.CreateClient();
        var admin = await AuthHelper.AdminOlarakGirisYapAsync(adminClient);
        adminClient.TokenIle(admin.Token);

        var kontroller = new (HttpClient Istemci, string Yol)[]
        {
            (ogrenciClient, "/api/auth/me"),
            (ogrenciClient, "/api/books"),
            (ogrenciClient, "/api/books/words"),
            (ogrenciClient, "/api/groups"),
            (ogrenciClient, "/api/dashboard/stats"),
            (ogrenciClient, "/api/dashboard/ocr"),
            (adminClient,   "/api/admin/users"),
            (adminClient,   "/api/admin/books"),
            (adminClient,   "/api/admin/groups"),
            (adminClient,   "/api/feedback/list"),
            (adminClient,   "/api/activity/stats"),
        };

        foreach (var (istemci, yol) in kontroller)
        {
            var yanit = await istemci.GetAsync(yol);
            yanit.IsSuccessStatusCode.Should().BeTrue($"{yol} çağrılabilmeli (gelen: {(int)yanit.StatusCode})");
            var govde = await yanit.Content.ReadAsStringAsync();

            govde.Should().NotContain("asswordHash", $"{yol} şifre hash'i sızdırıyor");
            govde.Should().NotContain("$2a$", $"{yol} BCrypt hash'i sızdırıyor");
            govde.Should().NotContain("$2b$", $"{yol} BCrypt hash'i sızdırıyor");
        }

        // Testin BOŞ KÜME üzerinde gezinmediğinin kanıtı.
        (await ogrenciClient.GetStringAsync("/api/books/words")).Should().Contain("hashtest");
        (await adminClient.GetStringAsync("/api/admin/users")).Should().Contain("ogr_");
    }

    [Fact]
    [Trait("Category", "VeriMinimizasyonu")]
    public async Task Ocr_yaniti_sunucu_dosya_yolunu_sizdirmaz()
    {
        var client = _fabrika.CreateClient();
        var ogrenci = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(ogrenci.Token);

        var kayitYanit = await client.PostAsJsonAsync("/api/dashboard/ocr",
            new { text = "taranmis metin" });
        kayitYanit.EnsureSuccessStatusCode();

        var kayitGovde = await kayitYanit.Content.ReadAsStringAsync();
        var listeGovde = await client.GetStringAsync("/api/dashboard/ocr");

        kayitGovde.Should().Contain("taranmis metin");
        listeGovde.Should().Contain("taranmis metin");
        kayitGovde.Should().NotContain("magePath", "OCR yanıtı sunucu dosya yolunu taşımamalı");
        listeGovde.Should().NotContain("magePath", "OCR yanıtı sunucu dosya yolunu taşımamalı");
    }

    [Fact]
    [Trait("Category", "VeriMinimizasyonu")]
    public async Task Kelime_listesi_baskasinin_kelimesini_dondurmez()
    {
        var aClient = _fabrika.CreateClient();
        var a = await AuthHelper.OgrenciOlarakGirisYapAsync(aClient);
        aClient.TokenIle(a.Token);
        (await aClient.PostAsJsonAsync("/api/books/addword",
            new { word = "gizlikelime", translation = "x", context = "" })).EnsureSuccessStatusCode();

        var bClient = _fabrika.CreateClient();
        var b = await AuthHelper.OgrenciOlarakGirisYapAsync(bClient);
        bClient.TokenIle(b.Token);

        var bListesi = await bClient.GetStringAsync("/api/books/words");
        bListesi.Should().NotContain("gizlikelime");

        // Sahibi görebilmeli — sahiplik filtresi bozulmamış olmalı.
        (await aClient.GetStringAsync("/api/books/words")).Should().Contain("gizlikelime");
    }

    [Fact]
    [Trait("Category", "VeriMinimizasyonu")]
    public async Task Uye_listesi_baskasinin_epostasini_dondurmez()
    {
        var (sahipClient, _, grupId, _, _) = await SinifKurAsync();

        var detayGovde = await sahipClient.GetStringAsync($"/api/groups/{grupId}");

        detayGovde.Should().NotContain("@test.local",
            "grup üyesi listesi sınıf arkadaşlarının e-posta adresini taşımamalı");
    }

    // ─── Yardımcılar ──────────────────────────────────────────────────
    private static readonly JsonSerializerOptions Secenekler =
        new(JsonSerializerDefaults.Web);

    /// <summary>Sahip + üye + grup + iki farklı kitap hazırlar.</summary>
    private async Task<(HttpClient Sahip, HttpClient Uye, int GrupId, KitapDto Atanan, KitapDto Atanmayan)>
        SinifKurAsync()
    {
        var sahipClient = _fabrika.CreateClient();
        var sahip = await AuthHelper.OgrenciOlarakGirisYapAsync(sahipClient);
        sahipClient.TokenIle(sahip.Token);

        var grupYanit = await sahipClient.PostAsJsonAsync("/api/groups",
            new { name = "Test Sınıfı", description = "" });
        grupYanit.EnsureSuccessStatusCode();
        var grup = await grupYanit.Content.ReadFromJsonAsync<GrupOzetDto>();

        var uyeClient = _fabrika.CreateClient();
        var uye = await AuthHelper.OgrenciOlarakGirisYapAsync(uyeClient);
        uyeClient.TokenIle(uye.Token);
        (await uyeClient.PostAsJsonAsync("/api/groups/join",
            new { inviteCode = grup!.InviteCode })).EnsureSuccessStatusCode();

        // TUZAK: tohum kitap kimliğine (bookId = 3) güvenmek. Tohum değişirse test
        // sessizce anlamsızlaşır. Kitaplar uçtan okunur ve iki FARKLI başlık olduğu
        // doğrulanır — aksi hâlde "içermemeli" iddiası kendiliğinden geçerdi.
        var kitaplar = await sahipClient.GetFromJsonAsync<List<KitapDto>>("/api/books");
        kitaplar.Should().NotBeNull();
        kitaplar!.Count.Should().BeGreaterThanOrEqualTo(2, "test iki ayrı kitap gerektirir");
        var atanan = kitaplar[0];
        var atanmayan = kitaplar[1];
        atanan.Title.Should().NotBe(atanmayan.Title);
        atanan.ChaptersCount.Should().BeGreaterThan(0);
        atanmayan.ChaptersCount.Should().BeGreaterThan(0);

        return (sahipClient, uyeClient, grup.Id, atanan, atanmayan);
    }

    private async Task<GrupDetayDto> DetayAlAsync(HttpClient client, int grupId)
    {
        var govde = await client.GetStringAsync($"/api/groups/{grupId}");
        return JsonSerializer.Deserialize<GrupDetayDto>(govde, Secenekler)!;
    }

    /// <summary>Verilen kitabın ilk bölümünden quiz üretir ve boş cevapla gönderir.</summary>
    private static async Task QuizCozAsync(HttpClient client, int kitapId)
    {
        var kitap = await client.GetFromJsonAsync<KitapDetayDto>($"/api/books/{kitapId}");
        kitap!.Chapters.Should().NotBeEmpty();
        var bolumId = kitap.Chapters[0].Id;

        var quiz = await client.GetFromJsonAsync<QuizDto>($"/api/books/quiz/{bolumId}");
        var gonder = await client.PostAsJsonAsync("/api/books/submitquiz",
            new { quizId = quiz!.Id, answers = new Dictionary<int, string>() });
        gonder.EnsureSuccessStatusCode();
    }

    // ─── Test DTO'ları (üretim DTO'larından KASTEN bağımsız) ──────────
    // Üretim record'unu doğrudan kullanmak, alan silinince testin de sessizce
    // uyum sağlaması demektir. Bu kopya "istemcinin gördüğü biçim"i temsil eder.
    private record KitapDto(int Id, string Title, int ChaptersCount, int PagesCount);
    private record BolumDto(int Id, int ChapterNumber, string Title);
    private record KitapDetayDto(int Id, string Title, List<BolumDto> Chapters);
    private record QuizDto(int Id, string Title);
    private record AtananKitapDto(int BookId, string Title);
    private record GrupOzetDto(int Id, string Name, string Description,
                               string? InviteCode, bool SahipMiyim, int MembersCount,
                               List<AtananKitapDto> Assignments);
    private record UyeDto(int UserId, string Username, string Role);
    private record IlerlemeDto(int UserId, string Username, string BookTitle,
                               float ProgressPercent, int CurrentChapter);
    private record GrupQuizDto(string Username, string BookTitle, string QuizTitle, int Score);
    private record GrupDetayDto(GrupOzetDto Group, List<UyeDto> Members,
                                List<AtananKitapDto> AllBooks,
                                List<IlerlemeDto> Progresses,
                                List<GrupQuizDto> QuizResults);
}
