using System.Net;
using System.Net.Http.Json;
using System.Reflection;
using System.Text.RegularExpressions;
using EnglishReadingPlatform.Data;
using EnglishReadingPlatform.Models;
using EnglishReadingPlatform.RateLimiting;
using EnglishReadingPlatform.Tests.Infrastructure;
using FluentAssertions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Routing;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace EnglishReadingPlatform.Tests;

/// <summary>
/// KURAL-17 sözleşme testleri — maliyetli iş ve paylaşılan yazma.
///
/// Bu dosya silinir ya da içindeki testlerden biri kaldırılırsa
/// scripts/guard/17-maliyet.sh kırmızı verir.
/// </summary>
[Collection("api")]
public class MaliyetSozlesmesiTests
{
    private readonly TestAppFactory _fabrika;
    public MaliyetSozlesmesiTests(TestAppFactory fabrika) => _fabrika = fabrika;

    // ─── Yansımayla uç taraması ───────────────────────────────────

    private static IEnumerable<MethodInfo> TumUclar() =>
        typeof(Program).Assembly.GetTypes()
            .Where(t => typeof(ControllerBase).IsAssignableFrom(t) && !t.IsAbstract)
            .SelectMany(t => t.GetMethods(BindingFlags.Public | BindingFlags.Instance
                                        | BindingFlags.DeclaredOnly))
            .Where(m => m.GetCustomAttributes<HttpMethodAttribute>().Any());

    /// <summary>
    /// SÖZLEŞME: ücretli dış API çağıran her uç, EN DAR kotaya bağlı olmalı.
    ///
    /// Yansımayla taranıyor: yeni bir uç eklendiğinde kimse hatırlatmasa da
    /// bu test onu yakalar. KURAL-07'nin kapısı yalnızca [EnableRateLimiting]
    /// VARLIĞINI denetliyordu — hangi politikanın doğru olduğunu değil.
    /// </summary>
    [Fact]
    [Trait("Category", "Maliyet")]
    public void Para_harcayan_her_uc_EN_DAR_kotada()
    {
        var darKotalar = new[] { HizSinirlari.AgirAnaliz, HizSinirlari.Ceviri };

        var ihlaller = TumUclar()
            .Where(m => m.GetCustomAttribute<ParaHarcarAttribute>() is not null)
            .Where(m => !darKotalar.Contains(
                m.GetCustomAttribute<EnableRateLimitingAttribute>()?.PolicyName))
            .Select(m => $"{m.DeclaringType!.Name}.{m.Name}")
            .ToList();

        ihlaller.Should().BeEmpty(
            "ücretli dış API çağıran uç, genel 'okuma' ya da 'yazma' kotasına " +
            "bağlanamaz — 'reanalyze' tam olarak böyle üç kat gevşek kalmıştı");
    }

    /// <summary>
    /// SÖZLEŞME (ters yön): Groq çağıran ama BİLDİRMEYEN uç olmamalı.
    ///
    /// Yukarıdaki test yalnızca bildirilmişleri denetler; asıl risk
    /// bildirilmemiş olandır — 'reanalyze' bir sorgu parametresinin arkasında
    /// saklandığı için hiç fark edilmemişti.
    /// </summary>
    [Fact]
    [Trait("Category", "Maliyet")]
    public void Groq_cagiran_her_yol_BILDIRILMIS_olmali()
    {
        var ihlaller = new List<string>();

        foreach (var (dosya, kaynak) in DenetleyiciKaynaklari())
        foreach (var blok in UcBloklari(kaynak))
        {
            if (!Regex.IsMatch(blok, @"AnalyzeTextAsync|TranslateWordAsync|TranslateSentenceAsync"))
                continue;
            if (blok.Contains("ParaHarcar")) continue;

            ihlaller.Add($"{dosya} → {UcAdi(blok)}");
        }

        ihlaller.Should().BeEmpty(
            "LLM/çeviri servisi çağıran her uç [ParaHarcar] taşımalı — " +
            "maliyet, kodu okuyarak keşfedilen bir özellik olmamalı");
    }

    /// <summary>
    /// SÖZLEŞME: paylaşılan veriyi ÜZERİNE YAZAN uç yetki ister.
    ///
    /// 'BosAlaniDoldurur' biçimi bilerek dışarıda: o yol yalnızca boş bir alanı
    /// doldurur, başkasının gördüğü içeriği BOZAMAZ. Etki yarıçapı olmayan bir
    /// işi rol kısıtına bağlamak, öğrencinin sayfayı hiç okuyamaması demekti.
    /// </summary>
    [Fact]
    [Trait("Category", "Maliyet")]
    public void Paylasilan_veri_UZERINE_yazan_uc_YETKI_ister()
    {
        var ihlaller = TumUclar()
            .Where(m => m.GetCustomAttribute<PaylasilanVeriYazarAttribute>()?.Bicim
                        == PaylasilanYazmaBicimi.UzerineYazar)
            .Where(m => string.IsNullOrWhiteSpace(m.GetCustomAttribute<AuthorizeAttribute>()?.Policy)
                     && string.IsNullOrWhiteSpace(m.GetCustomAttribute<AuthorizeAttribute>()?.Roles))
            .Select(m => $"{m.DeclaringType!.Name}.{m.Name}")
            .ToList();

        ihlaller.Should().BeEmpty(
            "paylaşılan veriyi herkes ezemez — sınıf düzeyindeki [Authorize] " +
            "yalnızca 'giriş yapmış olmak' demektir, yetki değil");
    }

    /// <summary>
    /// ANA REGRESYON: hiçbir GET ucu veri yazmamalı.
    ///
    /// Çerez SameSite=Lax, ÜST DÜZEY GET gezinmesinde gönderilir. Kurbanı bir
    /// bağlantıyla yazan bir GET'e yönlendirmek, onun hesabından iş yaptırmaya
    /// yeter — 'read' ucunda bu, Groq maliyeti demekti.
    ///
    /// Uç gövdesi YAPISAL kesiliyor (bir sonraki [Http...] özniteliğine kadar),
    /// sabit satır penceresiyle değil — faz 1 dersi 2.
    /// </summary>
    [Fact]
    [Trait("Category", "Maliyet")]
    public void Hicbir_GET_ucu_veri_YAZMAZ()
    {
        var ihlaller = new List<string>();

        foreach (var (dosya, kaynak) in DenetleyiciKaynaklari())
        foreach (var blok in UcBloklari(kaynak))
        {
            if (!Regex.IsMatch(blok, @"^\s*\[HttpGet")) continue;

            var govde = YorumsuzGovde(blok);
            if (Regex.IsMatch(govde, @"SaveChangesAsync|BenzersizKaydetAsync|ExecuteDelete|ExecuteUpdate"))
                ihlaller.Add($"{dosya} → {UcAdi(blok)}");
        }

        ihlaller.Should().BeEmpty("durum değiştiren iş GET üzerinden yapılamaz");
    }

    // ─── Davranış ─────────────────────────────────────────────────

    /// <summary>
    /// Öğrenci, HERKESİN gördüğü analizi yeniden üretemez.
    /// Butonu arayüzden gizlemek yetmez — curl bir satırdır.
    /// </summary>
    [Fact]
    [Trait("Category", "Maliyet")]
    public async Task Ogrenci_paylasilan_analizi_YENIDEN_URETEMEZ()
    {
        var client = _fabrika.CreateClient();
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(o.Token);

        var (kitapId, _) = await SayfaliKitapAcAsync("Bu bir cumle.", "[]");

        var yanit = await client.PostAsync($"/api/books/{kitapId}/reanalyze?page=1", null);

        yanit.StatusCode.Should().Be(HttpStatusCode.Forbidden,
            "paylaşılan analizi ezmek öğretmen/yönetici işidir");
    }

    /// <summary>
    /// TUZAK KONTROLÜ: "herkese 403 dönen" bir uç da yukarıdaki testi geçerdi.
    /// Öğretmenin yetki katmanından GEÇTİĞİ ayrıca kanıtlanıyor.
    ///
    /// İddia durum kodunun 403/401 OLMAMASI üzerinden kuruluyor: analizin
    /// kendisi dış servise bağlı (200) ya da bağlanamayabilir (502) — testi
    /// ağa bağımlı yapmamak için ölçülen şey YETKİ, analiz değil.
    /// </summary>
    [Fact]
    [Trait("Category", "Maliyet")]
    public async Task Ogretmen_paylasilan_analizi_yeniden_URETEBILIR()
    {
        var yoneticiClient = _fabrika.CreateClient();
        var yonetici = await AuthHelper.YeniYoneticiOlarakGirisYapAsync(yoneticiClient, _fabrika);
        yoneticiClient.TokenIle(yonetici.Token);

        var ogretmenClient = _fabrika.CreateClient();
        var ogretmen = await AuthHelper.OgretmenOlarakGirisYapAsync(ogretmenClient, yoneticiClient);
        ogretmenClient.TokenIle(ogretmen.Token);
        ogretmen.Role.Should().Be("teacher", "yükseltme gerçekten uygulanmalı");

        var (kitapId, _) = await SayfaliKitapAcAsync("Bu bir cumle.", "[]");

        var yanit = await ogretmenClient.PostAsync($"/api/books/{kitapId}/reanalyze?page=1", null);

        yanit.StatusCode.Should().NotBe(HttpStatusCode.Forbidden);
        yanit.StatusCode.Should().NotBe(HttpStatusCode.Unauthorized);
    }

    /// <summary>
    /// ASIL İDDİA: başarısız bir analiz, HERKESİN okuduğu mevcut veriyi EZMEZ.
    ///
    /// Boş içerikli bir sayfa kullanılıyor — analiz deterministik olarak boş
    /// döner ve dış servise hiç gidilmez. Eski kod bunu 'if (Any())' ile
    /// sessizce atlıyordu: kullanıcı başarılı sanıyor, hiçbir şey olmuyordu.
    /// </summary>
    [Fact]
    [Trait("Category", "Maliyet")]
    public async Task Basarisiz_analiz_mevcut_veriyi_EZMEZ()
    {
        var yoneticiClient = _fabrika.CreateClient();
        var yonetici = await AuthHelper.YeniYoneticiOlarakGirisYapAsync(yoneticiClient, _fabrika);
        yoneticiClient.TokenIle(yonetici.Token);

        var ogretmenClient = _fabrika.CreateClient();
        var ogretmen = await AuthHelper.OgretmenOlarakGirisYapAsync(ogretmenClient, yoneticiClient);
        ogretmenClient.TokenIle(ogretmen.Token);

        const string mevcutAnaliz = """[{"index":0,"original":"ONCEKI","translation":"ESKI"}]""";
        var (kitapId, sayfaId) = await SayfaliKitapAcAsync("   ", mevcutAnaliz);

        var yanit = await ogretmenClient.PostAsync($"/api/books/{kitapId}/reanalyze?page=1", null);

        yanit.StatusCode.Should().Be(HttpStatusCode.BadGateway,
            "analiz üretilemediyse bunu SÖYLEMELİ — sessizce başarılı dönmek " +
            "kullanıcıya yanlış bilgi verir");

        (await SayfaAnaliziniOkuAsync(sayfaId)).Should().Be(mevcutAnaliz,
            "başarısız bir LLM çağrısı HERKESİN okuduğu içeriği silmemeli");
    }

    /// <summary>
    /// Boşluk dolduran uç, DOLU bir analizi değiştirmez ve para harcamaz.
    /// Bu, ucun rol kısıtı olmadan herkese açık olabilmesinin gerekçesidir:
    /// etki yarıçapı yok.
    /// </summary>
    [Fact]
    [Trait("Category", "Maliyet")]
    public async Task Bos_alani_dolduran_uc_DOLU_analizi_DEGISTIRMEZ()
    {
        var client = _fabrika.CreateClient();
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(o.Token);

        const string mevcutAnaliz = """[{"index":0,"original":"ONCEKI","translation":"ESKI"}]""";
        var (kitapId, sayfaId) = await SayfaliKitapAcAsync("Bu bir cumle.", mevcutAnaliz);

        var yanit = await client.PostAsync($"/api/books/{kitapId}/analyze-page?page=1", null);

        yanit.StatusCode.Should().Be(HttpStatusCode.OK);
        (await SayfaAnaliziniOkuAsync(sayfaId)).Should().Be(mevcutAnaliz,
            "dolu bir analizin üzerine yazmak bu ucun işi değil");
    }

    /// <summary>
    /// Okuma ucu artık analiz ÜRETMİYOR; ürettirmediğini istemciye SÖYLÜYOR.
    /// Sessizce boş dizi dönmek, istemcinin "analiz yok" ile "analiz henüz
    /// üretilmedi"yi ayırt edememesi demekti.
    /// </summary>
    [Fact]
    [Trait("Category", "Maliyet")]
    public async Task Okuma_ucu_analiz_URETMEZ_ama_bekledigini_SOYLER()
    {
        var client = _fabrika.CreateClient();
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(o.Token);

        var (kitapId, sayfaId) = await SayfaliKitapAcAsync("Bu bir cumle.", "[]");

        var yanit = await client.GetFromJsonAsync<System.Text.Json.JsonElement>(
            $"/api/books/{kitapId}/read?page=1");

        yanit.GetProperty("analizBekliyor").GetBoolean().Should().BeTrue();
        (await SayfaAnaliziniOkuAsync(sayfaId)).Should().Be("[]",
            "okuma ucu paylaşılan satıra YAZMAMALI");
    }

    // ─── Yardımcılar ──────────────────────────────────────────────

    private async Task<(int KitapId, int SayfaId)> SayfaliKitapAcAsync(string icerik, string analiz)
    {
        using var kapsam = _fabrika.Services.CreateScope();
        var db = kapsam.ServiceProvider.GetRequiredService<AppDbContext>();

        var kitap = new Book { Title = $"Maliyet {Guid.NewGuid():N}"[..20], Author = "t" };
        db.Books.Add(kitap);
        await db.SaveChangesAsync();

        var sayfa = new BookPage
        {
            BookId = kitap.Id,
            PageNumber = 1,
            Content = icerik,
            SentencesJson = analiz,
        };
        db.BookPages.Add(sayfa);
        await db.SaveChangesAsync();

        return (kitap.Id, sayfa.Id);
    }

    private async Task<string> SayfaAnaliziniOkuAsync(int sayfaId)
    {
        using var kapsam = _fabrika.Services.CreateScope();
        var db = kapsam.ServiceProvider.GetRequiredService<AppDbContext>();
        return (await db.BookPages.AsNoTracking()
            .FirstAsync(p => p.Id == sayfaId)).SentencesJson;
    }

    private static IEnumerable<(string Dosya, string Kaynak)> DenetleyiciKaynaklari()
    {
        var kok = ProjeKoku();
        foreach (var yol in Directory.GetFiles(
                     Path.Combine(kok, "EnglishReadingPlatform", "Controllers"), "*.cs"))
            yield return (Path.GetFileName(yol), File.ReadAllText(yol));
    }

    /// <summary>Uç gövdesini YAPISAL keser: bir sonraki [Http…] özniteliğine kadar.</summary>
    private static IEnumerable<string> UcBloklari(string kaynak) =>
        Regex.Split(kaynak, @"\n(?=\s*\[Http)").Skip(1);

    private static string YorumsuzGovde(string blok) =>
        string.Join("\n", blok.Split('\n').Where(s => !s.TrimStart().StartsWith("//")));

    private static string UcAdi(string blok) =>
        Regex.Match(blok, @"public\s+(?:async\s+)?(?:Task<)?IActionResult>?\s+(\w+)") is { Success: true } m
            ? m.Groups[1].Value : "?";

    private static string ProjeKoku()
    {
        var dizin = AppContext.BaseDirectory;
        for (var i = 0; i < 8 && dizin is not null; i++)
        {
            if (File.Exists(Path.Combine(dizin, "Linguza.sln"))) return dizin;
            dizin = Directory.GetParent(dizin)?.FullName;
        }
        throw new InvalidOperationException("Proje kökü bulunamadı (Linguza.sln).");
    }
}
