using EnglishReadingPlatform.Exceptions;
using EnglishReadingPlatform.RateLimiting;
using FluentAssertions;
using Xunit;

namespace EnglishReadingPlatform.Tests;

/// <summary>
/// KURAL-07 İhlal 4: eşzamanlılık sınırı.
///
/// Hız sınırı "dakikada kaç istek" sorusunu yanıtlar; bu kapı "aynı anda kaç
/// tanesi bellekte" sorusunu. İkincisi olmadan 10 kullanıcının aynı anda
/// yüklediği 50 MB'lık PDF, dakikalık kotayı hiç aşmadan sunucuyu düşürebilir.
/// </summary>
public class AgirIsKapisiTests
{
    [Fact]
    [Trait("Category", "HizSiniri")]
    public async Task Sinir_ustundeki_is_beklemeden_reddedilir()
    {
        using var kapi = new AgirIsKapisi();
        using var birak = new SemaphoreSlim(0);

        // Kapıyı tamamen doldur.
        var tutulanlar = Enumerable.Range(0, HizSinirlari.EszamanliAgirIs)
            .Select(_ => kapi.CalistirAsync(async () => { await birak.WaitAsync(); return 1; }))
            .ToArray();

        // Yerlerin gerçekten alındığını doğrula (yarış olmasın).
        var basladi = SpinWait.SpinUntil(() => kapi.BostaYer == 0, TimeSpan.FromSeconds(5));
        basladi.Should().BeTrue("dolduran işler kapıyı işgal etmiş olmalı");

        var eylem = async () => await kapi.CalistirAsync(() => Task.FromResult(2));

        var hata = await eylem.Should().ThrowAsync<KullaniciHatasi>(
            "kapı doluysa istek KUYRUĞA ALINMAZ — kuyruk, korunmak istenen belleği tüketir");
        hata.And.DurumKodu.Should().Be(503);

        birak.Release(HizSinirlari.EszamanliAgirIs);
        await Task.WhenAll(tutulanlar);
    }

    [Fact]
    [Trait("Category", "HizSiniri")]
    public async Task Istisna_atan_is_yeri_geri_birakir()
    {
        // finally olmasaydı her hata kapıyı biraz daha daraltır, sonunda tamamen
        // kapatırdı — tek bir bozuk PDF servisi kilitlerdi.
        using var kapi = new AgirIsKapisi();

        for (var i = 0; i < HizSinirlari.EszamanliAgirIs * 3; i++)
        {
            var eylem = async () => await kapi.CalistirAsync<int>(
                () => throw new InvalidOperationException("test"));
            await eylem.Should().ThrowAsync<InvalidOperationException>();
        }

        kapi.BostaYer.Should().Be(HizSinirlari.EszamanliAgirIs,
            "istisna atan işler yerlerini geri bırakmalı");
    }
}
