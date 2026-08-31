# KURAL-07 — Kaynak tüketimi sınırlanır

> **Ön koşul:** KURAL-01, KURAL-04 ve KURAL-06 tamamlanmış olmalı.
> (KURAL-04 `TokenSecurityService`'ten iptal sorumluluğunu aldı; geriye yalnızca
> rate limit kaldı ve bu kural onu devralıyor.)

---

## Kural metni

> **Pahalı veya kötüye kullanılabilir her uç, sayılabilir bir bütçeye bağlı olacak.**
> Hız sınırlama tek bir merkezî mekanizmayla uygulanacak; sınırlayıcı durum sınırsız
> büyümeyecek. Saldırgan kontrolündeki anahtarlar (IP, e-posta) bellekte süresiz
> tutulmayacak. Sınır aşımında `429` ve `Retry-After` başlığı dönecek. Dış API'ye
> (LLM, çeviri) giden her çağrı zaman aşımına ve boyut sınırına tabi olacak.

---

## Envanter

Ölçüm tarihi: **2026-08-20**, commit `d2cfc0f`.

### İhlal 1 — Sınırlayıcı sözlük hiç temizlenmiyor 🔴

`Services/TokenSecurityService.cs`:

```
14:  private readonly ConcurrentDictionary<string, ConcurrentQueue<DateTime>> _rateLimitWindow = new();
67:  var queue = _rateLimitWindow.GetOrAdd(key, _ => new ConcurrentQueue<DateTime>());
81:  private void CleanupExpiredTokens()      ← YALNIZCA _revokedTokens'ı geziyor
```

`_rateLimitWindow` anahtarları **asla silinmiyor**. Anahtar biçimleri:

| Anahtar | Kaynağı | Saldırgan kontrolünde mi |
|---|---|---|
| `login_{ip}` | `HttpContext.Connection.RemoteIpAddress` | 🔴 **Evet** — IPv6 ile pratikte sınırsız |
| `register_{ip}` | aynı | 🔴 **Evet** |
| `user_{id}_read` | token claim'i | 🟡 Kullanıcı sayısıyla sınırlı |
| `user_{id}_trans` | aynı | 🟡 |
| `user_{id}_analyze` | aynı | 🟡 |

Her anahtar boş bir `ConcurrentQueue` bile olsa sözlükte kalır → yavaş ama kesin
bellek tükenmesi → OOM → servis dışı kalma.

### İhlal 2 — Korumasız yazma uçları

```
$ grep -rn "\[Http\(Post\|Put\|Delete\)" EnglishReadingPlatform/Controllers/ | wc -l
      22

$ grep -rn "IsRateLimitExceeded" EnglishReadingPlatform/Controllers/ | wc -l
       6
```

| Uç | Rate limit | Risk |
|---|---|---|
| `POST /auth/login` | ✅ `login_{ip}` 10/dk | — |
| `POST /auth/register` | ✅ `register_{ip}` 5/dk | — |
| `GET /books/{id}/read` | ✅ `user_{id}_read` 60/dk | — |
| `POST /translate/word` | ✅ `user_{id}_trans` 100/dk | — |
| `POST /translate/sentence` | ✅ aynı sayaç | — |
| `POST /translate/analyze` | ✅ `user_{id}_analyze` 20/dk | — |
| `POST /groups/join` | ❌ **YOK** | 🔴 8 karakterlik davet kodu kaba kuvvetle denenebilir |
| `POST /books/addword` | ❌ **YOK** | 🟠 Sınırsız satır yazımı → disk |
| `POST /feedback` | ❌ **YOK** | 🟠 Spam |
| `POST /activity/log` | ❌ **YOK** | 🟠 Log tablosu şişirme |
| `POST /dashboard/ocr` | ❌ **YOK** | 🟠 50.000 karakterlik metin sınırsız kayıt |
| `POST /books/submitquiz` | ❌ **YOK** | 🟡 |
| `POST /groups` | ❌ **YOK** | 🟠 Sınırsız grup |
| `POST /admin/books/upload*` | ❌ **YOK** | 🟠 50 MB × N eşzamanlı PDF ayrıştırma |
| Diğer 8 yazma ucu | ❌ | 🟡 |

**Korumasız yazma ucu: 16 / 22.**

### İhlal 3 — Dış API çağrılarında sınır eksikleri

| Yer | Zaman aşımı | Boyut sınırı |
|---|---|---|
| `TranslationService.AnalyzeTextWithGroqAsync` | ✅ 5 dakika | ❌ (KURAL-05 girdi sınırı ekledi) |
| `TranslationService.TranslateWordAsync` (Groq) | ❌ **varsayılan 100 sn** | ❌ |
| `TranslationService.TranslateSentenceAsync` (Google) | ❌ **varsayılan** | ❌ |
| `PdfService.SplitIntoChaptersWithGroqAsync` | ❌ **varsayılan** | ❌ |

> **5 dakikalık timeout kendisi bir sorundur:** 20 eşzamanlı analiz isteği, 5 dakika
> boyunca 20 bağlantı ve 20 thread'i tutar.

### İhlal 4 — Eşzamanlılık sınırı yok

Ağır işler (PDF ayrıştırma, LLM analizi) için kuyruk veya semafor yok. 10 kullanıcı
aynı anda 50 MB'lık PDF yüklerse 500 MB bellek + N × PdfPig ayrıştırması.

### Özet

| # | İhlal | Nokta |
|---|---|---|
| 1 | Sözlük temizliği yok | 1 |
| 2 | Korumasız yazma ucu | 16 |
| 3 | Timeout/boyut eksiği | 3 |
| 4 | Eşzamanlılık sınırı yok | 2 |
| | **TOPLAM** | **22** |

---

## Merkezî uygulama

.NET 8'de **yerleşik** `Microsoft.AspNetCore.RateLimiting` middleware'i vardır
(ek NuGet paketi gerekmez). Elle yazılmış `IsRateLimitExceeded` yerine bu kullanılır:
bölümlenmiş (partitioned) limitleyiciler, otomatik durum temizliği ve `Retry-After`
başlığı hazır gelir. **Bellek sızıntısı tasarım gereği ortadan kalkar.**

### 1. Politika tanımları — `RateLimiting/HizSinirlari.cs`

```csharp
namespace EnglishReadingPlatform.RateLimiting;

/// <summary>KURAL-07: Hız sınırı politikalarının TEK kaynağı.</summary>
public static class HizSinirlari
{
    // Politika adları — [EnableRateLimiting("...")] içinde kullanılır
    public const string KimlikDogrulama = "kimlik-dogrulama";  // login/register: IP + hedef
    public const string DavetKodu       = "davet-kodu";        // groups/join: kaba kuvvet
    public const string Okuma           = "okuma";             // books/read
    public const string Ceviri          = "ceviri";            // translate/word, sentence
    public const string AgirAnaliz      = "agir-analiz";       // translate/analyze (LLM)
    public const string Yazma           = "yazma";             // genel yazma uçları
    public const string DosyaYukleme    = "dosya-yukleme";     // admin upload

    // Dakika başına izin verilen istek sayıları
    public const int KimlikDogrulamaDk = 10;
    public const int DavetKoduDk       = 5;
    public const int OkumaDk           = 60;
    public const int CeviriDk          = 100;
    public const int AgirAnalizDk      = 20;
    public const int YazmaDk           = 60;
    public const int DosyaYuklemeDk    = 5;

    // Eşzamanlılık sınırları
    public const int EszamanliAgirIs   = 4;   // aynı anda kaç LLM/PDF işi
}
```

### 2. Kayıt — `RateLimiting/HizSinirlamaKurulumu.cs`

```csharp
using System.Globalization;
using System.Security.Claims;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;

namespace EnglishReadingPlatform.RateLimiting;

public static class HizSinirlamaKurulumu
{
    public static IServiceCollection HizSinirlamaEkle(this IServiceCollection services)
    {
        services.AddRateLimiter(secenekler =>
        {
            secenekler.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

            // ── 429 yanıtı projenin { error } sözleşmesine uyar ──
            secenekler.OnRejected = async (ctx, iptal) =>
            {
                if (ctx.Lease.TryGetMetadata(MetadataName.RetryAfter, out var sure))
                    ctx.HttpContext.Response.Headers.RetryAfter =
                        ((int)sure.TotalSeconds).ToString(NumberFormatInfo.InvariantInfo);

                ctx.HttpContext.Response.ContentType = "application/json; charset=utf-8";
                await ctx.HttpContext.Response.WriteAsync(
                    """{"error":"Çok fazla istek gönderdiniz. Lütfen biraz bekleyip tekrar deneyin."}""",
                    iptal);
            };

            // ── Global taban sınır: kimliği doğrulanmamış istekler IP başına ──
            secenekler.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx =>
                RateLimitPartition.GetFixedWindowLimiter(
                    partitionKey: IpAnahtari(ctx),
                    factory: _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = 300,           // dakikada 300 istek/IP — cömert taban
                        Window = TimeSpan.FromMinutes(1),
                        QueueLimit = 0
                    }));

            Politika(secenekler, HizSinirlari.KimlikDogrulama, HizSinirlari.KimlikDogrulamaDk, IpAnahtari);
            Politika(secenekler, HizSinirlari.DavetKodu,       HizSinirlari.DavetKoduDk,       KullaniciVeyaIp);
            Politika(secenekler, HizSinirlari.Okuma,           HizSinirlari.OkumaDk,           KullaniciVeyaIp);
            Politika(secenekler, HizSinirlari.Ceviri,          HizSinirlari.CeviriDk,          KullaniciVeyaIp);
            Politika(secenekler, HizSinirlari.AgirAnaliz,      HizSinirlari.AgirAnalizDk,      KullaniciVeyaIp);
            Politika(secenekler, HizSinirlari.Yazma,           HizSinirlari.YazmaDk,           KullaniciVeyaIp);
            Politika(secenekler, HizSinirlari.DosyaYukleme,    HizSinirlari.DosyaYuklemeDk,    KullaniciVeyaIp);
        });

        return services;
    }

    private static void Politika(RateLimiterOptions secenekler, string ad, int dakikaBasina,
                                 Func<HttpContext, string> anahtarUretici)
        => secenekler.AddPolicy(ad, ctx =>
            RateLimitPartition.GetFixedWindowLimiter(
                partitionKey: $"{ad}:{anahtarUretici(ctx)}",
                factory: _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = dakikaBasina,
                    Window = TimeSpan.FromMinutes(1),
                    QueueLimit = 0
                }));

    private static string IpAnahtari(HttpContext ctx)
        => ctx.Connection.RemoteIpAddress?.ToString() ?? "bilinmeyen-ip";

    /// <summary>Kimliği doğrulanmışsa kullanıcı, değilse IP. Kullanıcı bazlı sınır daha adildir.</summary>
    private static string KullaniciVeyaIp(HttpContext ctx)
    {
        var id = ctx.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return string.IsNullOrEmpty(id) ? "ip:" + IpAnahtari(ctx) : "kullanici:" + id;
    }
}
```

> **Bellek sızıntısı neden çözülüyor:** `PartitionedRateLimiter`, kullanılmayan
> bölümleri (partition) kendi iç zamanlayıcısıyla **otomatik olarak serbest bırakır**.
> Elle yazılmış `ConcurrentDictionary`'de böyle bir mekanizma yoktu.

### 3. `Program.cs` — kayıt ve middleware

```csharp
using EnglishReadingPlatform.RateLimiting;

builder.Services.HizSinirlamaEkle();
...
var app = builder.Build();

app.HataYakalamayiKullan();     // KURAL-06
app.UseStaticFiles();
app.UseRouting();
app.UseCors();
app.UseRateLimiter();           // ← KURAL-07: Authentication'dan SONRA, çünkü
app.UseAuthentication();        //   KullaniciVeyaIp claim'e bakıyor... AMA:
app.UseAuthorization();
app.MapControllers();
```

> ⚠️ **Sıra tuzağı:** `UseRateLimiter()` `UseAuthentication()`'dan **önce** çağrılırsa
> `ctx.User` boş olur ve tüm sınırlar IP bazına düşer. **Doğru sıra:**
>
> ```csharp
> app.UseRouting();
> app.UseCors();
> app.UseAuthentication();     // önce kimliği çöz
> app.UseRateLimiter();        // sonra kullanıcı bazlı sınırla
> app.UseAuthorization();
> ```
>
> Guard script bu sırayı kontrol ediyor.

### 4. Uçlara politika ata

```csharp
// AuthController
[HttpPost("login")]  [AllowAnonymous] [EnableRateLimiting(HizSinirlari.KimlikDogrulama)]
[HttpPost("register")] [AllowAnonymous] [EnableRateLimiting(HizSinirlari.KimlikDogrulama)]

// GroupsController
[HttpPost("join")]   [EnableRateLimiting(HizSinirlari.DavetKodu)]        // ← YENİ KORUMA
[HttpPost]           [EnableRateLimiting(HizSinirlari.Yazma)]
[HttpPost("assignbook")] [EnableRateLimiting(HizSinirlari.Yazma)]

// BooksController
[HttpGet("{id}/read")]  [EnableRateLimiting(HizSinirlari.Okuma)]
[HttpPost("addword")]   [EnableRateLimiting(HizSinirlari.Yazma)]          // ← YENİ
[HttpPut("words/{id}")] [EnableRateLimiting(HizSinirlari.Yazma)]          // ← YENİ
[HttpDelete("words/{id}")] [EnableRateLimiting(HizSinirlari.Yazma)]       // ← YENİ
[HttpPost("submitquiz")] [EnableRateLimiting(HizSinirlari.Yazma)]         // ← YENİ

// TranslateController
[HttpPost("word")]     [EnableRateLimiting(HizSinirlari.Ceviri)]
[HttpPost("sentence")] [EnableRateLimiting(HizSinirlari.Ceviri)]
[HttpPost("analyze")]  [EnableRateLimiting(HizSinirlari.AgirAnaliz)]

// ActivityController / FeedbackController / DashboardController
[HttpPost("log")] [EnableRateLimiting(HizSinirlari.Yazma)]                // ← YENİ
[HttpPost]        [EnableRateLimiting(HizSinirlari.Yazma)]                // feedback ← YENİ
[HttpPost("ocr")] [EnableRateLimiting(HizSinirlari.Yazma)]                // ← YENİ

// AdminController
[HttpPost("books/upload")]       [EnableRateLimiting(HizSinirlari.DosyaYukleme)]   // ← YENİ
[HttpPost("books/upload-pages")] [EnableRateLimiting(HizSinirlari.DosyaYukleme)]   // ← YENİ
```

Gövdedeki `IsRateLimitExceeded` çağrıları (6 nokta) **silinir** — artık öznitelik yapıyor.

### 5. Hesap bazlı giriş sınırı (dağıtık saldırıya karşı)

IP bazlı sınır, her IP'den 10 deneme yapan bir botnet'i durdurmaz. **Hedef e-posta**
bazlı ikinci bir sayaç gerekir. Bu, middleware ile yapılamaz (gövdeyi okumak gerekir),
bu yüzden `AuthController` içinde kalır:

```csharp
// AuthController.Login içinde, kimlik kontrolünden ÖNCE:
var hedefAnahtar = $"giris_hedef:{req.Email.Trim().ToLowerInvariant()}";
if (!_hesapSayaci.IzinVar(hedefAnahtar, izin: 10, pencere: TimeSpan.FromMinutes(15)))
{
    _logger.LogWarning("Hesap bazlı giriş sınırı aşıldı. Eposta={Eposta}",
        GuvenliLog.Eposta(req.Email));       // KURAL-06 maskeleme
    return StatusCode(429, new { error = "Bu hesap için çok fazla deneme yapıldı. 15 dakika sonra tekrar deneyin." });
}
```

`RateLimiting/HesapSayaci.cs`:

```csharp
using System.Threading.RateLimiting;

namespace EnglishReadingPlatform.RateLimiting;

/// <summary>
/// KURAL-07: Hedef (e-posta) bazlı sayaç. IP bazlı sınırın kapatamadığı
/// dağıtık credential-stuffing saldırısına karşı ikinci savunma hattı.
/// PartitionedRateLimiter kullanır → bölümler otomatik temizlenir, bellek sızmaz.
/// </summary>
public class HesapSayaci : IDisposable
{
    private readonly PartitionedRateLimiter<string> _sinirlayici;

    public HesapSayaci()
    {
        _sinirlayici = PartitionedRateLimiter.Create<string, string>(anahtar =>
            RateLimitPartition.GetFixedWindowLimiter(anahtar, _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromMinutes(15),
                QueueLimit = 0
            }));
    }

    public bool IzinVar(string anahtar, int izin, TimeSpan pencere)
    {
        using var kiralama = _sinirlayici.AttemptAcquire(anahtar);
        return kiralama.IsAcquired;
    }

    public void Dispose() => _sinirlayici.Dispose();
}
```

Kayıt: `builder.Services.AddSingleton<HesapSayaci>();`

> **Not:** Başarılı girişten sonra sayaç sıfırlanmaz (fixed window). Bu bilinçlidir —
> meşru kullanıcı 15 dakikada 10 kez yanlış şifre girmez. KURAL-09 bunu
> "başarılı girişte sıfırla" davranışıyla iyileştirebilir.

### 6. Dış çağrı zaman aşımı ve eşzamanlılık — `TranslationService` / `PdfService`

```csharp
// Program.cs — adlandırılmış HttpClient'lar
builder.Services.AddHttpClient("groq", c =>
{
    c.BaseAddress = new Uri("https://api.groq.com/");
    c.Timeout = TimeSpan.FromSeconds(60);       // 5 dakika → 60 saniye
});

builder.Services.AddHttpClient("google-translate", c =>
{
    c.Timeout = TimeSpan.FromSeconds(10);
});
```

Eşzamanlılık kapısı — `RateLimiting/AgirIsKapisi.cs`:

```csharp
namespace EnglishReadingPlatform.RateLimiting;

/// <summary>
/// KURAL-07: Aynı anda çalışabilecek ağır iş (LLM analizi, PDF ayrıştırma) sayısını sınırlar.
/// Sınır dolduğunda BEKLEMEZ, hemen reddeder — kuyrukta biriken istekler
/// thread ve bellek tüketir, bu da korunmak istenen şeyin ta kendisidir.
/// </summary>
public class AgirIsKapisi
{
    private readonly SemaphoreSlim _semafor = new(HizSinirlari.EszamanliAgirIs);

    public async Task<T> CalistirAsync<T>(Func<Task<T>> is_, CancellationToken iptal = default)
    {
        if (!await _semafor.WaitAsync(TimeSpan.FromSeconds(2), iptal))
            throw new Exceptions.KullaniciHatasi(
                "Sistem şu anda yoğun. Lütfen birkaç saniye sonra tekrar deneyin.", 503);

        try { return await is_(); }
        finally { _semafor.Release(); }
    }
}
```

Kullanım (`TranslationService.AnalyzeTextAsync` ve `PdfService.ExtractAndSplitAsync`):

```csharp
return await _agirIsKapisi.CalistirAsync(() => AnalyzeTextWithGroqAsync(text, apiKey));
```

### 7. `TokenSecurityService`'i emekliye ayır

KURAL-04 iptal sorumluluğunu aldı, bu kural rate limit sorumluluğunu alıyor.
Sınıf tamamen **silinir**; `Program.cs`'teki `AddSingleton<TokenSecurityService>()`
kaydı ve 6 controller'daki enjeksiyonu kaldırılır.

---

## Otomatik kapı

### A) Yansıma testi: her yazma ucu bir politikaya bağlı — `HizSiniriSozlesmesiTests.cs`

```csharp
using System.Reflection;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using FluentAssertions;
using Xunit;

namespace EnglishReadingPlatform.Tests;

public class HizSiniriSozlesmesiTests
{
    /// <summary>Bilinçli olarak sınırsız bırakılan uçlar. Her satırın gerekçesi yazılmalı.</summary>
    private static readonly HashSet<string> SinirsizBeyazListe = new()
    {
        "AuthController.Logout",   // çıkış engellenmemeli; kötüye kullanım değeri yok
    };

    private static IEnumerable<(Type Tip, MethodInfo Aksiyon, string Ad)> YazmaAksiyonlari()
    {
        var assembly = typeof(Program).Assembly;
        foreach (var tip in assembly.GetTypes()
                     .Where(t => typeof(ControllerBase).IsAssignableFrom(t) && !t.IsAbstract))
        {
            foreach (var aksiyon in tip.GetMethods(
                         BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly))
            {
                var yazmaMi = aksiyon.GetCustomAttributes<HttpMethodAttribute>()
                    .SelectMany(a => a.HttpMethods)
                    .Any(m => m is "POST" or "PUT" or "DELETE" or "PATCH");

                if (yazmaMi) yield return (tip, aksiyon, $"{tip.Name}.{aksiyon.Name}");
            }
        }
    }

    [Fact]
    [Trait("Category", "HizSiniri")]
    public void Her_yazma_ucu_hiz_sinirina_bagli_olmali()
    {
        var korumasizlar = new List<string>();

        foreach (var (tip, aksiyon, ad) in YazmaAksiyonlari())
        {
            if (SinirsizBeyazListe.Contains(ad)) continue;

            var politika = aksiyon.GetCustomAttribute<EnableRateLimitingAttribute>()
                        ?? tip.GetCustomAttribute<EnableRateLimitingAttribute>();

            var devreDisi = aksiyon.GetCustomAttribute<DisableRateLimitingAttribute>() != null;

            if (politika is null || devreDisi)
                korumasizlar.Add(ad);
        }

        korumasizlar.Should().BeEmpty(
            "bu yazma uçlarında [EnableRateLimiting] yok:\n" + string.Join("\n", korumasizlar));
    }

    [Fact]
    [Trait("Category", "HizSiniri")]
    public void Agir_uclar_dogru_politikayi_kullanmali()
    {
        var beklenen = new Dictionary<string, string>
        {
            ["TranslateController.Analyze"] = RateLimiting.HizSinirlari.AgirAnaliz,
            ["GroupsController.Join"]       = RateLimiting.HizSinirlari.DavetKodu,
            ["AuthController.Login"]        = RateLimiting.HizSinirlari.KimlikDogrulama,
            ["AuthController.Register"]     = RateLimiting.HizSinirlari.KimlikDogrulama,
            ["AdminController.UploadBook"]      = RateLimiting.HizSinirlari.DosyaYukleme,
            ["AdminController.UploadBookPages"] = RateLimiting.HizSinirlari.DosyaYukleme,
        };

        var yanlislar = new List<string>();

        foreach (var (tip, aksiyon, ad) in YazmaAksiyonlari())
        {
            if (!beklenen.TryGetValue(ad, out var beklenenPolitika)) continue;

            var gercek = aksiyon.GetCustomAttribute<EnableRateLimitingAttribute>()?.PolicyName;
            if (gercek != beklenenPolitika)
                yanlislar.Add($"{ad}: beklenen '{beklenenPolitika}', bulunan '{gercek ?? "yok"}'");
        }

        yanlislar.Should().BeEmpty(string.Join("\n", yanlislar));
    }

    [Fact]
    [Trait("Category", "HizSiniri")]
    public void Eski_elle_yazilmis_sinirlayici_kalmamali()
    {
        var assembly = typeof(Program).Assembly;
        var eskiTip = assembly.GetType("EnglishReadingPlatform.Services.TokenSecurityService");

        eskiTip.Should().BeNull(
            "TokenSecurityService emekliye ayrıldı; sorumlulukları ITokenIptalDeposu (KURAL-04) " +
            "ve yerleşik RateLimiter (KURAL-07) tarafından devralındı");
    }
}
```

### B) Davranış testi — `HizSiniriTests.cs`

```csharp
using System.Net;
using System.Net.Http.Json;
using EnglishReadingPlatform.Tests.Infrastructure;
using FluentAssertions;
using Xunit;

namespace EnglishReadingPlatform.Tests;

[Collection("api")]
public class HizSiniriTests
{
    private readonly TestAppFactory _fabrika;
    public HizSiniriTests(TestAppFactory fabrika) => _fabrika = fabrika;

    [Fact]
    [Trait("Category", "HizSiniri")]
    public async Task Davet_kodu_kaba_kuvvete_karsi_korunur()
    {
        // ANA REGRESYON: groups/join'de HİÇ sınır yoktu.
        var client = _fabrika.CreateClient();
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(o.Token);

        var durumlar = new List<HttpStatusCode>();
        for (var i = 0; i < RateLimiting.HizSinirlari.DavetKoduDk + 3; i++)
        {
            var yanit = await client.PostAsJsonAsync("/api/groups/join",
                new { inviteCode = $"KOD{i:D5}" });
            durumlar.Add(yanit.StatusCode);
        }

        durumlar.Should().Contain(HttpStatusCode.TooManyRequests,
            "davet kodu denemeleri sınırlanmalı");
    }

    [Fact]
    [Trait("Category", "HizSiniri")]
    public async Task Sinir_asiminda_RetryAfter_basligi_doner()
    {
        var client = _fabrika.CreateClient();
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(o.Token);

        HttpResponseMessage? reddedilen = null;
        for (var i = 0; i < RateLimiting.HizSinirlari.DavetKoduDk + 3; i++)
        {
            var yanit = await client.PostAsJsonAsync("/api/groups/join", new { inviteCode = "AAAAAAAA" });
            if (yanit.StatusCode == HttpStatusCode.TooManyRequests) { reddedilen = yanit; break; }
        }

        reddedilen.Should().NotBeNull();
        reddedilen!.Headers.Should().ContainKey("Retry-After");
    }

    [Fact]
    [Trait("Category", "HizSiniri")]
    public async Task Sinir_asimi_yaniti_error_alani_tasir()
    {
        var client = _fabrika.CreateClient();
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(o.Token);

        for (var i = 0; i < RateLimiting.HizSinirlari.DavetKoduDk + 3; i++)
        {
            var yanit = await client.PostAsJsonAsync("/api/groups/join", new { inviteCode = "BBBBBBBB" });
            if (yanit.StatusCode == HttpStatusCode.TooManyRequests)
            {
                var govde = await yanit.Content.ReadAsStringAsync();
                govde.Should().Contain("error", "istemci sözleşmesi korunmalı");
                return;
            }
        }
        Assert.Fail("Hız sınırı hiç tetiklenmedi");
    }

    [Fact]
    [Trait("Category", "HizSiniri")]
    public async Task Farkli_kullanicilar_birbirinin_kotasini_tuketmez()
    {
        var clientA = _fabrika.CreateClient();
        var a = await AuthHelper.OgrenciOlarakGirisYapAsync(clientA);
        clientA.TokenIle(a.Token);

        // A kotasını doldur
        for (var i = 0; i < RateLimiting.HizSinirlari.DavetKoduDk + 3; i++)
            await clientA.PostAsJsonAsync("/api/groups/join", new { inviteCode = "CCCCCCCC" });

        // B hâlâ çalışabilmeli
        var clientB = _fabrika.CreateClient();
        var b = await AuthHelper.OgrenciOlarakGirisYapAsync(clientB);
        clientB.TokenIle(b.Token);

        var yanit = await clientB.PostAsJsonAsync("/api/groups/join", new { inviteCode = "DDDDDDDD" });
        yanit.StatusCode.Should().NotBe(HttpStatusCode.TooManyRequests,
            "sınır kullanıcı bazlı bölümlenmiş olmalı");
    }
}
```

### C) Guard script — `scripts/guard/07-hiz-siniri.sh`

```bash
#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
echo "[07] Kaynak tüketimi / hız sınırı"

# 1. Eski elle yazılmış sınırlayıcı kaldı mı?
cikti="$(kodda_ara 'IsRateLimitExceeded|_rateLimitWindow|TokenSecurityService' 'EnglishReadingPlatform/**/*.cs')"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "eski sınırlayıcı kullanımda" "$n" "$cikti"

# 2. UseRateLimiter kayıtlı mı?
n=0; grep -q "UseRateLimiter()" EnglishReadingPlatform/Program.cs || n=1
ihlal_bildir "UseRateLimiter kayıtlı" "$n" "Program.cs'te yok"

# 3. Middleware sırası: UseAuthentication → UseRateLimiter
n=0
auth=$(grep -n "UseAuthentication()" EnglishReadingPlatform/Program.cs | head -1 | cut -d: -f1)
rate=$(grep -n "UseRateLimiter()" EnglishReadingPlatform/Program.cs | head -1 | cut -d: -f1)
if [ -n "$auth" ] && [ -n "$rate" ]; then
  [ "$auth" -lt "$rate" ] || n=1
else n=1; fi
ihlal_bildir "UseRateLimiter, Authentication sonrası" "$n" \
  "sıra yanlış → tüm sınırlar IP bazına düşer"

# 4. Sınırsız HttpClient (timeout yok)
n=0
grep -q 'AddHttpClient("groq"' EnglishReadingPlatform/Program.cs || n=1
ihlal_bildir "groq HttpClient timeout'lu" "$n" "adlandırılmış client tanımlı değil"

# 5. 5 dakikalık timeout kaldı mı?
cikti="$(kodda_ara 'Timeout = TimeSpan\.FromMinutes\(' 'EnglishReadingPlatform/**/*.cs')"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "dakika ölçekli HTTP timeout" "$n" "$cikti"

# 6. Sözleşme testi duruyor mu?
n=0; [ -f "EnglishReadingPlatform.Tests/HizSiniriSozlesmesiTests.cs" ] || n=1
ihlal_bildir "hız sınırı sözleşme testi mevcut" "$n" "dosya silinmiş"

guard_bitir
```

---

## Bitti kriteri

```bash
cd /Users/alihanfindikci/Desktop/ingilizceproje
docker compose up -d postgres

# 1) Testler — BEKLENEN: Başarısız: 0, Başarılı: 7
dotnet test Linguza.sln --filter "Category=HizSiniri" --logger "console;verbosity=normal"
echo "çıkış kodu: $?"

# 2) Guard kapısı — BEKLENEN: TOPLAM İHLAL: 0
bash scripts/guard/07-hiz-siniri.sh; echo "çıkış kodu: $?"

# 3) Eski sınırlayıcı kalıntısı — BEKLENEN: 0
grep -rn "IsRateLimitExceeded\|TokenSecurityService" EnglishReadingPlatform/ --include=*.cs 2>/dev/null | grep -v obj/ | wc -l

# 4) Korumasız yazma ucu — BEKLENEN: 0  (sözleşme testi ölçüyor)
dotnet test Linguza.sln --filter "FullyQualifiedName~Her_yazma_ucu_hiz_sinirina_bagli_olmali" 2>&1 | grep -c "Başarılı!"

# 5) EnableRateLimiting sayısı — BEKLENEN: ≥ 18
grep -rn "EnableRateLimiting" EnglishReadingPlatform/Controllers/ | wc -l

# 6) Tüm kapılar
bash scripts/guard/run-all.sh; echo "çıkış kodu: $?"

# 7) Regresyon
dotnet test Linguza.sln
```

---

## Mutasyon kontrolü (zorunlu)

```bash
# MUTASYON A — groups/join korumasını kaldır (orijinal açık)
sed -i '' '/EnableRateLimiting(HizSinirlari.DavetKodu)/d' \
  EnglishReadingPlatform/Controllers/AppControllers.cs

dotnet test Linguza.sln --filter "Category=HizSiniri"
# BEKLENEN: Başarısız: ≥2
#   • Davet_kodu_kaba_kuvvete_karsi_korunur  → 429 hiç gelmedi (KIRMIZI)
#   • Her_yazma_ucu_hiz_sinirina_bagli_olmali → GroupsController.Join listelendi

git checkout EnglishReadingPlatform/Controllers/AppControllers.cs
dotnet test Linguza.sln --filter "Category=HizSiniri"     # BEKLENEN: Başarısız: 0
```

```bash
# MUTASYON B — middleware sırasını boz
python3 - <<'PY'
yol = "EnglishReadingPlatform/Program.cs"
k = open(yol, encoding="utf-8").read()
k = k.replace("app.UseAuthentication();\napp.UseRateLimiter();",
              "app.UseRateLimiter();\napp.UseAuthentication();")
open(yol, "w", encoding="utf-8").write(k)
PY

bash scripts/guard/07-hiz-siniri.sh; echo "çıkış kodu: $?"     # BEKLENEN: 1
dotnet test Linguza.sln --filter "FullyQualifiedName~Farkli_kullanicilar_birbirinin_kotasini_tuketmez"
# BEKLENEN: Başarısız: 1 — sınır IP bazına düştüğü için B de 429 alır

git checkout EnglishReadingPlatform/Program.cs
```

```bash
# MUTASYON C — TokenSecurityService'i geri getir
git show HEAD~1:EnglishReadingPlatform/Services/TokenSecurityService.cs \
  > EnglishReadingPlatform/Services/TokenSecurityService.cs 2>/dev/null || \
  echo "namespace EnglishReadingPlatform.Services { public class TokenSecurityService { } }" \
  > EnglishReadingPlatform/Services/TokenSecurityService.cs

dotnet test Linguza.sln --filter "FullyQualifiedName~Eski_elle_yazilmis_sinirlayici_kalmamali"
# BEKLENEN: Başarısız: 1
bash scripts/guard/07-hiz-siniri.sh; echo "çıkış kodu: $?"     # BEKLENEN: 1

rm -f EnglishReadingPlatform/Services/TokenSecurityService.cs
```

---

## Geçiş planı

| Adım | İş | Nokta | Doğrulama |
|---|---|---|---|
| 1 | `RateLimiting/HizSinirlari.cs` yaz | — | derlenir |
| 2 | `RateLimiting/HizSinirlamaKurulumu.cs` yaz | — | derlenir |
| 3 | `RateLimiting/HesapSayaci.cs` + `AgirIsKapisi.cs` yaz | — | derlenir |
| 4 | `Program.cs`: kayıt + `UseRateLimiter()` **doğru sırada** | 1 | guard kapı 2-3 yeşil |
| 5 | `HizSiniriSozlesmesiTests.cs` yaz — **merkezî çözüm önce** | — | ilk koşuda **kırmızı** (16 korumasız uç listelenir) |
| 6 | 18 uca `[EnableRateLimiting]` ekle | 16 yeni + 6 taşınan | sözleşme testi yeşile döner |
| 7 | 6 `IsRateLimitExceeded` çağrısını sil | 6 | derlenir |
| 8 | `TokenSecurityService.cs` dosyasını sil, DI kaydını ve 6 enjeksiyonu kaldır | 7 | derlenir |
| 9 | `AuthController`'a `HesapSayaci` ekle | 1 | derlenir |
| 10 | Adlandırılmış `HttpClient`'lar + `TranslationService`/`PdfService` uyarlaması | 3 | guard kapı 4-5 yeşil |
| 11 | `AgirIsKapisi`'nı analiz ve PDF yollarına bağla | 2 | derlenir |
| 12 | `HizSiniriTests.cs` yaz | — | 4 test yeşil |
| 13 | `scripts/guard/07-hiz-siniri.sh` + `chmod +x` | — | çıkış kodu 0 |
| 14 | **Frontend regresyon** (aşağı bak) | — | elle |
| 15 | İlerleme tablosunu güncelle | — | — |

> **Adım 5 neden 6'dan önce:** Sözleşme testi **önce kırmızı** olmalı ve 16 korumasız
> ucu listelemeli. Bu liste, adım 6'nın yapılacaklar listesidir. Pazarlıksız madde 1.

### Adım 14 — frontend regresyon kontrolü (elle)

| Akış | Risk | Beklenen |
|---|---|---|
| Kitap okurken hızlı sayfa çevirme | 🟠 `Okuma` 60/dk | Normal hızda sorun olmamalı |
| Okuyucuda arka arkaya 30 kelimeye tıklama | 🔴 `Ceviri` 100/dk | Çalışmalı |
| `useActivityTracker` 30 sn heartbeat | 🟠 `Yazma` 60/dk | Dakikada 2 istek — güvenli |
| Kelime listesine hızlı ekleme | 🟠 `Yazma` 60/dk | Çalışmalı |
| OCR sonrası analiz | 🔴 `AgirAnaliz` 20/dk | Çalışmalı |
| **429 aldığında arayüz ne yapıyor?** | 🔴 | `api.ts` `errorData.error` gösteriyor ✅ |

> ⚠️ **Sayı kalibrasyonu:** Yukarıdaki limitler mevcut değerlerden türetildi. Gerçek
> kullanımda dar geliyorsa `HizSinirlari` sabitleri **tek yerden** artırılır — bu,
> merkezî çözümün faydasıdır.

---

## Tuzaklar

| Tuzak | Neden olur | Nasıl kaçınılır |
|---|---|---|
| **`UseRateLimiter()`'ı `UseAuthentication()`'dan önce koymak** | `ctx.User` boş olur, tüm sınırlar IP bazına düşer; NAT arkasındaki bir okul/şirket tek IP'den girdiği için **tüm öğrenciler birbirinin kotasını tüketir** | Guard kapı 3 sırayı zorluyor; `Farkli_kullanicilar...` testi davranışı doğruluyor |
| **`GlobalLimiter` sınırını dar tutmak** | 300/dk taban sınır NAT arkasında bir okulu keser | Taban sınır **cömert**, asıl koruma politika bazlı |
| **`QueueLimit > 0` vermek** | Kuyruk, reddedilmesi gereken istekleri bellekte tutar — korunmak istenen şeyin ta kendisi | Hepsinde `QueueLimit = 0` |
| **`SlidingWindow` yerine `FixedWindow` seçmeyi sorgulamamak** | `FixedWindow` pencere sınırında 2× patlamaya izin verir (dakika sonu + başı) | Bu proje için kabul edilebilir; kritikse `SlidingWindow` kullan — API aynı |
| **Hesap bazlı sayacı middleware'e taşımaya çalışmak** | E-posta istek **gövdesinde**; middleware gövdeyi okursa akış tüketilir ve controller boş gövde görür | `HesapSayaci` bilinçli olarak controller içinde |
| **`AgirIsKapisi`'nda uzun süre beklemek** | `WaitAsync(TimeSpan.FromMinutes(5))` yapılırsa istekler birikir, thread tükenir | 2 saniye bekle, sonra **503 ile reddet** |
| **Timeout'u `HttpClient` yerine `CancellationToken` ile vermeyi unutmak** | `HttpClient.Timeout` yalnızca yanıt başlıklarını kapsar; gövde akışı sonsuz sürebilir | Uzun yanıtlar için `CancellationTokenSource` da kullan |
| **`TokenSecurityService`'i silerken KURAL-04'ü bozmak** | Sınıf hâlâ `ITokenIptalDeposu` sanılıp enjekte edilebilir | KURAL-04 zaten ayırdı; `Eski_elle_yazilmis_sinirlayici_kalmamali` testi kalıntıyı yakalar |
| **429'u test etmek için gerçek zamanı beklemek** | Testler yavaşlar, kırılgan olur | Testler pencereyi **doldurarak** tetikliyor, beklemiyor |
| **Sınırları üretimde ölçmeden sıkmak** | Meşru kullanıcılar kesilir, destek yükü artar | Sabitler tek dosyada; üretimde log'dan 429 oranı izlenip ayarlanır |

---

## Teslim şablonu

```markdown
## 1. Kanıtlanarak kapandı
<7 bitti-kriteri komutunun ham çıktısı>
<Adım 5'te sözleşme testinin İLK koşusunun ham çıktısı — 16 korumasız ucu listeleyen KIRMIZI>
<MUTASYON A, B, C çıktıları>

## 2. Kapanmadı
- Hız sınırı durumu süreç belleğinde (yerleşik limiter dağıtık değil)
  → Çoklu replikada her instance kendi sayacını tutar; kullanıcı N× limit alır
  → Redis tabanlı dağıtık limiter gerekir (KURAL-04 ile aynı karar)
- Limit değerleri gerçek trafikle kalibre edilmedi

## 3. İnsan müdahalesi gerekiyor
- [ ] Frontend regresyon kontrolü (geçiş planı adım 14) — 6 akışı elle dene
- [ ] Okul/kurum NAT'ı arkasından kullanım olacak mı? Olacaksa GlobalLimiter tabanı gözden geçirilmeli
- [ ] Redis kararı (00-BASLA-BURADAN.md madde 10) — bu kuralı da etkiliyor

## Değiştirilen dosyalar
<git diff --stat>

## Commit
<git log -1 --format='%H %s'>
```
