namespace EnglishReadingPlatform.Logging;

/// <summary>
/// KURAL-06: Loga yazılmadan önce kullanıcı içeriğini maskeler.
///
/// Kapsam bilinçli olarak DAR tutulmuştur: yalnızca kullanıcının ÜRETTİĞİ
/// serbest içerik (kelime, cümle, arama metni, e-posta) maskelenir.
/// Sayfa numarası, kitap kimliği, HTTP durumu gibi teknik alanlar düz yazılır —
/// her şey hash'lenirse log hata ayıklamak için işe yaramaz hale gelir.
/// </summary>
public static class GuvenliLog
{
    /// <summary>E-postayı maskeler: ali@ornek.com → a**@o****m</summary>
    public static string Eposta(string? eposta)
    {
        if (string.IsNullOrWhiteSpace(eposta)) return "-";
        var parcalar = eposta.Split('@');
        if (parcalar.Length != 2 || parcalar[0].Length == 0 || parcalar[1].Length == 0) return "***";
        return $"{parcalar[0][..1]}**@{Kisalt(parcalar[1])}";
    }

    /// <summary>
    /// Serbest kullanıcı metnini (kelime, cümle, arama) loga yazılabilir hale getirir:
    /// içeriği DEĞİL, yalnızca uzunluğunu ve deterministik bir kısa hash'ini verir.
    /// Böylece "aynı kelime tekrar mı geldi" sorusu yanıtlanabilir ama içerik sızmaz.
    /// </summary>
    public static string KullaniciMetni(string? metin)
    {
        if (string.IsNullOrEmpty(metin)) return "boş";
        var hash = System.Security.Cryptography.SHA256.HashData(
            System.Text.Encoding.UTF8.GetBytes(metin));
        return $"len={metin.Length}, h={Convert.ToHexString(hash)[..8]}";
    }

    private static string Kisalt(string s) =>
        s.Length <= 2 ? "**" : s[..1] + new string('*', Math.Min(s.Length - 2, 4)) + s[^1..];
}
