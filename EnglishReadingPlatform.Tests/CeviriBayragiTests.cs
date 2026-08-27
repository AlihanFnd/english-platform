using System.Text.Json;
using EnglishReadingPlatform.Services;
using FluentAssertions;
using Xunit;

namespace EnglishReadingPlatform.Tests;

/// <summary>
/// KURAL-06 — "bu satır çevrilemedi" bayrağının sözleşmesi.
///
/// Bayrak yalnızca üretildiği anda değil, BookPage.SentencesJson'a yazılıp
/// tekrar okunduğunda da doğru olmak zorunda: okuyucu sayfaların çoğunu
/// veritabanındaki bu JSON'dan okuyor, çeviri servisinden değil.
/// </summary>
public class CeviriBayragiTests
{
    [Fact]
    [Trait("Category", "HataHijyeni")]
    public void Basarisiz_ceviri_SentencesJson_turunda_hayatta_kalir()
    {
        var cumleler = new List<AnalyzedSentence>
        {
            new() { Index = 0, Original = "Hello.",     Translation = "Merhaba.", CeviriBasarili = true  },
            new() { Index = 1, Original = "Good bye.",  Translation = "Good bye.", CeviriBasarili = false }
        };

        // BooksController'ın yaptığı ile aynı: düz Serialize, özel ayar yok.
        var json = JsonSerializer.Serialize(cumleler);

        // Frontend bu adı okuyor (books/[id]/page.tsx, ocr/page.tsx).
        json.Should().Contain("ceviriBasarili",
            "frontend alanı bu adla arıyor; ad değişirse uyarı sessizce kaybolur");

        var geri = JsonSerializer.Deserialize<List<AnalyzedSentence>>(json)!;
        geri[0].CeviriBasarili.Should().BeTrue();
        geri[1].CeviriBasarili.Should().BeFalse("başarısız çeviri işaretli kalmalı");
    }

    [Fact]
    [Trait("Category", "HataHijyeni")]
    public void Alani_olmayan_ESKI_kayit_basarili_sayilir()
    {
        // KURAL-06'dan ÖNCE yazılmış SentencesJson satırları bu alanı taşımıyor.
        // Eksikliği "başarısız" saymak, veritabanındaki tüm eski sayfaları
        // hatalı biçimde "çevrilemedi" diye işaretlerdi.
        const string eskiKayit =
            """[{"index":0,"original":"Hello.","translation":"Merhaba.","isHeading":false,"words":[]}]""";

        var geri = JsonSerializer.Deserialize<List<AnalyzedSentence>>(eskiKayit)!;

        geri.Should().HaveCount(1);
        geri[0].CeviriBasarili.Should().BeTrue("alan yoksa varsayılan 'başarılı' olmalı");
    }

    [Fact]
    [Trait("Category", "HataHijyeni")]
    public void CeviriSonucu_basarisizken_ozgun_metni_tasir_ama_isaretler()
    {
        // Sözleşme: metin yine döner (arayüz boş kalmasın) ama Basarili=false.
        var sonuc = new CeviriSonucu { Metin = "The old man was thin.", Basarili = false, Kaynak = "yok" };

        sonuc.Metin.Should().NotBeNullOrWhiteSpace("arayüz boş satır göstermemeli");
        sonuc.Basarili.Should().BeFalse();
    }
}
