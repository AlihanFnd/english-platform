namespace EnglishReadingPlatform.Security;

/// <summary>
/// KURAL-18: Şifre saklama parametreleri TEK kaynakta ve AÇIKÇA yazılı.
///
/// Neden: BCrypt.Net varsayılanı (11) SEKİZ ayrı çağrı yerinde örtük olarak
/// kullanılıyordu. Kütüphane varsayılanını değiştirse kimse fark etmezdi;
/// artırmak istendiğinde de "eski hash'ler ne olacak" sorusu sorulmazdı.
/// Parametre bir KARARDIR, varsayılan değil.
/// </summary>
public static class SifreHashleme
{
    /// <summary>
    /// BCrypt iş faktörü. 2026 önerisi ≥ 12.
    ///
    /// Yukarı çekerken ÖLÇ: her +1 süreyi ikiye katlar (12 ≈ 250 ms/hash).
    /// 14 ve üstü, giriş ucunu tek başına bir DoS yüzeyine çevirir — saldırgan
    /// hiç doğru şifre bilmeden CPU tüketir. 12, 2026 için maliyet/koruma
    /// dengesinin oturduğu yer.
    /// </summary>
    public const int IsFaktoru = 12;

    /// <summary>
    /// Bu değerin ALTINDAKİ hash'ler eskidir ve girişte sessizce yenilenir.
    /// Ayrı bir sabit olmasının sebebi: ileride iş faktörü 13'e çıkarılırken
    /// "hangi hash'ler eski sayılacak" sorusunun cevabı burada tek satırda
    /// değişsin — beş ayrı karşılaştırmada değil.
    /// </summary>
    public const int AsgariKabulEdilirIsFaktoru = IsFaktoru;

    /// <summary>Şifreyi sabit iş faktörüyle hash'ler.</summary>
    public static string Hashle(string sifre)
        => BCrypt.Net.BCrypt.HashPassword(sifre, IsFaktoru);

    /// <summary>Şifreyi hash'e karşı doğrular. İş faktörü hash'in içinden okunur.</summary>
    public static bool Dogrula(string sifre, string hash)
        => BCrypt.Net.BCrypt.Verify(sifre, hash);

    /// <summary>
    /// Bu hash daha zayıf bir iş faktörüyle mi üretilmiş?
    ///
    /// BCrypt biçimi: <c>$2a$11$tuzVeHash...</c> — '$' ile bölününce
    /// [0]="2a" (sürüm), [1]="11" (iş faktörü), [2]=tuz+hash.
    /// Biçim tanınmazsa <c>false</c> döner: tanımadığımız bir hash'i
    /// "eski" sayıp her girişte yeniden yazmak, hatayı sessizce çoğaltmak olur.
    /// </summary>
    public static bool YenilenmeliMi(string? hash)
    {
        if (string.IsNullOrWhiteSpace(hash)) return false;

        var parcalar = hash.Split('$', StringSplitOptions.RemoveEmptyEntries);
        return parcalar.Length >= 2
            && int.TryParse(parcalar[1], out var faktor)
            && faktor < AsgariKabulEdilirIsFaktoru;
    }
}
