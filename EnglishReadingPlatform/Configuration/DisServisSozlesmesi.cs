namespace EnglishReadingPlatform.Configuration;

/// <summary>
/// KURAL-14: Her dış bağımlılık ÜÇ SINIFTAN birine girer ve sınıflandırma
/// TEK BU DOSYADA tutulur.
///
/// Neden üç sınıf: faz 1'in KURAL-02'si yalnızca "eksikse hiç başlama"
/// (fail-fast) sınıfını tanıyordu. Şifre sıfırlama servisi o sınıfa girmiyor —
/// anahtarı olmayan bir geliştirme ortamı yine de açılabilmeli. Bu boşluk,
/// "sessizce loga yaz" gibi bir yedeğin doğmasına izin verdi: anahtar yokluğu
/// bir KULLANILABİLİRLİK sorunundan bir HESAP ELE GEÇİRME yoluna dönüştü.
///
/// Eksik olan sınıf şuydu: "uygulama açılsın, AMA o özellik KAPALI olsun."
/// </summary>
public enum ServisSinifi
{
    /// <summary>Eksikse uygulama HİÇ AÇILMAZ. (Jwt:Key, bağlantı dizesi…)</summary>
    UygulamaAcilmaz,

    /// <summary>
    /// Eksikse uygulama açılır ama BAĞLI ÖZELLİK 503 döner.
    /// Zayıf bir yedeğe DÜŞMEZ. (Resend, sıfırlama bağlantısı tabanı…)
    /// </summary>
    OzellikKapanir,

    /// <summary>
    /// Eksikse özellik bozulur ama güvenlik etkisi yoktur; açıkça loglanır.
    /// (Groq — çeviri kalitesi düşer, kimse tehlikeye girmez.)
    /// </summary>
    IslevBozulur,
}

/// <summary>Tek bir dış bağımlılığın sınıflandırması.</summary>
/// <param name="Ad">İnsan tarafından okunan ad — açılış raporunda görünür.</param>
/// <param name="YapilandirmaAnahtari">Kanonik yapılandırma anahtarı (ör. "Resend:ApiKey").</param>
/// <param name="Sinif">Eksik olduğunda uygulanacak davranış sınıfı.</param>
/// <param name="EksikseNeOlur">Operatörün karar verebilmesi için sonucun açık tarifi.</param>
/// <param name="OrtamTakmaAdlari">
/// Kanonik anahtarın DIŞINDA kabul edilen ortam değişkeni adları.
/// Groq anahtarı tarihsel olarak <c>GROQ_API_KEY</c> adıyla da okunuyordu ve
/// start-dev.sh bugün hâlâ .env'deki o adı dışa aktarıyor; bu ad burada AÇIKÇA
/// yazılmazsa, sözleşmeyi merkeze almak çalışan kurulumlarda sessiz bir işlev
/// kaybı yaratırdı.
///
/// KALDIRILAN TAKMA AD — <c>API_KEY</c>: tek bir okuma noktasında son çare
/// olarak duruyordu. Ad o kadar genel ki, ortamda BAŞKA bir servis için
/// tanımlanmış bir API_KEY varsa o sır Groq'a Bearer jetonu olarak gönderilirdi.
/// Hiçbir yapılandırma dosyası (.env, .env.example, docker-compose.yml) bu adı
/// tanımlamıyor; yani kaldırmak çalışan hiçbir kurulumu bozmaz.
/// </param>
public record DisServis(
    string Ad,
    string YapilandirmaAnahtari,
    ServisSinifi Sinif,
    string EksikseNeOlur,
    string[]? OrtamTakmaAdlari = null);

public static class DisServisSozlesmesi
{
    /// <summary>
    /// TEK KAYNAK. Yeni bir dış bağımlılık eklenirse buraya da eklenir;
    /// scripts/guard/14-yapilandirma.sh bunu denetler.
    /// </summary>
    public static readonly DisServis[] Servisler =
    {
        new("JWT imzalama anahtarı", "Jwt:Key", ServisSinifi.UygulamaAcilmaz,
            "Kimlik doğrulama tamamen çalışmaz."),

        new("Veritabanı", "ConnectionStrings:Default", ServisSinifi.UygulamaAcilmaz,
            "Hiçbir uç çalışmaz."),

        new("Resend e-posta", "Resend:ApiKey", ServisSinifi.OzellikKapanir,
            "Şifre sıfırlama ucu 503 döner. Bağlantı ASLA loga yazılmaz."),

        new("Ön yüz adresi", "App:FrontendUrl", ServisSinifi.OzellikKapanir,
            "Şifre sıfırlama bağlantısı üretilemez; uç 503 döner. " +
            "localhost'a düşen kullanılamaz bağlantı gönderilmez."),

        new("Groq LLM", "Groq:ApiKey", ServisSinifi.IslevBozulur,
            "Yapay zekâ çevirisi ve metin analizi yapılmaz; sözlük yedeği kullanılır.",
            OrtamTakmaAdlari: new[] { "GROQ_API_KEY" }),
    };

    /// <summary>
    /// Bir servisin yapılandırılmış değerini döner; yoksa <c>null</c>.
    ///
    /// Kanonik anahtar önce okunur, sonra sözleşmede yazan ortam takma adları
    /// denenir. Sıra ÖNEMLİ: yapılandırma her zaman kazanır, takma adlar
    /// yalnızca geriye dönük uyumluluk içindir.
    /// </summary>
    public static string? Deger(IConfiguration yapilandirma, string anahtar)
    {
        var deger = yapilandirma[anahtar];
        if (!string.IsNullOrWhiteSpace(deger)) return deger;

        var servis = Servisler.FirstOrDefault(s => s.YapilandirmaAnahtari == anahtar);
        foreach (var takmaAd in servis?.OrtamTakmaAdlari ?? Array.Empty<string>())
        {
            deger = Environment.GetEnvironmentVariable(takmaAd);
            if (!string.IsNullOrWhiteSpace(deger)) return deger;
        }

        return null;
    }

    /// <summary>Bu servis kullanılabilir mi?</summary>
    public static bool Kullanilabilir(IConfiguration yapilandirma, string anahtar)
        => !string.IsNullOrWhiteSpace(Deger(yapilandirma, anahtar));

    /// <summary>
    /// Eksik olan "özellik kapanır" sınıfı servisleri döner.
    ///
    /// Program.cs bunları BAŞLANGIÇTA loglar — operatör hangi özelliğin kapalı
    /// olduğunu ilk saniyede bilir, ilk kullanıcı şikâyetinde değil.
    /// </summary>
    public static IReadOnlyList<DisServis> KapaliOzellikler(IConfiguration yapilandirma)
        => Servisler
            .Where(s => s.Sinif == ServisSinifi.OzellikKapanir)
            .Where(s => !Kullanilabilir(yapilandirma, s.YapilandirmaAnahtari))
            .ToList();
}
