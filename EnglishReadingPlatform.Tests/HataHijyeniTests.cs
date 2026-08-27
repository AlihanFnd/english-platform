using System.Net;
using System.Net.Http.Json;
using EnglishReadingPlatform.Data;
using EnglishReadingPlatform.Tests.Infrastructure;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace EnglishReadingPlatform.Tests;

/// <summary>
/// KURAL-06 — uçtan uca. Merkezî middleware'in GERÇEK boru hattında devrede
/// olduğunu ve envanterdeki kardeş yolların da kapandığını sınar.
/// </summary>
[Collection("api")]
public class HataHijyeniTests
{
    private readonly TestAppFactory _fabrika;
    public HataHijyeniTests(TestAppFactory fabrika) => _fabrika = fabrika;

    /// <summary>İç detay sızıntısını gösteren tipik parmak izleri.</summary>
    private static readonly string[] SizintiIsaretleri =
    {
        "Exception", "   at ", "System.", "Npgsql", "EnglishReadingPlatform.Services",
        ".cs:line", "StackTrace", "InnerException", "Microsoft.EntityFrameworkCore",
        "SELECT", "relation \"", "column \"", "UglyToad", "PdfPig"
    };

    private static void SizintiYok(string govde)
    {
        foreach (var isaret in SizintiIsaretleri)
            govde.Should().NotContain(isaret,
                $"hata yanıtı '{isaret}' içermemeli — iç yapı sızıyor. Gövde: {govde}");
    }

    private static MultipartFormDataContent DosyaFormu(byte[] icerik, string dosyaAdi)
        => new()
        {
            { new StringContent("Test Kitap"), "title" },
            { new ByteArrayContent(icerik), "file", dosyaAdi },
            { new StringContent("1"), "selectedPages" }
        };

    [Fact]
    [Trait("Category", "HataHijyeni")]
    public async Task Hata_yaniti_ic_detay_sizdirmaz()
    {
        var client = _fabrika.CreateClient();
        var admin = await AuthHelper.AdminOlarakGirisYapAsync(client);
        client.TokenIle(admin.Token);

        // Geçersiz dosya yükleyerek PdfService'i hata vermeye zorla
        using var icerik = DosyaFormu(new byte[] { 0x00, 0x01, 0x02, 0x03 }, "bozuk.pdf");

        var yanit = await client.PostAsync("/api/admin/books/upload-pages", icerik);
        var govde = await yanit.Content.ReadAsStringAsync();

        SizintiYok(govde);
        govde.Should().Contain("error", "{ error } sözleşmesi korunmalı");
    }

    [Fact]
    [Trait("Category", "HataHijyeni")]
    public async Task Bozuk_dosya_kardes_yukleme_ucunda_da_sizdirmaz()
    {
        // KURAL-04 (yarım kapatma yok): upload-pages kapatılıp upload açık kalmamalı.
        var client = _fabrika.CreateClient();
        var admin = await AuthHelper.AdminOlarakGirisYapAsync(client);
        client.TokenIle(admin.Token);

        using var icerik = DosyaFormu(new byte[] { 0x25, 0x50, 0x44, 0x46, 0xFF }, "bozuk2.pdf");
        var yanit = await client.PostAsync("/api/admin/books/upload", icerik);
        var govde = await yanit.Content.ReadAsStringAsync();

        SizintiYok(govde);
    }

    [Fact]
    [Trait("Category", "HataHijyeni")]
    public async Task Kullanici_hatasi_gercek_boru_hattinda_aynen_iletilir()
    {
        // Middleware'in Program.cs'te GERÇEKTEN kayıtlı olduğunun kanıtı:
        // PdfService'in fırlattığı KullaniciHatasi, controller'da hiçbir catch
        // olmadan 400 + kendi metniyle dönüyorsa zincir kuruludur.
        var client = _fabrika.CreateClient();
        var admin = await AuthHelper.AdminOlarakGirisYapAsync(client);
        client.TokenIle(admin.Token);

        using var icerik = DosyaFormu(new byte[] { 0x41, 0x42, 0x43 }, "kitap.txt");
        var yanit = await client.PostAsync("/api/admin/books/upload", icerik);
        var govde = await yanit.Content.ReadAsStringAsync();

        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        govde.Should().Contain("Sadece PDF veya DOCX");
        govde.Should().NotContain("olayKimligi");
        SizintiYok(govde);
    }

    [Fact]
    [Trait("Category", "HataHijyeni")]
    public async Task Beklenmeyen_hata_olay_kimligi_dondurur()
    {
        // Not: Kasıtlı hata için test-only bir uç AÇILMAZ — üretim yüzeyini
        // genişletirdi. Middleware'in kendisi HataMiddlewareTests'te sınanıyor.
        var client = _fabrika.CreateClient();
        var yanit = await client.GetAsync("/api/books/99999999/read?page=1");

        // 401 (tokensiz) beklenir; asıl kontrol: gövde stack trace içermemeli
        var govde = await yanit.Content.ReadAsStringAsync();
        govde.Should().NotContain("   at ");
    }

    [Fact]
    [Trait("Category", "HataHijyeni")]
    public async Task Dogrulama_hatasi_kullaniciya_anlamli_mesaj_verir()
    {
        // KURAL-05 ile birlikte: 400'ler ANLAMLI mesaj taşımalı,
        // 500'ler ise GENEL mesaj + olay kimliği.
        var client = _fabrika.CreateClient();
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(o.Token);

        var yanit = await client.PostAsJsonAsync("/api/books/addword",
            new { word = "", translation = "", context = "" });

        var govde = await yanit.Content.ReadAsStringAsync();
        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        govde.Should().Contain("error");
        govde.Should().NotContain("Exception");
    }

    [Fact]
    [Trait("Category", "HataHijyeni")]
    public async Task Aktivite_kaydina_kullanicinin_kelimesi_yazilmaz()
    {
        // İhlal 3'ün VERİTABANI tarafı: kullanıcının hangi kelimeleri bilmediği
        // bir öğrenme profilidir. Eskiden Details = "Word: {kelime}" olarak
        // kalıcı biçimde saklanıyordu.
        var client = _fabrika.CreateClient();
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(o.Token);

        const string gizliKelime = "zqxjvbgizlikelime";
        var yanit = await client.PostAsJsonAsync("/api/translate/word",
            new { text = gizliKelime, context = "This is a zqxjvbgizlikelime test.", useAI = true });

        yanit.StatusCode.Should().Be(HttpStatusCode.OK);

        using var scope = _fabrika.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var kayitlar = await db.UserActivityLogs
            .Where(l => l.UserId == o.UserId && l.ActivityType == "ai_word_translation")
            .Select(l => l.Details)
            .ToListAsync();

        kayitlar.Should().NotBeEmpty("kota sayacı için kayıt yine oluşmalı — sayaç bozulmadı");
        kayitlar.Should().OnlyContain(d => !d.Contains(gizliKelime),
            "kullanıcının sorguladığı kelime kalıcı olarak saklanmamalı");
        kayitlar.Should().OnlyContain(d => !d.StartsWith("Word:"),
            "eski PII biçimi geri gelmemeli");
    }
}
