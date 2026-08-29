using System.Reflection;
using FluentAssertions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Routing;
using Xunit;

namespace EnglishReadingPlatform.Tests;

/// <summary>
/// KURAL-03: Her HTTP ucunun yetkilendirme kararı AÇIK olmalı.
///
/// Bu testin asıl gücü bugünkü ihlalleri yakalamasında değil: tüm controller
/// action'larını yansımayla gezdiği için YARIN eklenen bir uç da otomatik kapsanır.
/// Geliştirici [Authorize] yazmayı unutursa test kırmızı olur.
/// </summary>
public class YetkilendirmeSozlesmesiTests
{
    /// <summary>
    /// Bilinçli olarak herkese açık bırakılan uçlar.
    /// Buraya bir uç eklemek GÜVENLİK KARARIDIR — gerekçesi yorumda yazılmalı.
    /// </summary>
    private static readonly HashSet<string> AnonimBeyazListe = new()
    {
        "AuthController.Login",     // giriş: token almadan önce çağrılır
        "AuthController.Register",  // kayıt: token almadan önce çağrılır
        // KURAL-09: şifresini unutan kullanıcının token'ı YOKTUR; bu iki uç
        // zorunlu olarak anonimdir. Karşılığında: hız sınırı (KimlikDogrulama),
        // her durumda aynı yanıt (enumerasyon yok) ve tek kullanımlık,
        // 30 dakika ömürlü, hash'lenmiş saklanan jeton.
        "AuthController.SifremiUnuttum",  // şifre sıfırlama talebi
        "AuthController.SifreSifirla",    // jetonla şifre belirleme
    };

    /// <summary>Yalnızca yönetici erişebilmesi gereken uçlar.</summary>
    private static readonly HashSet<string> AdminGerektirenler = new()
    {
        "ActivityController.GetStats",        // tüm kullanıcıların aktivite akışı
        "FeedbackController.GetFeedbackList", // tüm kullanıcıların geri bildirimleri
        // AdminController'ın tamamı sınıf özniteliğiyle kapsanıyor
    };

    private static IEnumerable<(Type Controller, MethodInfo Action, string Ad)> TumAksiyonlar()
    {
        var assembly = typeof(Program).Assembly;
        var controllerTipleri = assembly.GetTypes()
            .Where(t => typeof(ControllerBase).IsAssignableFrom(t) && !t.IsAbstract);

        foreach (var tip in controllerTipleri)
        {
            // DeclaredOnly zorunlu: olmazsa ControllerBase'in miras alınan public
            // metotları da taranır ve yüzlerce sahte ihlal çıkar.
            var aksiyonlar = tip.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
                .Where(m => m.GetCustomAttributes<HttpMethodAttribute>().Any());

            foreach (var aksiyon in aksiyonlar)
                yield return (tip, aksiyon, $"{tip.Name}.{aksiyon.Name}");
        }
    }

    private static (bool Anonim, bool Yetkili, string? Rol, string? Politika) YetkiDurumu(Type tip, MethodInfo aksiyon)
    {
        var anonim = aksiyon.GetCustomAttribute<AllowAnonymousAttribute>() != null
                  || tip.GetCustomAttribute<AllowAnonymousAttribute>() != null;

        var aksiyonYetki = aksiyon.GetCustomAttribute<AuthorizeAttribute>();
        var sinifYetki   = tip.GetCustomAttribute<AuthorizeAttribute>();
        var etkin = aksiyonYetki ?? sinifYetki;

        return (anonim, etkin != null, etkin?.Roles, etkin?.Policy);
    }

    [Fact]
    [Trait("Category", "Yetkilendirme")]
    public void Her_ucun_yetkilendirme_karari_acik_olmali()
    {
        var belirsizler = new List<string>();

        foreach (var (tip, aksiyon, ad) in TumAksiyonlar())
        {
            var (anonim, yetkili, _, _) = YetkiDurumu(tip, aksiyon);

            if (anonim)
            {
                if (!AnonimBeyazListe.Contains(ad))
                    belirsizler.Add($"{ad} → [AllowAnonymous] var ama beyaz listede DEĞİL");
                continue;
            }

            if (!yetkili)
                belirsizler.Add($"{ad} → ne [Authorize] ne [AllowAnonymous] var");
        }

        belirsizler.Should().BeEmpty(
            "her uç ya [Authorize(...)] ile korunmalı ya da [AllowAnonymous] + beyaz liste ile " +
            "bilinçli olarak açılmalı. Belirsiz uçlar:\n" + string.Join("\n", belirsizler));
    }

    [Fact]
    [Trait("Category", "Yetkilendirme")]
    public void Admin_gerektiren_uclar_rol_veya_politika_tasimali()
    {
        var eksikler = new List<string>();

        foreach (var (tip, aksiyon, ad) in TumAksiyonlar())
        {
            if (!AdminGerektirenler.Contains(ad)) continue;

            var (_, _, rol, politika) = YetkiDurumu(tip, aksiyon);
            var adminKapsiyor = (rol?.Contains("admin") ?? false) || politika == "AdminOnly";

            if (!adminKapsiyor)
                eksikler.Add($"{ad} → admin gerektiriyor ama Roles/Policy yok (Roles={rol}, Policy={politika})");
        }

        eksikler.Should().BeEmpty("admin uçları rol veya politika taşımalı:\n" + string.Join("\n", eksikler));
    }

    [Fact]
    [Trait("Category", "Yetkilendirme")]
    public void Beyaz_liste_gercekten_anonim_uclarla_eslesmeli()
    {
        // Beyaz listede olup artık anonim OLMAYAN uçlar temizlenmeli (liste çürümesin).
        var gercekAnonimler = TumAksiyonlar()
            .Where(x => YetkiDurumu(x.Controller, x.Action).Anonim)
            .Select(x => x.Ad)
            .ToHashSet();

        var hayaletler = AnonimBeyazListe.Except(gercekAnonimler).ToList();

        hayaletler.Should().BeEmpty(
            "beyaz listede olup artık anonim olmayan uçlar var, liste güncellenmeli: "
            + string.Join(", ", hayaletler));
    }

    /// <summary>
    /// Sözleşme testinin kendisi anlamlı bir yüzeyi tarıyor mu?
    /// Yansıma sorgusu bozulursa (isim değişikliği, BindingFlags hatası) liste
    /// boşalır ve diğer üç test "hiç ihlal yok" diye YEŞİL kalırdı — sessiz
    /// başarısızlık. Bu test o senaryoyu yakalar.
    /// </summary>
    [Fact]
    [Trait("Category", "Yetkilendirme")]
    public void Sozlesme_testi_gercekten_uclari_goruyor()
    {
        var aksiyonlar = TumAksiyonlar().ToList();

        aksiyonlar.Should().HaveCountGreaterThanOrEqualTo(38,
            "envanterde 38 uç ölçüldü; bu sayı düşerse yansıma sorgusu bozulmuş demektir");
    }
}
