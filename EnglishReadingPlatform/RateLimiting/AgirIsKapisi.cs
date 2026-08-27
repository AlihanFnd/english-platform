using EnglishReadingPlatform.Exceptions;

namespace EnglishReadingPlatform.RateLimiting;

/// <summary>
/// KURAL-07 İhlal 4: Aynı anda çalışabilecek AĞIR iş (LLM analizi, PDF ayrıştırma)
/// sayısını sınırlar.
///
/// Hız sınırı "dakikada kaç istek" sorusunu yanıtlar; eşzamanlılık sınırı
/// "aynı anda kaç tanesi bellekte" sorusunu. İkincisi olmadan 10 kullanıcının
/// aynı anda yüklediği 50 MB'lık PDF, dakikalık kotayı hiç aşmadan sunucuyu
/// düşürebilir.
///
/// SIRA DOLDUĞUNDA BEKLEMEZ, REDDEDER: kuyrukta biriken istekler thread ve bellek
/// tüketir — korunmak istenen şeyin ta kendisi. 2 saniyelik kısa bir bekleme,
/// anlık dalgalanmaları yutar; ötesi 503 alır.
/// </summary>
public sealed class AgirIsKapisi : IDisposable
{
    private readonly SemaphoreSlim _semafor = new(HizSinirlari.EszamanliAgirIs, HizSinirlari.EszamanliAgirIs);

    /// <summary>Şu an kaç ağır iş yeri boşta — testler ve teşhis içindir.</summary>
    public int BostaYer => _semafor.CurrentCount;

    public async Task<T> CalistirAsync<T>(Func<Task<T>> isGovdesi, CancellationToken iptal = default)
    {
        if (!await _semafor.WaitAsync(HizSinirlari.AgirIsBeklemeSuresi, iptal))
            throw new KullaniciHatasi(
                "Sistem şu anda yoğun. Lütfen birkaç saniye sonra tekrar deneyin.", 503);

        try
        {
            return await isGovdesi();
        }
        finally
        {
            // finally ZORUNLU: istisna durumunda serbest bırakılmayan bir yer,
            // kapıyı kalıcı olarak daraltır ve sonunda tamamen kapatır.
            _semafor.Release();
        }
    }

    public void Dispose() => _semafor.Dispose();
}
