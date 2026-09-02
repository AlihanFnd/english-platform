using System.IO.Compression;
using EnglishReadingPlatform.Exceptions;
using EnglishReadingPlatform.Files;
using EnglishReadingPlatform.Tests.Infrastructure;
using FluentAssertions;
using Xunit;

namespace EnglishReadingPlatform.Tests;

/// <summary>KURAL-10: merkezî dosya doğrulayıcısının birim testleri.</summary>
public class DosyaDogrulayiciTests
{
    private readonly DosyaDogrulayici _dogrulayici = new();

    // ─── Tür içerikten belirlenir ────────────────────────────────

    [Fact]
    [Trait("Category", "DosyaYukleme")]
    public void Uzantisi_degistirilmis_dosya_reddedilir()
    {
        // ANA REGRESYON: kotu.exe → kotu.pdf
        var eylem = () => _dogrulayici.Dogrula(
            TestBelgeleri.Dosya(TestBelgeleri.SahteCalistirilabilir(), "kitap.pdf"));

        eylem.Should().Throw<KullaniciHatasi>().WithMessage("*içeriği tanınamadı*");
    }

    [Fact]
    [Trait("Category", "DosyaYukleme")]
    public void Docx_icerigi_pdf_uzantisiyla_reddedilir()
    {
        var eylem = () => _dogrulayici.Dogrula(
            TestBelgeleri.Dosya(TestBelgeleri.GercekDocx(), "kitap.pdf"));

        eylem.Should().Throw<KullaniciHatasi>().WithMessage("*uzantısı içeriğiyle uyuşmuyor*");
    }

    [Fact]
    [Trait("Category", "DosyaYukleme")]
    public void Pdf_icerigi_docx_uzantisiyla_reddedilir()
    {
        var eylem = () => _dogrulayici.Dogrula(
            TestBelgeleri.Dosya(TestBelgeleri.GercekPdf(), "kitap.docx"));

        eylem.Should().Throw<KullaniciHatasi>().WithMessage("*uzantısı içeriğiyle uyuşmuyor*");
    }

    [Fact]
    [Trait("Category", "DosyaYukleme")]
    public void ContentType_basligi_karara_etki_etmez()
    {
        // Content-Type'ı da istemci yazar. "application/pdf" diyen bir çalıştırılabilir
        // yine reddedilmeli — karar YALNIZCA sihirli baytlarda.
        var dosya = TestBelgeleri.Dosya(TestBelgeleri.SahteCalistirilabilir(), "kitap.pdf");
        dosya.ContentType.Should().NotBeNull();

        var eylem = () => _dogrulayici.Dogrula(dosya);

        eylem.Should().Throw<KullaniciHatasi>().WithMessage("*içeriği tanınamadı*");
    }

    [Fact]
    [Trait("Category", "DosyaYukleme")]
    public void Gecerli_pdf_kabul_edilir()
        => _dogrulayici.Dogrula(TestBelgeleri.Dosya(TestBelgeleri.GercekPdf(), "kitap.pdf"))
                       .Should().Be(DosyaTuru.Pdf);

    [Fact]
    [Trait("Category", "DosyaYukleme")]
    public void Gecerli_docx_kabul_edilir()
        => _dogrulayici.Dogrula(TestBelgeleri.Dosya(TestBelgeleri.GercekDocx(), "kitap.docx"))
                       .Should().Be(DosyaTuru.Docx);

    [Fact]
    [Trait("Category", "DosyaYukleme")]
    public void Izinsiz_uzanti_reddedilir()
    {
        var eylem = () => _dogrulayici.Dogrula(
            TestBelgeleri.Dosya(TestBelgeleri.GercekPdf(), "kitap.txt"));

        eylem.Should().Throw<KullaniciHatasi>().WithMessage("*PDF veya DOCX*");
    }

    [Fact]
    [Trait("Category", "DosyaYukleme")]
    public void Bos_dosya_reddedilir()
    {
        var eylem = () => _dogrulayici.Dogrula(
            TestBelgeleri.Dosya(Array.Empty<byte>(), "bos.pdf"));

        eylem.Should().Throw<KullaniciHatasi>();
    }

    [Fact]
    [Trait("Category", "DosyaYukleme")]
    public void Dosya_verilmezse_reddedilir()
    {
        var eylem = () => _dogrulayici.Dogrula(null);

        eylem.Should().Throw<KullaniciHatasi>().WithMessage("*seçilmedi*");
    }

    // ─── Sayfa seçimi sınırları ──────────────────────────────────

    [Fact]
    [Trait("Category", "DosyaYukleme")]
    public void Cok_fazla_sayfa_reddedilir()
    {
        // Sayı KASTEN sabit. "EnCokSayfa + 50" yazmak testi kendi ölçtüğü sabite
        // bağlar: sınır 999999'a çıkarılsa girdi de onunla büyür ve test yeşil
        // kalır — yani sınırın DEĞERİNİ hiç ölçmemiş olur. Mutasyonla doğrulandı.
        const int istenenSayfa = 1_600;
        istenenSayfa.Should().BeGreaterThan(DosyaDogrulayici.EnCokSayfa,
            "sınır bilinçli olarak yükseltildiyse bu testteki sayı da güncellenmeli");

        var cokSayfa = string.Join(",", Enumerable.Range(1, istenenSayfa));

        var eylem = () => _dogrulayici.SayfalariDogrula(cokSayfa, toplamSayfa: 10_000);

        eylem.Should().Throw<KullaniciHatasi>().WithMessage("*en fazla*sayfa*");
    }

    [Fact]
    [Trait("Category", "DosyaYukleme")]
    public void Sayfa_ust_siniri_dosya_acilmadan_uygulanir()
    {
        // SecimiCoz dosyaya hiç dokunmaz: sınır, ayrıştırıcı meşgul edilmeden önce işler.
        const int istenenSayfa = 1_501;   // sabit — gerekçe için yukarıdaki teste bak
        istenenSayfa.Should().BeGreaterThan(DosyaDogrulayici.EnCokSayfa);

        var cokSayfa = string.Join(",", Enumerable.Range(1, istenenSayfa));

        var eylem = () => _dogrulayici.SecimiCoz(cokSayfa);

        eylem.Should().Throw<KullaniciHatasi>().WithMessage("*en fazla*sayfa*");
    }

    [Fact]
    [Trait("Category", "DosyaYukleme")]
    public void Aralik_disi_sayfalar_atilir()
        => _dogrulayici.SayfalariDogrula("1,2,999,-5,3", toplamSayfa: 10)
                       .Should().BeEquivalentTo(new[] { 1, 2, 3 });

    [Fact]
    [Trait("Category", "DosyaYukleme")]
    public void Tekrarli_sayfalar_teklestirilir()
        => _dogrulayici.SayfalariDogrula("3,1,3,2,1", 10)
                       .Should().BeEquivalentTo(new[] { 1, 2, 3 });

    [Fact]
    [Trait("Category", "DosyaYukleme")]
    public void Bos_secim_reddedilir()
    {
        var eylem = () => _dogrulayici.SayfalariDogrula("   ", 10);

        eylem.Should().Throw<KullaniciHatasi>().WithMessage("*sayfaları seçin*");
    }

    [Fact]
    [Trait("Category", "DosyaYukleme")]
    public void Hicbiri_aralikta_degilse_reddedilir()
    {
        var eylem = () => _dogrulayici.SayfalariDogrula("900,901", toplamSayfa: 10);

        eylem.Should().Throw<KullaniciHatasi>().WithMessage("*Geçerli bir sayfa*");
    }

    // ─── Zip-bomb ────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "DosyaYukleme")]
    public void Zip_bomb_reddedilir()
    {
        // 300 MB açılmış içerik, birkaç KB sıkıştırılmış.
        var dosya = TestBelgeleri.Dosya(TestBelgeleri.ZipBombasi(300), "bomba.docx");

        var eylem = () => _dogrulayici.ZipBombKontrolu(dosya);

        eylem.Should().Throw<KullaniciHatasi>();
    }

    [Fact]
    [Trait("Category", "DosyaYukleme")]
    public void Boyutunu_yalan_soyleyen_zip_bildirdiginden_fazlasini_teslim_edemez()
    {
        // NEDEN BU TEST VAR: "bildirilen boyut" alanını arşivi ÜRETEN taraf yazar,
        // yani saldırgan. İlk bakışta 1. aşama (bildirilen toplam) kandırılabilir
        // görünür. ÖLÇÜLDÜ, öyle değil: .NET'in ZipArchive'ı bildirilen boyutu
        // DeflateStream'e ÜST SINIR olarak veriyor — 0 yazan bir arşiv 0 bayt
        // teslim ediyor, 300 MB değil. Yani aşağı yönlü yalan bir bomba üretmiyor.
        //
        // Bu test o çalışma zamanı davranışını SABİTLER. Davranış bir gün
        // değişirse burası kırmızıya döner ve 2. aşamanın (gerçek bayt sayacı)
        // artık yük taşıyan kontrol hâline geldiğini bize söyler — sessizce
        // koruma kaybetmeyiz.
        var yalanci = TestBelgeleri.BoyutuYalanSoyleyenZip(TestBelgeleri.ZipBombasi(300));

        var bildirilen = 0L;
        var gercektenOkunan = 0L;
        using (var bellek = new MemoryStream(yalanci))
        using (var arsiv = new ZipArchive(bellek, ZipArchiveMode.Read, leaveOpen: false))
        {
            var tampon = new byte[81_920];
            foreach (var giris in arsiv.Entries)
            {
                bildirilen += giris.Length;
                using var akis = giris.Open();
                int okunan;
                while ((okunan = akis.Read(tampon, 0, tampon.Length)) > 0) gercektenOkunan += okunan;
            }
        }

        bildirilen.Should().Be(0, "arşiv boyutunu sıfır olarak bildiriyor");
        gercektenOkunan.Should().Be(bildirilen,
            "ZipArchive bildirilen boyutu üst sınır olarak uyguluyor — aşağı yönlü yalan bomba üretemez");
    }

    [Fact]
    [Trait("Category", "DosyaYukleme")]
    public void Normal_docx_zip_bomb_kontrolunden_gecer()
    {
        // Yanlış pozitif olmamalı: meşru bir DOCX her zaman geçmeli.
        var dosya = TestBelgeleri.Dosya(TestBelgeleri.GercekDocx(), "normal.docx");

        var eylem = () => _dogrulayici.ZipBombKontrolu(dosya);

        eylem.Should().NotThrow();
    }

    [Fact]
    [Trait("Category", "DosyaYukleme")]
    public void Bozuk_zip_kullanici_hatasi_verir()
    {
        // İç detay sızdıran ham InvalidDataException DEĞİL.
        var dosya = TestBelgeleri.Dosya(
            new byte[] { 0x50, 0x4B, 0x03, 0x04, 0xFF, 0xFF, 0xFF, 0xFF }, "bozuk.docx");

        var eylem = () => _dogrulayici.ZipBombKontrolu(dosya);

        eylem.Should().Throw<KullaniciHatasi>().WithMessage("*okunamadı*");
    }
}
