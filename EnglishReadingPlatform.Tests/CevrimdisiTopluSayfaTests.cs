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
/// YH-13: Çevrimdışı okuma için toplu sayfa ucu (GET /api/books/{id}/sayfalar?bas=1&son=50).
/// Salt okunurdur. İlerleme YAZMAZ, LLM çağırmaz / analiz ÜRETMET (KURAL-17).
/// </summary>
[Collection("api")]
public class CevrimdisiTopluSayfaTests
{
    private readonly TestAppFactory _fabrika;
    public CevrimdisiTopluSayfaTests(TestAppFactory fabrika) => _fabrika = fabrika;

    private async Task<HttpClient> OgrenciIstemcisiAlAsync()
    {
        var client = _fabrika.CreateClient();
        var res = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(res.Token);
        return client;
    }

    private async Task<int> TestKitabiOlusturAsync(int sayfaSayisi)
    {
        using var kapsam = _fabrika.Services.CreateScope();
        var db = kapsam.ServiceProvider.GetRequiredService<AppDbContext>();

        var kitap = new Book { Title = $"Toplu {Guid.NewGuid():N}"[..18], Author = "Test" };
        db.Books.Add(kitap);
        await db.SaveChangesAsync();

        db.BookPages.AddRange(Enumerable.Range(1, sayfaSayisi).Select(n => new BookPage
        {
            BookId = kitap.Id,
            PageNumber = n,
            Content = $"Cevrimdisi sayfa {n} icerigi.",
            SentencesJson = n % 2 == 1 ? "[{\"original\":\"Sentence.\"}]" : "",
        }));
        await db.SaveChangesAsync();
        return kitap.Id;
    }

    [Fact]
    [Trait("Category", "TopluSayfa")]
    public async Task Toplu_sayfa_ucu_ANALIZ_URETMEZ()
    {
        var c = await OgrenciIstemcisiAlAsync();
        var kitapId = await TestKitabiOlusturAsync(5);

        var res = await c.GetAsync($"/api/books/{kitapId}/sayfalar?bas=1&son=5");
        res.StatusCode.Should().Be(HttpStatusCode.OK);

        var json = await res.Content.ReadFromJsonAsync<JsonElement>();
        json.ValueKind.Should().Be(JsonValueKind.Array);
        json.GetArrayLength().Should().Be(5);

        // analizBekliyor bayrağı kontrolü
        var ilkSayfa = json[0];
        ilkSayfa.GetProperty("pageNumber").GetInt32().Should().Be(1);
        ilkSayfa.GetProperty("analizBekliyor").GetBoolean().Should().BeFalse();

        var ikinciSayfa = json[1];
        ikinciSayfa.GetProperty("pageNumber").GetInt32().Should().Be(2);
        ikinciSayfa.GetProperty("analizBekliyor").GetBoolean().Should().BeTrue();
    }

    [Fact]
    [Trait("Category", "TopluSayfa")]
    public async Task Toplu_sayfa_ucu_YAZMAZ()
    {
        var client = _fabrika.CreateClient();
        var authRes = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(authRes.Token);

        var kitapId = await TestKitabiOlusturAsync(10);

        var res = await client.GetAsync($"/api/books/{kitapId}/sayfalar?bas=1&son=10");
        res.StatusCode.Should().Be(HttpStatusCode.OK);

        // İlerleme kaydı oluşturulmamalıdır (salt okunur)
        using var kapsam = _fabrika.Services.CreateScope();
        var db = kapsam.ServiceProvider.GetRequiredService<AppDbContext>();

        var ilerleme = await db.ReadingProgresses
            .FirstOrDefaultAsync(p => p.UserId == authRes.UserId && p.BookId == kitapId);

        ilerleme.Should().BeNull();
    }

    [Fact]
    [Trait("Category", "TopluSayfa")]
    public async Task Toplu_sayfa_SINIRI()
    {
        var c = await OgrenciIstemcisiAlAsync();
        var kitapId = await TestKitabiOlusturAsync(60);

        // 51 sayfa istemek 400 döner
        var res = await c.GetAsync($"/api/books/{kitapId}/sayfalar?bas=1&son=51");
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        // bas > son 400 döner
        var resTers = await c.GetAsync($"/api/books/{kitapId}/sayfalar?bas=10&son=5");
        resTers.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    [Trait("Category", "TopluSayfa")]
    public async Task Toplu_sayfa_olmayan_kitap_404()
    {
        var c = await OgrenciIstemcisiAlAsync();

        var res = await c.GetAsync("/api/books/999999/sayfalar?bas=1&son=10");
        res.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    /// <summary>
    /// GERÇEK VERİ BİÇİMİ: analizi henüz üretilmemiş sayfalar veritabanında "[]"
    /// (boş dizi) olarak duruyor — geliştirme verisinde 819 sayfanın 756'sı.
    /// Okuma ucu bunu "analiz bekliyor" sayıyordu; toplu uç yalnızca boş metne
    /// bakıyordu, bu yüzden analizsiz sayfalar çevrimdışına "hazır" diye iniyordu.
    /// (Yukarıdaki testler analizsiz sayfayı "" ile kurduğu için bu hiç görülmedi.)
    /// </summary>
    [Fact]
    [Trait("Category", "TopluSayfa")]
    public async Task Toplu_sayfa_ucu_BOS_DIZIYI_analiz_BEKLIYOR_sayar_ve_icerik_GONDERMEZ()
    {
        var c = await OgrenciIstemcisiAlAsync();

        int kitapId;
        using (var kapsam = _fabrika.Services.CreateScope())
        {
            var db = kapsam.ServiceProvider.GetRequiredService<AppDbContext>();
            var kitap = new Book { Title = $"BosDizi {Guid.NewGuid():N}"[..18], Author = "Test" };
            db.Books.Add(kitap);
            await db.SaveChangesAsync();
            db.BookPages.AddRange(
                new BookPage { BookId = kitap.Id, PageNumber = 1, Content = "Analizsiz sayfa.", SentencesJson = "[]" },
                new BookPage { BookId = kitap.Id, PageNumber = 2, Content = "Analizli sayfa.", SentencesJson = "[{\"original\":\"Sentence.\"}]" });
            await db.SaveChangesAsync();
            kitapId = kitap.Id;
        }

        var json = await c.GetFromJsonAsync<JsonElement>($"/api/books/{kitapId}/sayfalar?bas=1&son=2");

        json[0].GetProperty("analizBekliyor").GetBoolean().Should().BeTrue(
            "\"[]\" analizin henüz üretilmediği demektir — okuma ucuyla aynı kural");
        json[0].GetProperty("sentencesJson").ValueKind.Should().Be(JsonValueKind.Null,
            "analizi olmayan sayfa çevrimdışına hazır gibi inmemeli");

        json[1].GetProperty("analizBekliyor").GetBoolean().Should().BeFalse();
        json[1].GetProperty("sentencesJson").GetString().Should().Contain("Sentence.");
    }
}
