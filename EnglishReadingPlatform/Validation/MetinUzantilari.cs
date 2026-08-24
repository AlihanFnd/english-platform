namespace EnglishReadingPlatform.Validation;

public static class MetinUzantilari
{
    /// <summary>
    /// Metni en fazla verilen uzunluğa kırpar. null-güvenlidir.
    /// KURAL-05: kolon sınırına yazılmadan önce SON savunma hattı.
    ///
    /// Nerede kırpılır, nerede reddedilir:
    ///  • Kullanıcının BİLEREK yazdığı alan (kelime, çeviri, mesaj) → REDDEDİLİR (400)
    ///  • Seçimden/dosyadan/LLM'den TÜRETİLEN alan (bağlam, bölüm başlığı) → KIRPILIR
    /// Türetilmiş alanda 400 vermek, özelliği kullanılamaz kılar.
    /// </summary>
    public static string KirpEnCok(this string? metin, int enCok)
    {
        if (string.IsNullOrEmpty(metin)) return "";
        var temiz = metin.Trim();
        return temiz.Length <= enCok ? temiz : temiz[..enCok];
    }
}
