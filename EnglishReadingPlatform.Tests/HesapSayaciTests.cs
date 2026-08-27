using System.Net;
using System.Net.Http.Json;
using EnglishReadingPlatform.RateLimiting;
using EnglishReadingPlatform.Tests.Infrastructure;
using FluentAssertions;
using Xunit;

namespace EnglishReadingPlatform.Tests;

/// <summary>
/// KURAL-07: HEDEF (e-posta) bazlı giriş sınırı.
///
/// IP bazlı sınır dağıtık bir saldırıyı durdurmaz: her IP'den 10 deneme yapan bir
/// botnet, IP kotasını hiç aşmadan tek hesaba binlerce şifre dener. Bu testler
/// tam olarak o senaryoyu — HER DENEME FARKLI IP'DEN — kurar.
/// </summary>
[Collection("api")]
public class HesapSayaciTests
{
    private readonly TestAppFactory _fabrika;
    public HesapSayaciTests(TestAppFactory fabrika) => _fabrika = fabrika;

    private static int _ip = 20_000;

    /// <summary>Her çağrı FARKLI bir IP'den gelir — IP bazlı sınır kasten devre dışı bırakılır.</summary>
    private static async Task<HttpResponseMessage> GirisDeneAsync(
        HttpClient client, string eposta, string sifre)
    {
        var n = Interlocked.Increment(ref _ip);
        using var istek = new HttpRequestMessage(HttpMethod.Post, "/api/auth/login")
        {
            Content = JsonContent.Create(new { email = eposta, password = sifre })
        };
        istek.Headers.Add(TestIstemciIpFiltresi.Baslik,
            $"172.{(n >> 16) & 0xFF}.{(n >> 8) & 0xFF}.{n & 0xFF}");
        return await client.SendAsync(istek);
    }

    [Fact]
    [Trait("Category", "HizSiniri")]
    public async Task Dagitik_kaba_kuvvet_hesap_bazinda_kesilir()
    {
        var client = _fabrika.CreateClient();
        var hedef = $"hedef_{Guid.NewGuid():N}@test.local";

        var durumlar = new List<HttpStatusCode>();
        for (var i = 0; i < HizSinirlari.GirisHedefEnCokBasarisiz + 2; i++)
            durumlar.Add((await GirisDeneAsync(client, hedef, $"yanlis{i}")).StatusCode);

        durumlar.Should().Contain(HttpStatusCode.TooManyRequests,
            "her deneme farklı IP'den geldi; yalnızca hedef bazlı sayaç bunu kesebilir");

        // İlk denemeler 401 almalı — sayaç ilk istekte kapanmamalı.
        durumlar.Take(HizSinirlari.GirisHedefEnCokBasarisiz)
            .Should().AllBeEquivalentTo(HttpStatusCode.Unauthorized);
    }

    [Fact]
    [Trait("Category", "HizSiniri")]
    public async Task Butce_dolunca_dogru_sifre_de_kabul_edilmez()
    {
        // Gerçek hesap kilidi davranışı: kontrol şifre doğrulamasından ÖNCE yapılır.
        // Aksi hâlde saldırgan, doğru şifreyi bulduğu anda kilidi delip geçerdi.
        var client = _fabrika.CreateClient();
        var kurulum = _fabrika.CreateClient();
        var ek = Guid.NewGuid().ToString("N")[..8];
        await AuthHelper.OgrenciOlarakGirisYapAsync(kurulum, ek);
        var eposta = $"ogr_{ek}@test.local";

        for (var i = 0; i < HizSinirlari.GirisHedefEnCokBasarisiz; i++)
            await GirisDeneAsync(client, eposta, $"kesinlikleYanlis{i}");

        var yanit = await GirisDeneAsync(client, eposta, "TestSifre123!");

        yanit.StatusCode.Should().Be(HttpStatusCode.TooManyRequests,
            "bütçe dolduysa doğru şifre bile geçmemeli");
        (await yanit.Content.ReadAsStringAsync()).Should().Contain("\"error\"");
    }

    [Fact]
    [Trait("Category", "HizSiniri")]
    public async Task Basarili_girisler_hesap_butcesini_tuketmez()
    {
        // Başarılı girişleri de saymak, üç cihazdan giren meşru kullanıcıyı
        // kilitlerdi ve saldırgana hiçbir maliyet getirmezdi (brute-force zaten
        // yanlış şifrelerden oluşur). Bütçeden fazla sayıda BAŞARILI giriş yapılır.
        var kurulum = _fabrika.CreateClient();
        var ek = Guid.NewGuid().ToString("N")[..8];
        await AuthHelper.OgrenciOlarakGirisYapAsync(kurulum, ek);
        var eposta = $"ogr_{ek}@test.local";

        var client = _fabrika.CreateClient();
        for (var i = 0; i < HizSinirlari.GirisHedefEnCokBasarisiz + 3; i++)
        {
            var yanit = await GirisDeneAsync(client, eposta, "TestSifre123!");
            yanit.StatusCode.Should().Be(HttpStatusCode.OK,
                $"{i + 1}. başarılı giriş de kabul edilmeli");
        }
    }

    [Fact]
    [Trait("Category", "HizSiniri")]
    public void Sayac_anahtari_normalize_edilir()
    {
        // "Ali@X.com" ile "  ali@x.com " ayrı kova açsaydı, saldırgan büyük/küçük
        // harf değiştirerek sınırı sonsuz kez sıfırlayabilirdi.
        HesapSayaci.GirisAnahtari("  Ali@Ornek.COM ")
            .Should().Be(HesapSayaci.GirisAnahtari("ali@ornek.com"));
    }

    [Fact]
    [Trait("Category", "HizSiniri")]
    public void Bosta_kalan_bolumler_bellekte_birikmez()
    {
        // KURAL-07 İhlal 1: eski ConcurrentDictionary anahtarları ASLA silinmiyordu.
        // PartitionedRateLimiter bölümü kendi zamanlayıcısıyla serbest bırakır;
        // burada ölçülen, sayaç durumunun anahtar başına SINIRLI olduğudur.
        using var sayac = new HesapSayaci();
        var anahtar = HesapSayaci.GirisAnahtari("kova@test.local");

        sayac.KalanHak(anahtar).Should().Be(HizSinirlari.GirisHedefEnCokBasarisiz);

        for (var i = 0; i < HizSinirlari.GirisHedefEnCokBasarisiz; i++)
            sayac.BasarisizDenemeKaydet(anahtar);

        sayac.KalanHak(anahtar).Should().Be(0);
        sayac.IzinVar(anahtar).Should().BeFalse();

        // Bütçe aşıldıktan sonra fazladan deneme negatife düşmemeli.
        sayac.BasarisizDenemeKaydet(anahtar);
        sayac.KalanHak(anahtar).Should().Be(0);
    }
}
