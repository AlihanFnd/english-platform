using System.Net;
using System.Net.Http.Json;
using System.Reflection;
using EnglishReadingPlatform.Data;
using EnglishReadingPlatform.Models;
using EnglishReadingPlatform.Tests.Infrastructure;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace EnglishReadingPlatform.Tests;

/// <summary>
/// KURAL-19 sözleşme testleri — kişisel veri yaşam döngüsü.
///
/// Bu dosya silinir ya da içindeki testlerden biri kaldırılırsa
/// scripts/guard/19-kisisel-veri.sh kırmızı verir.
/// </summary>
[Collection("api")]
public class KisiselVeriTests
{
    private readonly TestAppFactory _fabrika;
    public KisiselVeriTests(TestAppFactory fabrika) => _fabrika = fabrika;

    // ─── Envanter ─────────────────────────────────────────────────

    /// <summary>
    /// SÖZLEŞME: kişisel veri taşıyan HER kolon envanterde kayıtlı olmalı.
    ///
    /// Modelden taranıyor: yeni bir alan eklenip envantere yazılmazsa test
    /// kırılır — yani envanter, dokümandaki gibi sessizce eskiyemez.
    /// Anahtar/yabancı anahtar ve navigasyon alanları hariç: onlar kişisel
    /// veri değil, ilişki kurulumu.
    /// </summary>
    [Fact]
    [Trait("Category", "KisiselVeri")]
    public void Kisisel_veri_tasiyan_her_kolon_ENVANTERDE()
    {
        // UserId taşıyan tipler = kişiye bağlı veri taşıyan tipler.
        var kisiyeBagliTipler = new[]
        {
            (typeof(User), "Users"),
            (typeof(OcrRecord), "OcrRecords"),
            (typeof(UserActivityLog), "UserActivityLogs"),
            (typeof(ReadingProgress), "ReadingProgresses"),
            (typeof(WordListItem), "WordListItems"),
            (typeof(QuizResult), "QuizResults"),
            (typeof(Feedback), "Feedbacks"),
            (typeof(SifreSifirlamaJetonu), "SifreSifirlamaJetonlari"),
        };

        var ihlaller = new List<string>();

        foreach (var (tip, tablo) in kisiyeBagliTipler)
        foreach (var ozellik in tip.GetProperties(BindingFlags.Public | BindingFlags.Instance))
        {
            // Kimlik/ilişki alanları kişisel veri değil.
            if (ozellik.Name is "Id" || ozellik.Name.EndsWith("Id")) continue;
            // Yalnızca SKALER kolonlar taranır: navigasyon özellikleri
            // (tekil ya da koleksiyon) veritabanında kolon DEĞİLDİR.
            if (!SkalerMi(ozellik.PropertyType)) continue;

            if (!KisiselVeriEnvanteri.Kayitli(tablo, ozellik.Name))
                ihlaller.Add($"{tablo}.{ozellik.Name}");
        }

        ihlaller.Should().BeEmpty(
            "kişisel veri taşıyan her alan envantere yazılmalı — sebebi, ömrü " +
            "ve dışa aktarılıp aktarılmadığıyla birlikte");
    }

    /// <summary>
    /// Veritabanında bir KOLONA karşılık gelen tip mi?
    /// Navigasyon özellikleri (User, ICollection&lt;WordListItem&gt;…) kolon değildir;
    /// onları envanterde aramak yanlış alarm üretirdi.
    /// </summary>
    private static bool SkalerMi(Type tip)
    {
        var t = Nullable.GetUnderlyingType(tip) ?? tip;
        return t.IsPrimitive || t.IsEnum
            || t == typeof(string) || t == typeof(decimal)
            || t == typeof(DateTime) || t == typeof(DateTimeOffset)
            || t == typeof(Guid) || t == typeof(TimeSpan);
    }

    /// <summary>Sırlar dışa aktarmaya GİRMEZ — bayrak yanlış konsa bile.</summary>
    [Fact]
    [Trait("Category", "KisiselVeri")]
    public void Sirlar_disa_aktarmaya_GIRMEZ()
    {
        KisiselVeriEnvanteri.DisaAktarilanlar()
            .Should().NotContain(k => k.Sinif == VeriSinifi.Sir);

        KisiselVeriEnvanteri.Kalemler
            .Where(k => k.Sinif == VeriSinifi.Sir)
            .Should().NotBeEmpty("en az bir sır kalemi olmalı — yoksa bu test hiçbir şey ölçmez");
    }

    /// <summary>
    /// Belirsiz içerikli veri SÜRESİZ saklanamaz. İçeriğini bilmediğimiz bir
    /// metni sonsuza kadar tutmak savunulabilir değil.
    /// </summary>
    [Fact]
    [Trait("Category", "KisiselVeri")]
    public void Belirsiz_icerik_SURESIZ_saklanmaz()
    {
        KisiselVeriEnvanteri.Kalemler
            .Where(k => k.Sinif == VeriSinifi.BelirsizIcerik)
            .Should().OnlyContain(k => k.SaklamaGunu != null || k.Tablo == "Feedbacks",
                "OCR gibi içeriği bilinmeyen kullanıcı metni bir saklama süresi taşımalı");
    }

    // ─── Dışa aktarma ─────────────────────────────────────────────

    [Fact]
    [Trait("Category", "KisiselVeri")]
    public async Task Disa_aktarma_sifre_hashini_ICERMEZ()
    {
        var client = _fabrika.CreateClient();
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(o.Token);

        var govde = await client.GetStringAsync("/api/verim/disa-aktar");

        govde.Should().NotContain("assword", "PasswordHash alanı yanıta girmemeli");
        govde.Should().NotContain("$2a$", "BCrypt hash'i dışa aktarmada görünemez");
        govde.Should().NotContain("JetonHash");
    }

    /// <summary>
    /// ANA REGRESYON: dışa aktarmanın en tehlikeli hatası kullanıcı filtresini
    /// unutmaktır — o zaman uç bütün veritabanını döker.
    /// </summary>
    [Fact]
    [Trait("Category", "KisiselVeri")]
    public async Task Disa_aktarma_BASKASININ_verisini_icermez()
    {
        var aClient = _fabrika.CreateClient();
        var a = await AuthHelper.OgrenciOlarakGirisYapAsync(aClient);
        aClient.TokenIle(a.Token);

        var bClient = _fabrika.CreateClient();
        var b = await AuthHelper.OgrenciOlarakGirisYapAsync(bClient);
        bClient.TokenIle(b.Token);

        var bKelimesi = $"gizli{Guid.NewGuid():N}"[..16];
        (await bClient.PostAsJsonAsync("/api/books/addword",
            new { word = bKelimesi, translation = "x", context = "y" }))
            .EnsureSuccessStatusCode();

        var aDisaAktarma = await aClient.GetStringAsync("/api/verim/disa-aktar");

        aDisaAktarma.Should().NotContain(bKelimesi,
            "A'nın dışa aktarması B'nin verisini İÇEREMEZ — filtreyi unutmak " +
            "bütün veritabanını dökmek demektir");
    }

    // ─── Hesap silme ──────────────────────────────────────────────

    /// <summary>
    /// Şifre olmadan hesap silinemez: çalınmış bir token kalıcı veri kaybına
    /// yol açmamalı. Geçerli token "giriş yapmış" der, "hesabını silmek
    /// istiyor" demez.
    /// </summary>
    [Fact]
    [Trait("Category", "KisiselVeri")]
    public async Task Hesap_silme_SIFRE_ister()
    {
        var client = _fabrika.CreateClient();
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(o.Token);

        // Hız sınırlı uç (kimlik kotası): taze test IP'si — aksi hâlde
        // başka dosyalardaki testlerle aynı kovayı paylaşır ve 429 alınır.
        var yanit = await client.TazeIpIlePostAsync("/api/verim/hesabimi-sil",
            new { sifre = "YanlisSifre123!" });

        yanit.StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        using var kapsam = _fabrika.Services.CreateScope();
        var db = kapsam.ServiceProvider.GetRequiredService<AppDbContext>();
        (await db.Users.AnyAsync(u => u.Id == o.UserId))
            .Should().BeTrue("yanlış şifreyle hesap SİLİNMEMELİ");
    }

    /// <summary>
    /// TUZAK KONTROLÜ: "her zaman 401 dönen" bir uç yukarıdaki testi de
    /// geçerdi. Doğru şifreyle silmenin GERÇEKTEN çalıştığı ve kişisel
    /// verinin tablo tablo GİTTİĞİ ayrıca kanıtlanıyor.
    /// </summary>
    [Fact]
    [Trait("Category", "KisiselVeri")]
    public async Task Hesap_silinince_tum_kisisel_veri_GIDER()
    {
        var client = _fabrika.CreateClient();
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(o.Token);

        // Birkaç tabloya veri bırak
        (await client.PostAsJsonAsync("/api/books/addword",
            new { word = "ephemeral", translation = "geçici", context = "bir cümle" }))
            .EnsureSuccessStatusCode();

        using (var kapsam = _fabrika.Services.CreateScope())
        {
            var db = kapsam.ServiceProvider.GetRequiredService<AppDbContext>();
            db.OcrRecords.Add(new OcrRecord
            {
                UserId = o.UserId,
                ExtractedText = "taranmis gizli metin",
                ScannedAt = DateTime.UtcNow,
            });
            await db.SaveChangesAsync();
        }

        var yanit = await client.TazeIpIlePostAsync("/api/verim/hesabimi-sil",
            new { sifre = "TestSifre123!" });

        yanit.StatusCode.Should().Be(HttpStatusCode.OK, "doğru şifreyle silme ÇALIŞMALI");

        using (var kapsam = _fabrika.Services.CreateScope())
        {
            var db = kapsam.ServiceProvider.GetRequiredService<AppDbContext>();

            (await db.Users.AnyAsync(u => u.Id == o.UserId)).Should().BeFalse("hesap");
            (await db.WordListItems.AnyAsync(w => w.UserId == o.UserId)).Should().BeFalse("kelimeler");
            (await db.OcrRecords.AnyAsync(r => r.UserId == o.UserId)).Should().BeFalse("OCR kayıtları");
            (await db.ReadingProgresses.AnyAsync(p => p.UserId == o.UserId)).Should().BeFalse("ilerleme");
            (await db.UserActivityLogs.AnyAsync(a => a.UserId == o.UserId)).Should().BeFalse("aktivite");
        }
    }

    // ─── Saklama süresi ───────────────────────────────────────────

    /// <summary>
    /// OCR kayıtları süresiz saklanamaz — ve süre sabitini TANIMLAYIP
    /// silmeyi yazmamak tipik yarım iştir. Bu test silmenin GERÇEKTEN
    /// çalıştığını ölçüyor.
    ///
    /// Yeni kaydın da SAĞ KALDIĞI ayrıca iddia ediliyor: "hepsini sil"
    /// biçiminde bir hata yukarıdaki iddiayı da geçerdi.
    /// </summary>
    [Fact]
    [Trait("Category", "KisiselVeri")]
    public async Task Saklama_temizligi_eski_OCR_kaydini_siler_yenisini_BIRAKIR()
    {
        var client = _fabrika.CreateClient();
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        int eskiId, yeniId;

        using (var kapsam = _fabrika.Services.CreateScope())
        {
            var db = kapsam.ServiceProvider.GetRequiredService<AppDbContext>();
            var eski = new OcrRecord
            {
                UserId = o.UserId, ExtractedText = "eski",
                ScannedAt = DateTime.UtcNow - SaklamaTemizligiServisi.OcrKaydi - TimeSpan.FromDays(1),
            };
            var yeni = new OcrRecord
            {
                UserId = o.UserId, ExtractedText = "yeni", ScannedAt = DateTime.UtcNow,
            };
            db.OcrRecords.AddRange(eski, yeni);
            await db.SaveChangesAsync();
            eskiId = eski.Id; yeniId = yeni.Id;
        }

        var temizlik = _fabrika.Services.GetServices<IHostedService>()
            .OfType<SaklamaTemizligiServisi>().Single();
        await temizlik.TemizleAsync();

        using (var kapsam = _fabrika.Services.CreateScope())
        {
            var db = kapsam.ServiceProvider.GetRequiredService<AppDbContext>();
            (await db.OcrRecords.AnyAsync(r => r.Id == eskiId)).Should().BeFalse(
                "saklama süresi dolmuş OCR metni silinmeli");
            (await db.OcrRecords.AnyAsync(r => r.Id == yeniId)).Should().BeTrue(
                "süresi dolmamış kayıt SİLİNMEMELİ");
        }
    }
}
