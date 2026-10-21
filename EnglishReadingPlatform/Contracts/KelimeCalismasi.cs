namespace EnglishReadingPlatform.Contracts;

/// <summary>
/// Kelime çalışma seansının kuralları — TEK kaynak.
/// </summary>
public static class KelimeCalismasi
{
    /// <summary>
    /// Bir kelimenin "öğrenildi" sayılması için gereken Leitner kutusu (Kutu 4 = 7 gün aralık).
    /// </summary>
    public const int OgrenildiEsigi = LeitnerHesaplayici.OgrenildiEsigiKutu;

    /// <summary>Bir seansta çalışılabilecek en az kelime.</summary>
    public const int EnAzSeansBoyu = 1;

    /// <summary>
    /// Bir seansta çalışılabilecek en fazla kelime.
    /// Sınırsız bırakmak, tek istekle bütün listeyi belleğe çekmeye izin verir.
    /// </summary>
    public const int EnCokSeansBoyu = 100;

    /// <summary>Kullanıcı bir seçim yapmazsa kullanılan boy.</summary>
    public const int VarsayilanSeansBoyu = 20;
}

/// <summary>Çalışma seansındaki tek bir kart.</summary>
public record CalismaKartiYaniti(
    int Id,
    string Word,
    string Translation,
    string Context,
    int DogruSeri,
    int Kutu,
    DateTime? SonrakiTekrarAt,
    bool Ogrenildi);

/// <summary>Kelime listesinin çalışma özeti.</summary>
/// <param name="Toplam">Listedeki tüm kelimeler.</param>
/// <param name="Ogrenildi">Kutu 4 ve üzeri olanlar.</param>
/// <param name="Calisiliyor">Çalışılmış ama henüz Kutu 4'e ulaşmamış olanlar.</param>
/// <param name="HicCalisilmadi">Hiç karşısına çıkmamış olanlar (Kutu 0 ve SonCalismaAt null).</param>
/// <param name="BugunTekrar">SonrakiTekrarAt zamanı gelmiş olanlar.</param>
/// <param name="YarinTekrar">Gelecek 24 saat içinde tekrar zamanı gelecek olanlar.</param>
/// <param name="KutuDagilimi">Kutu 0-7 arası dağılım dizisi (uzunluk: 8).</param>
public record KelimeOzetiYaniti(
    int Toplam,
    int Ogrenildi,
    int Calisiliyor,
    int HicCalisilmadi,
    int BugunTekrar,
    int YarinTekrar,
    int[] KutuDagilimi,
    int OgrenildiEsigi);
