using System.Reflection;
using EnglishReadingPlatform.RateLimiting;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Routing;
using Microsoft.AspNetCore.RateLimiting;
using Xunit;

namespace EnglishReadingPlatform.Tests;

/// <summary>
/// KURAL-07 OTOMATİK KAPI: yeni bir yazma ucu eklendiğinde hız sınırı unutulursa
/// build kırılır. Envanterdeki 16 korumasız ucun tekrar oluşmasını engelleyen
/// mekanizma budur — tek tek route yamamak değil.
/// </summary>
public class HizSiniriSozlesmesiTests
{
    /// <summary>
    /// Bilinçli olarak politika ATANMAYAN uçlar. Her satırın gerekçesi yazılmalı.
    /// Bu liste uzuyorsa kural aşınıyor demektir.
    /// </summary>
    private static readonly HashSet<string> SinirsizBeyazListe = new()
    {
        // Çıkış engellenmemeli. Kötüye kullanım değeri de yok: logout token'ı iptal
        // eder, ikinci çağrı zaten 401 alır. Global taban sınır (300/dk) yine geçerli.
        "AuthController.Logout",
    };

    private static readonly HashSet<string> BilinenPolitikalar = new()
    {
        HizSinirlari.KimlikDogrulama, HizSinirlari.DavetKodu, HizSinirlari.Okuma,
        HizSinirlari.Ceviri, HizSinirlari.AgirAnaliz, HizSinirlari.Yazma,
        HizSinirlari.DosyaYukleme,
    };

    private static IEnumerable<(Type Tip, MethodInfo Aksiyon, string Ad)> YazmaAksiyonlari()
    {
        var assembly = typeof(Program).Assembly;
        foreach (var tip in assembly.GetTypes()
                     .Where(t => typeof(ControllerBase).IsAssignableFrom(t) && !t.IsAbstract))
        {
            foreach (var aksiyon in tip.GetMethods(
                         BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly))
            {
                var yazmaMi = aksiyon.GetCustomAttributes<HttpMethodAttribute>()
                    .SelectMany(a => a.HttpMethods)
                    .Any(m => m is "POST" or "PUT" or "DELETE" or "PATCH");

                if (yazmaMi) yield return (tip, aksiyon, $"{tip.Name}.{aksiyon.Name}");
            }
        }
    }

    private static EnableRateLimitingAttribute? Politika(Type tip, MethodInfo aksiyon)
        => aksiyon.GetCustomAttribute<EnableRateLimitingAttribute>()
           ?? tip.GetCustomAttribute<EnableRateLimitingAttribute>();

    [Fact]
    [Trait("Category", "HizSiniri")]
    public void Her_yazma_ucu_hiz_sinirina_bagli_olmali()
    {
        var korumasizlar = new List<string>();

        foreach (var (tip, aksiyon, ad) in YazmaAksiyonlari())
        {
            if (SinirsizBeyazListe.Contains(ad)) continue;

            var politika = Politika(tip, aksiyon);

            // [DisableRateLimiting] koruma kaldırmanın SESSİZ yoludur — o da ihlaldir.
            var devreDisi = aksiyon.GetCustomAttribute<DisableRateLimitingAttribute>() != null;

            if (politika is null || devreDisi)
                korumasizlar.Add(ad);
        }

        korumasizlar.Should().BeEmpty(
            "bu yazma uçlarında [EnableRateLimiting] yok:\n" + string.Join("\n", korumasizlar));
    }

    [Fact]
    [Trait("Category", "HizSiniri")]
    public void Agir_uclar_dogru_politikayi_kullanmali()
    {
        // Uca politika atanmış olması yetmez: davet kodu ucuna "yazma" (60/dk)
        // atamak, kaba kuvvet penceresini 12 katına çıkarır ve kapı yine yeşil kalır.
        var beklenen = new Dictionary<string, string>
        {
            ["TranslateController.Analyze"]     = HizSinirlari.AgirAnaliz,
            ["GroupsController.Join"]           = HizSinirlari.DavetKodu,
            ["AuthController.Login"]            = HizSinirlari.KimlikDogrulama,
            ["AuthController.Register"]         = HizSinirlari.KimlikDogrulama,
            ["AdminController.UploadBook"]      = HizSinirlari.DosyaYukleme,
            ["AdminController.UploadBookPages"] = HizSinirlari.DosyaYukleme,
            ["TranslateController.Word"]        = HizSinirlari.Ceviri,
            ["TranslateController.Sentence"]    = HizSinirlari.Ceviri,
        };

        var yanlislar = new List<string>();
        var bulunanlar = new HashSet<string>();

        foreach (var (tip, aksiyon, ad) in YazmaAksiyonlari())
        {
            if (!beklenen.TryGetValue(ad, out var beklenenPolitika)) continue;
            bulunanlar.Add(ad);

            var gercek = Politika(tip, aksiyon)?.PolicyName;
            if (gercek != beklenenPolitika)
                yanlislar.Add($"{ad}: beklenen '{beklenenPolitika}', bulunan '{gercek ?? "yok"}'");
        }

        // Uç yeniden adlandırılırsa sözlük sessizce boşa düşerdi: o da bir kapı kaçağıdır.
        var kayip = beklenen.Keys.Except(bulunanlar).ToList();
        kayip.Should().BeEmpty("bu uçlar artık bulunamıyor (yeniden mi adlandırıldı?): "
                               + string.Join(", ", kayip));

        yanlislar.Should().BeEmpty(string.Join("\n", yanlislar));
    }

    [Fact]
    [Trait("Category", "HizSiniri")]
    public void Kullanilan_her_politika_tanimli_olmali()
    {
        // Yazım hatası ("yazmaa") çalışma zamanında istisna üretir; burada derleme
        // sonrası, istek gelmeden yakalanır.
        var tanimsizlar = new List<string>();

        foreach (var (tip, aksiyon, ad) in YazmaAksiyonlari())
        {
            var politikaAdi = Politika(tip, aksiyon)?.PolicyName;
            if (politikaAdi is not null && !BilinenPolitikalar.Contains(politikaAdi))
                tanimsizlar.Add($"{ad} → '{politikaAdi}'");
        }

        tanimsizlar.Should().BeEmpty("HizSinirlari'nda karşılığı olmayan politika adı:\n"
                                     + string.Join("\n", tanimsizlar));
    }

    [Fact]
    [Trait("Category", "HizSiniri")]
    public void Eski_elle_yazilmis_sinirlayici_kalmamali()
    {
        var assembly = typeof(Program).Assembly;
        var eskiTip = assembly.GetType("EnglishReadingPlatform.Services.TokenSecurityService");

        eskiTip.Should().BeNull(
            "TokenSecurityService emekliye ayrıldı; sorumlulukları ITokenIptalDeposu (KURAL-04) " +
            "ve yerleşik RateLimiter (KURAL-07) tarafından devralındı. Sınıfın _rateLimitWindow " +
            "sözlüğü hiç temizlenmiyordu — saldırgan kontrolündeki IP anahtarlarıyla OOM yolu.");
    }
}
