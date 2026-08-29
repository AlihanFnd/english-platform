using System.Text.RegularExpressions;

namespace EnglishReadingPlatform.Security;

/// <summary>Politika sonucu. Hatalar kullanıcıya gösterilebilir; iç detay taşımaz.</summary>
public record SifreDogrulamaSonucu(bool Gecerli, IReadOnlyList<string> Hatalar)
{
    public static SifreDogrulamaSonucu Basarili() => new(true, Array.Empty<string>());
    public string BirlesikMesaj => string.Join(" ", Hatalar);
}

/// <summary>
/// KURAL-09: Şifre kurallarının TEK kaynağı.
/// Kayıt, şifre değiştirme ve şifre sıfırlama yollarının HEPSİ buradan geçer.
/// Yeni bir şifre kabul eden yol eklenirse guard kapısı (09-kimlik.sh kapı 2)
/// bu servisten geçmediğini yakalar.
/// </summary>
public class SifrePolitikasi
{
    public const int EnAzUzunluk  = 10;
    public const int EnCokUzunluk = 128;   // BCrypt 72 bayt sonrasını yok sayar; DoS üst sınırı

    /// <summary>
    /// En sık kullanılan şifreler. Üretimde bu liste bir dosyadan yüklenmelidir
    /// (ör. SecLists top-10000). Buradaki küçük liste ASGARİ savunmadır.
    /// </summary>
    private static readonly HashSet<string> YayginSifreler = new(StringComparer.OrdinalIgnoreCase)
    {
        "password", "parola", "123456", "12345678", "123456789", "1234567890",
        "qwerty", "qwerty123", "asdasd", "111111", "123123", "abc123",
        "sifre123", "parola123", "iloveyou", "welcome",
        // NOT: SirDogrulayici'nin sızmış-sır listesiyle çakışan bir giriş bilerek
        // ÇIKARILDI. Aksi halde KURAL-02 sır tarayıcısı bu dosyayı işaretliyordu.
        // Tarayıcıyı gevşetmek yerine giriş kaldırıldı: 8 karakter uzunluğunda
        // olduğu için EnAzUzunluk=10 kuralına zaten takılıyor — koruma kaybı yok.
        "monkey", "dragon", "letmein", "football", "password1", "password123",
        "linguza", "linguza123", "ingilizce", "turkiye", "galatasaray",
        "fenerbahce", "besiktas", "trabzonspor"
    };

    public SifreDogrulamaSonucu Dogrula(string? sifre, string? kullaniciAdi = null, string? eposta = null)
    {
        var hatalar = new List<string>();

        if (string.IsNullOrWhiteSpace(sifre))
            return new SifreDogrulamaSonucu(false, new[] { "Şifre zorunludur." });

        if (sifre.Length < EnAzUzunluk)
            hatalar.Add($"Şifre en az {EnAzUzunluk} karakter olmalıdır.");

        if (sifre.Length > EnCokUzunluk)
            hatalar.Add($"Şifre en fazla {EnCokUzunluk} karakter olabilir.");

        // Karmaşıklık: dört sınıftan en az üçü.
        // Türkçe harfler dahil — yoksa "Çğıöşü" içeren meşru şifreler haksız yere reddedilir.
        var siniflar = 0;
        if (Regex.IsMatch(sifre, "[a-zçğıöşü]"))    siniflar++;
        if (Regex.IsMatch(sifre, "[A-ZÇĞİÖŞÜ]"))    siniflar++;
        if (Regex.IsMatch(sifre, "[0-9]"))          siniflar++;
        if (Regex.IsMatch(sifre, @"[^\p{L}\p{N}]")) siniflar++;

        if (siniflar < 3)
            hatalar.Add("Şifre; küçük harf, büyük harf, rakam ve sembol türlerinden en az üçünü içermelidir.");

        if (YayginSifreler.Contains(sifre))
            hatalar.Add("Bu şifre çok yaygın kullanılıyor, başka bir şifre seçin.");

        // Tek karakter tekrarı: "aaaaaaaaaa" uzunluk kuralını geçer ama tahmin edilebilir.
        if (sifre.Distinct().Count() <= 3)
            hatalar.Add("Şifre yeterince çeşitli karakter içermiyor.");

        if (!string.IsNullOrWhiteSpace(kullaniciAdi) &&
            sifre.Contains(kullaniciAdi, StringComparison.OrdinalIgnoreCase))
            hatalar.Add("Şifre kullanıcı adınızı içeremez.");

        if (!string.IsNullOrWhiteSpace(eposta))
        {
            var yerel = eposta.Split('@')[0];
            if (yerel.Length >= 3 && sifre.Contains(yerel, StringComparison.OrdinalIgnoreCase))
                hatalar.Add("Şifre e-posta adresinizi içeremez.");
        }

        return hatalar.Count == 0
            ? SifreDogrulamaSonucu.Basarili()
            : new SifreDogrulamaSonucu(false, hatalar);
    }
}
