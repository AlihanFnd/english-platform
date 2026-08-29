using EnglishReadingPlatform.Security;
using FluentAssertions;
using Xunit;

namespace EnglishReadingPlatform.Tests;

/// <summary>KURAL-09: şifre politikasının birim testleri. Veritabanı gerektirmez.</summary>
public class SifrePolitikasiTests
{
    private readonly SifrePolitikasi _politika = new();

    [Theory]
    [Trait("Category", "KimlikSertlestirme")]
    [InlineData("123456",        "kısa ve yaygın")]
    [InlineData("password",      "yaygın")]
    [InlineData("sifre123",      "yaygın")]
    [InlineData("aaaaaaaaaaaa",  "çeşitlilik yok")]
    [InlineData("abcdefghij",    "karmaşıklık yok")]
    [InlineData("Kisa1!",        "10 karakterden kısa")]
    [InlineData("",              "boş")]
    public void Zayif_sifreler_reddedilir(string sifre, string gerekce)
    {
        _politika.Dogrula(sifre).Gecerli.Should().BeFalse($"'{sifre}' reddedilmeli: {gerekce}");
    }

    [Theory]
    [Trait("Category", "KimlikSertlestirme")]
    [InlineData("Kaplan!Deniz42")]
    [InlineData("uzun-ve-Guclu-2026")]
    [InlineData("Yagmur#Bulut7788")]
    public void Guclu_sifreler_kabul_edilir(string sifre)
    {
        var sonuc = _politika.Dogrula(sifre);
        sonuc.Gecerli.Should().BeTrue(sonuc.BirlesikMesaj);
    }

    /// <summary>Türkçe harfler karmaşıklık sınıflarında sayılmalı — yoksa meşru şifre reddedilir.</summary>
    [Fact]
    [Trait("Category", "KimlikSertlestirme")]
    public void Turkce_harfli_guclu_sifre_kabul_edilir()
    {
        var sonuc = _politika.Dogrula("ÇiğdemGül2026");
        sonuc.Gecerli.Should().BeTrue(sonuc.BirlesikMesaj);
    }

    [Fact]
    [Trait("Category", "KimlikSertlestirme")]
    public void Kullanici_adini_iceren_sifre_reddedilir()
    {
        _politika.Dogrula("Alihan!2026xyz", kullaniciAdi: "alihan")
                 .Gecerli.Should().BeFalse();
    }

    [Fact]
    [Trait("Category", "KimlikSertlestirme")]
    public void Eposta_yerel_kismini_iceren_sifre_reddedilir()
    {
        _politika.Dogrula("Ogrenci!2026ABC", eposta: "ogrenci@okul.com")
                 .Gecerli.Should().BeFalse();
    }

    [Fact]
    [Trait("Category", "KimlikSertlestirme")]
    public void Cok_uzun_sifre_reddedilir()
    {
        _politika.Dogrula(new string('A', 500) + "a1!").Gecerli.Should().BeFalse();
    }

    /// <summary>Mevcut testlerin kullandığı şifre politikadan geçmeli — yoksa 163 test kırılır.</summary>
    [Fact]
    [Trait("Category", "KimlikSertlestirme")]
    public void Test_altyapisinin_sifresi_politikadan_gecer()
    {
        _politika.Dogrula("TestSifre123!").Gecerli.Should().BeTrue();
        _politika.Dogrula("GucluSifre123!").Gecerli.Should().BeTrue();
    }
}
