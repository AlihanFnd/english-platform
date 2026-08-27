namespace EnglishReadingPlatform.Security;

/// <summary>
/// KURAL-04: Süresi dolmuş iptal kayıtlarını periyodik temizler.
/// Task.Run(while(true)) yerine BackgroundService: istisna loglanır, host'a bildirilir.
/// </summary>
public class TokenTemizlikServisi : BackgroundService
{
    private readonly BellekTokenIptalDeposu _depo;
    private readonly ILogger<TokenTemizlikServisi> _logger;
    private static readonly TimeSpan Aralik = TimeSpan.FromMinutes(10);

    public TokenTemizlikServisi(ITokenIptalDeposu depo, ILogger<TokenTemizlikServisi> logger)
    {
        _depo = (BellekTokenIptalDeposu)depo;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken durdurmaTokeni)
    {
        while (!durdurmaTokeni.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(Aralik, durdurmaTokeni);
                var silinen = _depo.SuresiDolanlariTemizle();
                if (silinen > 0)
                    _logger.LogInformation("{Sayi} süresi dolmuş token iptal kaydı temizlendi.", silinen);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                // Yutma: logla ve döngüye devam et.
                _logger.LogError(ex, "Token temizliği başarısız oldu, sonraki turda tekrar denenecek.");
            }
        }
    }
}
