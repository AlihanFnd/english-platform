using EnglishReadingPlatform.Validation;
using FluentAssertions;
using Xunit;

namespace EnglishReadingPlatform.Tests;

/// <summary>
/// KirpEnCok birim testleri. Kırpma, kolona yazılmadan önceki son savunma hattıdır ve
/// 20'den fazla yazma yolunda kullanılır: kelime, bağlam, çeviri, kullanıcı adı,
/// e-posta, kitap/bölüm başlığı, grup adı, çeviri önbelleği.
/// </summary>
public class MetinUzantilariTests
{
    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public void Sinirin_altindaki_metne_dokunmaz_ustundekini_keser()
    {
        "  abc  ".KirpEnCok(10).Should().Be("abc");
        ((string?)null).KirpEnCok(10).Should().Be("");
        "abcdef".KirpEnCok(4).Should().Be("abcd");
    }

    /// <summary>
    /// Emoji ve bazı harfler UTF-16'da İKİ birimdir (vekil çifti). Sınır tam ortalarına
    /// denk gelirse yarım vekil kalır; yarım vekil geçerli UTF-8'e çevrilemez.
    /// </summary>
    [Theory]
    [Trait("Category", "GirdiDogrulama")]
    [InlineData("😀")]   // U+1F600
    [InlineData("𝒜")]   // U+1D49C
    public void Vekil_ciftini_ORTASINDAN_bolmez(string ikiBirimlik)
    {
        var metin = new string('a', 199) + ikiBirimlik + "tail";

        var sonuc = metin.KirpEnCok(200);

        sonuc.Length.Should().BeLessThanOrEqualTo(200);
        char.IsHighSurrogate(sonuc[^1]).Should().BeFalse("yarım vekil geçerli UTF-8'e çevrilemez");
        sonuc.Should().Be(new string('a', 199));
    }
}
