namespace EnglishReadingPlatform.Configuration;

/// <summary>Tek bir ortam değişkeninin dağıtım sözleşmesi.</summary>
/// <param name="Anahtar">Yapılandırma anahtarı (ör. "Jwt:Key").</param>
/// <param name="UretimdeZorunlu">Eksikse üretimde uygulama BAŞLAMAZ mı?</param>
/// <param name="EksikseNeOlur">Operatörün karar verebilmesi için sonucun tarifi.</param>
public record OrtamDegiskeni(
    string Anahtar,
    bool UretimdeZorunlu,
    string EksikseNeOlur);

/// <summary>
/// KURAL-15: Hangi ortam değişkeni hangi ortamda zorunlu — TEK kaynak.
///
/// Neden <see cref="SirDogrulayici"/>'ya eklenmiyor: o sınıf "sır" kavramına
/// odaklı (sızmış değer kontrolü, asgari anahtar uzunluğu). Burada sorulan soru
/// farklı: "bu DAĞITIM eksiksiz mi?" Bir değer sır olmayabilir (PublicHost) ama
/// eksikliği bütün bir güvenlik katmanını sessizce düşürebilir.
///
/// ─── Neden KURAL-14 ile ÇAKIŞMIYOR ───────────────────────────────────────
/// KURAL-15'in taslağı Resend:ApiKey ve App:FrontendUrl'ü "üretimde zorunlu"
/// listesine koyuyordu. Bu, KURAL-14'ün kararıyla DOĞRUDAN çelişirdi:
/// orada bu iki anahtar <see cref="ServisSinifi.OzellikKapanir"/> sınıfına
/// konmuştu — "uygulama açılır AMA şifre sıfırlama 503 döner". Zorunlu
/// yapılsaydı, anahtar gelene kadar uygulama üretimde HİÇ AÇILMAZDI.
///
/// İki sözleşmede aynı anahtarı iki kez sınıflandırmak, faz 2'nin tekrar
/// tekrar uyardığı hatadır: biri güncellenir, diğeri unutulur. Bu yüzden
/// KURAL-14'ün tanıdığı anahtarlar burada YENİDEN YAZILMIYOR, sınıfından
/// TÜRETİLİYOR:
///
///   UygulamaAcilmaz  → üretimde zorunlu   (eksikse zaten başlayamaz)
///   OzellikKapanir   → zorunlu DEĞİL      (uygulama açılır, özellik 503 döner)
///   IslevBozulur     → zorunlu DEĞİL      (yedeğe düşer)
/// </summary>
public static class OrtamSozlesmesi
{
    /// <summary>
    /// KURAL-14'ün kapsamadığı, bu kurala ait değişkenler.
    /// Dış servis anahtarları BURAYA YAZILMAZ — DisServisSozlesmesi'ne yazılır.
    /// </summary>
    private static readonly OrtamDegiskeni[] KuralaAitOlanlar =
    {
        // ── Faz 1, KURAL-02 (SirDogrulayici zaten zorunlu tutuyor) ──
        new("Jwt:Issuer",         true, "Token doğrulaması başarısız olur; kimse giriş yapamaz."),
        new("Jwt:Audience",       true, "Token doğrulaması başarısız olur; kimse giriş yapamaz."),
        new("Seed:AdminPassword", true, "Yönetici hesabı oluşturulamaz."),

        // ── KURAL-13 ──
        new("CorsOrigins", true, "Tarayıcıdan hiçbir istemci bağlanamaz."),
        new("PublicHost",  true,
            "Host başlığı doğrulanamaz; mutlak URL üreten her yer zehirlenebilir."),

        // ── KURAL-15 (bu kural) ──
        new("Seed:AdminEmail", true,
            "Yönetici hesabı HİÇ OLUŞMAZ ve bu sessizce olur — panele kimse giremez."),
    };

    /// <summary>
    /// Bütün dağıtım sözleşmesi: KURAL-14'ün dış servisleri + bu kuralın
    /// kendi değişkenleri. Sıra, hata mesajının okunabilirliği içindir.
    /// </summary>
    public static readonly OrtamDegiskeni[] Degiskenler =
        DisServisSozlesmesi.Servisler
            .Select(s => new OrtamDegiskeni(
                s.YapilandirmaAnahtari,
                UretimdeZorunlu: s.Sinif == ServisSinifi.UygulamaAcilmaz,
                s.EksikseNeOlur))
            .Concat(KuralaAitOlanlar)
            .OrderByDescending(d => d.UretimdeZorunlu)
            .ToArray();

    /// <summary>Üretimde eksik olan zorunlu değişkenler.</summary>
    public static IReadOnlyList<OrtamDegiskeni> EksikZorunlular(IConfiguration yapilandirma)
        => Degiskenler
            .Where(d => d.UretimdeZorunlu)
            .Where(d => !DisServisSozlesmesi.Kullanilabilir(yapilandirma, d.Anahtar))
            .ToList();

    /// <summary>
    /// Üretimde eksik zorunlu değişken varsa uygulamayı BAŞLATMAZ.
    ///
    /// Fail-fast bilinçli: yarım yapılandırılmış bir dağıtımın çalışıyor
    /// GÖRÜNMESİ, hiç açılmamasından daha tehlikelidir — Seed:AdminEmail
    /// eksikken uygulama sorunsuz ayağa kalkar ve yönetici panelinin neden
    /// boş olduğunu kimse aylarca anlamaz.
    /// </summary>
    public static void UretimdeDogrula(IConfiguration yapilandirma, IHostEnvironment ortam)
    {
        if (ortam.IsDevelopment()) return;

        var eksikler = EksikZorunlular(yapilandirma);
        if (eksikler.Count == 0) return;

        var satirlar = eksikler.Select(d =>
            $"  • {d.Anahtar} tanımlı değil. Ortam değişkeni: {d.Anahtar.Replace(":", "__")}\n" +
            $"    Eksikse: {d.EksikseNeOlur}");

        throw new InvalidOperationException(
            "Dağıtım eksik — uygulama başlatılamıyor:\n" +
            string.Join("\n", satirlar) +
            "\n\nÇözüm: bu değerleri dağıtım platformunun ortam değişkenlerine ekleyin. " +
            "Dağıtımdan önce: bash scripts/dagitim/on-kontrol.sh");
    }
}
