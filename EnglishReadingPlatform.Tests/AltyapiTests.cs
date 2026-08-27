using System.Net;
using EnglishReadingPlatform.Tests.Infrastructure;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace EnglishReadingPlatform.Tests;

[Collection("api")]
public class AltyapiTests
{
    private readonly TestAppFactory _fabrika;
    public AltyapiTests(TestAppFactory fabrika) => _fabrika = fabrika;

    [Fact]
    [Trait("Category", "Altyapi")]
    public async Task Uygulama_ayaga_kalkiyor_ve_korumali_uc_401_donuyor()
    {
        var client = _fabrika.CreateClient();
        var yanit = await client.GetAsync("/api/books");
        yanit.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    [Trait("Category", "Altyapi")]
    public async Task Ogrenci_kaydolup_token_alabiliyor()
    {
        var client = _fabrika.CreateClient();
        var sonuc = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        sonuc.Token.Should().NotBeNullOrWhiteSpace();
        sonuc.Role.Should().Be("student");
    }

    [Fact]
    [Trait("Category", "Altyapi")]
    public async Task Hiz_siniri_testleri_kirmadan_cok_sayida_hesap_acilabiliyor()
    {
        // Uygulama kayıt ucunda IP başına dakikada 5 istek sınırı uyguluyor.
        // TestServer altında bütün istekler aynı adresten gelir; AuthHelper her
        // hesap için ayrı bir test IP'si göndermeseydi 6. hesap 429 alır ve
        // sonraki kuralların çok kullanıcılı testleri kurulamazdı.
        var client = _fabrika.CreateClient();

        var acilanlar = new List<int>();
        for (var i = 0; i < 8; i++)
        {
            var sonuc = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
            acilanlar.Add(sonuc.UserId);
        }

        acilanlar.Should().HaveCount(8);
        acilanlar.Should().OnlyHaveUniqueItems();
    }

    [Fact]
    [Trait("Category", "Altyapi")]
    public async Task Test_veritabani_gercek_veritabani_DEGIL()
    {
        // Pazarlıksız madde 4'ün otomatik kontrolü.
        using var scope = _fabrika.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<EnglishReadingPlatform.Data.AppDbContext>();
        var baglanti = db.Database.GetConnectionString() ?? "";
        baglanti.Should().Contain("englishreadingdb_test");
        baglanti.Should().NotContain("Database=englishreadingdb;");
    }
}
