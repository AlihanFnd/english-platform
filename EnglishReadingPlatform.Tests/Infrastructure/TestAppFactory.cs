using EnglishReadingPlatform.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Xunit;

namespace EnglishReadingPlatform.Tests.Infrastructure;

/// <summary>
/// Testler için uygulama örneği.
/// Pazarlıksız madde 4: gerçek veritabanına ASLA yazmaz — englishreadingdb_test kullanır.
/// Şema, gerçek migration'larla üretilir (InMemory sağlayıcı DEĞİL) çünkü
/// varchar(n) taşması gibi PostgreSQL'e özgü davranışlar test edilebilmeli.
///
/// KURAL-02: Burada hiçbir sır gömülü değildir. Veritabanı şifresi ortamdan
/// gelir; testlere özel yönetici hesabı da sızmış tohum hesabı değil,
/// Seed:AdminEmail/Seed:AdminPassword üzerinden oluşturulan hesaptır.
/// </summary>
public class TestAppFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    public const string TestJwtKey = "TEST_ONLY_KEY_do_not_use_in_production_32+chars!!";

    /// <summary>Testlerin kullandığı yönetici — üretimdeki hiçbir hesapla ilgisi yok.</summary>
    public const string TestAdminEmail    = "test-yonetici@test.local";
    public const string TestAdminPassword = "TEST_ONLY_ADMIN_PW_do_not_use!!";

    /// <summary>
    /// Bağlantı dizesi sırası: TEST_DB_CONNECTION → TEST_DB_PASSWORD → .env.test.local
    /// Hiçbiri yoksa açık bir hata verir. Koda gömülü şifre YOKTUR:
    /// eskiden buradaki varsayılan, sürüm kontrolüne sızmış DB şifresini taşıyordu.
    /// </summary>
    private static string ConnectionString
    {
        get
        {
            var tam = Environment.GetEnvironmentVariable("TEST_DB_CONNECTION");
            if (!string.IsNullOrWhiteSpace(tam)) return tam;

            var sifre = Environment.GetEnvironmentVariable("TEST_DB_PASSWORD")
                        ?? YerelDosyadanOku("TEST_DB_PASSWORD");

            if (string.IsNullOrWhiteSpace(sifre))
                throw new InvalidOperationException(
                    "Test veritabanı sırrı bulunamadı.\n" +
                    "Çözüm: proje kökünde  bash scripts/dev/test-rolu-kur.sh  çalıştırın " +
                    "(.env.test.local üretir), ya da TEST_DB_CONNECTION ortam değişkenini ayarlayın.");

            return $"Host=localhost;Database=englishreadingdb_test;Username=linguza_test;Password={sifre}";
        }
    }

    /// <summary>Proje kökündeki .gitignore'lu .env.test.local dosyasından tek bir anahtarı okur.</summary>
    private static string? YerelDosyadanOku(string anahtar)
    {
        var dizin = AppContext.BaseDirectory;
        for (var i = 0; i < 8 && dizin is not null; i++)
        {
            var yol = Path.Combine(dizin, ".env.test.local");
            if (File.Exists(yol))
                foreach (var satir in File.ReadAllLines(yol))
                {
                    var kirpik = satir.Trim();
                    if (kirpik.StartsWith('#') || !kirpik.StartsWith(anahtar + "=")) continue;
                    return kirpik[(anahtar.Length + 1)..].Trim().Trim('"');
                }
            dizin = Directory.GetParent(dizin)?.FullName;
        }
        return null;
    }

    /// <summary>
    /// Sırları SÜREÇ ORTAMINA yazar.
    ///
    /// NEDEN ConfigureAppConfiguration yetmiyor: Program.cs minimal hosting
    /// kullanıyor ve SirDogrulayici, builder.Build() ÇAĞRILMADAN önce
    /// builder.Configuration'ı okuyor. WebApplicationFactory'nin
    /// ConfigureAppConfiguration çağrıları ise ancak Build() sırasında
    /// uygulanıyor — yani doğrulayıcı onları göremiyor.
    ///
    /// Ortam değişkeni bu sırayı atlar: WebApplication.CreateBuilder,
    /// AddEnvironmentVariables()'ı en baştan ekliyor. Böylece üretim kodunda
    /// hiçbir değişiklik yapmadan, doğrulayıcının fail-fast davranışı da
    /// bozulmadan testler kendi sırlarını verebiliyor.
    /// </summary>
    static TestAppFactory()
    {
        Environment.SetEnvironmentVariable("Jwt__Key", TestJwtKey);
        Environment.SetEnvironmentVariable("Jwt__Issuer", "EnglishPlatform");
        Environment.SetEnvironmentVariable("Jwt__Audience", "EnglishPlatformUsers");
        Environment.SetEnvironmentVariable("ConnectionStrings__Default", ConnectionString);
        Environment.SetEnvironmentVariable("Seed__AdminEmail", TestAdminEmail);
        Environment.SetEnvironmentVariable("Seed__AdminPassword", TestAdminPassword);
        Environment.SetEnvironmentVariable("Groq__ApiKey", "");
        Environment.SetEnvironmentVariable("CorsOrigins", "http://localhost:3000");
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");

        builder.ConfigureAppConfiguration((_, config) =>
        {
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:Default"] = ConnectionString,
                ["Jwt:Key"]      = TestJwtKey,
                ["Jwt:Issuer"]   = "EnglishPlatform",
                ["Jwt:Audience"] = "EnglishPlatformUsers",
                ["Groq:ApiKey"]  = "",          // testlerde dış API çağrısı yapılmasın
                ["CorsOrigins"]  = "http://localhost:3000",
                // KURAL-02: yönetici artık ortamdan tohumlanıyor.
                ["Seed:AdminEmail"]    = TestAdminEmail,
                ["Seed:AdminPassword"] = TestAdminPassword,
            });
        });

        // Testlere özel istemci IP'si ara katmanı. Üretim kodunu değiştirmez;
        // IP tabanlı hız sınırlarının testler arasında çakışmasını önler.
        builder.ConfigureTestServices(services =>
        {
            services.AddSingleton<IStartupFilter, TestIstemciIpFiltresi>();
        });
    }

    public async Task InitializeAsync()
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.Database.EnsureDeletedAsync();   // her koşuda temiz şema klonu
        await db.Database.MigrateAsync();

        // Program.cs'teki tohumlama, fabrika kurulurken zaten çalıştı; ama o an
        // şema EnsureDeleted ile silindi. Temiz şema üzerinde tekrar tohumla.
        var logger = scope.ServiceProvider
            .GetRequiredService<ILoggerFactory>().CreateLogger("TestTohum");
        var cfg = scope.ServiceProvider.GetRequiredService<IConfiguration>();
        await YoneticiTohumlayici.TohumlaAsync(db, cfg, logger);
    }

    public new async Task DisposeAsync()
    {
        await base.DisposeAsync();
    }
}

[CollectionDefinition("api")]
public class ApiCollection : ICollectionFixture<TestAppFactory> { }
