using System.IO.Compression;
using System.Text;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using Microsoft.AspNetCore.Http;
using PdfSayfaBoyutu = UglyToad.PdfPig.Content.PageSize;
using UglyToad.PdfPig.Core;
using UglyToad.PdfPig.Fonts.Standard14Fonts;
using UglyToad.PdfPig.Writer;

namespace EnglishReadingPlatform.Tests.Infrastructure;

/// <summary>
/// KURAL-10 testleri için belge üreteci.
///
/// GERÇEK dosyalar üretir çünkü bazı testler ayrıştırıcıya kadar gitmek
/// zorundadır: "500 sayfa sınırı" mutasyonu, yalnızca sınır kalkınca istek
/// BAŞARILI olduğunda kırmızıya döner. Sahte baytlarla o istek zaten
/// "PDF okunamadı" ile 400 döner ve mutasyon fark edilmez —
/// yani test, ölçtüğünü sandığı şeyi ölçmez.
/// </summary>
public static class TestBelgeleri
{
    public static IFormFile Dosya(byte[] icerik, string ad)
        => new FormFile(new MemoryStream(icerik), 0, icerik.Length, "file", ad)
        {
            Headers = new HeaderDictionary(),
            ContentType = "application/octet-stream"
        };

    /// <summary>Ayrıştırılabilir, gerçek bir PDF.</summary>
    public static byte[] GercekPdf(int sayfaSayisi = 1)
    {
        var uretici = new PdfDocumentBuilder();
        var yaziTipi = uretici.AddStandard14Font(Standard14Font.Helvetica);

        for (var i = 1; i <= sayfaSayisi; i++)
        {
            var sayfa = uretici.AddPage(PdfSayfaBoyutu.A4);
            sayfa.AddText($"Sayfa {i} metni burada duruyor.", 12, new PdfPoint(25, 700), yaziTipi);
        }

        return uretici.Build();
    }

    /// <summary>Ayrıştırılabilir, gerçek bir DOCX.</summary>
    public static byte[] GercekDocx(string metin = "Merhaba dunya. Bu bir test belgesidir.")
    {
        using var bellek = new MemoryStream();
        using (var belge = WordprocessingDocument.Create(
                   bellek, WordprocessingDocumentType.Document, autoSave: true))
        {
            var ana = belge.AddMainDocumentPart();
            ana.Document = new Document(new Body(new Paragraph(new Run(new Text(metin)))));
        }
        return bellek.ToArray();
    }

    /// <summary>PDF gibi görünmeyen, çalıştırılabilir başlıklı içerik.</summary>
    public static byte[] SahteCalistirilabilir()
        => Encoding.ASCII.GetBytes("MZ This is actually an executable");

    /// <summary>Sihirli baytları doğru ama gövdesi çöp olan PDF.</summary>
    public static byte[] BozukPdf()
        => new byte[] { 0x25, 0x50, 0x44, 0x46, 0x2D, 0xFF, 0xFE, 0x00, 0x01, 0x02 };

    /// <summary>DOCX yerine sadece ZIP: sihirli baytlar PK, içeriği anlamsız.</summary>
    public static byte[] BasitZip()
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

    /// <summary>Açıldığında <paramref name="megabayt"/> MB'a ulaşan sıkıştırılmış arşiv.</summary>
    public static byte[] ZipBombasi(int megabayt)
    {
        using var bellek = new MemoryStream();
        using (var arsiv = new ZipArchive(bellek, ZipArchiveMode.Create, true))
        {
            var giris = arsiv.CreateEntry("word/document.xml", CompressionLevel.SmallestSize);
            using var akis = giris.Open();
            var blok = new byte[1024 * 1024];          // 1 MB sıfır
            for (var i = 0; i < megabayt; i++) akis.Write(blok, 0, blok.Length);
        }
        return bellek.ToArray();
    }

    /// <summary>
    /// ZIP başlıklarındaki "açılmış boyut" alanlarını SIFIRLAR.
    ///
    /// Gerçek bir saldırganın yapacağı şey budur: merkezî dizindeki boyut alanı
    /// arşivi ÜRETEN tarafın yazdığı bir sayıdır, ölçülmüş bir değer değil.
    /// Yalnızca o alana bakan bir zip-bomb kontrolü bu dosyayı geçirir.
    /// </summary>
    public static byte[] BoyutuYalanSoyleyenZip(byte[] arsiv)
    {
        var kopya = (byte[])arsiv.Clone();

        for (var i = 0; i + 30 <= kopya.Length; i++)
        {
            // Yerel dosya başlığı: PK 03 04 — açılmış boyut alanı ofset 22
            if (kopya[i] == 0x50 && kopya[i + 1] == 0x4B && kopya[i + 2] == 0x03 && kopya[i + 3] == 0x04)
                Array.Clear(kopya, i + 22, 4);

            // Merkezî dizin başlığı: PK 01 02 — açılmış boyut alanı ofset 24
            if (kopya[i] == 0x50 && kopya[i + 1] == 0x4B && kopya[i + 2] == 0x01 && kopya[i + 3] == 0x02)
                Array.Clear(kopya, i + 24, 4);
        }

        return kopya;
    }
}
