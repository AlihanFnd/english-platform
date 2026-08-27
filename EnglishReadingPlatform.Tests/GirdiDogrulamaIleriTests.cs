using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using EnglishReadingPlatform.Services;
using EnglishReadingPlatform.Tests.Infrastructure;
using EnglishReadingPlatform.Validation;
using FluentAssertions;
using Microsoft.IdentityModel.Tokens;
using Xunit;

namespace EnglishReadingPlatform.Tests;

/// <summary>
/// KURAL-05 — envanterin ötesindeki girdi yolları.
///
/// Gövde alanları kuralın açıkça saydığı noktalardı. Bu dosya, aynı SINIFA ait
/// olduğu hâlde envanterde geçmeyen girdi taşıyıcılarını kapsar:
/// rota parametresi, sorgu dizesi, JWT claim'i ve sayfa seçim ifadesi.
/// </summary>
[Collection("api")]
public class GirdiDogrulamaIleriTests
{
    private readonly TestAppFactory _fabrika;
    public GirdiDogrulamaIleriTests(TestAppFactory fabrika) => _fabrika = fabrika;

    private async Task<HttpClient> OgrenciClientAsync()
    {
        var client = _fabrika.CreateClient();
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        return client.TokenIle(o.Token);
    }

    // ── Rota parametreleri ──────────────────────────────────────────────

    [Theory]
    [InlineData("/api/books/-1")]
    [InlineData("/api/books/0")]
    [InlineData("/api/books/-5/read")]
    [InlineData("/api/books/quiz/-3")]
    [InlineData("/api/groups/-1")]
    [Trait("Category", "GirdiDogrulama")]
    public async Task Negatif_rota_kimligi_reddedilir(string yol)
    {
        var client = await OgrenciClientAsync();
        var yanit = await client.GetAsync(yol);

        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest,
            "rota parametresi de istemci girdisidir");
        yanit.StatusCode.Should().NotBe(HttpStatusCode.InternalServerError);
    }

    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public async Task Negatif_kimlikle_silme_reddedilir()
    {
        var client = await OgrenciClientAsync();
        var yanit = await client.DeleteAsync("/api/books/words/-1");
        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    // ── Taksonomi ucu ───────────────────────────────────────────────────

    /// <summary>
    /// Taksonominin üç yerde ayrı tutulmasının kalıcı çözümü.
    /// Uç, whitelist'in KENDİSİNİ yayımlar; istemciler kopya tutmaz.
    /// </summary>
    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public async Task Taksonomi_ucu_whitelistin_aynisini_dondurur()
    {
        var client = await OgrenciClientAsync();
        var d = await client.GetFromJsonAsync<JsonElement>("/api/books/taxonomy");

        d.GetProperty("levels").EnumerateArray().Select(x => x.GetString()!)
            .Should().BeEquivalentTo(IzinliDegerler.Seviyeler);
        d.GetProperty("categories").EnumerateArray().Select(x => x.GetString()!)
            .Should().BeEquivalentTo(IzinliDegerler.Kategoriler);
        d.GetProperty("languages").EnumerateArray().Select(x => x.GetString()!)
            .Should().BeEquivalentTo(IzinliDegerler.Diller);
    }

    /// <summary>
    /// "taxonomy" segmenti GET /books/{id} rotasıyla çakışmamalı.
    /// Çakışsaydı uç 400 verir ve panel yedeğe düşerdi — sessizce.
    /// </summary>
    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public async Task Taksonomi_rotasi_kitap_kimligi_rotasiyla_cakismaz()
    {
        var client = await OgrenciClientAsync();
        var yanit = await client.GetAsync("/api/books/taxonomy");
        yanit.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public async Task Taksonomi_ucu_kimlik_dogrulamasi_ister()
    {
        var client = _fabrika.CreateClient();          // token YOK
        var yanit = await client.GetAsync("/api/books/taxonomy");
        yanit.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    // ── JWT claim'i de bir girdidir ─────────────────────────────────────

    /// <summary>
    /// İmzası GEÇERLİ ama NameIdentifier'ı sayı OLMAYAN bir token üretir.
    /// Eskiden int.Parse(...!) çağrısı FormatException fırlatıp 500 üretiyordu:
    /// yani imzalama anahtarını ele geçirmeden de sunucu hatası tetiklenebilirdi.
    /// Doğru davranış: 401.
    /// </summary>
    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public async Task Bozuk_kullanici_claimi_500_uretmez()
    {
        var token = BozukClaimliToken("bu-bir-sayi-degil");
        var client = _fabrika.CreateClient().TokenIle(token);

        foreach (var yol in new[] { "/api/books/words", "/api/dashboard/stats", "/api/groups" })
        {
            var yanit = await client.GetAsync(yol);
            yanit.StatusCode.Should().NotBe(HttpStatusCode.InternalServerError,
                $"{yol}: bozuk claim sunucu hatası üretmemeli");
            yanit.StatusCode.Should().Be(HttpStatusCode.Unauthorized, yol);
        }
    }

    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public async Task Bozuk_kullanici_claimi_yazma_uclarinda_da_500_uretmez()
    {
        var token = BozukClaimliToken("9999999999999999999");   // int'e sığmıyor
        var client = _fabrika.CreateClient().TokenIle(token);

        var log = await client.PostAsJsonAsync("/api/activity/log",
            new { activityType = "PageView", details = "x", durationSeconds = 5 });
        log.StatusCode.Should().NotBe(HttpStatusCode.InternalServerError);
        log.StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        var gb = await client.PostAsJsonAsync("/api/feedback", new { message = "merhaba" });
        gb.StatusCode.Should().NotBe(HttpStatusCode.InternalServerError);
        gb.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    // ── Koleksiyon İÇİNDEKİ değerler ────────────────────────────────────

    /// <summary>
    /// [MaxLength] sözlükte yalnızca ELEMAN SAYISINI sınırlar. Tek bir cevabın
    /// 200.000 karakter olmasını hiçbir öznitelik engellemiyordu: istek 200 OK
    /// alıyordu. Değer kaydedilmese de sunucu onu okuyup ayrıştırmak zorundaydı.
    /// </summary>
    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public async Task Devasa_quiz_cevabi_reddedilir()
    {
        var (client, quizId, soruId) = await QuizHazirlaAsync();

        var yanit = await client.PostAsJsonAsync("/api/books/submitquiz", new
        {
            quizId,
            answers = new Dictionary<string, string> { [soruId.ToString()] = new string('A', 200_000) }
        });

        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest,
            "sözlük DEĞERİ de istemci girdisidir");
    }

    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public async Task Whitelist_disi_quiz_sikki_reddedilir()
    {
        var (client, quizId, soruId) = await QuizHazirlaAsync();

        var yanit = await client.PostAsJsonAsync("/api/books/submitquiz", new
        {
            quizId,
            answers = new Dictionary<string, string> { [soruId.ToString()] = "Z" }
        });

        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public async Task Cok_fazla_cevap_reddedilir()
    {
        var client = await OgrenciClientAsync();
        var cok = new Dictionary<string, string>();
        for (var i = 1; i <= 5_000; i++) cok[i.ToString()] = "A";

        var yanit = await client.PostAsJsonAsync("/api/books/submitquiz",
            new { quizId = 1, answers = cok });

        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    /// <summary>Regresyon: gerçek quiz akışı bozulmamalı.</summary>
    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public async Task Gecerli_quiz_gonderimi_hala_calisiyor()
    {
        var (client, quizId, soruId) = await QuizHazirlaAsync();

        var yanit = await client.PostAsJsonAsync("/api/books/submitquiz", new
        {
            quizId,
            answers = new Dictionary<string, string> { [soruId.ToString()] = "B" }
        });

        yanit.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    /// <summary>Cevapsız soru bir hata değildir — boş değer kabul edilmeli.</summary>
    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public async Task Cevapsiz_soru_reddedilmez()
    {
        var (client, quizId, soruId) = await QuizHazirlaAsync();

        var yanit = await client.PostAsJsonAsync("/api/books/submitquiz", new
        {
            quizId,
            answers = new Dictionary<string, string> { [soruId.ToString()] = "" }
        });

        yanit.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    private async Task<(HttpClient, int, int)> QuizHazirlaAsync()
    {
        var client = await OgrenciClientAsync();
        var quiz = await client.GetFromJsonAsync<JsonElement>("/api/books/quiz/1");
        return (client,
                quiz.GetProperty("id").GetInt32(),
                quiz.GetProperty("questions").EnumerateArray().First().GetProperty("id").GetInt32());
    }

    private static string BozukClaimliToken(string kullaniciId)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(TestAppFactory.TestJwtKey));
        var simdi = DateTime.UtcNow;

        var token = new JwtSecurityToken(
            issuer: "EnglishPlatform",
            audience: "EnglishPlatformUsers",
            claims: new[]
            {
                new Claim(ClaimTypes.NameIdentifier, kullaniciId),
                new Claim(ClaimTypes.Name, "bozuk"),
                new Claim(ClaimTypes.Role, "student"),
                new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
                new Claim(JwtRegisteredClaimNames.Iat,
                    new DateTimeOffset(simdi).ToUnixTimeSeconds().ToString(),
                    ClaimValueTypes.Integer64)
            },
            expires: simdi.AddHours(1),
            signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256));

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}

/// <summary>
/// KURAL-05 — sayfa seçim ifadesi.
///
/// Eski kod aralığı ÖNCE genişletip SONRA filtreliyordu: "1-2000000000"
/// 12 karakterlik bir alanla 2 milyar elemanlı bir HashSet doğuruyordu.
/// Bu testler, üretilen küme boyutunun istemci metnine DEĞİL belgenin
/// sayfa sayısına bağlı olduğunu zorlar.
/// </summary>
public class SayfaSecimiTests
{
    [Theory]
    [InlineData("1-2000000000")]
    [InlineData("0-2147483647")]
    [InlineData("-2147483648-2147483647")]
    [InlineData("1-999999,1-999999,1-999999")]
    [Trait("Category", "GirdiDogrulama")]
    public void Devasa_aralik_belge_boyutuyla_sinirlanir(string secim)
    {
        var sonuc = PdfService.SayfaSeciminiCoz(secim, toplamSayfa: 10);

        sonuc.Should().HaveCountLessThanOrEqualTo(10,
            "aralık genişletilmeden ÖNCE belge sınırına kırpılmalı");
        sonuc.Should().OnlyContain(p => p >= 1 && p <= 10);
    }

    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public void Cok_fazla_parca_sinirlanir()
    {
        var secim = string.Join(",", Enumerable.Repeat("1", 100_000));
        var sonuc = PdfService.SayfaSeciminiCoz(secim, toplamSayfa: 5);
        sonuc.Should().OnlyContain(p => p >= 1 && p <= 5);
    }

    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public void Gecerli_secim_hala_dogru_calisiyor()
    {
        PdfService.SayfaSeciminiCoz("1,3,5-7", 10).Should().Equal(1, 3, 5, 6, 7);
        PdfService.SayfaSeciminiCoz("7-5", 10).Should().Equal(5, 6, 7);      // ters aralık
        PdfService.SayfaSeciminiCoz("2", 10).Should().Equal(2);
    }

    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public void Bos_secim_tum_belgeyi_dondurur()
    {
        PdfService.SayfaSeciminiCoz(null, 3).Should().Equal(1, 2, 3);
        PdfService.SayfaSeciminiCoz("", 3).Should().Equal(1, 2, 3);
        PdfService.SayfaSeciminiCoz("999,1000", 3).Should().Equal(1, 2, 3);  // hiçbiri geçerli değil
    }
}
