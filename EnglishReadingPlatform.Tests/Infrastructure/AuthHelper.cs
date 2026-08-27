using System.Net.Http.Headers;
using System.Net.Http.Json;

namespace EnglishReadingPlatform.Tests.Infrastructure;

public static class AuthHelper
{
    public record TokenSonucu(string Token, int UserId, string Role);

    private static int _ipSayaci;

    /// <summary>
    /// Her çağrıda farklı bir test IP'si üretir.
    ///
    /// Uygulama hız sınırını IP başına tutuyor (kayıt: dakikada 5, giriş: 10).
    /// TestServer altında bütün istekler aynı adresten geldiği için, bu ayrım
    /// olmadan bir dakika içinde 6. hesabı açan test 429 alıp kırılırdı.
    /// Bu, testin ölçtüğü şeyle ilgisi olmayan bir kırmızıdır.
    /// Hız sınırının KENDİSİNİ sınayan testler bu yardımcıyı kullanmaz;
    /// başlığı kasten sabit tutarak aynı kovayı paylaşır.
    /// </summary>
    private static string SonrakiTestIpsi()
    {
        var n = Interlocked.Increment(ref _ipSayaci);
        return $"10.{(n >> 16) & 0xFF}.{(n >> 8) & 0xFF}.{n & 0xFF}";
    }

    private static async Task<HttpResponseMessage> IpIleGonderAsync(
        HttpClient client, string yol, object govde, string? ip = null)
    {
        using var istek = new HttpRequestMessage(HttpMethod.Post, yol)
        {
            Content = JsonContent.Create(govde)
        };
        istek.Headers.Add(TestIstemciIpFiltresi.Baslik, ip ?? SonrakiTestIpsi());
        return await client.SendAsync(istek);
    }

    /// <summary>Yeni bir öğrenci hesabı açar ve token'ını döner.</summary>
    public static async Task<TokenSonucu> OgrenciOlarakGirisYapAsync(HttpClient client, string? ek = null)
    {
        var benzersiz = ek ?? Guid.NewGuid().ToString("N")[..8];
        var res = await IpIleGonderAsync(client, "/api/auth/register", new
        {
            username = $"ogr_{benzersiz}",
            email    = $"ogr_{benzersiz}@test.local",
            password = "TestSifre123!",
            role     = "student"
        });
        res.EnsureSuccessStatusCode();
        var body = await res.Content.ReadFromJsonAsync<KayitYaniti>();
        return new TokenSonucu(body!.token, body.user.id, body.user.role);
    }

    /// <summary>
    /// Tohumlanan yönetici hesabıyla giriş yapar.
    /// KURAL-02: koda gömülü tohum yöneticisi (admin@platform.com) yerine
    /// TestAppFactory'nin ortamdan verdiği test hesabı kullanılır.
    /// </summary>
    public static async Task<TokenSonucu> AdminOlarakGirisYapAsync(HttpClient client)
    {
        var res = await IpIleGonderAsync(client, "/api/auth/login", new
        {
            email = TestAppFactory.TestAdminEmail,
            password = TestAppFactory.TestAdminPassword
        });
        res.EnsureSuccessStatusCode();
        var body = await res.Content.ReadFromJsonAsync<KayitYaniti>();
        return new TokenSonucu(body!.token, body.user.id, body.user.role);
    }

    public static HttpClient TokenIle(this HttpClient client, string token)
    {
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    private record KullaniciDto(int id, string username, string email, string role);
    private record KayitYaniti(string token, KullaniciDto user);
}
