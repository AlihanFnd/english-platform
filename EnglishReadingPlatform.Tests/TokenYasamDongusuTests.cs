using System.Net;
using System.Net.Http.Json;
using EnglishReadingPlatform.Tests.Infrastructure;
using FluentAssertions;
using Xunit;

namespace EnglishReadingPlatform.Tests;

[Collection("api")]
public class TokenYasamDongusuTests
{
    private readonly TestAppFactory _fabrika;
    public TokenYasamDongusuTests(TestAppFactory fabrika) => _fabrika = fabrika;

    [Fact]
    [Trait("Category", "TokenYasamDongusu")]
    public async Task Cikis_yapilan_token_ARTIK_CALISMAZ()
    {
        // ANA REGRESYON TESTİ — bu testin var olma sebebi #1 numaralı ihlaldir.
        var client = _fabrika.CreateClient();
        var ogrenci = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(ogrenci.Token);

        // 1) Token çalışıyor
        (await client.GetAsync("/api/auth/me")).StatusCode
            .Should().Be(HttpStatusCode.OK, "çıkıştan önce token geçerli olmalı");

        // 2) Çıkış yap
        (await client.PostAsync("/api/auth/logout", null)).StatusCode
            .Should().Be(HttpStatusCode.OK);

        // 3) AYNI token artık geçersiz olmalı
        (await client.GetAsync("/api/auth/me")).StatusCode
            .Should().Be(HttpStatusCode.Unauthorized,
                "çıkış yapılan token bir daha kullanılamamalı — bu testin kırmızı olması " +
                "logout'un sessizce hiçbir şey yapmadığı anlamına gelir");
    }

    [Fact]
    [Trait("Category", "TokenYasamDongusu")]
    public async Task Cikis_baska_kullanicinin_tokenini_etkilemez()
    {
        var clientA = _fabrika.CreateClient();
        var a = await AuthHelper.OgrenciOlarakGirisYapAsync(clientA);
        clientA.TokenIle(a.Token);

        var clientB = _fabrika.CreateClient();
        var b = await AuthHelper.OgrenciOlarakGirisYapAsync(clientB);
        clientB.TokenIle(b.Token);

        await clientA.PostAsync("/api/auth/logout", null);

        (await clientB.GetAsync("/api/auth/me")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    [Trait("Category", "TokenYasamDongusu")]
    public async Task Rol_degisince_eski_token_gecersiz_olur()
    {
        var adminClient = _fabrika.CreateClient();
        var admin = await AuthHelper.AdminOlarakGirisYapAsync(adminClient);
        adminClient.TokenIle(admin.Token);

        var ogrClient = _fabrika.CreateClient();
        var ogrenci = await AuthHelper.OgrenciOlarakGirisYapAsync(ogrClient);
        ogrClient.TokenIle(ogrenci.Token);

        (await ogrClient.GetAsync("/api/auth/me")).StatusCode.Should().Be(HttpStatusCode.OK);

        // Admin, öğrencinin rolünü değiştirir
        var res = await adminClient.PutAsJsonAsync(
            $"/api/admin/users/{ogrenci.UserId}/role", new { role = "teacher" });
        res.StatusCode.Should().Be(HttpStatusCode.OK);

        // Öğrencinin ESKİ token'ı artık geçersiz olmalı
        (await ogrClient.GetAsync("/api/auth/me")).StatusCode
            .Should().Be(HttpStatusCode.Unauthorized,
                "rol değişince eski rolü taşıyan token kesilmeli");
    }

    [Fact]
    [Trait("Category", "TokenYasamDongusu")]
    public async Task Silinen_kullanicinin_tokeni_gecersiz_olur()
    {
        var adminClient = _fabrika.CreateClient();
        var admin = await AuthHelper.AdminOlarakGirisYapAsync(adminClient);
        adminClient.TokenIle(admin.Token);

        var ogrClient = _fabrika.CreateClient();
        var ogrenci = await AuthHelper.OgrenciOlarakGirisYapAsync(ogrClient);
        ogrClient.TokenIle(ogrenci.Token);

        (await ogrClient.GetAsync("/api/auth/me")).StatusCode.Should().Be(HttpStatusCode.OK);

        (await adminClient.DeleteAsync($"/api/admin/users/{ogrenci.UserId}")).StatusCode
            .Should().Be(HttpStatusCode.OK);

        (await ogrClient.GetAsync("/api/auth/me")).StatusCode
            .Should().Be(HttpStatusCode.Unauthorized,
                "silinen kullanıcının tokenı anında geçersiz olmalı");
    }

    [Fact]
    [Trait("Category", "TokenYasamDongusu")]
    public async Task Authorization_basligi_cookieyi_ezer()
    {
        // A kullanıcısının cookie'si + B kullanıcısının Bearer token'ı → B dönmeli.
        var kurulum = _fabrika.CreateClient();
        var a = await AuthHelper.OgrenciOlarakGirisYapAsync(kurulum, "kullanici_a");
        var b = await AuthHelper.OgrenciOlarakGirisYapAsync(kurulum, "kullanici_b");

        var client = _fabrika.CreateClient();
        var istek = new HttpRequestMessage(HttpMethod.Get, "/api/auth/me");
        istek.Headers.Add("Cookie", $"jwt_token={a.Token}");
        istek.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", b.Token);

        var yanit = await client.SendAsync(istek);
        yanit.StatusCode.Should().Be(HttpStatusCode.OK);

        var govde = await yanit.Content.ReadAsStringAsync();
        govde.Should().Contain("kullanici_b",
            "Authorization başlığı cookie'ye önceliklidir");
        govde.Should().NotContain("kullanici_a");
    }

    [Fact]
    [Trait("Category", "TokenYasamDongusu")]
    public async Task Cookie_tek_basina_calisir()
    {
        // Başlık yoksa cookie fallback'i çalışmalı (davranış korunmalı).
        var kurulum = _fabrika.CreateClient();
        var a = await AuthHelper.OgrenciOlarakGirisYapAsync(kurulum);

        var client = _fabrika.CreateClient();
        var istek = new HttpRequestMessage(HttpMethod.Get, "/api/auth/me");
        istek.Headers.Add("Cookie", $"jwt_token={a.Token}");

        (await client.SendAsync(istek)).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    [Trait("Category", "TokenYasamDongusu")]
    public async Task Logout_yaniti_yaptigi_isi_dogru_bildirir()
    {
        // Sessiz başarısızlık yasağı: mesaj gerçeği yansıtmalı.
        var client = _fabrika.CreateClient();
        var ogrenci = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(ogrenci.Token);

        var yanit = await client.PostAsync("/api/auth/logout", null);
        var govde = await yanit.Content.ReadAsStringAsync();

        yanit.StatusCode.Should().Be(HttpStatusCode.OK);
        govde.Should().Contain("sonlandırıldı");
    }

    [Fact]
    [Trait("Category", "TokenYasamDongusu")]
    public async Task Token_exp_talebi_Logoutun_okudugu_bicimde_bulunur()
    {
        // Logout, iptal kaydını token'ın KENDİ exp'ine kadar tutar.
        // exp claim'i principal üzerinde bulunamazsa sessizce 24 saatlik sabite düşer —
        // yani 1 saatlik admin tokenı 24 saat listede kalır. Bu test o sessiz düşüşü yakalar.
        var client = _fabrika.CreateClient();
        var ogrenci = await AuthHelper.OgrenciOlarakGirisYapAsync(client);

        var handler = new System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler();
        var principal = handler.ValidateToken(ogrenci.Token,
            new Microsoft.IdentityModel.Tokens.TokenValidationParameters
            {
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = new Microsoft.IdentityModel.Tokens.SymmetricSecurityKey(
                    System.Text.Encoding.UTF8.GetBytes(TestAppFactory.TestJwtKey)),
                ValidIssuer = "EnglishPlatform",
                ValidAudience = "EnglishPlatformUsers",
                ClockSkew = TimeSpan.Zero
            }, out _);

        var exp = principal.FindFirst(
            System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Exp)?.Value;

        exp.Should().NotBeNullOrEmpty("Logout iptal süresini bu claim'den okuyor");
        long.TryParse(exp, out var expSec).Should().BeTrue();
        DateTimeOffset.FromUnixTimeSeconds(expSec).UtcDateTime
            .Should().BeAfter(DateTime.UtcNow, "yeni alınan token'ın exp'i gelecekte olmalı");
    }
}
