namespace EnglishReadingPlatform.Contracts;

/// <summary>
/// Kelime çalışma seansının kuralları — TEK kaynak.
///
/// Eşik hem sunucuda (seans seçimi, özet sayımı) hem istemcide (rozet)
/// kullanılıyor. İki yerde ayrı yazılırsa biri değişir, diğeri kalır ve
/// kullanıcı "35 öğrenildi" yazan bir ekranla "34 öğrenildi" diyen bir
/// listeyi yan yana görür. İstemci bu değeri özet ucundan okur.
/// </summary>
public static class KelimeCalismasi
{
    /// <summary>
    /// Bir kelimenin "öğrenildi" sayılması için gereken ÜST ÜSTE doğru sayısı.
    /// 3, ezberle gerçek öğrenmeyi ayırt etmeye yetecek kadar; kullanıcıyı
    /// bıktırmayacak kadar az.
    /// </summary>
    public const int OgrenildiEsigi = 3;

    /// <summary>Bir seansta çalışılabilecek en az kelime.</summary>
    public const int EnAzSeansBoyu = 1;

    /// <summary>
    /// Bir seansta çalışılabilecek en fazla kelime.
    /// Sınırsız bırakmak, tek istekle bütün listeyi belleğe çekmeye izin verir
    /// (KURAL-07: kaynak tüketimi). 100 kart zaten tek oturumda bitmez.
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
    bool Ogrenildi);

/// <summary>Kelime listesinin çalışma özeti.</summary>
/// <param name="Toplam">Listedeki tüm kelimeler.</param>
/// <param name="Ogrenildi">Üst üste eşik kadar doğru bilinenler.</param>
/// <param name="Calisiliyor">Çalışılmış ama henüz öğrenilmemiş olanlar.</param>
/// <param name="HicCalisilmadi">Hiç karşısına çıkmamış olanlar.</param>
public record KelimeOzetiYaniti(
    int Toplam,
    int Ogrenildi,
    int Calisiliyor,
    int HicCalisilmadi,
    int OgrenildiEsigi);
