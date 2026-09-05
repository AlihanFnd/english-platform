using System.Net;
using System.Net.Http.Json;
using EnglishReadingPlatform.Data;
using EnglishReadingPlatform.Models;
using EnglishReadingPlatform.Security;
using EnglishReadingPlatform.Tests.Infrastructure;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace EnglishReadingPlatform.Tests;

/// <summary>
/// KURAL-18 sözleşme testleri — şifre saklama parametreleri.
///
/// Bu dosya silinir ya da içindeki testlerden biri kaldırılırsa
/// scripts/guard/18-tedarik.sh kırmızı verir.
/// </summary>
[Collection("api")]
public class SifreHashlemeTests
{
    private readonly TestAppFactory _fabrika;
    public SifreHashlemeTests(TestAppFactory fabrika) => _fabrika = fabrika;

    [Fact]
    [Trait("Category", "Tedarik")]
    public void Is_faktoru_asgari_12()
    {
        SifreHashleme.IsFaktoru.Should().BeGreaterThanOrEqualTo(12,
            "2026 önerisi ≥ 12; düşürmek sessiz bir zayıflatmadır");
    }

    /// <summary>
    /// TUZAK KONTROLÜ: "sabiti değiştirdim, iş bitti" yanılgısı.
    ///
    /// Sabiti 12 yapıp çağrıda <c>HashPassword(sifre)</c> bırakmak, kütüphane
    /// varsayılanını (11) sürdürür — sabit yalan söyler. Bu test ÜRETİLEN
    /// hash'e bakar, sabite değil.
    /// </summary>
    [Fact]
    [Trait("Category", "Tedarik")]
    public void Uretilen_hash_dogru_is_faktorunu_TASIR()
    {
        var hash = SifreHashleme.Hashle("TestSifre123!");

        hash.Split('$')[2].Should().Be(SifreHashleme.IsFaktoru.ToString("D2"),
            "sabit ile ÜRETİLEN hash aynı olmalı — sabiti değiştirip " +
            "çağrıyı unutmak sessizce eski faktörü sürdürür");
    }

    [Fact]
    [Trait("Category", "Tedarik")]
    public void Eski_faktorlu_hash_YENILENMELI_isaretlenir()
    {
        var eski = BCrypt.Net.BCrypt.HashPassword("x", 10);
        SifreHashleme.YenilenmeliMi(eski).Should().BeTrue();

        var yeni = SifreHashleme.Hashle("x");
        SifreHashleme.YenilenmeliMi(yeni).Should().BeFalse(
            "yeni üretilen hash asla 'eski' sayılmamalı — sayılsaydı her giriş " +
            "gereksiz bir yazma yapardı");
    }

    /// <summary>
    /// Tanınmayan biçim "eski" SAYILMAZ. Aksi hâlde bozuk bir hash her
    /// girişte yeniden yazılır ve hata sessizce çoğalır.
    /// </summary>
    [Fact]
    [Trait("Category", "Tedarik")]
    public void Taninmayan_hash_bicimi_YENILENMELI_sayilmaz()
    {
        SifreHashleme.YenilenmeliMi("").Should().BeFalse();
        SifreHashleme.YenilenmeliMi("bu-bir-hash-degil").Should().BeFalse();
        SifreHashleme.YenilenmeliMi(null).Should().BeFalse();
    }

    /// <summary>
    /// ANA REGRESYON: eski hash'li kullanıcı giriş yapınca hash GÜÇLENMELİ —
    /// ve giriş de BAŞARILI olmalı.
    ///
    /// Bu testsiz kural "yapıldı" görünür ama mevcut hesapların hiçbirini
    /// korumaz: bcrypt tek yönlü olduğu için toplu migration imkânsızdır,
    /// kademeli yenileme TEK yoldur.
    /// </summary>
    [Fact]
    [Trait("Category", "Tedarik")]
    public async Task Giriste_eski_hash_sessizce_GUCLENDIRILIR()
    {
        const string sifre = "TestSifre123!";
        var ek = Guid.NewGuid().ToString("N")[..8];
        var eposta = $"eh_{ek}@test.local";
        int kullaniciId;

        using (var kapsam = _fabrika.Services.CreateScope())
        {
            var db = kapsam.ServiceProvider.GetRequiredService<AppDbContext>();
            var k = new User
            {
                Username     = $"eh_{ek}",
                Email        = eposta,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(sifre, 10),   // ESKİ faktör
                Role         = "student",
                CreatedAt    = DateTime.UtcNow,
            };
            db.Users.Add(k);
            await db.SaveChangesAsync();
            kullaniciId = k.Id;
        }

        var giris = await _fabrika.CreateClient()
            .PostAsJsonAsync("/api/auth/login", new { email = eposta, password = sifre });

        giris.StatusCode.Should().Be(HttpStatusCode.OK,
            "eski hash'le giriş HÂLÂ çalışmalı — güçlendirme kullanıcıyı dışarıda bırakamaz");

        using (var kapsam = _fabrika.Services.CreateScope())
        {
            var db = kapsam.ServiceProvider.GetRequiredService<AppDbContext>();
            var guncel = await db.Users.AsNoTracking().FirstAsync(u => u.Id == kullaniciId);

            SifreHashleme.YenilenmeliMi(guncel.PasswordHash).Should().BeFalse(
                "başarılı girişte hash yeni iş faktörüne taşınmalı");
            guncel.PasswordHash.Split('$')[2].Should().Be(
                SifreHashleme.IsFaktoru.ToString("D2"));
        }
    }

    /// <summary>
    /// TUZAK KONTROLÜ: güçlendirme şifreyi BOZMAMALI.
    /// Yeniden hash'lerken yanlış girdi kullanmak (ör. hash'i hash'lemek)
    /// kullanıcıyı hesabından kalıcı olarak kilitler — ve bu, ilk girişte
    /// değil İKİNCİ girişte ortaya çıkar.
    /// </summary>
    [Fact]
    [Trait("Category", "Tedarik")]
    public async Task Guclendirmeden_SONRA_ayni_sifreyle_tekrar_girilebilir()
    {
        const string sifre = "TestSifre123!";
        var ek = Guid.NewGuid().ToString("N")[..8];
        var eposta = $"eh2_{ek}@test.local";

        using (var kapsam = _fabrika.Services.CreateScope())
        {
            var db = kapsam.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Users.Add(new User
            {
                Username     = $"eh2_{ek}",
                Email        = eposta,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(sifre, 10),
                Role         = "student",
                CreatedAt    = DateTime.UtcNow,
            });
            await db.SaveChangesAsync();
        }

        var client = _fabrika.CreateClient();
        (await client.PostAsJsonAsync("/api/auth/login", new { email = eposta, password = sifre }))
            .StatusCode.Should().Be(HttpStatusCode.OK, "birinci giriş (güçlendirme burada olur)");

        (await client.PostAsJsonAsync("/api/auth/login", new { email = eposta, password = sifre }))
            .StatusCode.Should().Be(HttpStatusCode.OK,
                "güçlendirmeden SONRA aynı şifre çalışmalı — aksi hâlde kullanıcı " +
                "hesabına bir daha giremez ve sebebi hiç anlaşılmaz");
    }

    /// <summary>
    /// Sahte hash (zamanlama eşitleyici) de merkezden üretilmeli.
    ///
    /// Merkez dışında ve daha DÜŞÜK bir faktörle üretilseydi, "kullanıcı yok"
    /// dalı ölçülebilir biçimde daha hızlı biterdi ve KURAL-09'un kapattığı
    /// enumerasyon zamanlama üzerinden geri gelirdi.
    /// </summary>
    [Fact]
    [Trait("Category", "Tedarik")]
    public void Tum_hash_uretimi_MERKEZDEN_gecer()
    {
        var kok = ProjeKoku();
        var ihlaller = new List<string>();

        foreach (var yol in Directory.GetFiles(Path.Combine(kok, "EnglishReadingPlatform"),
                                               "*.cs", SearchOption.AllDirectories))
        {
            if (Path.GetFileName(yol) == "SifreHashleme.cs") continue;

            var satirlar = File.ReadAllLines(yol);
            for (var i = 0; i < satirlar.Length; i++)
            {
                if (satirlar[i].TrimStart().StartsWith("//")) continue;
                if (satirlar[i].Contains("BCrypt.Net.BCrypt."))
                    ihlaller.Add($"{Path.GetFileName(yol)}:{i + 1}");
            }
        }

        ihlaller.Should().BeEmpty(
            "tüm hash üretimi ve doğrulaması SifreHashleme üzerinden geçmeli — " +
            "sahte hash (zamanlama eşitleyici) dâhil");
    }

    private static string ProjeKoku()
    {
        var dizin = AppContext.BaseDirectory;
        for (var i = 0; i < 8 && dizin is not null; i++)
        {
            if (File.Exists(Path.Combine(dizin, "Linguza.sln"))) return dizin;
            dizin = Directory.GetParent(dizin)?.FullName;
        }
        throw new InvalidOperationException("Proje kökü bulunamadı (Linguza.sln).");
    }
}
