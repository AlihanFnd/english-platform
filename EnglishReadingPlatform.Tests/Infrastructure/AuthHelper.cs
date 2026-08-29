using System.Net.Http.Headers;
using System.Net.Http.Json;
using EnglishReadingPlatform.Data;
using Microsoft.Extensions.DependencyInjection;

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

    /// <summary>
    /// Teste ÖZEL, YENİ bir yönetici hesabı açar ve token'ını döner.
    ///
    /// NEDEN GEREKLİ: hız sınırı bölümleri KULLANICI kimliğine göre ayrılıyor
    /// (HizSinirlamaKurulumu.KullaniciVeyaIp). Tohumlanan yönetici tek olduğu için
    /// onunla çalışan BÜTÜN testler aynı kovayı paylaşıyordu; dosya yükleme kotası
    /// dakikada 5 olduğundan, altıncı yükleme testi -- hangi dosyada yazılmış
    /// olursa olsun -- uzaktaki başka bir testi 429 ile kırıyordu. Test eklemenin
    /// alakasız bir testi bozması, bulunması en pahalı kırılganlık türüdür.
    /// Her testin kendi yöneticisi olunca bu bağ tamamen kopar.
    ///
    /// Rol yükseltmesi doğrudan veritabanında yapılır, ardından TEKRAR giriş
    /// yapılır: roldeki değişiklik elde duran token'ın claim'ine yansımaz.
    /// </summary>
    public static async Task<TokenSonucu> YeniYoneticiOlarakGirisYapAsync(
        HttpClient client, TestAppFactory fabrika)
    {
        var benzersiz = Guid.NewGuid().ToString("N")[..8];
        var eposta = $"yon_{benzersiz}@test.local";
        const string sifre = "TestSifre123!";

        var kayit = await IpIleGonderAsync(client, "/api/auth/register", new
        {
            username = $"yon_{benzersiz}",
            email    = eposta,
            password = sifre,
            role     = "student"
        });
        kayit.EnsureSuccessStatusCode();
        var kayitGovde = await kayit.Content.ReadFromJsonAsync<KayitYaniti>();

        using (var kapsam = fabrika.Services.CreateScope())
        {
            var db = kapsam.ServiceProvider.GetRequiredService<AppDbContext>();
            var kullanici = await db.Users.FindAsync(kayitGovde!.user.id);
            kullanici!.Role = "admin";
            await db.SaveChangesAsync();
        }

        var giris = await IpIleGonderAsync(client, "/api/auth/login",
            new { email = eposta, password = sifre });
        giris.EnsureSuccessStatusCode();
        var girisGovde = await giris.Content.ReadFromJsonAsync<KayitYaniti>();

        if (girisGovde!.user.role != "admin")
            throw new InvalidOperationException(
                $"Rol yükseltmesi token'a yansımadı (gelen rol: {girisGovde.user.role}).");

        return new TokenSonucu(girisGovde.token, girisGovde.user.id, girisGovde.user.role);
    }

    public static HttpClient TokenIle(this HttpClient client, string token)
    {
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    private record KullaniciDto(int id, string username, string email, string role);
    private record KayitYaniti(string token, KullaniciDto user);
}
