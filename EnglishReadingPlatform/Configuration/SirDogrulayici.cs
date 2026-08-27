namespace EnglishReadingPlatform.Configuration;

/// <summary>
/// KURAL-02: Sırlar yalnızca ortamdan okunur, eksikse uygulama başlamaz.
/// Fail-fast: sessizce varsayılana düşmek, açığın kendisidir.
///
/// Buradaki <see cref="YasakliDegerler"/> listesi ile
/// scripts/guard/02-sirlar.sh içindeki YASAKLI deseni AYNI kaynaktan gelir —
/// guard script listeyi bu dosyadan okur, elle senkron tutulmaz.
/// </summary>
public static class SirDogrulayici
{
    /// <summary>
    /// Sürüm kontrolüne girmiş, artık kullanılması yasak değerler.
    /// Yeni bir sır sızarsa buraya eklenir.
    /// DİKKAT: Bu bloğun biçimi guard script tarafından ayrıştırılıyor —
    /// her değer kendi satırında, tırnak içinde durmalı.
    /// </summary>
    public static readonly string[] YasakliDegerler =
    {
        "EnglishPlatformSuperSecretKey2026_MustBe32Chars!!",
        "SuperSecretKey_ChangeInProduction_32chars!",
        "StrongPass@2026!",
        "Admin@2026!",
        "admin123",
    };

    /// <summary>
    /// Sızmış değerlerin şifre olanları. Bağlantı dizesi ve tohum şifresi
    /// yalnızca bunlara karşı taranır — imzalama anahtarını bağlantı dizesinde
    /// aramanın anlamı yok.
    /// </summary>
    private static readonly string[] YasakliSifreler =
    {
        "StrongPass@2026!",
        "Admin@2026!",
        "admin123",
    };

    private const int AsgariAnahtarUzunlugu = 32;

    public static void Dogrula(IConfiguration yapilandirma, IHostEnvironment ortam)
    {
        var hatalar = new List<string>();

        // ── JWT imzalama anahtarı ──────────────────────────────
        var jwtKey = yapilandirma["Jwt:Key"];
        if (string.IsNullOrWhiteSpace(jwtKey))
            hatalar.Add("Jwt:Key tanımlı değil. Ortam değişkeni: Jwt__Key (veya JWT_KEY).");
        else if (jwtKey.Length < AsgariAnahtarUzunlugu)
            hatalar.Add($"Jwt:Key en az {AsgariAnahtarUzunlugu} karakter olmalı (şu an {jwtKey.Length}).");
        else if (YasakliDegerler.Contains(jwtKey))
            hatalar.Add("Jwt:Key sürüm kontrolüne sızmış bir değer. Yeni anahtar üretin: openssl rand -base64 48");

        // ── Veritabanı bağlantısı ──────────────────────────────
        var baglanti = yapilandirma.GetConnectionString("Default");
        if (string.IsNullOrWhiteSpace(baglanti))
            hatalar.Add("ConnectionStrings:Default tanımlı değil. Ortam değişkeni: ConnectionStrings__Default.");
        else
        {
            foreach (var yasakli in YasakliSifreler)
                if (baglanti.Contains(yasakli, StringComparison.Ordinal))
                    hatalar.Add($"ConnectionStrings:Default sızmış bir şifre içeriyor ({Maskele(yasakli)}).");

            // Üretimde ayrıntılı hata detayı kapalı olmalı (KURAL-06 ile örtüşür)
            if (!ortam.IsDevelopment() &&
                baglanti.Contains("Include Error Detail=true", StringComparison.OrdinalIgnoreCase))
                hatalar.Add("Üretimde 'Include Error Detail=true' kullanılamaz — iç şema bilgisi sızdırır.");
        }

        // ── Issuer / Audience ──────────────────────────────────
        if (string.IsNullOrWhiteSpace(yapilandirma["Jwt:Issuer"]))
            hatalar.Add("Jwt:Issuer tanımlı değil.");
        if (string.IsNullOrWhiteSpace(yapilandirma["Jwt:Audience"]))
            hatalar.Add("Jwt:Audience tanımlı değil.");

        // ── Tohum yönetici şifresi (isteğe bağlı ama tanımlıysa sızmış olamaz) ──
        var tohumSifre = yapilandirma["Seed:AdminPassword"];
        if (!string.IsNullOrWhiteSpace(tohumSifre) && YasakliSifreler.Contains(tohumSifre))
            hatalar.Add("Seed:AdminPassword sürüm kontrolüne sızmış bir değer. Yeni bir şifre belirleyin.");

        if (hatalar.Count > 0)
        {
            var mesaj = "Güvenlik yapılandırması geçersiz — uygulama başlatılamıyor:\n"
                      + string.Join("\n", hatalar.Select(h => "  • " + h))
                      + "\n\nÇözüm: proje kökündeki .env dosyasını doldurun "
                      + "(bkz. guvenlik-kurallari/00-BASLA-BURADAN.md → İnsan kararı gereken işler).";
            throw new InvalidOperationException(mesaj);
        }
    }

    /// <summary>Bir değerin sızmış listede olup olmadığını söyler (tohumlayıcı kullanır).</summary>
    public static bool YasakliMi(string? deger) =>
        !string.IsNullOrEmpty(deger) && YasakliDegerler.Contains(deger);

    private static string Maskele(string s) =>
        s.Length <= 4 ? "****" : s[..2] + new string('*', s.Length - 4) + s[^2..];
}
