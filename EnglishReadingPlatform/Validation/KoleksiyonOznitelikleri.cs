using System.Collections;
using System.ComponentModel.DataAnnotations;

namespace EnglishReadingPlatform.Validation;

/// <summary>
/// KURAL-05: Bir koleksiyonun/sözlüğün İÇİNDEKİ metinlerin uzunluğunu sınırlar.
///
/// NEDEN AYRI BİR ÖZNİTELİK GEREKİYOR:
/// [StringLength] yalnızca özelliğin KENDİSİ string ise çalışır. Bir
/// Dictionary&lt;int, string&gt; üzerinde hiçbir şey yapmaz; [MaxLength] ise
/// yalnızca ELEMAN SAYISINI sınırlar. Yani "100 cevap" kuralı varken tek bir
/// cevabın 200.000 karakter olmasını hiçbir öznitelik engellemiyordu.
///
/// Bir koleksiyon alanı İKİ sınır ister:
///   [MaxLength(n)]      → kaç eleman
///   [OgeUzunlugu(m)]    → her elemanın uzunluğu
/// AlanSinirlariTests ikisinin de bildirildiğini zorlar.
/// </summary>
[AttributeUsage(AttributeTargets.Property | AttributeTargets.Parameter)]
public sealed class OgeUzunluguAttribute : ValidationAttribute
{
    private readonly int _enCok;

    public OgeUzunluguAttribute(int enCok) => _enCok = enCok;

    public int EnCok => _enCok;

    protected override ValidationResult? IsValid(object? deger, ValidationContext ctx)
    {
        var alanAdi = ctx.DisplayName ?? ctx.MemberName ?? "Değer";

        foreach (var oge in KoleksiyonMetinleri.Oku(deger))
            if (oge is not null && oge.Length > _enCok)
                return new ValidationResult(
                    $"{alanAdi} içindeki değerler en fazla {_enCok} karakter olabilir.");

        return ValidationResult.Success;
    }
}

/// <summary>
/// KURAL-05: Bir koleksiyonun/sözlüğün İÇİNDEKİ her metnin izinli kümede
/// olmasını zorlar (whitelist). Küme adı <see cref="IzinliDegerler"/> içinden
/// yansımayla çözülür — dizi kopyalanmaz.
///
/// Whitelist zaten bir uzunluk üst sınırıdır (kümedeki en uzun değer), bu yüzden
/// ayrıca [OgeUzunlugu] gerekmez.
/// </summary>
[AttributeUsage(AttributeTargets.Property | AttributeTargets.Parameter)]
public sealed class OgeIzinliDegerAttribute : ValidationAttribute
{
    private readonly string _kumeAdi;
    private readonly bool _bosaIzinVer;

    /// <param name="bosaIzinVer">
    /// Varsayılan true: boş değer "cevaplanmadı" anlamına gelir ve reddedilmez.
    /// Bu, mevcut davranışı korur — cevapsız soru bir hata değildir.
    /// </param>
    public OgeIzinliDegerAttribute(string kumeAdi, bool bosaIzinVer = true)
    {
        _kumeAdi = kumeAdi;
        _bosaIzinVer = bosaIzinVer;
    }

    public string KumeAdi => _kumeAdi;

    public string[] Kume => IzinliDegerCozucu.Coz(_kumeAdi);

    protected override ValidationResult? IsValid(object? deger, ValidationContext ctx)
    {
        var alanAdi = ctx.DisplayName ?? ctx.MemberName ?? "Değer";
        var izinliler = IzinliDegerCozucu.Coz(_kumeAdi);

        foreach (var oge in KoleksiyonMetinleri.Oku(deger))
        {
            if (string.IsNullOrWhiteSpace(oge))
            {
                if (_bosaIzinVer) continue;
                return new ValidationResult($"{alanAdi} boş değer içeremez.");
            }

            if (!izinliler.Contains(oge, StringComparer.Ordinal))
                return new ValidationResult(
                    $"{alanAdi} geçersiz bir değer içeriyor. İzinli değerler: {string.Join(", ", izinliler)}");
        }

        return ValidationResult.Success;
    }
}

/// <summary>Koleksiyon ve sözlüklerden metin öğelerini tek bir yerden okur.</summary>
internal static class KoleksiyonMetinleri
{
    public static IEnumerable<string?> Oku(object? deger)
    {
        switch (deger)
        {
            case null:
                yield break;

            // Sözlükte DEĞERLER doğrulanır; anahtarlar tip sistemince zaten sınırlı.
            case IDictionary sozluk:
                foreach (var v in sozluk.Values)
                    if (v is string s) yield return s;
                yield break;

            case IEnumerable dizi and not string:
                foreach (var v in dizi)
                    if (v is string s) yield return s;
                yield break;
        }
    }
}
