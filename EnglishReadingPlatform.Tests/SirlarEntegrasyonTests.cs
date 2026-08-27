using System.Net;
using System.Net.Http.Json;
using EnglishReadingPlatform.Tests.Infrastructure;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace EnglishReadingPlatform.Tests;

/// <summary>
/// KURAL-02'nin asıl kanıtı: sızmış tohum yöneticisi gerçekten çalışmıyor,
/// ortamdan tohumlanan yönetici gerçekten çalışıyor.
///
/// Şema, gerçek migration'larla kuruluyor — yani SeedAdminOrtamaTasindi
/// migration'ının etkisi burada uçtan uca ölçülüyor.
/// </summary>
[Collection("api")]
public class SirlarEntegrasyonTests
{
    private readonly TestAppFactory _fabrika;
    public SirlarEntegrasyonTests(TestAppFactory fabrika) => _fabrika = fabrika;

    private static async Task<HttpResponseMessage> GirisDeneAsync(
        HttpClient client, string email, string sifre, string ip)
    {
        using var istek = new HttpRequestMessage(HttpMethod.Post, "/api/auth/login")
        {
            Content = JsonContent.Create(new { email, password = sifre })
        };
        istek.Headers.Add(TestIstemciIpFiltresi.Baslik, ip);
        return await client.SendAsync(istek);
    }

    [Fact]
    [Trait("Category", "Sirlar")]
    public async Task Sizmis_tohum_yoneticisiyle_giris_yapilamaz()
    {
        var client = _fabrika.CreateClient();

        var yanit = await GirisDeneAsync(client, "admin@platform.com", "Admin@2026!", "10.99.0.1");

        yanit.StatusCode.Should().Be(HttpStatusCode.Unauthorized,
            "koda gömülü admin@platform.com / Admin@2026! hesabı KURAL-02 ile geçersiz kılındı");
    }

    [Fact]
    [Trait("Category", "Sirlar")]
    public async Task Sizmis_tohum_yoneticisi_veritabaninda_yok()
    {
        using var scope = _fabrika.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<EnglishReadingPlatform.Data.AppDbContext>();

        var varMi = await db.Users.AnyAsync(u => u.Email == "admin@platform.com");

        varMi.Should().BeFalse(
            "temiz şemada sızmış tohum hesabı migration tarafından kaldırılmalı");
    }

    [Fact]
    [Trait("Category", "Sirlar")]
    public async Task Ortamdan_tohumlanan_yoneticiyle_giris_yapilabilir()
    {
        var client = _fabrika.CreateClient();

        var sonuc = await AuthHelper.AdminOlarakGirisYapAsync(client);

        sonuc.Token.Should().NotBeNullOrWhiteSpace();
        sonuc.Role.Should().Be("admin");
    }

    [Fact]
    [Trait("Category", "Sirlar")]
    public async Task Tohumlama_idempotent_ikinci_calistirmada_kopya_uretmez()
    {
        using var scope = _fabrika.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<EnglishReadingPlatform.Data.AppDbContext>();
        var cfg = scope.ServiceProvider.GetRequiredService<Microsoft.Extensions.Configuration.IConfiguration>();
        var logger = scope.ServiceProvider
            .GetRequiredService<Microsoft.Extensions.Logging.ILoggerFactory>().CreateLogger("Test");

        await EnglishReadingPlatform.Data.YoneticiTohumlayici.TohumlaAsync(db, cfg, logger);
        await EnglishReadingPlatform.Data.YoneticiTohumlayici.TohumlaAsync(db, cfg, logger);

        var adet = await db.Users.CountAsync(u => u.Email == TestAppFactory.TestAdminEmail);
        adet.Should().Be(1);
    }
}
