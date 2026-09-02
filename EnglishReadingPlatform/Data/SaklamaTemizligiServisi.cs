using Microsoft.EntityFrameworkCore;

namespace EnglishReadingPlatform.Data;

/// <summary>
/// KURAL-12: süresi dolan kişisel veriyi periyodik siler.
///
/// Neden gerekli: aktivite kaydı kullanıcı başına dakikada iki satır büyüyor
/// (30 saniyelik heartbeat). Hiçbir üst sınır olmadan bu tablo, kullanıcının
/// hangi gün hangi saatte ne okuduğunu SÜRESİZ saklayan bir davranış arşivine
/// dönüşüyor. Saklama süresi, "veriyi silmeyi unutmamak" için koda gömülmüş
/// tek karardır — bir operatörün elle çalıştırmasına bırakılmaz.
///
/// Günde bir kez çalışır; silme sayıları loglanır (kayıt olmadan bir temizlik
/// işinin çalışmadığını fark etmek imkânsızdır — sessiz başarısızlık).
/// </summary>
public class SaklamaTemizligiServisi : BackgroundService
{
    private readonly IServiceScopeFactory _kapsamFabrikasi;
    private readonly ILogger<SaklamaTemizligiServisi> _logger;

    // ── Saklama süreleri — TEK kaynak ────────────────────────────────────
    //
    // ⚠️ AktiviteLogu KISALTILMAMALIDIR. 'ai_word_translation' satırları aynı
    // zamanda Groq GÜNLÜK KOTA SAYACIDIR: bugünün kayıtları silinirse kullanıcı
    // günlük limitini sıfırlar ve kota koruması çöker. 90 günlük eşik bunu
    // güvenle aşar. Bu bağ testle sabitlendi (VeriButunluguTests) ve
    // MUTASYON C ile kanıtlandı.
    public static readonly TimeSpan AktiviteLogu    = TimeSpan.FromDays(90);
    public static readonly TimeSpan CeviriOnbellegi = TimeSpan.FromDays(365);
    public static readonly TimeSpan SifirlamaJetonu = TimeSpan.FromDays(7);

    private static readonly TimeSpan Aralik   = TimeSpan.FromHours(24);
    private static readonly TimeSpan Gecikme  = TimeSpan.FromMinutes(5);

    public SaklamaTemizligiServisi(IServiceScopeFactory kapsamFabrikasi,
                                   ILogger<SaklamaTemizligiServisi> logger)
    {
        _kapsamFabrikasi = kapsamFabrikasi;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken durdurma)
    {
        // Açılışta hemen çalışma — uygulama önce ayağa kalksın.
        try { await Task.Delay(Gecikme, durdurma); }
        catch (OperationCanceledException) { return; }

        while (!durdurma.IsCancellationRequested)
        {
            try
            {
                await TemizleAsync(durdurma);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                // Temizlik başarısız olsa bile uygulama çalışmaya devam eder,
                // ama SESSİZCE devam etmez: bir sonraki tur 24 saat sonradır.
                _logger.LogError(ex, "Saklama temizliği başarısız.");
            }

            try { await Task.Delay(Aralik, durdurma); }
            catch (OperationCanceledException) { break; }
        }
    }

    /// <summary>
    /// Tek bir temizlik turu. Testten doğrudan çağrılabilsin diye public.
    /// Satırları belleğe ÇEKMEDEN siler (ExecuteDelete): büyük log tablosunda
    /// tek tek yükleme, temizliği kendi başına bir kesinti sebebine çevirirdi.
    /// </summary>
    public async Task TemizleAsync(CancellationToken durdurma = default)
    {
        using var kapsam = _kapsamFabrikasi.CreateScope();
        var db = kapsam.ServiceProvider.GetRequiredService<AppDbContext>();
        var simdi = DateTime.UtcNow;

        var logEsigi = simdi - AktiviteLogu;
        var silinenLog = await db.UserActivityLogs
            .Where(l => l.Timestamp < logEsigi)
            .ExecuteDeleteAsync(durdurma);

        var onbellekEsigi = simdi - CeviriOnbellegi;
        var silinenOnbellek = await db.TranslationCaches
            .Where(tc => tc.CreatedAt < onbellekEsigi)
            .ExecuteDeleteAsync(durdurma);

        // Süresi dolmuş sıfırlama jetonu artık bir kimlik doğrulama sırrı değil,
        // yalnızca bir kalıntıdır. Yedek dosyalarında birikmesinin sebebi yok.
        var jetonEsigi = simdi - SifirlamaJetonu;
        var silinenJeton = await db.SifreSifirlamaJetonlari
            .Where(j => j.CreatedAt < jetonEsigi)
            .ExecuteDeleteAsync(durdurma);

        if (silinenLog + silinenOnbellek + silinenJeton > 0)
            _logger.LogInformation(
                "Saklama temizliği. AktiviteLogu={Log} CeviriOnbellegi={Onbellek} Jeton={Jeton}",
                silinenLog, silinenOnbellek, silinenJeton);
    }
}
