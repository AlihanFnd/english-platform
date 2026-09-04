using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using EnglishReadingPlatform.Data;
using EnglishReadingPlatform.Models;
using EnglishReadingPlatform.Tests.Infrastructure;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace EnglishReadingPlatform.Tests;

/// <summary>
/// Kitapta kaldığı yerden devam.
///
/// İlerleme KURAL-12'den beri kaydediliyordu ama hiç OKUNMUYORDU: okuma ucu
/// 'page' ve 'chapter' için 1 varsayılanı kullanıyordu. 300 sayfalık bir kitabı
/// 120. sayfada bırakan kullanıcı, kitabı her açtığında 1. sayfayı görüyordu.
/// </summary>
[Collection("api")]
public class OkumaDevamTests
{
    private readonly TestAppFactory _fabrika;
    public OkumaDevamTests(TestAppFactory fabrika) => _fabrika = fabrika;

    private sealed record SayfaYaniti(bool HasPages, int TotalPages, int PageNumber);
    private sealed record BolumYaniti(bool HasPages, int TotalChapters, int ChapterNumber);

    /// <summary>Sayfa modunda bir kitap üretir (BookPage taşır).</summary>
    private async Task<int> SayfaliKitapAcAsync(int sayfaSayisi)
    {
        using var kapsam = _fabrika.Services.CreateScope();
        var db = kapsam.ServiceProvider.GetRequiredService<AppDbContext>();

        var kitap = new Book { Title = $"Devam {Guid.NewGuid():N}"[..20], Author = "t" };
        db.Books.Add(kitap);
        await db.SaveChangesAsync();

        db.BookPages.AddRange(Enumerable.Range(1, sayfaSayisi).Select(n => new BookPage
        {
            BookId = kitap.Id,
            PageNumber = n,
            Content = $"Sayfa {n} icerigi.",
            SentencesJson = "[]",   // JIT analiz tetiklenmesin: Groq testte kapalı
        }));
        await db.SaveChangesAsync();
        return kitap.Id;
    }

    private static async Task<SayfaYaniti> SayfaOkuAsync(HttpClient c, int kitapId, int? sayfa = null)
    {
        var yol = sayfa is null ? $"/api/books/{kitapId}/read" : $"/api/books/{kitapId}/read?page={sayfa}";
        var yanit = await c.GetAsync(yol);
        yanit.EnsureSuccessStatusCode();
        return (await yanit.Content.ReadFromJsonAsync<SayfaYaniti>())!;
    }

    // ══════════════════════════════════════════════════════════════

    /// <summary>ANA REGRESYON: konum verilmezse kaldığı yerden devam etmeli.</summary>
    [Fact]
    [Trait("Category", "OkumaDevam")]
    public async Task Konum_verilmezse_KALDIGI_YERDEN_devam_eder()
    {
        var client = _fabrika.CreateClient();
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(o.Token);

        var kitapId = await SayfaliKitapAcAsync(10);

        // 7. sayfaya kadar oku
        (await SayfaOkuAsync(client, kitapId, 7)).PageNumber.Should().Be(7);

        // Kitabı konum belirtmeden yeniden aç
        var yeniden = await SayfaOkuAsync(client, kitapId);

        yeniden.PageNumber.Should().Be(7,
            "ilerleme kaydediliyordu ama okunmuyordu — kitap her açılışta baştan başlıyordu");
    }

    [Fact]
    [Trait("Category", "OkumaDevam")]
    public async Task Acikca_verilen_konum_kayitli_olani_EZER()
    {
        var client = _fabrika.CreateClient();
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(o.Token);

        var kitapId = await SayfaliKitapAcAsync(10);
        await SayfaOkuAsync(client, kitapId, 7);

        (await SayfaOkuAsync(client, kitapId, 2)).PageNumber.Should().Be(2,
            "kullanıcı bir sayfaya açıkça gitmek istediyse ona saygı gösterilmeli");
    }

    [Fact]
    [Trait("Category", "OkumaDevam")]
    public async Task Hic_okunmamis_kitap_ILK_sayfadan_baslar()
    {
        var client = _fabrika.CreateClient();
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(o.Token);

        var kitapId = await SayfaliKitapAcAsync(5);

        (await SayfaOkuAsync(client, kitapId)).PageNumber.Should().Be(1);
    }

    /// <summary>
    /// Kitap yeniden yüklenip KISALDIYSA kayıtlı konum artık yok.
    ///
    /// Kırpma olmadan da kod çökmüyor — bulunamayan sayfa için İLK sayfaya
    /// düşüyor. Ama 9. sayfada bırakan birini 1. sayfaya atmak, ilerlemeyi
    /// sessizce silmektir. Doğrusu SON sayfaya kırpmaktır: okuduğu yere en
    /// yakın nokta orasıdır.
    ///
    /// İddia bilerek KESİN (Be(3)): "1'e düşse de geçer" biçiminde gevşek
    /// yazılsaydı, kırpmayı kaldıran bir değişiklik testi kırmazdı —
    /// ölçmeyen bir test olurdu (mutasyonla ortaya çıktı).
    /// </summary>
    [Fact]
    [Trait("Category", "OkumaDevam")]
    public async Task Kitap_kisaldiysa_kayitli_konum_KIRPILIR()
    {
        var client = _fabrika.CreateClient();
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(o.Token);

        var kitapId = await SayfaliKitapAcAsync(10);
        await SayfaOkuAsync(client, kitapId, 9);

        // Kitap 3 sayfaya düşürülür (yeniden yükleme senaryosu)
        using (var kapsam = _fabrika.Services.CreateScope())
        {
            var db = kapsam.ServiceProvider.GetRequiredService<AppDbContext>();
            var fazlalik = await db.BookPages
                .Where(p => p.BookId == kitapId && p.PageNumber > 3).ToListAsync();
            db.BookPages.RemoveRange(fazlalik);
            await db.SaveChangesAsync();
        }

        var yanit = await SayfaOkuAsync(client, kitapId);

        yanit.PageNumber.Should().Be(3,
            "sınır dışı kayıtlı konum SON sayfaya kırpılmalı — ilk sayfaya " +
            "düşmek kullanıcının ilerlemesini sessizce silmek olur");
    }

    /// <summary>
    /// Kaldığı yer KULLANICIYA ÖZELDİR. A'nın ilerlemesi B'yi etkilememeli.
    /// </summary>
    [Fact]
    [Trait("Category", "OkumaDevam")]
    public async Task Kaldigi_yer_KULLANICIYA_ozeldir()
    {
        var aClient = _fabrika.CreateClient();
        var a = await AuthHelper.OgrenciOlarakGirisYapAsync(aClient);
        aClient.TokenIle(a.Token);

        var bClient = _fabrika.CreateClient();
        var b = await AuthHelper.OgrenciOlarakGirisYapAsync(bClient);
        bClient.TokenIle(b.Token);

        var kitapId = await SayfaliKitapAcAsync(10);

        await SayfaOkuAsync(aClient, kitapId, 8);

        (await SayfaOkuAsync(bClient, kitapId)).PageNumber.Should().Be(1,
            "başkasının ilerlemesi bizim kitabımızı ortadan açmamalı");
    }

    [Theory]
    [Trait("Category", "OkumaDevam")]
    [InlineData(0)]
    [InlineData(-3)]
    public async Task Gecersiz_sayfa_numarasi_REDDEDILIR(int sayfa)
    {
        var client = _fabrika.CreateClient();
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(o.Token);

        var kitapId = await SayfaliKitapAcAsync(3);

        (await client.GetAsync($"/api/books/{kitapId}/read?page={sayfa}"))
            .StatusCode.Should().Be(HttpStatusCode.BadRequest,
                "nullable yapmak girdi doğrulamasını GEVŞETMEMELİ");
    }

    /// <summary>
    /// KURAL-12 regresyonu: devam mantığı ilerleme satırını çoğaltmamalı.
    /// </summary>
    [Fact]
    [Trait("Category", "OkumaDevam")]
    public async Task Devam_etmek_ILERLEME_satirini_cogaltmaz()
    {
        var client = _fabrika.CreateClient();
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(o.Token);

        var kitapId = await SayfaliKitapAcAsync(5);

        await SayfaOkuAsync(client, kitapId, 3);
        await SayfaOkuAsync(client, kitapId);
        await SayfaOkuAsync(client, kitapId);

        using var kapsam = _fabrika.Services.CreateScope();
        var db = kapsam.ServiceProvider.GetRequiredService<AppDbContext>();
        (await db.ReadingProgresses.CountAsync(p => p.UserId == o.UserId && p.BookId == kitapId))
            .Should().Be(1);
    }
}
