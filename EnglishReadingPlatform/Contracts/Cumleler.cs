using System.ComponentModel.DataAnnotations;
using EnglishReadingPlatform.Validation;

namespace EnglishReadingPlatform.Contracts;

public record CumleIstegi(
    [Required(ErrorMessage = "Cümle metni zorunludur.")]
    [StringLength(AlanSinirlari.Cumle, ErrorMessage = "Cümle en fazla 500 karakter olabilir.")]
    string Cumle,

    [StringLength(AlanSinirlari.CumleCevirisi, ErrorMessage = "Çeviri en fazla 1000 karakter olabilir.")]
    string? Ceviri,

    [StringLength(AlanSinirlari.CumleBaglami, ErrorMessage = "Bağlam en fazla 400 karakter olabilir.")]
    string? Baglam
);

/// <summary>
/// Toplu içe aktarmanın (yerel cümle göçünün) öğesi.
///
/// Sınırlar GİRDİ sınırıdır, kolon sınırı DEĞİL: öğe düzeyindeki bir doğrulama hatası
/// MVC'de bütün isteği 400'e düşürür. Gövde eski yerel veriden gelir ve orada sınır
/// yoktu; tek bir uzun ya da boş cümle, parçadaki bütün cümlelerin taşınmasını
/// engelliyordu. Kolonu aşan, boş ya da null öğeyi denetleyici TEK BAŞINA atlar ve
/// 'atlanan' sayar. Alanlar bu yüzden null olabilir — null olmayan string, MVC'de
/// örtük [Required] demektir.
/// </summary>
public record TopluCumleOgesi(
    [StringLength(AlanSinirlari.TopluCumleAlanGirdi, ErrorMessage = "Toplu eklemede bir alan en fazla 5000 karakter olabilir.")]
    string? Cumle,

    [StringLength(AlanSinirlari.TopluCumleAlanGirdi, ErrorMessage = "Toplu eklemede bir alan en fazla 5000 karakter olabilir.")]
    string? Ceviri,

    [StringLength(AlanSinirlari.TopluCumleAlanGirdi, ErrorMessage = "Toplu eklemede bir alan en fazla 5000 karakter olabilir.")]
    string? Baglam
);

public record TopluCumleIstegi(
    [MaxLength(AlanSinirlari.TopluCumleEnCok, ErrorMessage = "Tek seferde en fazla 200 cümle eklenebilir.")]
    List<TopluCumleOgesi>? Cumleler
);

public record CalismaSonucuCumleIstegi(
    [Range(1, int.MaxValue, ErrorMessage = "Geçersiz kayıt numarası.")]
    int CumleId,
    bool Bildim
);

public record CumleYaniti(
    int Id,
    string Cumle,
    string Ceviri,
    string Baglam,
    DateTime AddedAt,
    int DogruSayisi,
    int YanlisSayisi,
    int DogruSeri,
    int Kutu,
    DateTime? SonrakiTekrarAt,
    DateTime? SonCalismaAt,
    bool Ogrenildi
);

public record CumleOzetiYaniti(
    int Toplam,
    int Ogrenildi,
    int Calisiliyor,
    int HicCalisilmadi,
    int BugunTekrar,
    int YarinTekrar,
    int[] KutuDagilimi,
    int OgrenildiEsigi
);

public record TopluCumleSonucYaniti(
    int Eklenen,
    int Atlanan
);
