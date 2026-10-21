using System.Text;
using System.Text.RegularExpressions;

namespace EnglishReadingPlatform.Validation;

public static class KelimeNormallestirici
{
    /// <summary>
    /// YH-11: Kelime listesine giden kelimelerin merkezî normalleştiricisi.
    ///
    /// Kurallar:
    ///  1. Unicode Normalizasyonu (FormC) ve dış boşluk temizliği.
    ///  2. Baştaki ve sondaki noktalama, tırnak, parantez ve sembollerin temizlenmesi.
    ///     İç kesme işareti ("don't") ve iç tire ("well-known") KORUNUR.
    ///  3. İç aradaki birden fazla boşluğun teke indirilmesi ("New   York" -> "new york").
    ///  4. Küçük harfe dönüştürme (ToLowerInvariant). Tek harf "I" istisnası korunur ("I" -> "I").
    ///  5. KirpEnCok(AlanSinirlari.Kelime) sınırı.
    ///
    /// Mevcut satırları temizleyen migration (NormalizeWordListItems) aynı kuralları
    /// SQL'de uygular; ikisinin aynı sonucu ürettiğini
    /// KelimeNormalizasyonuTests.Goc_normallestirme_kurallari_CSHARP_ile_AYNI ölçer.
    /// </summary>
    public static string Normallestir(string? girdi)
    {
        if (string.IsNullOrWhiteSpace(girdi)) return "";

        var metin = girdi.Normalize(NormalizationForm.FormC).Trim();
        if (string.IsNullOrWhiteSpace(metin)) return "";

        // Baştaki ve sondaki noktalama ve sembollerin temizlenmesi
        int bas = 0;
        while (bas < metin.Length && (char.IsPunctuation(metin[bas]) || char.IsSymbol(metin[bas]) || char.IsWhiteSpace(metin[bas])))
        {
            bas++;
        }

        if (bas >= metin.Length) return "";

        int son = metin.Length - 1;
        while (son >= bas && (char.IsPunctuation(metin[son]) || char.IsSymbol(metin[son]) || char.IsWhiteSpace(metin[son])))
        {
            son--;
        }

        if (son < bas) return "";

        var temiz = metin.Substring(bas, son - bas + 1);

        // İç boşlukları teke indir
        temiz = Regex.Replace(temiz, @"\s+", " ");

        // Tek harf 'I' hariç ToLowerInvariant
        if (temiz.Equals("I", StringComparison.OrdinalIgnoreCase))
        {
            temiz = "I";
        }
        else
        {
            temiz = temiz.ToLowerInvariant();
        }

        return temiz.KirpEnCok(AlanSinirlari.Kelime);
    }
}
