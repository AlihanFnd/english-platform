namespace EnglishReadingPlatform.Configuration;

/// <summary>
/// KURAL-13: Tarayıcıdan gelen isteklerde kabul edilen KÖKEN listesi.
///
/// Neden tek sınıf: köken listesi hem CORS politikasında hem AllowedHosts'ta
/// gerekiyor. İki yerde ayrı ayrı yazılırsa biri güncellenir, diğeri unutulur —
/// ve "unutulan" taraf her zaman gevşek olandır.
///
/// Kaynak: CorsOrigins yapılandırması (virgülle ayrılmış tam kökenler).
/// Örnek:  CorsOrigins=https://linguza.vercel.app,https://admin.linguza.app
/// </summary>
public static class GuvenilirKokenler
{
    public const string Anahtar = "CorsOrigins";

    /// <summary>Geliştirmede varsayılan — üretimde ASLA kullanılmaz.</summary>
    private static readonly string[] GelistirmeKokenleri =
    {
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
    };

    /// <summary>
    /// Yapılandırmadan kökenleri okur.
    ///
    /// ÜRETİMDE BOŞSA İSTİSNA FIRLATIR. Sessizce "hepsine izin ver"e ya da
    /// sessizce "hiçbirine izin verme"ye düşmek, iki farklı biçimde yanıltıcıdır:
    /// birincisi açığı geri getirir, ikincisi uygulamayı sebebi anlaşılmadan bozar.
    /// </summary>
    public static string[] Oku(IConfiguration yapilandirma, IHostEnvironment ortam)
    {
        var ham = yapilandirma[Anahtar];

        if (string.IsNullOrWhiteSpace(ham))
        {
            if (ortam.IsDevelopment()) return GelistirmeKokenleri;

            throw new InvalidOperationException(
                $"{Anahtar} tanımlı değil. Üretimde tarayıcı kökenleri açıkça " +
                "listelenmelidir. Ortam değişkeni: CorsOrigins " +
                "(virgülle ayrılmış, ör. https://linguza.vercel.app,https://admin.linguza.app)");
        }

        var kokenler = ham
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(k => k.TrimEnd('/'))          // "https://x.app/" ile "https://x.app" aynı köken
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        // Joker kökenin yapılandırmadan sızmasını engelle: "*" yazıp
        // AllowCredentials ile birleştirmek tam olarak kapattığımız açıktır.
        var joker = kokenler.FirstOrDefault(k => k == "*" || k.Contains('*'));
        if (joker is not null)
            throw new InvalidOperationException(
                $"{Anahtar} joker değer içeriyor ('{joker}'). Kimlik bilgisi taşıyan " +
                "bir CORS politikası joker kökenle birleştirilemez. Kökenleri tek tek yazın.");

        foreach (var k in kokenler)
        {
            if (!Uri.TryCreate(k, UriKind.Absolute, out var uri))
                throw new InvalidOperationException($"{Anahtar} geçersiz köken içeriyor: '{k}'");

            if (uri.Scheme != Uri.UriSchemeHttps && !ortam.IsDevelopment() && !uri.IsLoopback && uri.Host != "localhost")
                throw new InvalidOperationException(
                    $"{Anahtar} üretimde http köken içeremez: '{k}'");
        }

        return kokenler;
    }

    /// <summary>
    /// Kökenlerin ana bilgisayar adları — AllowedHosts için.
    /// API kendi alan adından da çağrılabildiği için o da eklenmelidir;
    /// PublicHost yapılandırmasıyla verilir.
    /// </summary>
    public static string[] AnaBilgisayarlar(string[] kokenler, string? apiAnaBilgisayari)
        => kokenler
            .Select(k => new Uri(k).Host)
            .Concat(string.IsNullOrWhiteSpace(apiAnaBilgisayari)
                ? Array.Empty<string>()
                : new[] { apiAnaBilgisayari })
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
}
