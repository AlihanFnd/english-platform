using System.Net;
using System.Net.Http.Json;
using EnglishReadingPlatform.RateLimiting;
using EnglishReadingPlatform.Tests.Infrastructure;
using FluentAssertions;
using Xunit;

namespace EnglishReadingPlatform.Tests;

/// <summary>
/// KURAL-07 davranış testleri: sınır GERÇEKTEN tetikleniyor mu, doğru bölümleniyor mu,
/// istemci sözleşmesi (429 + Retry-After + { error }) korunuyor mu.
///
/// Testler gerçek zamanı BEKLEMEZ; pencereyi doldurarak tetikler. Bekleyen test
/// yavaş ve kırılgan olur.
/// </summary>
[Collection("api")]
public class HizSiniriTests
{
    private readonly TestAppFactory _fabrika;
    public HizSiniriTests(TestAppFactory fabrika) => _fabrika = fabrika;

    private static async Task<HttpResponseMessage> KatilmaDeneAsync(HttpClient client, string kod)
        => await client.PostAsJsonAsync("/api/groups/join", new { inviteCode = kod });

    [Fact]
    [Trait("Category", "HizSiniri")]
    public async Task Davet_kodu_kaba_kuvvete_karsi_korunur()
    {
        // ANA REGRESYON: groups/join'de HİÇ sınır yoktu. 8 karakterlik davet kodu
        // sınırsız denenebiliyordu.
        var client = _fabrika.CreateClient();
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(o.Token);

        var durumlar = new List<HttpStatusCode>();
        for (var i = 0; i < HizSinirlari.DavetKoduDk + 3; i++)
            durumlar.Add((await KatilmaDeneAsync(client, $"KOD{i:D5}")).StatusCode);

        durumlar.Should().Contain(HttpStatusCode.TooManyRequests,
            "davet kodu denemeleri sınırlanmalı");
    }

    [Fact]
    [Trait("Category", "HizSiniri")]
    public async Task Sinir_asiminda_RetryAfter_basligi_doner()
    {
        // Retry-After olmadan istemci ne zaman tekrar deneyeceğini bilemez ve
        // sıkı bir döngüye girer — sınırın yükü azaltma amacı boşa çıkar.
        var client = _fabrika.CreateClient();
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(o.Token);

        HttpResponseMessage? reddedilen = null;
        for (var i = 0; i < HizSinirlari.DavetKoduDk + 3; i++)
        {
            var yanit = await KatilmaDeneAsync(client, "AAAAAAAA");
            if (yanit.StatusCode == HttpStatusCode.TooManyRequests) { reddedilen = yanit; break; }
        }

        reddedilen.Should().NotBeNull("hız sınırı hiç tetiklenmedi");
        reddedilen!.Headers.Contains("Retry-After").Should().BeTrue();
        reddedilen.Headers.GetValues("Retry-After").First().Should().NotBe("0",
            "0 saniyelik Retry-After istemciyi anında tekrar denemeye çağırır");
    }

    [Fact]
    [Trait("Category", "HizSiniri")]
    public async Task Sinir_asimi_yaniti_error_alani_tasir()
    {
        // İstemci sözleşmesi: frontend/app/api.ts errorData.error okuyor.
        // Boş gövde dönmek kullanıcıya "HTTP error! status: 429" gösterirdi.
        var client = _fabrika.CreateClient();
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(o.Token);

        for (var i = 0; i < HizSinirlari.DavetKoduDk + 3; i++)
        {
            var yanit = await KatilmaDeneAsync(client, "BBBBBBBB");
            if (yanit.StatusCode == HttpStatusCode.TooManyRequests)
            {
                var govde = await yanit.Content.ReadAsStringAsync();
                govde.Should().Contain("\"error\"", "istemci sözleşmesi korunmalı");
                govde.Should().Contain("Çok fazla istek",
                    "mesaj Türkçe ve kullanıcıya yönelik olmalı (JSON kaçırması bozulmamalı)");
                return;
            }
        }
        Assert.Fail("Hız sınırı hiç tetiklenmedi");
    }

    [Fact]
    [Trait("Category", "HizSiniri")]
    public async Task Farkli_kullanicilar_birbirinin_kotasini_tuketmez()
    {
        // Bu test MİDDLEWARE SIRASINI ölçer. UseRateLimiter, UseAuthentication'dan
        // önce konursa ctx.User boş olur, bölümleme IP'ye düşer ve TestServer'da
        // her iki istemci aynı (boş) adresten geldiği için B de kesilir.
        // Gerçek karşılığı: okul NAT'ı arkasındaki öğrencilerin birbirini kesmesi.
        var clientA = _fabrika.CreateClient();
        var a = await AuthHelper.OgrenciOlarakGirisYapAsync(clientA);
        clientA.TokenIle(a.Token);

        for (var i = 0; i < HizSinirlari.DavetKoduDk + 3; i++)
            await KatilmaDeneAsync(clientA, "CCCCCCCC");

        var clientB = _fabrika.CreateClient();
        var b = await AuthHelper.OgrenciOlarakGirisYapAsync(clientB);
        clientB.TokenIle(b.Token);

        var yanit = await KatilmaDeneAsync(clientB, "DDDDDDDD");
        yanit.StatusCode.Should().NotBe(HttpStatusCode.TooManyRequests,
            "sınır kullanıcı bazlı bölümlenmiş olmalı");
    }

    [Fact]
    [Trait("Category", "HizSiniri")]
    public async Task Ayni_kullanici_farkli_politikalari_ayri_kovada_tutar()
    {
        // Tek bir kova kullanılsaydı, davet kodu denemeleri okuma kotasını da
        // yerdi ve sınıra takılan kullanıcı kitabını okuyamazdı.
        var client = _fabrika.CreateClient();
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(o.Token);

        for (var i = 0; i < HizSinirlari.DavetKoduDk + 3; i++)
            await KatilmaDeneAsync(client, "EEEEEEEE");

        // Okuma politikası ayrı kovada: 404 beklenir (kitap yok), 429 DEĞİL.
        var yanit = await client.GetAsync("/api/books/999999/read");
        yanit.StatusCode.Should().NotBe(HttpStatusCode.TooManyRequests);
    }
}
