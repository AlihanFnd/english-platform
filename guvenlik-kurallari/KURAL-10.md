# KURAL-10 — Dosya yükleme içerikten doğrulanır

> **Ön koşul:** KURAL-01, KURAL-05, KURAL-06 ve KURAL-07 tamamlanmış olmalı.

---

## Kural metni

> **Yüklenen bir dosyanın ne olduğu, istemcinin söylediğinden değil içeriğinden belirlenecek.**
> Dosya türü sihirli baytlarla (magic bytes) doğrulanacak; uzantı yalnızca ilk eleme
> olacak. Boyut, sayfa sayısı ve ayrıştırma süresi üst sınıra tabi olacak. Ayrıştırıcıya
> giden hiçbir girdi sınırsız olmayacak. Ayrıştırma hataları kullanıcıya iç detay
> sızdırmadan bildirilecek.

---

## Envanter

Ölçüm tarihi: **2026-08-20**, commit `d2cfc0f`.

### İhlal 1 — Tür, dosya adından türetiliyor 🟠

`Services/PdfService.cs:107-113`:

```csharp
var ext = System.IO.Path.GetExtension(file.FileName).ToLower();   // ← İSTEMCİNİN VERDİĞİ AD
if (!AllowedExtensions.Contains(ext))
    throw new InvalidOperationException("Sadece PDF veya DOCX dosyaları yüklenebilir.");

if (file.Length > MaxFileSizeBytes)
    throw new InvalidOperationException("Dosya boyutu 50 MB sınırını aşıyor.");
```

`PdfService.cs:56` (`ExtractSinglePageText`) de aynı deseni kullanıyor ve **boyut
kontrolü bile yok**:

```csharp
public string ExtractSinglePageText(IFormFile file, int pageNumber)
{
    var ext = System.IO.Path.GetExtension(file.FileName).ToLower();
    if (ext == ".docx") return ExtractDocxText(file);
    using var stream = file.OpenReadStream();
    using var document = PdfDocument.Open(stream);      // ← doğrulanmamış içerik
```

`kotu.exe` → `kotu.pdf` olarak yeniden adlandırılırsa doğrudan `PdfDocument.Open`'a gider.

> Dosya **diske yazılmadığı** için doğrudan kod çalıştırma riski yoktur ✅.
> Risk, ayrıştırıcıya keyfi içerik gitmesidir.

### İhlal 2 — Sayfa sayısı ve ayrıştırma süresi sınırsız 🟠

`AdminController.cs:244-310` (`UploadBookPages`):

```csharp
var selectedPageNumbers = meta.SelectedPages.Split(',')
    .Select(p => p.Trim()).Where(p => int.TryParse(p, out _)).Select(int.Parse)
    .OrderBy(p => p).Distinct().ToList();          // ← üst sınır YOK

foreach (var pageNum in selectedPageNumbers)
{
    pageText = _pdfService.ExtractSinglePageText(file, pageNum);   // ← her sayfada PDF'i YENİDEN AÇIYOR
```

İki sorun:
1. **Sayfa sayısı sınırsız** — `SelectedPages` alanına 100.000 sayı gönderilebilir
2. **O(n²) davranış** — her sayfa için `PdfDocument.Open` yeniden çağrılıyor; 500 sayfalık
   bir PDF'te dosya 500 kez ayrıştırılıyor

### İhlal 3 — DOCX zip-bomb koruması yok 🟠

`PdfService.ExtractDocxText`:

```csharp
using var wordDoc = WordprocessingDocument.Open(stream, false);
var paragraphs = body.Descendants<Paragraph>().Select(p => p.InnerText)...
```

DOCX bir ZIP arşividir. 50 MB'lık sıkıştırılmış bir dosya açıldığında gigabaytlara
ulaşabilir. Açılmış boyut kontrolü yok.

### İhlal 4 — `ExtractSinglePageText` DOCX'te sayfayı yok sayıyor 🟡

```csharp
if (ext == ".docx") return ExtractDocxText(file);   // pageNumber KULLANILMIYOR
```

Sayfa seçilerek DOCX yüklenirse **her sayfa aynı içeriği** alır. Güvenlik açığı değil
ama sessiz bir işlev hatası (`docs/04-BACKEND.md` § 6).

### İhlal 5 — Yükleme uçlarında rate limit yoktu

KURAL-07 `DosyaYukleme` politikasını (5/dk) ekledi ✅. Bu kural onu tamamlıyor.

### Özet

| # | İhlal | Nokta |
|---|---|---|
| 1 | Tür dosya adından | 2 (`ExtractAndSplitAsync`, `ExtractSinglePageText`) |
| 2 | Sayfa/süre sınırsız | 2 |
| 3 | Zip-bomb koruması yok | 1 |
| 4 | DOCX sayfa yok sayılıyor | 1 |
| | **TOPLAM** | **6** |

---

## Merkezî uygulama

### 1. İçerik doğrulayıcı — `Files/DosyaDogrulayici.cs`

```csharp
using EnglishReadingPlatform.Exceptions;

namespace EnglishReadingPlatform.Files;

public enum DosyaTuru { Bilinmeyen, Pdf, Docx }

/// <summary>
/// KURAL-10: Dosya türünü İÇERİKTEN belirler. Dosya adı yalnızca ilk elemedir.
/// Tüm yükleme yolları bu sınıftan geçer.
/// </summary>
public class DosyaDogrulayici
{
    public const long EnBuyukBoyut       = 50L * 1024 * 1024;   // 50 MB (sıkıştırılmış)
    public const long EnBuyukAcilmisBoyut = 200L * 1024 * 1024; // 200 MB (zip-bomb koruması)
    public const int  EnCokSayfa          = 500;
    public static readonly TimeSpan AyristirmaSuresi = TimeSpan.FromSeconds(60);

    // Sihirli baytlar
    private static readonly byte[] PdfImza  = "%PDF-"u8.ToArray();
    private static readonly byte[] ZipImza  = { 0x50, 0x4B, 0x03, 0x04 };   // PK.. — DOCX bir ZIP'tir

    private static readonly string[] IzinliUzantilar = { ".pdf", ".docx" };

    /// <summary>
    /// Dosyayı doğrular ve gerçek türünü döner.
    /// Geçersizse KullaniciHatasi fırlatır (KURAL-06: mesaj kullanıcıya gösterilebilir).
    /// </summary>
    public DosyaTuru Dogrula(IFormFile? dosya)
    {
        if (dosya is null || dosya.Length == 0)
            throw new KullaniciHatasi("Dosya seçilmedi.");

        if (dosya.Length > EnBuyukBoyut)
            throw new KullaniciHatasi($"Dosya boyutu {EnBuyukBoyut / 1024 / 1024} MB sınırını aşıyor.");

        // 1. Eleme: uzantı (ucuz)
        var uzanti = Path.GetExtension(dosya.FileName).ToLowerInvariant();
        if (!IzinliUzantilar.Contains(uzanti))
            throw new KullaniciHatasi("Sadece PDF veya DOCX dosyaları yüklenebilir.");

        // 2. Eleme: içerik (belirleyici)
        var gercekTur = TuruBelirle(dosya);
        if (gercekTur == DosyaTuru.Bilinmeyen)
            throw new KullaniciHatasi(
                "Dosya içeriği tanınamadı. Geçerli bir PDF veya DOCX dosyası yükleyin.");

        // 3. Uzantı ile içerik uyuşuyor mu?
        var beklenen = uzanti == ".pdf" ? DosyaTuru.Pdf : DosyaTuru.Docx;
        if (gercekTur != beklenen)
            throw new KullaniciHatasi(
                "Dosya uzantısı içeriğiyle uyuşmuyor. Doğru dosyayı yüklediğinizden emin olun.");

        return gercekTur;
    }

    /// <summary>Yalnızca içeriğe bakarak türü belirler. Akışı başa sarar.</summary>
    public DosyaTuru TuruBelirle(IFormFile dosya)
    {
        using var akis = dosya.OpenReadStream();
        Span<byte> tampon = stackalloc byte[8];
        var okunan = akis.ReadAtLeast(tampon, 8, throwOnEndOfStream: false);
        if (okunan < 4) return DosyaTuru.Bilinmeyen;

        if (tampon[..5].SequenceEqual(PdfImza)) return DosyaTuru.Pdf;
        if (tampon[..4].SequenceEqual(ZipImza)) return DosyaTuru.Docx;
        return DosyaTuru.Bilinmeyen;
    }

    /// <summary>DOCX'in açılmış boyutunu kontrol eder (zip-bomb koruması).</summary>
    public void ZipBombKontrolu(IFormFile dosya)
    {
        using var akis = dosya.OpenReadStream();
        using var arsiv = new System.IO.Compression.ZipArchive(
            akis, System.IO.Compression.ZipArchiveMode.Read, leaveOpen: false);

        long toplamAcilmis = 0;
        foreach (var giris in arsiv.Entries)
        {
            toplamAcilmis += giris.Length;
            if (toplamAcilmis > EnBuyukAcilmisBoyut)
                throw new KullaniciHatasi(
                    "Dosya açıldığında izin verilen boyutu aşıyor. Farklı bir dosya deneyin.");
        }

        // Sıkıştırma oranı kontrolü: 100:1'den fazlası şüphelidir
        if (dosya.Length > 0 && toplamAcilmis / dosya.Length > 100)
            throw new KullaniciHatasi("Dosya olağandışı sıkıştırma oranına sahip, işlenemedi.");
    }

    /// <summary>Seçilen sayfa listesini doğrular ve normalize eder.</summary>
    public IReadOnlyList<int> SayfalariDogrula(string? sayfaSecimi, int toplamSayfa)
    {
        if (string.IsNullOrWhiteSpace(sayfaSecimi))
            throw new KullaniciHatasi("Lütfen yüklenecek sayfaları seçin.");

        var sayfalar = sayfaSecimi.Split(',', StringSplitOptions.RemoveEmptyEntries)
            .Select(p => p.Trim())
            .Where(p => int.TryParse(p, out _))
            .Select(int.Parse)
            .Where(p => p >= 1 && p <= toplamSayfa)      // aralık dışını at
            .Distinct()
            .OrderBy(p => p)
            .ToList();

        if (sayfalar.Count == 0)
            throw new KullaniciHatasi("Geçerli bir sayfa seçilmedi.");

        if (sayfalar.Count > EnCokSayfa)
            throw new KullaniciHatasi($"Tek seferde en fazla {EnCokSayfa} sayfa yüklenebilir.");

        return sayfalar;
    }
}
```

Kayıt: `builder.Services.AddSingleton<DosyaDogrulayici>();`

### 2. `PdfService` — tek açış, toplu sayfa çıkarma

O(n²) davranışı ortadan kaldırır ve zaman aşımı uygular.

```csharp
/// <summary>
/// KURAL-10: PDF'i BİR KEZ açar, istenen sayfaları tek geçişte çıkarır.
/// Eski ExtractSinglePageText her sayfada dosyayı yeniden açıyordu.
/// </summary>
public async Task<IReadOnlyDictionary<int, string>> SayfalariCikarAsync(
    IFormFile dosya, IReadOnlyList<int> sayfaNumaralari, CancellationToken iptal = default)
{
    var tur = _dogrulayici.Dogrula(dosya);

    if (tur == DosyaTuru.Docx)
    {
        _dogrulayici.ZipBombKontrolu(dosya);
        // DOCX'te sayfa kavramı yok — tüm metni tek "sayfa" olarak döner.
        // Çağıran bunu bilmeli (eski kod sessizce her sayfaya aynı metni koyuyordu).
        var tumMetin = ExtractDocxText(dosya);
        return new Dictionary<int, string> { [1] = tumMetin };
    }

    using var zamanAsimi = CancellationTokenSource.CreateLinkedTokenSource(iptal);
    zamanAsimi.CancelAfter(DosyaDogrulayici.AyristirmaSuresi);

    return await Task.Run(() =>
    {
        var sonuc = new Dictionary<int, string>();
        using var akis = dosya.OpenReadStream();
        using var belge = PdfDocument.Open(akis);          // ← TEK AÇIŞ

        foreach (var no in sayfaNumaralari)
        {
            zamanAsimi.Token.ThrowIfCancellationRequested();
            if (no < 1 || no > belge.NumberOfPages) continue;
            var metin = ExtractTextFromPage(belge.GetPage(no));
            if (!string.IsNullOrWhiteSpace(metin)) sonuc[no] = metin.Trim();
        }
        return sonuc;
    }, zamanAsimi.Token);
}

/// <summary>PDF'in sayfa sayısını okur (seçim doğrulaması için).</summary>
public int SayfaSayisiniOku(IFormFile dosya)
{
    if (_dogrulayici.TuruBelirle(dosya) != DosyaTuru.Pdf) return 1;   // DOCX
    using var akis = dosya.OpenReadStream();
    using var belge = PdfDocument.Open(akis);
    return belge.NumberOfPages;
}
```

`ExtractAndSplitAsync` de başına `_dogrulayici.Dogrula(file)` çağrısı ekleyerek
eski elle yapılan kontrolleri kaldırır.

### 3. `AdminController.UploadBookPages` — yeniden yazım

```csharp
[HttpPost("books/upload-pages")]
[RequestSizeLimit(DosyaDogrulayici.EnBuyukBoyut)]
[EnableRateLimiting(HizSinirlari.DosyaYukleme)]           // KURAL-07
public async Task<IActionResult> UploadBookPages(
    [FromForm] BookUploadPagesRequest meta, IFormFile file, CancellationToken iptal)
{
    // KURAL-10: doğrulama merkezden — hata KullaniciHatasi olarak fırlar,
    // KURAL-06 middleware'i onu 400 + temiz mesaja çevirir.
    _dogrulayici.Dogrula(file);

    var toplamSayfa = _pdfService.SayfaSayisiniOku(file);
    var sayfalar = _dogrulayici.SayfalariDogrula(meta.SelectedPages, toplamSayfa);

    // KURAL-07: ağır iş kapısı
    var metinler = await _agirIsKapisi.CalistirAsync(
        () => _pdfService.SayfalariCikarAsync(file, sayfalar, iptal), iptal);

    if (metinler.Count == 0)
        return BadRequest(new { error =
            "Seçilen sayfaların hiçbirinden metin çıkarılamadı. Dosyanız taranmış/görsel tabanlı olabilir." });

    var kitap = new Book { /* meta alanları — KURAL-05 doğrulaması yaptı */ };
    _db.Books.Add(kitap);
    await _db.SaveChangesAsync();

    var gorunenNo = 1;
    var sayfaKayitlari = sayfalar
        .Where(metinler.ContainsKey)
        .Select(no => new BookPage
        {
            BookId = kitap.Id,
            PageNumber = gorunenNo++,
            Content = metinler[no],
            SentencesJson = "[]"
        }).ToList();

    _db.BookPages.AddRange(sayfaKayitlari);
    await _db.SaveChangesAsync();

    _logger.LogInformation("Kitap yüklendi. KitapId={KitapId} Sayfa={Sayfa}", kitap.Id, sayfaKayitlari.Count);
    return Ok(new { success = true, bookId = kitap.Id, title = kitap.Title, pagesCreated = sayfaKayitlari.Count });
}
```

> **Eski `Book` geri silme mantığı kaldırıldı** — artık kitap, metin çıkarıldıktan
> **sonra** oluşturuluyor. Yetim kayıt riski tasarımdan kalktı.

---

## Otomatik kapı

### A) Doğrulayıcı birim testleri — `DosyaDogrulayiciTests.cs`

```csharp
using System.IO.Compression;
using System.Text;
using EnglishReadingPlatform.Exceptions;
using EnglishReadingPlatform.Files;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Xunit;

namespace EnglishReadingPlatform.Tests;

public class DosyaDogrulayiciTests
{
    private readonly DosyaDogrulayici _dogrulayici = new();

    private static IFormFile Dosya(byte[] icerik, string ad)
        => new FormFile(new MemoryStream(icerik), 0, icerik.Length, "file", ad)
           { Headers = new HeaderDictionary(), ContentType = "application/octet-stream" };

    private static byte[] SahtePdf() => Encoding.ASCII.GetBytes("%PDF-1.7\n%âãÏÓ\n...");
    private static byte[] SahteDocx()
    {
        using var bellek = new MemoryStream();
        using (var arsiv = new ZipArchive(bellek, ZipArchiveMode.Create, true))
        {
            var giris = arsiv.CreateEntry("word/document.xml");
            using var yazici = new StreamWriter(giris.Open());
            yazici.Write("<w:document/>");
        }
        return bellek.ToArray();
    }

    [Fact]
    [Trait("Category", "DosyaYukleme")]
    public void Uzantisi_degistirilmis_dosya_reddedilir()
    {
        // ANA REGRESYON: kotu.exe → kotu.pdf
        var sahte = Encoding.ASCII.GetBytes("MZ\x90\x00This is actually an executable");

        var eylem = () => _dogrulayici.Dogrula(Dosya(sahte, "kitap.pdf"));

        eylem.Should().Throw<KullaniciHatasi>()
             .WithMessage("*içeriği tanınamadı*");
    }

    [Fact]
    [Trait("Category", "DosyaYukleme")]
    public void Docx_icerigi_pdf_uzantisiyla_reddedilir()
    {
        var eylem = () => _dogrulayici.Dogrula(Dosya(SahteDocx(), "kitap.pdf"));

        eylem.Should().Throw<KullaniciHatasi>()
             .WithMessage("*uzantısı içeriğiyle uyuşmuyor*");
    }

    [Fact]
    [Trait("Category", "DosyaYukleme")]
    public void Gecerli_pdf_kabul_edilir()
        => _dogrulayici.Dogrula(Dosya(SahtePdf(), "kitap.pdf")).Should().Be(DosyaTuru.Pdf);

    [Fact]
    [Trait("Category", "DosyaYukleme")]
    public void Gecerli_docx_kabul_edilir()
        => _dogrulayici.Dogrula(Dosya(SahteDocx(), "kitap.docx")).Should().Be(DosyaTuru.Docx);

    [Fact]
    [Trait("Category", "DosyaYukleme")]
    public void Izinsiz_uzanti_reddedilir()
    {
        var eylem = () => _dogrulayici.Dogrula(Dosya(SahtePdf(), "kitap.txt"));
        eylem.Should().Throw<KullaniciHatasi>().WithMessage("*PDF veya DOCX*");
    }

    [Fact]
    [Trait("Category", "DosyaYukleme")]
    public void Bos_dosya_reddedilir()
    {
        var eylem = () => _dogrulayici.Dogrula(Dosya(Array.Empty<byte>(), "bos.pdf"));
        eylem.Should().Throw<KullaniciHatasi>();
    }

    [Fact]
    [Trait("Category", "DosyaYukleme")]
    public void Cok_fazla_sayfa_reddedilir()
    {
        var cokSayfa = string.Join(",", Enumerable.Range(1, DosyaDogrulayici.EnCokSayfa + 50));

        var eylem = () => _dogrulayici.SayfalariDogrula(cokSayfa, toplamSayfa: 10_000);

        eylem.Should().Throw<KullaniciHatasi>().WithMessage("*en fazla*sayfa*");
    }

    [Fact]
    [Trait("Category", "DosyaYukleme")]
    public void Aralik_disi_sayfalar_atilir()
    {
        var sonuc = _dogrulayici.SayfalariDogrula("1,2,999,-5,3", toplamSayfa: 10);
        sonuc.Should().BeEquivalentTo(new[] { 1, 2, 3 });
    }

    [Fact]
    [Trait("Category", "DosyaYukleme")]
    public void Tekrarli_sayfalar_teklestirilir()
        => _dogrulayici.SayfalariDogrula("3,1,3,2,1", 10).Should().BeEquivalentTo(new[] { 1, 2, 3 });

    [Fact]
    [Trait("Category", "DosyaYukleme")]
    public void Zip_bomb_reddedilir()
    {
        // Yüksek sıkıştırma oranlı DOCX: 10 MB sıfır → birkaç KB
        using var bellek = new MemoryStream();
        using (var arsiv = new ZipArchive(bellek, ZipArchiveMode.Create, true))
        {
            var giris = arsiv.CreateEntry("word/document.xml", CompressionLevel.SmallestSize);
            using var akis = giris.Open();
            var blok = new byte[1024 * 1024];      // 1 MB sıfır
            for (var i = 0; i < 300; i++) akis.Write(blok);   // 300 MB açılmış
        }
        var dosya = Dosya(bellek.ToArray(), "bomba.docx");

        var eylem = () => _dogrulayici.ZipBombKontrolu(dosya);

        eylem.Should().Throw<KullaniciHatasi>();
    }
}
```

### B) Uçtan uca test — `DosyaYuklemeTests.cs`

```csharp
using System.Net;
using System.Text;
using EnglishReadingPlatform.Tests.Infrastructure;
using FluentAssertions;
using Xunit;

namespace EnglishReadingPlatform.Tests;

[Collection("api")]
public class DosyaYuklemeTests
{
    private readonly TestAppFactory _fabrika;
    public DosyaYuklemeTests(TestAppFactory fabrika) => _fabrika = fabrika;

    private static MultipartFormDataContent Form(byte[] icerik, string dosyaAdi, string sayfalar = "1")
        => new()
        {
            { new StringContent("Test Kitap"), "title" },
            { new StringContent(""), "author" },
            { new StringContent(""), "description" },
            { new StringContent("en"), "language" },
            { new StringContent("A1"), "level" },
            { new StringContent("story"), "category" },
            { new StringContent(sayfalar), "selectedPages" },
            { new ByteArrayContent(icerik), "file", dosyaAdi }
        };

    [Fact]
    [Trait("Category", "DosyaYukleme")]
    public async Task Sahte_pdf_400_doner_500_DEGIL()
    {
        var client = _fabrika.CreateClient();
        var admin = await AuthHelper.AdminOlarakGirisYapAsync(client);
        client.TokenIle(admin.Token);

        var sahte = Encoding.ASCII.GetBytes("MZ\x90\x00 executable içerik");
        var yanit = await client.PostAsync("/api/admin/books/upload-pages", Form(sahte, "kitap.pdf"));

        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        yanit.StatusCode.Should().NotBe(HttpStatusCode.InternalServerError);
    }

    [Fact]
    [Trait("Category", "DosyaYukleme")]
    public async Task Hata_yaniti_ic_detay_sizdirmaz()
    {
        var client = _fabrika.CreateClient();
        var admin = await AuthHelper.AdminOlarakGirisYapAsync(client);
        client.TokenIle(admin.Token);

        var bozuk = new byte[] { 0x25, 0x50, 0x44, 0x46, 0x2D, 0xFF, 0xFE, 0x00 };  // %PDF- + çöp
        var yanit = await client.PostAsync("/api/admin/books/upload-pages", Form(bozuk, "bozuk.pdf"));
        var govde = await yanit.Content.ReadAsStringAsync();

        foreach (var isaret in new[] { "PdfPig", "UglyToad", "   at ", "Exception", ".cs:line" })
            govde.Should().NotContain(isaret, $"'{isaret}' sızıyor: {govde}");
    }

    [Fact]
    [Trait("Category", "DosyaYukleme")]
    public async Task Cok_fazla_sayfa_secimi_reddedilir()
    {
        var client = _fabrika.CreateClient();
        var admin = await AuthHelper.AdminOlarakGirisYapAsync(client);
        client.TokenIle(admin.Token);

        var pdf = Encoding.ASCII.GetBytes("%PDF-1.7\n...");
        var cokSayfa = string.Join(",", Enumerable.Range(1, 1000));

        var yanit = await client.PostAsync("/api/admin/books/upload-pages", Form(pdf, "k.pdf", cokSayfa));

        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    [Trait("Category", "DosyaYukleme")]
    public async Task Ogrenci_kitap_yukleyemez()
    {
        // KURAL-03 ile örtüşen çapraz kontrol
        var client = _fabrika.CreateClient();
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(o.Token);

        var yanit = await client.PostAsync("/api/admin/books/upload-pages",
            Form(Encoding.ASCII.GetBytes("%PDF-1.7"), "k.pdf"));

        yanit.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }
}
```

### C) Guard script — `scripts/guard/10-dosya.sh`

```bash
#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
echo "[10] Dosya yükleme"

# 1. Uzantı doğrudan tür kararı için kullanılıyor mu?
cikti="$(kodda_ara 'if \(ext == "\.docx"\)|AllowedExtensions\.Contains\(ext\)' 'EnglishReadingPlatform/Services/*.cs')"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "tür uzantıdan belirleniyor" "$n" "$cikti"

# 2. Merkezî doğrulayıcı kullanılıyor mu?
n=0
grep -q "_dogrulayici.Dogrula" EnglishReadingPlatform/Controllers/AdminController.cs || n=1
ihlal_bildir "yükleme uçları doğrulayıcıdan geçiyor" "$n" "AdminController doğrulayıcı çağırmıyor"

# 3. Eski O(n²) API'si kaldı mı?
cikti="$(kodda_ara 'ExtractSinglePageText' 'EnglishReadingPlatform/**/*.cs')"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "sayfa başına yeniden açan API" "$n" "$cikti"

# 4. Sayfa üst sınırı tanımlı mı?
n=0; grep -q "EnCokSayfa" EnglishReadingPlatform/Files/DosyaDogrulayici.cs 2>/dev/null || n=1
ihlal_bildir "sayfa üst sınırı tanımlı" "$n" "DosyaDogrulayici.EnCokSayfa yok"

# 5. Zip-bomb kontrolü çağrılıyor mu?
n=0; grep -q "ZipBombKontrolu" EnglishReadingPlatform/Services/PdfService.cs 2>/dev/null || n=1
ihlal_bildir "zip-bomb kontrolü uygulanıyor" "$n" "DOCX açılmış boyutu kontrol edilmiyor"

# 6. RequestSizeLimit tüm yükleme uçlarında var mı?
eksik=""
for uc in "books/upload" "books/upload-pages"; do
  grep -B3 "HttpPost(\"$uc\")" EnglishReadingPlatform/Controllers/AdminController.cs \
    | grep -q "RequestSizeLimit" || eksik="${eksik}${uc}"$'\n'
done
n=$(printf '%s' "$eksik" | grep -c . || true)
ihlal_bildir "RequestSizeLimit eksik uç" "$n" "$eksik"

guard_bitir
```

---

## Bitti kriteri

```bash
cd /Users/alihanfindikci/Desktop/ingilizceproje
docker compose up -d postgres

# 1) Testler — BEKLENEN: Başarısız: 0, Başarılı: 14
dotnet test Linguza.sln --filter "Category=DosyaYukleme" --logger "console;verbosity=normal"
echo "çıkış kodu: $?"

# 2) Guard kapısı — BEKLENEN: TOPLAM İHLAL: 0
bash scripts/guard/10-dosya.sh; echo "çıkış kodu: $?"

# 3) Uzantı tabanlı tür kararı — BEKLENEN: 0
grep -rn 'if (ext == ".docx")\|AllowedExtensions.Contains(ext)' EnglishReadingPlatform/Services/ | wc -l

# 4) Eski API kalıntısı — BEKLENEN: 0
grep -rn "ExtractSinglePageText" EnglishReadingPlatform/ --include=*.cs 2>/dev/null | grep -v obj/ | wc -l

# 5) Tüm kapılar
bash scripts/guard/run-all.sh; echo "çıkış kodu: $?"

# 6) Regresyon
dotnet test Linguza.sln
```

---

## Mutasyon kontrolü (zorunlu)

```bash
# MUTASYON A — içerik kontrolünü kaldır (orijinal açık)
python3 - <<'PY'
yol = "EnglishReadingPlatform/Files/DosyaDogrulayici.cs"
k = open(yol, encoding="utf-8").read()
k = k.replace("var gercekTur = TuruBelirle(dosya);",
              "var gercekTur = uzanti == \".pdf\" ? DosyaTuru.Pdf : DosyaTuru.Docx;  // MUTASYON")
open(yol, "w", encoding="utf-8").write(k)
PY

dotnet test Linguza.sln --filter "Category=DosyaYukleme"
# BEKLENEN: Başarısız: ≥2
#   • Uzantisi_degistirilmis_dosya_reddedilir → istisna fırlatılmadı (KIRMIZI)
#   • Docx_icerigi_pdf_uzantisiyla_reddedilir → KIRMIZI

git checkout EnglishReadingPlatform/Files/DosyaDogrulayici.cs
dotnet test Linguza.sln --filter "Category=DosyaYukleme"    # BEKLENEN: Başarısız: 0
```

```bash
# MUTASYON B — sayfa üst sınırını kaldır
sed -i '' 's|public const int  EnCokSayfa          = 500;|public const int  EnCokSayfa          = 999999;|' \
  EnglishReadingPlatform/Files/DosyaDogrulayici.cs

dotnet test Linguza.sln --filter "FullyQualifiedName~Cok_fazla_sayfa"
# BEKLENEN: Başarısız: 2 (birim + uçtan uca)

git checkout EnglishReadingPlatform/Files/DosyaDogrulayici.cs
```

```bash
# MUTASYON C — zip-bomb kontrolünü kaldır
sed -i '' '/_dogrulayici.ZipBombKontrolu(dosya);/d' EnglishReadingPlatform/Services/PdfService.cs

bash scripts/guard/10-dosya.sh; echo "çıkış kodu: $?"      # BEKLENEN: 1
git checkout EnglishReadingPlatform/Services/PdfService.cs
```

---

## Geçiş planı

| Adım | İş | Nokta | Doğrulama |
|---|---|---|---|
| 1 | `Files/DosyaDogrulayici.cs` yaz | — | derlenir |
| 2 | `DosyaDogrulayiciTests.cs` yaz — **merkezî çözüm önce** | — | 10 test yeşil |
| 3 | `PdfService.SayfalariCikarAsync` + `SayfaSayisiniOku` ekle | — | derlenir |
| 4 | `PdfService.ExtractAndSplitAsync` doğrulayıcıya bağla, elle kontrolleri kaldır | 2 | guard kapı 1 → 0 |
| 5 | `PdfService.ExtractSinglePageText`'i **sil** | 1 | guard kapı 3 → 0 |
| 6 | `AdminController.UploadBookPages` yeniden yaz | 1 | uçtan uca testler yeşil |
| 7 | `AdminController.UploadBook` doğrulayıcıya bağla, `ex.Message` kaldır (KURAL-06) | 1 | derlenir |
| 8 | `DosyaYuklemeTests.cs` yaz | — | 4 test yeşil |
| 9 | `scripts/guard/10-dosya.sh` + `chmod +x` | — | çıkış kodu 0 |
| 10 | **DOCX davranış değişikliği** (aşağı bak) | — | karar + rapor |
| 11 | İlerleme tablosunu güncelle | — | — |

### Adım 10 — DOCX sayfa seçimi davranış değişikliği 🟡

Eski davranış: DOCX yüklenirken 5 sayfa seçilirse **5 sayfa oluşturulur, hepsi aynı
içeriği taşır** (sessiz hata).

Yeni davranış: DOCX'te tek bir sayfa oluşturulur ve tüm metni içerir.

Bu **daha doğrudur** ama yönetici panelinde DOCX için sayfa seçici zaten anlamsızdır
(pdf.js DOCX render edemez, önizleme boş kalır). İki seçenek:

| Seçenek | Ne olur |
|---|---|
| **A** — DOCX için sayfa seçiciyi gizle, "tüm belge yüklenecek" yaz | Dürüst, basit ⭐ önerilen |
| **B** — DOCX'i her 400 kelimede bir sayfaya böl (`ExtractAndSplitAsync`'teki mantık) | Sayfa seçimi anlamlı olur ama sayfa numaraları belgeyle uyuşmaz |

**Varsayılan A.** Frontend değişikliği gerektirir → teknik borç olarak raporlanır.

---

## Tuzaklar

| Tuzak | Neden olur | Nasıl kaçınılır |
|---|---|---|
| **`ContentType`'a güvenmek** | `Content-Type: application/pdf` başlığını istemci belirler; dosya adı kadar sahtedir | Yalnızca sihirli baytlar belirleyicidir |
| **Akışı başa sarmayı unutmak** | `TuruBelirle` akışı okur; sonra `PdfDocument.Open` boş akış görür → "geçersiz PDF" | `OpenReadStream()` her çağrıda **yeni akış** döner ✅ — ama aynı akış paylaşılırsa `Seek(0)` gerekir |
| **`ZipArchive`'ı `IFormFile` akışıyla açıp `leaveOpen: true` unutmak** | Akış kapanır, sonraki okuma başarısız olur | `ZipBombKontrolu` kendi akışını açıyor |
| **`giris.Length` yerine `giris.CompressedLength` okumak** | Sıkıştırılmış boyut zaten biliniyor; korunmak istenen **açılmış** boyut | `Length` = açılmış boyut |
| **Zip-bomb kontrolünü PDF'e de uygulamak** | PDF ZIP değildir, `ZipArchive` istisna fırlatır | Yalnızca `DosyaTuru.Docx` dalında |
| **Zaman aşımını `Task.Run` dışında vermek** | `PdfPig` senkron çalışır; `CancellationToken` iş içinde kontrol edilmezse iptal edilmez | Döngü içinde `ThrowIfCancellationRequested()` |
| **`RequestSizeLimit`'i unutmak** | Doğrulayıcı 50 MB der ama Kestrel gövdeyi zaten belleğe almıştır | Öznitelik + `DosyaDogrulayici.EnBuyukBoyut` aynı sabitten |
| **Kitabı metin çıkarmadan önce oluşturmak** | Hata durumunda yetim `Book` kaydı kalır; eski kod bunu "geri silerek" çözüyordu | Yeni akış: önce metin, sonra kayıt |
| **Sahte PDF testinde gerçek PDF üretmeye çalışmak** | Test bağımlılığı artar, kırılganlaşır | Sihirli baytlar yeterli — doğrulayıcı zaten ilk 8 baytı okuyor |
| **`stackalloc` ile 8 bayttan fazla okumaya çalışmak** | Büyük `stackalloc` yığın taşmasına yol açar | 8 bayt yeterli; daha fazlası gerekirse `ArrayPool` |

---

## Teslim şablonu

```markdown
## 1. Kanıtlanarak kapandı
<6 bitti-kriteri komutunun ham çıktısı>
<MUTASYON A çıktısı — sahte PDF'in kabul edildiği (KIRMIZI) kanıtı>
<MUTASYON B ve C çıktıları>

## 2. Kapanmadı
- DOCX sayfa seçici arayüzü hâlâ görünüyor (adım 10, seçenek A frontend işi) — teknik borç
- Taranmış (görsel) PDF'ler için OCR yok; kullanıcı "metin çıkarılamadı" hatası alıyor (mevcut davranış)

## 3. İnsan müdahalesi gerekiyor
- [ ] DOCX sayfa seçimi kararı (A/B) — varsayılan A uygulandı
- [ ] Yönetici panelinde DOCX için sayfa seçiciyi gizleme işi planlanmalı
- [ ] Üretimde 50 MB / 500 sayfa sınırları yeterli mi? (gerçek kitap boyutlarına göre)

## Değiştirilen dosyalar
<git diff --stat>

## Commit
<git log -1 --format='%H %s'>
```
