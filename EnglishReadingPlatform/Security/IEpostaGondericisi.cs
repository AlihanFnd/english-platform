using System.Net.Http.Headers;
using System.Text.Json;
using EnglishReadingPlatform.Logging;

namespace EnglishReadingPlatform.Security;

public interface IEpostaGondericisi
{
    Task SifreSifirlamaGonderAsync(string eposta, string sifirlamaBaglantisi, CancellationToken iptal = default);
}

/// <summary>
/// KURAL-14: e-posta servisi yapılandırılmamışken kullanılan uygulama.
///
/// ESKİ HÂLİ SİLİNDİ. Önceki "loglayan" yedek uygulama, sıfırlama
/// bağlantısını LOGA yazıyordu — yani anahtar yokluğu, bir kullanılabilirlik
/// sorunundan bir HESAP ELE GEÇİRME yoluna dönüşüyordu: /auth/forgot-password
/// anonim olduğu için, logu görebilen herkes istediği hesabın bağlantısını
/// üretip okuyabiliyordu.
///
/// Yeni davranış: gönderemiyorsak bunu SÖYLERİZ. Çağıran (AuthController)
/// bunu 503'e çevirir ve jeton hiç üretilmez.
/// </summary>
public class KapaliEpostaGondericisi : IEpostaGondericisi
{
    private readonly ILogger<KapaliEpostaGondericisi> _logger;
    public KapaliEpostaGondericisi(ILogger<KapaliEpostaGondericisi> logger) => _logger = logger;

    public Task SifreSifirlamaGonderAsync(string eposta, string baglanti, CancellationToken iptal = default)
    {
        // DİKKAT: 'baglanti' parametresi BİLEREK loglanmıyor. Bu satırın
        // tamamı scripts/guard/14-yapilandirma.sh tarafından denetleniyor.
        _logger.LogError(
            "E-posta servisi yapılandırılmamış; gönderim reddedildi. Alici={Alici}",
            GuvenliLog.Eposta(eposta));

        throw new EpostaServisiKapaliException();
    }
}

/// <summary>
/// KURAL-14: e-posta servisi yapılandırılmamış.
///
/// Mesaj SABİTTİR ve bağlantıyı TAŞIMAZ: merkezî HataYakalamaMiddleware
/// yakalanmamış istisnaları tam ayrıntısıyla logluyor, yani mesaja konan
/// her şey başka bir dosyadan tekrar sızardı.
/// </summary>
public class EpostaServisiKapaliException : Exception
{
    public EpostaServisiKapaliException()
        : base("E-posta servisi yapılandırılmamış.") { }
}

/// <summary>
/// KURAL-09 / 00-BASLA-BURADAN madde 7 kararı **A**: Resend ile gerçek gönderim.
///
/// Anahtar <c>Resend__ApiKey</c> ortam değişkeninden okunur; koda gömülmez (KURAL-02).
/// Gönderim başarısız olursa istisna YUKARI TAŞINMAZ — aksi halde /forgot-password
/// ucu, e-posta kayıtlıyken hata, kayıtlı değilken 200 dönerdi ve bu tam olarak
/// kapatmaya çalıştığımız enumerasyon sızıntısı olurdu.
/// </summary>
public class ResendEpostaGondericisi : IEpostaGondericisi
{
    private readonly IHttpClientFactory _fabrika;
    private readonly ILogger<ResendEpostaGondericisi> _logger;
    private readonly string _apiAnahtari;
    private readonly string _gonderen;

    public const string IstemciAdi = "resend";

    public ResendEpostaGondericisi(IHttpClientFactory fabrika, IConfiguration cfg,
                                   ILogger<ResendEpostaGondericisi> logger)
    {
        _fabrika     = fabrika;
        _logger      = logger;
        _apiAnahtari = cfg["Resend:ApiKey"] ?? "";
        _gonderen    = cfg["Resend:Gonderen"] ?? "Linguza <onboarding@resend.dev>";
    }

    public async Task SifreSifirlamaGonderAsync(string eposta, string baglanti, CancellationToken iptal = default)
    {
        var govde = new
        {
            from    = _gonderen,
            to      = new[] { eposta },
            subject = "Linguza — şifre sıfırlama",
            html    = $"""
                <p>Merhaba,</p>
                <p>Şifreni sıfırlamak için aşağıdaki bağlantıya tıkla. Bağlantı <b>30 dakika</b> geçerlidir
                ve yalnızca bir kez kullanılabilir.</p>
                <p><a href="{baglanti}">Şifremi sıfırla</a></p>
                <p>Bu isteği sen yapmadıysan bu e-postayı yok sayabilirsin; şifren değişmez.</p>
                """
        };

        try
        {
            var istemci = _fabrika.CreateClient(IstemciAdi);
            istemci.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", _apiAnahtari);

            using var yanit = await istemci.PostAsJsonAsync("emails", govde, iptal);

            if (!yanit.IsSuccessStatusCode)
            {
                // Sağlayıcı gövdesi loglanmaz: içinde alıcı adresi ve iç detay olabilir (KURAL-06).
                _logger.LogError("Resend gönderimi başarısız. Durum={Durum} Alici={Alici}",
                    (int)yanit.StatusCode, GuvenliLog.Eposta(eposta));
                return;
            }

            _logger.LogInformation("Şifre sıfırlama e-postası gönderildi. Alici={Alici}",
                GuvenliLog.Eposta(eposta));
        }
        catch (Exception ex)
        {
            // Yutuluyor — gerekçe sınıf özetinde. Mesaj değil, tip loglanır (KURAL-06).
            _logger.LogError("Resend gönderiminde hata. Tip={Tip} Alici={Alici}",
                ex.GetType().Name, GuvenliLog.Eposta(eposta));
        }
    }
}
