namespace EnglishReadingPlatform.RateLimiting;

/// <summary>
/// KURAL-07: Hız sınırı politikalarının TEK kaynağı.
///
/// Sayılar burada durur çünkü üretimde dar geldiklerinde tek bir dosya
/// değiştirilir. Eskiden her sayı çağrı yerine gömülüydü (100, 20, 60, 10, 5)
/// ve hiçbiri diğerinden haberdar değildi.
/// </summary>
public static class HizSinirlari
{
    // ── Politika adları — [EnableRateLimiting("...")] içinde kullanılır ──
    public const string KimlikDogrulama = "kimlik-dogrulama";  // login/register: IP başına
    public const string DavetKodu       = "davet-kodu";        // groups/join: kaba kuvvet
    public const string Okuma           = "okuma";             // books/{id}/read
    public const string Ceviri          = "ceviri";            // translate/word, translate/sentence
    public const string AgirAnaliz      = "agir-analiz";       // translate/analyze (LLM maliyeti)
    public const string Yazma           = "yazma";             // genel yazma uçları
    public const string DosyaYukleme    = "dosya-yukleme";     // admin upload (50 MB × N)

    // ── Dakika başına izin verilen istek sayıları ──
    public const int KimlikDogrulamaDk = 10;
    public const int DavetKoduDk       = 5;
    public const int OkumaDk           = 60;
    public const int CeviriDk          = 100;
    public const int AgirAnalizDk      = 20;
    public const int YazmaDk           = 60;
    public const int DosyaYuklemeDk    = 5;

    /// <summary>
    /// Kimliği doğrulanmamış trafiğe IP başına cömert taban sınır.
    /// DAR TUTULMAZ: okul/kurum NAT'ı arkasındaki onlarca öğrenci tek IP'den gelir.
    /// Asıl koruma politika bazlıdır; bu yalnızca kör bir seli keser.
    /// </summary>
    public const int GlobalTabanDk = 300;

    // ── Hesap (e-posta) bazlı giriş sınırı ──
    // IP bazlı sınır, her IP'den 10 deneme yapan bir botnet'i durdurmaz.
    public const int GirisHedefEnCokBasarisiz = 10;
    public static readonly TimeSpan GirisHedefPenceresi = TimeSpan.FromMinutes(15);

    // ── Eşzamanlılık sınırı ──
    /// <summary>Aynı anda çalışabilecek LLM analizi / PDF ayrıştırma işi sayısı.</summary>
    public const int EszamanliAgirIs = 4;

    /// <summary>Kapı doluysa istek bu kadar bekler, sonra 503 ile REDDEDİLİR.</summary>
    public static readonly TimeSpan AgirIsBeklemeSuresi = TimeSpan.FromSeconds(2);

    // ── Dış API bütçeleri (KURAL-07 İhlal 3) ──
    public static readonly TimeSpan GroqTavanZamanAsimi   = TimeSpan.FromSeconds(60);
    public static readonly TimeSpan GoogleZamanAsimi      = TimeSpan.FromSeconds(10);
    public const long GroqEnCokYanitBayti   = 8 * 1024 * 1024;   // 8 MB
    public const long GoogleEnCokYanitBayti = 1 * 1024 * 1024;   // 1 MB

    // Tek çağrı bütçeleri (HttpClient tavanının altında; CancellationToken ile uygulanır).
    public static readonly TimeSpan GroqKelimeButcesi     = TimeSpan.FromSeconds(20);
    public static readonly TimeSpan GroqKisaButce         = TimeSpan.FromSeconds(10);
    public static readonly TimeSpan GroqAgirButce         = TimeSpan.FromSeconds(60);

    // ── Adlandırılmış HttpClient adları ──
    public const string GroqIstemcisi   = "groq";
    public const string GoogleIstemcisi = "google-translate";
}
