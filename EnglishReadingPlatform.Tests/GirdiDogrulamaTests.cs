using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using EnglishReadingPlatform.Tests.Infrastructure;
using EnglishReadingPlatform.Validation;
using FluentAssertions;
using Xunit;

namespace EnglishReadingPlatform.Tests;

/// <summary>
/// KURAL-05 — uçtan uca doğrulama testleri.
///
/// Şema gerçek migration'larla üretilen bir KLON üzerinde koşar (englishreadingdb_test),
/// InMemory sağlayıcı değil: InMemory, varchar(n) taşmasını hiç yakalamaz ve bu
/// dosyadaki testlerin çoğu anlamsızlaşırdı.
/// </summary>
[Collection("api")]
public class GirdiDogrulamaTests
{
    private readonly TestAppFactory _fabrika;
    public GirdiDogrulamaTests(TestAppFactory fabrika) => _fabrika = fabrika;

    private async Task<HttpClient> OgrenciClientAsync()
    {
        var client = _fabrika.CreateClient();
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        return client.TokenIle(o.Token);
    }

    private async Task<HttpClient> AdminClientAsync()
    {
        var client = _fabrika.CreateClient();
        var a = await AuthHelper.AdminOlarakGirisYapAsync(client);
        return client.TokenIle(a.Token);
    }

    private static string UzunMetin(int uzunluk) => new('x', uzunluk);

    // ── ANA REGRESYON: normal kullanımda 500 üreten senaryo ──────────────

    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public async Task Uzun_baglam_400_doner_500_DEGIL()
    {
        var client = await OgrenciClientAsync();

        var yanit = await client.PostAsJsonAsync("/api/books/addword", new
        {
            word = "gaunt",
            translation = "bitkin",
            context = UzunMetin(5000)
        });

        yanit.StatusCode.Should().NotBe(HttpStatusCode.InternalServerError,
            "kolon taşması kullanıcıya sunucu hatası olarak dönmemeli");
        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest,
            "uzun bağlam doğrulama hatası vermeli");
    }

    /// <summary>
    /// Okuyucuda 300 karakterlik bir cümle seçmek NORMALDİR: 400 vermek
    /// özelliği kullanılamaz kılar. Doğru davranış kaydedip KIRPMAKTIR.
    /// Bu test kırpmanın gerçekten yapıldığını veritabanından okuyarak kanıtlar.
    /// </summary>
    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public async Task Kolon_sinirini_asan_ama_makul_baglam_kirpilarak_kaydedilir()
    {
        var client = await OgrenciClientAsync();
        var kelime = "kirpma_" + Guid.NewGuid().ToString("N")[..6];

        var ekle = await client.PostAsJsonAsync("/api/books/addword", new
        {
            word = kelime,
            translation = "test",
            context = UzunMetin(300)          // Baglam(200) üstü, BaglamGirdi(400) altı
        });
        ekle.StatusCode.Should().Be(HttpStatusCode.OK, "makul uzunlukta bağlam reddedilmemeli");

        var liste = await client.GetFromJsonAsync<JsonElement>("/api/books/words");
        var kayit = liste.EnumerateArray()
            .First(w => w.GetProperty("word").GetString() == kelime);

        kayit.GetProperty("context").GetString()!.Length
            .Should().Be(AlanSinirlari.Baglam, "bağlam kolon sınırına kırpılarak yazılmalı");
    }

    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public async Task Uzun_kelime_400_doner()
    {
        var client = await OgrenciClientAsync();
        var yanit = await client.PostAsJsonAsync("/api/books/addword",
            new { word = UzunMetin(1000), translation = "x", context = "" });

        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    /// <summary>UpdateWord, AddWord ile aynı kolonlara yazan KARDEŞ YOL.</summary>
    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public async Task Kelime_guncellemede_de_uzun_baglam_400_doner()
    {
        var client = await OgrenciClientAsync();
        await client.PostAsJsonAsync("/api/books/addword",
            new { word = "kardes_yol", translation = "x", context = "kısa" });

        var liste = await client.GetFromJsonAsync<JsonElement>("/api/books/words");
        var id = liste.EnumerateArray().First(w => w.GetProperty("word").GetString() == "kardes_yol")
                      .GetProperty("id").GetInt32();

        var yanit = await client.PutAsJsonAsync($"/api/books/words/{id}",
            new { word = "kardes_yol", translation = "x", context = UzunMetin(5000) });

        yanit.StatusCode.Should().NotBe(HttpStatusCode.InternalServerError);
        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest,
            "tek yolu düzeltip kardeş yolu açık bırakmak açığın yarısını kapatmaktır");
    }

    // ── Aktivite ────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public async Task Uzun_aktivite_detayi_400_doner()
    {
        var client = await OgrenciClientAsync();
        var yanit = await client.PostAsJsonAsync("/api/activity/log", new
        {
            activityType = "PageView",
            details = UzunMetin(5000),
            durationSeconds = 30
        });

        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public async Task Bilinmeyen_aktivite_tipi_reddedilir()
    {
        var client = await OgrenciClientAsync();
        var yanit = await client.PostAsJsonAsync("/api/activity/log", new
        {
            activityType = "uydurma_tip",
            details = "x",
            durationSeconds = 10
        });

        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest, "whitelist dışı tip kabul edilmemeli");
    }

    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public async Task Absurt_sure_reddedilir()
    {
        var client = await OgrenciClientAsync();
        var yanit = await client.PostAsJsonAsync("/api/activity/log", new
        {
            activityType = "PageView",
            details = "Ana Sayfa",
            durationSeconds = 999_999_999
        });

        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest, "istatistikler bozulmamalı");
    }

    // ── Geri bildirim / çeviri / OCR ────────────────────────────────────

    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public async Task Uzun_geri_bildirim_400_doner()
    {
        var client = await OgrenciClientAsync();
        var yanit = await client.PostAsJsonAsync("/api/feedback", new { message = UzunMetin(50_000) });
        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public async Task Cok_uzun_ceviri_metni_reddedilir()
    {
        var client = await OgrenciClientAsync();
        var yanit = await client.PostAsJsonAsync("/api/translate/analyze",
            new { text = UzunMetin(200_000) });

        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest,
            "sınırsız metin LLM'e gönderilmemeli");
    }

    /// <summary>
    /// Kelime ucu ile analiz ucu AYNI DTO'yu paylaşırsa, kelime ucu da
    /// 20.000 karakter kabul eder. Ayrı DTO'ların gerekçesi budur.
    /// </summary>
    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public async Task Kelime_ucu_analiz_ucunun_sinirini_devralmaz()
    {
        var client = await OgrenciClientAsync();
        var yanit = await client.PostAsJsonAsync("/api/translate/word",
            new { text = UzunMetin(5_000) });

        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest,
            "kelime ucu analiz ucunun 20.000 karakterlik sınırını almamalı");
    }

    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public async Task Uzun_OCR_metni_reddedilir()
    {
        var client = await OgrenciClientAsync();
        var yanit = await client.PostAsJsonAsync("/api/dashboard/ocr",
            new { text = UzunMetin(200_000) });

        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    // ── Yönetici: whitelist ─────────────────────────────────────────────

    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public async Task Gecersiz_seviye_reddedilir()
    {
        var client = await AdminClientAsync();

        var yanit = await client.PutAsJsonAsync("/api/admin/books/1", new
        {
            title = "Test", author = "", description = "",
            language = "en", level = "Z9", category = "story"
        });

        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest, "CEFR whitelist dışı seviye reddedilmeli");
    }

    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public async Task Gecerli_seviye_hala_kabul_edilir()
    {
        // Regresyon: whitelist meşru yönetici işini bozmamalı.
        var client = await AdminClientAsync();

        foreach (var seviye in IzinliDegerler.Seviyeler)
        {
            var yanit = await client.PutAsJsonAsync("/api/admin/books/1", new
            {
                title = "Test", author = "", description = "",
                language = "en", level = seviye, category = "story"
            });

            yanit.StatusCode.Should().Be(HttpStatusCode.OK,
                $"'{seviye}' whitelist'te — yönetici paneli bu değeri gönderiyor");
        }
    }

    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public async Task Gecersiz_kategori_reddedilir()
    {
        var client = await AdminClientAsync();
        var yanit = await client.PutAsJsonAsync("/api/admin/books/1", new
        {
            title = "Test", author = "", description = "",
            language = "en", level = "A1", category = "<script>"
        });

        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public async Task Gecersiz_rol_reddedilir()
    {
        var client = await AdminClientAsync();
        var yanit = await client.PutAsJsonAsync("/api/admin/users/1/role", new { role = "superadmin" });
        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    // ── Kayıt ───────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public async Task Kisa_sifreyle_kayit_reddedilir()
    {
        var client = _fabrika.CreateClient();
        var yanit = await client.PostAsJsonAsync("/api/auth/register", new
        {
            username = "kisa_" + Guid.NewGuid().ToString("N")[..6],
            email = $"kisa_{Guid.NewGuid():N}@test.local",
            password = "abc123",
            role = "student"
        });

        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    /// <summary>Kayıt whitelist'inde "admin" YOK — sessizce student'a düşmek yerine 400.</summary>
    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public async Task Kayitta_admin_rolu_istenemez()
    {
        var client = _fabrika.CreateClient();
        var yanit = await client.PostAsJsonAsync("/api/auth/register", new
        {
            username = "yetki_" + Guid.NewGuid().ToString("N")[..6],
            email = $"yetki_{Guid.NewGuid():N}@test.local",
            password = "GucluSifre123!",
            role = "admin"
        });

        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    // ── İstemci sözleşmesi ──────────────────────────────────────────────

    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public async Task Hata_yaniti_error_alani_tasimali()
    {
        // frontend/app/api.ts errorData.error okuyor — biçim korunmalı.
        var client = await OgrenciClientAsync();
        var yanit = await client.PostAsJsonAsync("/api/books/addword",
            new { word = "", translation = "", context = "" });

        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var govde = await yanit.Content.ReadAsStringAsync();
        govde.Should().Contain("\"error\"", "istemci sözleşmesi { error } biçimini bekliyor");

        var json = JsonDocument.Parse(govde).RootElement;
        json.GetProperty("error").GetString().Should().NotBeNullOrWhiteSpace(
            "boş bir 'error' alanı kullanıcıya 'HTTP error! status: 400' gösterir");
    }

    // ── Sorgu parametreleri de girdidir ─────────────────────────────────

    /// <summary>
    /// Bu değerler doğrudan aritmetiğe girip ReadingProgress'e YAZILIYOR.
    /// Doğrulama eklenmeden önce ?chapter=-999999 isteği 200 dönüp
    /// veritabanına progressPercent = -49999950 yazıyordu.
    /// </summary>
    [Theory]
    [InlineData("chapter=-999999")]
    [InlineData("page=-5")]
    [InlineData("chapter=0")]
    [InlineData("page=0")]
    [Trait("Category", "GirdiDogrulama")]
    public async Task Negatif_sayfa_veya_bolum_reddedilir(string sorgu)
    {
        var client = await OgrenciClientAsync();
        var yanit = await client.GetAsync($"/api/books/1/read?{sorgu}");

        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest,
            "sorgu parametresi de istemci girdisidir ve veritabanına yazılıyor");
    }

    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public async Task Gecerli_okuma_istegi_hala_calisiyor()
    {
        var client = await OgrenciClientAsync();
        var yanit = await client.GetAsync("/api/books/1/read?chapter=1");
        yanit.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    /// <summary>Bozuk ilerleme kaydedilmediğini veritabanından okuyarak kanıtlar.</summary>
    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public async Task Reddedilen_istek_ilerlemeyi_bozmaz()
    {
        var client = await OgrenciClientAsync();

        await client.GetAsync("/api/books/1/read?chapter=1");          // meşru okuma
        await client.GetAsync("/api/books/1/read?chapter=-999999");    // saldırı

        var panel = await client.GetFromJsonAsync<JsonElement>("/api/dashboard/stats");
        var ilerleme = panel.GetProperty("recentProgress").EnumerateArray().First();

        ilerleme.GetProperty("progressPercent").GetSingle()
            .Should().BeGreaterThanOrEqualTo(0, "negatif ilerleme veritabanına yazılmamalı");
        ilerleme.GetProperty("currentChapter").GetInt32()
            .Should().BeGreaterThan(0);
    }

    // ── Regresyon: meşru kullanım bozulmamalı ───────────────────────────

    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public async Task Gecerli_istek_hala_calisiyor()
    {
        var client = await OgrenciClientAsync();
        var yanit = await client.PostAsJsonAsync("/api/books/addword", new
        {
            word = "gaunt",
            translation = "bitkin, sıska",
            context = "The old man was thin and gaunt."
        });

        yanit.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public async Task Gecerli_aktivite_kaydi_hala_calisiyor()
    {
        // useActivityTracker'ın gönderdiği gerçek yük.
        var client = await OgrenciClientAsync();
        var yanit = await client.PostAsJsonAsync("/api/activity/log", new
        {
            activityType = "ReadBook",
            details = "Kitap ID: 1 - Kitap Okuyor",
            durationSeconds = 30
        });

        yanit.StatusCode.Should().Be(HttpStatusCode.OK);
    }
}
