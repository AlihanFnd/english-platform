using System.Collections.Concurrent;
using System.ComponentModel.DataAnnotations;
using System.Reflection;

namespace EnglishReadingPlatform.Validation;

/// <summary>
/// KURAL-05: Değerin izinli küme içinde olmasını zorlar (whitelist).
///
/// Kümeyi <see cref="IzinliDegerler"/> içinden ADIYLA çözer:
/// <c>[IzinliDeger(nameof(IzinliDegerler.Seviyeler))]</c>
///
/// NEDEN dizi değil de ad: öznitelik parametresi olarak dizi yazmak
/// (<c>[IzinliDeger(new[]{"A1","A2",...})]</c>) whitelist'i ikinci bir yere
/// kopyalar. İki kopya er geç ayrışır; ayrıştığında da kimse fark etmez.
/// Tek kaynak IzinliDegerler'dir.
///
/// Küme adı yanlış yazılırsa doğrulama sessizce geçmez —
/// <see cref="InvalidOperationException"/> fırlatılır ve
/// IzinliDegerKullanimTests tüm kullanımları derleme sonrası tarar.
/// </summary>
/// <summary>
/// KURAL-05: Whitelist kümesini adıyla çözer. Hem <see cref="IzinliDegerAttribute"/>
/// hem <see cref="OgeIzinliDegerAttribute"/> buradan okur — çözme mantığının iki
/// kopyası olsaydı biri düzeltilip diğeri unutulurdu.
/// </summary>
internal static class IzinliDegerCozucu
{
    private static readonly ConcurrentDictionary<string, string[]> Onbellek = new();

    public static string[] Coz(string kumeAdi) => Onbellek.GetOrAdd(kumeAdi, ad =>
    {
        var alan = typeof(IzinliDegerler).GetField(ad, BindingFlags.Public | BindingFlags.Static)
            ?? throw new InvalidOperationException(
                $"IzinliDegerler.{ad} bulunamadı. Whitelist öznitelikleri yalnızca " +
                $"IzinliDegerler içindeki bir string[] kümesine bağlanabilir.");

        return alan.GetValue(null) as string[]
            ?? throw new InvalidOperationException($"IzinliDegerler.{ad} bir string[] değil.");
    });
}

[AttributeUsage(AttributeTargets.Property | AttributeTargets.Parameter)]
public sealed class IzinliDegerAttribute : ValidationAttribute
{
    private readonly string _kumeAdi;
    private readonly bool _bosaIzinVer;

    public IzinliDegerAttribute(string kumeAdi, bool bosaIzinVer = false)
    {
        _kumeAdi = kumeAdi;
        _bosaIzinVer = bosaIzinVer;
    }

    /// <summary>Bağlandığı küme — testler ve guard için okunabilir.</summary>
    public string KumeAdi => _kumeAdi;

    public string[] Kume => IzinliDegerCozucu.Coz(_kumeAdi);

    protected override ValidationResult? IsValid(object? deger, ValidationContext ctx)
    {
        var alanAdi = ctx.DisplayName ?? ctx.MemberName ?? "Değer";

        if (deger is null || (deger is string bos && string.IsNullOrWhiteSpace(bos)))
            return _bosaIzinVer
                ? ValidationResult.Success
                : new ValidationResult($"{alanAdi} zorunludur.");

        var izinliler = IzinliDegerCozucu.Coz(_kumeAdi);
        var metin = deger.ToString()!;

        // Ordinal karşılaştırma bilinçli: kültüre duyarlı karşılaştırma
        // Türkçe'de "I"/"ı" gibi durumlarda whitelist'i genişletebilir.
        return izinliler.Contains(metin, StringComparer.Ordinal)
            ? ValidationResult.Success
            : new ValidationResult(
                $"{alanAdi} geçersiz. İzinli değerler: {string.Join(", ", izinliler)}");
    }
}
