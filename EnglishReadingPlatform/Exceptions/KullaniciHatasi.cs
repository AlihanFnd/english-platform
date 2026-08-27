namespace EnglishReadingPlatform.Exceptions;

/// <summary>
/// KURAL-06: Mesajı kullanıcıya GÖSTERİLEBİLİR olan hata.
///
/// Bu istisnayı fırlatan kod, mesajın içinde iç detay (dosya yolu, sınıf adı,
/// SQL sorgusu, sunucu adresi, istisna metni) BULUNMADIĞINI garanti eder.
/// Yani mesaj elle yazılmış, kullanıcıya yönelik bir cümledir — asla
/// $"...{ex.Message}" gibi bir birleştirme değildir.
///
/// Merkezî HataYakalamaMiddleware bu istisnayı görürse mesajı AYNEN iletir;
/// diğer her istisnada mesaj gizlenir ve yerine olay kimliği konur.
/// </summary>
public class KullaniciHatasi : Exception
{
    public int DurumKodu { get; }

    public KullaniciHatasi(string kullaniciMesaji, int durumKodu = 400)
        : base(kullaniciMesaji) => DurumKodu = durumKodu;
}
