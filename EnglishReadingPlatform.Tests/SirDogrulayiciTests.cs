using EnglishReadingPlatform.Configuration;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace EnglishReadingPlatform.Tests;

/// <summary>
/// KURAL-02: Sır doğrulayıcısının birim testleri. Veritabanı gerekmez.
/// </summary>
public class SirDogrulayiciTests
{
    private static IConfiguration Yapilandir(params (string, string?)[] degerler) =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(degerler.ToDictionary(d => d.Item1, d => d.Item2))
            .Build();

    private sealed class SahteOrtam : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Production";
        public string ApplicationName { get; set; } = "Test";
        public string ContentRootPath { get; set; } = ".";
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } = null!;
    }

    private const string GecerliAnahtar  = "bu_anahtar_test_icindir_ve_32_karakterden_uzundur";
    private const string GecerliBaglanti = "Host=localhost;Database=x;Username=u;Password=p";

    [Fact]
    [Trait("Category", "Sirlar")]
    public void Jwt_anahtari_yoksa_uygulama_baslamaz()
    {
        var cfg = Yapilandir(
            ("ConnectionStrings:Default", GecerliBaglanti),
            ("Jwt:Issuer", "i"), ("Jwt:Audience", "a"));

        var eylem = () => SirDogrulayici.Dogrula(cfg, new SahteOrtam());

        eylem.Should().Throw<InvalidOperationException>()
             .WithMessage("*Jwt:Key tanımlı değil*");
    }

    [Fact]
    [Trait("Category", "Sirlar")]
    public void Jwt_anahtari_kisaysa_uygulama_baslamaz()
    {
        var cfg = Yapilandir(
            ("Jwt:Key", "kisa"),
            ("ConnectionStrings:Default", GecerliBaglanti),
            ("Jwt:Issuer", "i"), ("Jwt:Audience", "a"));

        var eylem = () => SirDogrulayici.Dogrula(cfg, new SahteOrtam());

        eylem.Should().Throw<InvalidOperationException>()
             .WithMessage("*en az 32 karakter*");
    }

    [Theory]
    [Trait("Category", "Sirlar")]
    [InlineData("EnglishPlatformSuperSecretKey2026_MustBe32Chars!!")]
    [InlineData("SuperSecretKey_ChangeInProduction_32chars!")]
    public void Sizmis_anahtar_reddedilir(string sizmisAnahtar)
    {
        var cfg = Yapilandir(
            ("Jwt:Key", sizmisAnahtar),
            ("ConnectionStrings:Default", GecerliBaglanti),
            ("Jwt:Issuer", "i"), ("Jwt:Audience", "a"));

        var eylem = () => SirDogrulayici.Dogrula(cfg, new SahteOrtam());

        eylem.Should().Throw<InvalidOperationException>()
             .WithMessage("*sürüm kontrolüne sızmış*");
    }

    [Fact]
    [Trait("Category", "Sirlar")]
    public void Sizmis_db_sifresi_reddedilir()
    {
        var cfg = Yapilandir(
            ("Jwt:Key", GecerliAnahtar),
            ("ConnectionStrings:Default", "Host=localhost;Database=x;Username=u;Password=StrongPass@2026!"),
            ("Jwt:Issuer", "i"), ("Jwt:Audience", "a"));

        var eylem = () => SirDogrulayici.Dogrula(cfg, new SahteOrtam());

        eylem.Should().Throw<InvalidOperationException>()
             .WithMessage("*sızmış bir şifre*");
    }

    [Fact]
    [Trait("Category", "Sirlar")]
    public void Sizmis_tohum_yonetici_sifresi_reddedilir()
    {
        var cfg = Yapilandir(
            ("Jwt:Key", GecerliAnahtar),
            ("ConnectionStrings:Default", GecerliBaglanti),
            ("Jwt:Issuer", "i"), ("Jwt:Audience", "a"),
            ("Seed:AdminPassword", "Admin@2026!"));

        var eylem = () => SirDogrulayici.Dogrula(cfg, new SahteOrtam());

        eylem.Should().Throw<InvalidOperationException>()
             .WithMessage("*Seed:AdminPassword sürüm kontrolüne sızmış*");
    }

    [Fact]
    [Trait("Category", "Sirlar")]
    public void Baglanti_dizesi_yoksa_uygulama_baslamaz()
    {
        var cfg = Yapilandir(
            ("Jwt:Key", GecerliAnahtar),
            ("Jwt:Issuer", "i"), ("Jwt:Audience", "a"));

        var eylem = () => SirDogrulayici.Dogrula(cfg, new SahteOrtam());

        eylem.Should().Throw<InvalidOperationException>()
             .WithMessage("*ConnectionStrings:Default tanımlı değil*");
    }

    [Fact]
    [Trait("Category", "Sirlar")]
    public void Uretimde_Include_Error_Detail_reddedilir()
    {
        var cfg = Yapilandir(
            ("Jwt:Key", GecerliAnahtar),
            ("ConnectionStrings:Default", GecerliBaglanti + ";Include Error Detail=true"),
            ("Jwt:Issuer", "i"), ("Jwt:Audience", "a"));

        var eylem = () => SirDogrulayici.Dogrula(cfg, new SahteOrtam { EnvironmentName = "Production" });

        eylem.Should().Throw<InvalidOperationException>()
             .WithMessage("*Include Error Detail*");
    }

    [Fact]
    [Trait("Category", "Sirlar")]
    public void Gelistirmede_Include_Error_Detail_kabul_edilir()
    {
        var cfg = Yapilandir(
            ("Jwt:Key", GecerliAnahtar),
            ("ConnectionStrings:Default", GecerliBaglanti + ";Include Error Detail=true"),
            ("Jwt:Issuer", "i"), ("Jwt:Audience", "a"));

        var eylem = () => SirDogrulayici.Dogrula(cfg, new SahteOrtam { EnvironmentName = "Development" });

        eylem.Should().NotThrow();
    }

    [Fact]
    [Trait("Category", "Sirlar")]
    public void Gecerli_yapilandirma_kabul_edilir()
    {
        var cfg = Yapilandir(
            ("Jwt:Key", GecerliAnahtar),
            ("ConnectionStrings:Default", GecerliBaglanti),
            ("Jwt:Issuer", "i"), ("Jwt:Audience", "a"));

        var eylem = () => SirDogrulayici.Dogrula(cfg, new SahteOrtam());

        eylem.Should().NotThrow();
    }
}
