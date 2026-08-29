using System.Net.Http.Headers;
using System.Text.Json;
using EnglishReadingPlatform.Logging;

namespace EnglishReadingPlatform.Security;

public interface IEpostaGondericisi
{
    Task SifreSifirlamaGonderAsync(string eposta, string sifirlamaBaglantisi, CancellationToken iptal = default);
}

/// <summary>
/// KURAL-09: Gerçek e-posta servisi yapılandırılmamışken kullanılan uygulama.
/// Bağlantıyı LOGA yazar.
///
/// ⚠️ ÜRETİMDE KULLANILMAMALIDIR: log erişimi olan herkes sıfırlama bağlantısını
/// görür, yani her hesabı ele geçirebilir. Program.cs bu sınıfı yalnızca
/// Resend anahtarı yokken kaydeder ve üretim ortamında ayrıca uyarı basar.
/// </summary>
public class LoglayanEpostaGondericisi : IEpostaGondericisi
{
    private readonly ILogger<LoglayanEpostaGondericisi> _logger;
    public LoglayanEpostaGondericisi(ILogger<LoglayanEpostaGondericisi> logger) => _logger = logger;

    public Task SifreSifirlamaGonderAsync(string eposta, string baglanti, CancellationToken iptal = default)
    {
        _logger.LogWarning(
            "E-POSTA SERVİSİ YAPILANDIRILMAMIŞ. Şifre sıfırlama bağlantısı gönderilemedi. " +
            "Alici={Alici} Baglanti={Baglanti}",
            GuvenliLog.Eposta(eposta), baglanti);
        return Task.CompletedTask;
    }
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
