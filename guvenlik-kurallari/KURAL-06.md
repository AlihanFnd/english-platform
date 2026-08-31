# KURAL-06 — Hata ve log hijyeni

> **Ön koşul:** KURAL-01 ve KURAL-05 tamamlanmış olmalı.

---

## Kural metni

> **İstisna metni asla istemciye ulaşmayacak; log asla PII taşımayacak.**
> Tüm yakalanmamış istisnalar tek bir merkezî middleware'de yakalanacak, kullanıcıya
> genel bir mesaj + izlenebilir bir **olay kimliği** dönecek, ayrıntı yalnızca sunucu
> loguna yazılacak. Loglama `Console.WriteLine` ile değil `ILogger<T>` ile yapılacak.
> Kullanıcı içeriği (kelime, cümle, e-posta, token) loga **düz olarak** yazılmayacak.
> Bir işlem başarısız olduysa yanıt bunu **açıkça** söyleyecek — sessizce özgün veriyi
> geri döndürmeyecek.

---

## Envanter

Ölçüm tarihi: **2026-08-20**, commit `d2cfc0f`.

### İhlal 1 — İstisna metni yanıtta: 4 nokta

```
$ grep -rn "ex\.Message\|ex\.ToString()" EnglishReadingPlatform/Controllers/
AppControllers.cs:343:   catch (Exception ex) { return StatusCode(500, new { error = "Çeviri hatası: " + ex.Message }); }
AdminController.cs:183:  return BadRequest(new { error = ex.Message });
AdminController.cs:187:  return StatusCode(500, new { error = "Dosya işlenirken hata oluştu: " + ex.Message });
AdminController.cs:298:  return BadRequest(new { error = $"{pageNum}. sayfa okunurken hata oluştu: {ex.Message}" });
```

`AppControllers.cs:343` en tehlikelisi: Groq/Google HTTP hatası oluşursa
`TranslationService` `$"HTTP {response.StatusCode} from Groq: {errContent}"` fırlatıyor
ve **API yanıt gövdesi** istemciye gidiyor.

> `AdminController.cs:183` bir istisnadır: `InvalidOperationException` mesajları
> `PdfService`'te **kasten kullanıcıya yönelik** yazılmış ("Sadece PDF veya DOCX
> dosyaları yüklenebilir."). Bu, tipli bir alan hatasına dönüştürülecek.

### İhlal 2 — Yapılandırılmamış loglama: 14 nokta, 0 `ILogger`

```
$ grep -rn "Console.WriteLine" EnglishReadingPlatform/Controllers/ EnglishReadingPlatform/Services/ | wc -l
      14

$ grep -rc "Console.WriteLine" EnglishReadingPlatform/Controllers/*.cs EnglishReadingPlatform/Services/*.cs | grep -v ':0'
EnglishReadingPlatform/Controllers/AdminController.cs:3
EnglishReadingPlatform/Services/PdfService.cs:2
EnglishReadingPlatform/Services/TranslationService.cs:9

$ grep -rn "ILogger" EnglishReadingPlatform/Controllers EnglishReadingPlatform/Services
HİÇ YOK
```

Sonuç: log seviyesi yok, filtrelenemiyor, yapılandırılamıyor, üretimde toplanamıyor.
`appsettings.json` içindeki `Logging:LogLevel` ayarı bu satırların hiçbirini etkilemiyor.

### İhlal 3 — Log'a düşen kullanıcı içeriği: 2 nokta

```
TranslationService.cs:129:  Console.WriteLine($"[Translation Cache HIT] Word: {clean}");
AppControllers.cs:292:      Details = $"Word: {clean}",     // ← veritabanına da yazılıyor
```

Kullanıcının **hangi kelimeleri bilmediği** hem loga hem `UserActivityLogs` tablosuna
düşüyor. Bu bir öğrenme profilidir ve kişisel veridir.

### İhlal 4 — Sessiz başarısızlık: 3 nokta

| Yer | Davranış |
|---|---|
| `TranslationService.cs:88` (`TranslateSentenceAsync`) | `catch { return text; }` — çeviri başarısızsa **İngilizce metni Türkçe çevirisiymiş gibi** döner |
| `TranslationService.cs:161` | Önbellek okuma hatası yutuluyor, sadece Console'a yazılıyor |
| `TranslationService.cs:254` | Önbellek **yazma** hatası yutuluyor — kota harcanıyor ama sonuç kaydedilmiyor |

`docs/07-GUVENLIK.md` #15 ve `docs/04-BACKEND.md` § 5.6 bu davranışı belgeliyor.

### İhlal 5 — Bağlantı dizesinde `Include Error Detail=true`

```
$ grep -n "Include Error Detail" EnglishReadingPlatform/appsettings.json
3:    "Default": "Host=localhost;...;Include Error Detail=true"
```

Npgsql istisnalarına tablo/kolon adlarını ekler. KURAL-02'nin `SirDogrulayici`'sı bunu
üretimde zaten reddediyor; bu kural yanıt tarafını kapatıyor.

### Özet

| # | İhlal | Nokta |
|---|---|---|
| 1 | İstisna metni yanıtta | 4 |
| 2 | `Console.WriteLine` | 14 |
| 3 | Log/DB'ye PII | 2 |
| 4 | Sessiz başarısızlık | 3 |
| 5 | `Include Error Detail` | 1 |
| | **TOPLAM** | **24** |

---

## Merkezî uygulama

### 1. Genel istisna middleware'i — `Middleware/HataYakalamaMiddleware.cs`

```csharp
using System.Text.Json;

namespace EnglishReadingPlatform.Middleware;

/// <summary>
/// KURAL-06: Tüm yakalanmamış istisnaları tek noktada yakalar.
/// İstemciye: genel mesaj + olay kimliği.  Loga: tam ayrıntı + aynı olay kimliği.
/// Böylece kullanıcı "olay kimliği ABC123" der, geliştirici logda o kaydı bulur.
/// </summary>
public class HataYakalamaMiddleware
{
    private readonly RequestDelegate _sonraki;
    private readonly ILogger<HataYakalamaMiddleware> _logger;
    private readonly IHostEnvironment _ortam;

    public HataYakalamaMiddleware(RequestDelegate sonraki,
                                  ILogger<HataYakalamaMiddleware> logger,
                                  IHostEnvironment ortam)
    {
        _sonraki = sonraki; _logger = logger; _ortam = ortam;
    }

    public async Task InvokeAsync(HttpContext ctx)
    {
        try
        {
            await _sonraki(ctx);
        }
        catch (Exception ex)
        {
            var olayKimligi = Guid.NewGuid().ToString("N")[..8].ToUpperInvariant();

            _logger.LogError(ex,
                "İşlenmemiş istisna. OlayKimligi={OlayKimligi} Yol={Yol} Metot={Metot} KullaniciId={KullaniciId}",
                olayKimligi,
                ctx.Request.Path,
                ctx.Request.Method,
                ctx.User?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? "-");

            if (ctx.Response.HasStarted)
            {
                _logger.LogWarning("Yanıt zaten başlamış, hata gövdesi yazılamadı. OlayKimligi={OlayKimligi}", olayKimligi);
                return;
            }

            ctx.Response.Clear();
            ctx.Response.StatusCode = StatusCodes.Status500InternalServerError;
            ctx.Response.ContentType = "application/json; charset=utf-8";

            // KURAL-06: istisna metni ASLA gövdeye girmez — Development'ta bile.
            // Geliştirici logdan okur; böylece "geliştirmede açık, üretimde kapalı"
            // ayrımının yanlış yapılandırılma riski ortadan kalkar.
            var govde = new
            {
                error = "Beklenmeyen bir hata oluştu. Sorun sürerse bu kodu iletin: " + olayKimligi,
                olayKimligi
            };

            await ctx.Response.WriteAsync(JsonSerializer.Serialize(govde));
        }
    }
}

public static class HataYakalamaMiddlewareUzantilari
{
    public static IApplicationBuilder HataYakalamayiKullan(this IApplicationBuilder app)
        => app.UseMiddleware<HataYakalamaMiddleware>();
}
```

`Program.cs` — **middleware zincirinin en başına**:

```csharp
var app = builder.Build();

app.HataYakalamayiKullan();      // ← KURAL-06: en başta, her şeyi kapsar
app.UseStaticFiles();
app.UseRouting();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
```

### 2. Alan (domain) hataları için tipli istisna — `Exceptions/KullaniciHatasi.cs`

Kullanıcıya **gösterilmesi gereken** mesajlarla, gösterilmemesi gerekenleri ayırır.

```csharp
namespace EnglishReadingPlatform.Exceptions;

/// <summary>
/// KURAL-06: Mesajı kullanıcıya GÖSTERİLEBİLİR olan hata.
/// İçinde iç detay (dosya yolu, sınıf adı, sorgu) bulunmayacağı GARANTİ EDİLİR —
/// bu istisnayı fırlatan kod bundan sorumludur.
/// </summary>
public class KullaniciHatasi : Exception
{
    public int DurumKodu { get; }

    public KullaniciHatasi(string kullaniciMesaji, int durumKodu = 400)
        : base(kullaniciMesaji) => DurumKodu = durumKodu;
}
```

Middleware'e ekle (`catch (Exception ex)` bloğundan **önce**):

```csharp
catch (KullaniciHatasi kh)
{
    _logger.LogInformation("Kullanıcı hatası: {Mesaj} Yol={Yol}", kh.Message, ctx.Request.Path);
    ctx.Response.Clear();
    ctx.Response.StatusCode = kh.DurumKodu;
    ctx.Response.ContentType = "application/json; charset=utf-8";
    await ctx.Response.WriteAsync(JsonSerializer.Serialize(new { error = kh.Message }));
}
```

### 3. PII güvenli loglama — `Logging/GuvenliLog.cs`

```csharp
namespace EnglishReadingPlatform.Logging;

/// <summary>KURAL-06: Loga yazılmadan önce kullanıcı içeriğini maskeler.</summary>
public static class GuvenliLog
{
    /// <summary>E-postayı maskeler: ali@ornek.com → a**@o****.com</summary>
    public static string Eposta(string? eposta)
    {
        if (string.IsNullOrWhiteSpace(eposta)) return "-";
        var parcalar = eposta.Split('@');
        if (parcalar.Length != 2) return "***";
        return $"{parcalar[0][..1]}**@{Kisalt(parcalar[1])}";
    }

    /// <summary>
    /// Serbest kullanıcı metnini (kelime, cümle, arama) loga yazılabilir hale getirir:
    /// içeriği DEĞİL, yalnızca uzunluğunu ve deterministik bir kısa hash'ini verir.
    /// Böylece "aynı kelime tekrar mı geldi" sorusu yanıtlanabilir ama içerik sızmaz.
    /// </summary>
    public static string KullaniciMetni(string? metin)
    {
        if (string.IsNullOrEmpty(metin)) return "boş";
        var hash = System.Security.Cryptography.SHA256.HashData(
            System.Text.Encoding.UTF8.GetBytes(metin));
        return $"len={metin.Length}, h={Convert.ToHexString(hash)[..8]}";
    }

    private static string Kisalt(string s) =>
        s.Length <= 2 ? "**" : s[..1] + new string('*', Math.Min(s.Length - 2, 4)) + s[^1..];
}
```

### 4. `Console.WriteLine` → `ILogger` — 14 nokta

`TranslationService` ve `PdfService` yapıcılarına logger enjekte edilir:

```csharp
public class TranslationService
{
    private readonly ILogger<TranslationService> _logger;

    public TranslationService(IHttpClientFactory httpFactory, IConfiguration configuration,
                              AppDbContext db, ILogger<TranslationService> logger)
    {
        ...
        _logger = logger;
    }
```

Dönüşüm tablosu:

| Eski | Yeni |
|---|---|
| `Console.WriteLine($"[Translation Cache HIT] Word: {clean}")` | `_logger.LogDebug("Çeviri önbelleği isabet. Kelime={Kelime}", GuvenliLog.KullaniciMetni(clean))` |
| `Console.WriteLine($"[Translation Cache Read Error]: {ex.Message}")` | `_logger.LogWarning(ex, "Çeviri önbelleği okunamadı.")` |
| `Console.WriteLine($"[Translation Cache Write Error]: {ex.Message}")` | `_logger.LogWarning(ex, "Çeviri önbelleğine yazılamadı — kota harcandı ama sonuç kaydedilmedi.")` |
| `Console.WriteLine($"[Groq Token Usage ...] Prompt: ...")` | `_logger.LogInformation("Groq token kullanımı. Islem={Islem} Girdi={Girdi} Cikti={Cikti} Toplam={Toplam}", ...)` |
| `Console.WriteLine($"[Groq API Error, falling back...]: {ex.Message}")` | `_logger.LogWarning(ex, "Groq çağrısı başarısız, Google Translate'e düşülüyor.")` |
| `Console.WriteLine("[Groq API Key missing] ...")` | `_logger.LogWarning("Groq API anahtarı tanımlı değil, yedek çeviri yolu kullanılıyor.")` |
| `Console.WriteLine($"[PDF UPLOAD ERROR] Sayfa {n}: {ex.ToString()}")` | `_logger.LogError(ex, "PDF sayfası okunamadı. Sayfa={Sayfa}", pageNum)` |
| `Console.WriteLine($"[PDF UPLOAD WARNING] Sayfa {n} bos")` | `_logger.LogInformation("PDF sayfasından metin çıkarılamadı. Sayfa={Sayfa}", pageNum)` |
| `Console.WriteLine($"[Groq Chapter Split Error...]")` | `_logger.LogWarning(ex, "Bölüm ayırma başarısız, regex yedeğine düşülüyor.")` |

> **Yapılandırılmış loglama:** `{Kelime}` gibi adlandırılmış yer tutucular kullanılır,
> string interpolasyon (`$"..."`) **kullanılmaz**. Aksi halde log toplayıcılar alanları
> ayrıştıramaz.

### 5. Sessiz başarısızlıkları görünür kıl — `TranslationService`

```csharp
public class CeviriSonucu
{
    public string Metin { get; init; } = "";
    public bool Basarili { get; init; }
    public string Kaynak { get; init; } = "";   // "groq" | "google" | "onbellek" | "yok"
}

public async Task<CeviriSonucu> TranslateSentenceAsync(string text)
{
    if (string.IsNullOrWhiteSpace(text))
        return new CeviriSonucu { Metin = text, Basarili = true, Kaynak = "yok" };

    try
    {
        ... mevcut Google çağrısı ...
        if (!res.IsSuccessStatusCode)
        {
            _logger.LogWarning("Google Translate {Durum} döndürdü.", res.StatusCode);
            // KURAL-06: sessizce özgün metni "çeviri" diye dönme — durumu bildir.
            return new CeviriSonucu { Metin = text, Basarili = false, Kaynak = "google" };
        }
        var cevrilmis = ParseSentence(json);
        return cevrilmis is null
            ? new CeviriSonucu { Metin = text, Basarili = false, Kaynak = "google" }
            : new CeviriSonucu { Metin = cevrilmis, Basarili = true, Kaynak = "google" };
    }
    catch (Exception ex)
    {
        _logger.LogWarning(ex, "Cümle çevirisi başarısız.");
        return new CeviriSonucu { Metin = text, Basarili = false, Kaynak = "google" };
    }
}
```

`AnalyzedSentence`'a bir alan eklenir:

```csharp
[JsonPropertyName("ceviriBasarili")]
public bool CeviriBasarili { get; set; } = true;
```

Böylece frontend "bu satır çevrilemedi" göstergesi koyabilir.

> ⚠️ **Kapsam notu:** Frontend'in bu bayrağı göstermesi bu kuralın kapsamı **dışındadır**;
> ancak alan eklenmezse sorun hiç görünür olmaz. Alan eklenir, arayüz değişikliği
> teknik borç olarak raporlanır.

### 6. `Include Error Detail` yalnızca Development

`appsettings.json` → `"Default": ""` (KURAL-02'de zaten boşaltıldı).
`.env` içindeki geliştirme bağlantı dizesine eklenebilir; üretim dizesine **eklenmez**.
`SirDogrulayici` (KURAL-02) üretimde bunu zaten reddediyor.

### 7. `Details` alanından PII'yi çıkar — `TranslateController`

```csharp
// ESKİ:  Details = $"Word: {clean}",
// YENİ:
Details = "ai_kelime_cevirisi",     // kelime içeriği YAZILMAZ
```

> ⚠️ Bu, kota sayacını **bozmaz** — sayaç `ActivityType == "ai_word_translation"`
> filtresiyle çalışıyor, `Details` kullanılmıyor (`AppControllers.cs:284-288`).
> Doğrulaması geçiş planı adım 7'de.

---

## Otomatik kapı

### A) Guard script — `scripts/guard/06-hata-log.sh`

```bash
#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
echo "[06] Hata ve log hijyeni"

# 1. İstisna metni yanıtta
cikti="$(kodda_ara 'error = .*ex\.Message|error = .*ex\.ToString|\+ ex\.Message' 'EnglishReadingPlatform/Controllers/*.cs')"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "istisna metni yanıtta" "$n" "$cikti"

# 2. Console.WriteLine
cikti="$(kodda_ara 'Console\.(WriteLine|Write|Error)' 'EnglishReadingPlatform/Controllers/*.cs' 'EnglishReadingPlatform/Services/*.cs' 'EnglishReadingPlatform/Program.cs')"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "Console.WriteLine kullanımı" "$n" "$cikti"

# 3. Hata middleware'i kayıtlı mı ve EN BAŞTA mı?
n=0; grep -q "HataYakalamayiKullan" EnglishReadingPlatform/Program.cs || n=1
ihlal_bildir "hata middleware'i kayıtlı" "$n" "Program.cs'te HataYakalamayiKullan() yok"

n=0
if grep -q "HataYakalamayiKullan" EnglishReadingPlatform/Program.cs; then
  hata_satir=$(grep -n "HataYakalamayiKullan" EnglishReadingPlatform/Program.cs | head -1 | cut -d: -f1)
  routing_satir=$(grep -n "UseRouting()" EnglishReadingPlatform/Program.cs | head -1 | cut -d: -f1)
  [ -n "$routing_satir" ] && [ "$hata_satir" -lt "$routing_satir" ] || n=1
fi
ihlal_bildir "hata middleware'i zincirin başında" "$n" "UseRouting'den sonra geliyor"

# 4. Log'a düz kullanıcı metni yazılıyor mu?
cikti="$(kodda_ara 'Log(Debug|Information|Warning|Error).*\{Kelime\}.*, *clean\)|Details = \$"Word:' 'EnglishReadingPlatform/**/*.cs')"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "log'a düz kullanıcı metni" "$n" "$cikti"

# 5. String interpolasyonlu log (yapılandırılmamış)
cikti="$(kodda_ara '_logger\.Log[A-Za-z]+\(\$"' 'EnglishReadingPlatform/**/*.cs')"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "interpolasyonlu log çağrısı" "$n" "$cikti"

# 6. Include Error Detail üretim yapılandırmasında
cikti="$(grep -n 'Include Error Detail=true' EnglishReadingPlatform/appsettings.json 2>/dev/null || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "appsettings'te Include Error Detail" "$n" "$cikti"

guard_bitir
```

### B) Uçtan uca testler — `HataHijyeniTests.cs`

```csharp
using System.Net;
using System.Net.Http.Json;
using EnglishReadingPlatform.Tests.Infrastructure;
using FluentAssertions;
using Xunit;

namespace EnglishReadingPlatform.Tests;

[Collection("api")]
public class HataHijyeniTests
{
    private readonly TestAppFactory _fabrika;
    public HataHijyeniTests(TestAppFactory fabrika) => _fabrika = fabrika;

    /// <summary>İç detay sızıntısını gösteren tipik parmak izleri.</summary>
    private static readonly string[] SizintiIsaretleri =
    {
        "Exception", "   at ", "System.", "Npgsql", "EnglishReadingPlatform.Services",
        ".cs:line", "StackTrace", "InnerException", "Microsoft.EntityFrameworkCore",
        "SELECT", "relation \"", "column \""
    };

    [Fact]
    [Trait("Category", "HataHijyeni")]
    public async Task Hata_yaniti_ic_detay_sizdirmaz()
    {
        var client = _fabrika.CreateClient();
        var admin = await AuthHelper.AdminOlarakGirisYapAsync(client);
        client.TokenIle(admin.Token);

        // Geçersiz dosya yükleyerek PdfService'i hata vermeye zorla
        using var icerik = new MultipartFormDataContent
        {
            { new StringContent("Test Kitap"), "title" },
            { new ByteArrayContent(new byte[] { 0x00, 0x01, 0x02, 0x03 }), "file", "bozuk.pdf" },
            { new StringContent("1"), "selectedPages" }
        };

        var yanit = await client.PostAsync("/api/admin/books/upload-pages", icerik);
        var govde = await yanit.Content.ReadAsStringAsync();

        foreach (var isaret in SizintiIsaretleri)
            govde.Should().NotContain(isaret,
                $"hata yanıtı '{isaret}' içermemeli — iç yapı sızıyor. Gövde: {govde}");
    }

    [Fact]
    [Trait("Category", "HataHijyeni")]
    public async Task Beklenmeyen_hata_olay_kimligi_dondurur()
    {
        // Not: Bu test, hata middleware'inin devrede olduğunu doğrular.
        // Kasıtlı hata için test-only bir uç kullanılmaz; bunun yerine
        // middleware birim testiyle doğrulanır (aşağıdaki HataMiddlewareTests).
        var client = _fabrika.CreateClient();
        var yanit = await client.GetAsync("/api/books/99999999/read?page=1");

        // 401 (tokensiz) beklenir; asıl kontrol: gövde stack trace içermemeli
        var govde = await yanit.Content.ReadAsStringAsync();
        govde.Should().NotContain("   at ");
    }

    [Fact]
    [Trait("Category", "HataHijyeni")]
    public async Task Dogrulama_hatasi_kullaniciya_anlamli_mesaj_verir()
    {
        // KURAL-05 ile birlikte: 400'ler ANLAMLI mesaj taşımalı,
        // 500'ler ise GENEL mesaj + olay kimliği.
        var client = _fabrika.CreateClient();
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(o.Token);

        var yanit = await client.PostAsJsonAsync("/api/books/addword",
            new { word = "", translation = "", context = "" });

        var govde = await yanit.Content.ReadAsStringAsync();
        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        govde.Should().Contain("error");
        govde.Should().NotContain("Exception");
    }
}
```

### C) Middleware birim testi — `HataMiddlewareTests.cs`

```csharp
using System.Net;
using EnglishReadingPlatform.Exceptions;
using EnglishReadingPlatform.Middleware;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace EnglishReadingPlatform.Tests;

public class HataMiddlewareTests
{
    private sealed class SahteOrtam : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Production";
        public string ApplicationName { get; set; } = "Test";
        public string ContentRootPath { get; set; } = ".";
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } = null!;
    }

    private static async Task<(int Durum, string Govde)> CalistirAsync(
        Exception firlatilan, string ortam = "Production")
    {
        var ctx = new DefaultHttpContext();
        ctx.Response.Body = new MemoryStream();
        ctx.Request.Path = "/api/test";

        var mw = new HataYakalamaMiddleware(
            _ => throw firlatilan,
            NullLogger<HataYakalamaMiddleware>.Instance,
            new SahteOrtam { EnvironmentName = ortam });

        await mw.InvokeAsync(ctx);

        ctx.Response.Body.Seek(0, SeekOrigin.Begin);
        var govde = await new StreamReader(ctx.Response.Body).ReadToEndAsync();
        return (ctx.Response.StatusCode, govde);
    }

    [Fact]
    [Trait("Category", "HataHijyeni")]
    public async Task Beklenmeyen_istisna_500_ve_olay_kimligi_uretir()
    {
        var (durum, govde) = await CalistirAsync(
            new InvalidOperationException("veritabanı bağlantısı reddedildi: host=10.0.0.5"));

        durum.Should().Be(500);
        govde.Should().Contain("olayKimligi");
        govde.Should().NotContain("10.0.0.5", "iç ayrıntı istemciye gitmemeli");
        govde.Should().NotContain("InvalidOperationException");
    }

    [Fact]
    [Trait("Category", "HataHijyeni")]
    public async Task Development_ortaminda_da_istisna_metni_sizmaz()
    {
        // Bilinçli tercih: ortam ayrımına güvenmiyoruz.
        var (_, govde) = await CalistirAsync(
            new Exception("GİZLİ_AYRINTI_XYZ"), ortam: "Development");

        govde.Should().NotContain("GİZLİ_AYRINTI_XYZ");
    }

    [Fact]
    [Trait("Category", "HataHijyeni")]
    public async Task KullaniciHatasi_mesaji_aynen_iletilir()
    {
        var (durum, govde) = await CalistirAsync(
            new KullaniciHatasi("Sadece PDF veya DOCX dosyaları yüklenebilir.", 400));

        durum.Should().Be(400);
        govde.Should().Contain("Sadece PDF veya DOCX");
        govde.Should().NotContain("olayKimligi", "kullanıcı hatası izlenebilirlik kodu gerektirmez");
    }
}
```

---

## Bitti kriteri

```bash
cd /Users/alihanfindikci/Desktop/ingilizceproje
docker compose up -d postgres

# 1) Testler — BEKLENEN: Başarısız: 0, Başarılı: 6
dotnet test Linguza.sln --filter "Category=HataHijyeni" --logger "console;verbosity=normal"
echo "çıkış kodu: $?"

# 2) Guard kapısı — BEKLENEN: TOPLAM İHLAL: 0
bash scripts/guard/06-hata-log.sh; echo "çıkış kodu: $?"

# 3) İstisna metni yanıtta — BEKLENEN: 0
grep -rn "error = .*ex\.Message\|+ ex\.Message" EnglishReadingPlatform/Controllers/ | wc -l

# 4) Console.WriteLine — BEKLENEN: 0
grep -rn "Console.WriteLine" EnglishReadingPlatform/Controllers EnglishReadingPlatform/Services EnglishReadingPlatform/Program.cs | wc -l

# 5) ILogger kullanımı — BEKLENEN: ≥ 3 (0 değil)
grep -rl "ILogger" EnglishReadingPlatform/Controllers EnglishReadingPlatform/Services | wc -l

# 6) Log'da düz kelime — BEKLENEN: 0
grep -rn 'Details = \$"Word:' EnglishReadingPlatform/ | wc -l

# 7) Tüm kapılar
bash scripts/guard/run-all.sh; echo "çıkış kodu: $?"

# 8) Regresyon
dotnet test Linguza.sln
```

---

## Mutasyon kontrolü (zorunlu)

```bash
# MUTASYON A — istisna metnini yanıta geri koy
cp EnglishReadingPlatform/Middleware/HataYakalamaMiddleware.cs /tmp/mw.orig.cs
python3 - <<'PY'
yol = "EnglishReadingPlatform/Middleware/HataYakalamaMiddleware.cs"
k = open(yol, encoding="utf-8").read()
k = k.replace('error = "Beklenmeyen bir hata oluştu. Sorun sürerse bu kodu iletin: " + olayKimligi',
              'error = ex.ToString()   // MUTASYON')
open(yol, "w", encoding="utf-8").write(k)
PY

dotnet test Linguza.sln --filter "Category=HataHijyeni"
# BEKLENEN: Başarısız: ≥2
#   • Beklenmeyen_istisna_500_ve_olay_kimligi_uretir → "10.0.0.5" bulundu
#   • Development_ortaminda_da_istisna_metni_sizmaz  → "GİZLİ_AYRINTI_XYZ" bulundu

cp /tmp/mw.orig.cs EnglishReadingPlatform/Middleware/HataYakalamaMiddleware.cs
dotnet test Linguza.sln --filter "Category=HataHijyeni"     # BEKLENEN: Başarısız: 0
```

```bash
# MUTASYON B — bir Console.WriteLine geri koy, guard kırmızı olmalı
echo '        // mutasyon' >> /dev/null
python3 - <<'PY'
yol = "EnglishReadingPlatform/Services/TranslationService.cs"
k = open(yol, encoding="utf-8").read()
k = k.replace("public List<string> SplitSentences(string text)",
              'public List<string> SplitSentences(string text)\n        {\n            Console.WriteLine("MUTASYON");\n            return SplitSentencesIc(text);\n        }\n        private List<string> SplitSentencesIc(string text)', 1)
open(yol, "w", encoding="utf-8").write(k)
PY

bash scripts/guard/06-hata-log.sh; echo "çıkış kodu: $?"   # BEKLENEN: 1
git checkout EnglishReadingPlatform/Services/TranslationService.cs
bash scripts/guard/06-hata-log.sh; echo "çıkış kodu: $?"   # BEKLENEN: 0
```

```bash
# MUTASYON C — middleware'i zincirin sonuna al
python3 - <<'PY'
yol = "EnglishReadingPlatform/Program.cs"
k = open(yol, encoding="utf-8").read()
k = k.replace("app.HataYakalamayiKullan();\napp.UseStaticFiles();",
              "app.UseStaticFiles();")
k = k.replace("app.MapControllers();", "app.HataYakalamayiKullan();  // MUTASYON\napp.MapControllers();")
open(yol, "w", encoding="utf-8").write(k)
PY

bash scripts/guard/06-hata-log.sh; echo "çıkış kodu: $?"   # BEKLENEN: 1 ("zincirin başında" ihlali)
git checkout EnglishReadingPlatform/Program.cs
```

---

## Geçiş planı

| Adım | İş | Nokta | Doğrulama |
|---|---|---|---|
| 1 | `Exceptions/KullaniciHatasi.cs` yaz | — | derlenir |
| 2 | `Middleware/HataYakalamaMiddleware.cs` yaz | — | derlenir |
| 3 | `Logging/GuvenliLog.cs` yaz | — | derlenir |
| 4 | `HataMiddlewareTests.cs` yaz — **merkezî çözüm önce kanıtlanır** | — | 3 test yeşil |
| 5 | `Program.cs` → middleware'i **en başa** ekle | — | guard kapı 3-4 yeşil |
| 6 | 4 controller `ex.Message` noktasını temizle; `PdfService` `InvalidOperationException`'larını `KullaniciHatasi`'na çevir | 4 | guard kapı 1 → 0 |
| 7 | 14 `Console.WriteLine`'ı `ILogger`'a taşı (3 dosya) | 14 | guard kapı 2 → 0 |
| 8 | `Details = $"Word: {clean}"` → sabit metin; **kota sayacının bozulmadığını doğrula** | 1 | aşağı bak |
| 9 | `TranslateSentenceAsync` → `CeviriSonucu` döndür, çağıranları uyarla | 3 | derlenir |
| 10 | `HataHijyeniTests.cs` yaz | — | 3 test yeşil |
| 11 | `scripts/guard/06-hata-log.sh` + `chmod +x` | — | çıkış kodu 0 |
| 12 | İlerleme tablosunu güncelle | — | — |

### Adım 8 doğrulaması — kota sayacı bozulmasın

`Details` alanı değiştiği için kota sorgusunun **hâlâ `ActivityType`'a baktığını** doğrula:

```bash
grep -A6 'aiCount = await _db.UserActivityLogs.CountAsync' EnglishReadingPlatform/Controllers/AppControllers.cs
```

Çıktıda `log.ActivityType == "ai_word_translation"` görünmeli, `log.Details` **görünmemeli**.
Görünüyorsa `Details` değiştirilemez — önce sorgu düzeltilir.

### Adım 9 uyarısı — imza değişikliği

`TranslateSentenceAsync` dönüş tipi değişiyor. Çağıranlar:

```bash
grep -rn "TranslateSentenceAsync" EnglishReadingPlatform/
```

Beklenen 3 nokta: `TranslateController.Sentence`, `AnalyzeTextAsync` fallback yolu,
ve test. Hepsi `.Metin` alanını okuyacak şekilde uyarlanır.

---

## Tuzaklar

| Tuzak | Neden olur | Nasıl kaçınılır |
|---|---|---|
| **`UseExceptionHandler` ile karıştırmak** | ASP.NET Core'un yerleşik `UseExceptionHandler`'ı yeniden yürütme (re-execute) yapar; `ProblemDetails` biçimi döner ve `{ error }` sözleşmesini bozar | Özel middleware kullanılıyor |
| **Middleware'i `UseRouting`'den sonra koymak** | Routing öncesi oluşan istisnalar (model binding, CORS) yakalanmaz | Guard kapı 4 sırayı kontrol ediyor |
| **`ctx.Response.HasStarted` kontrolünü atlamak** | Yanıt yazılmaya başlandıysa `StatusCode` atamak istisna fırlatır → istisna içinde istisna | Middleware'de kontrol var |
| **Development'ta stack trace göstermek** | "Sadece geliştirmede açık" varsayımı yanlış yapılandırmayla üretime sızar | Bilinçli tercih: **her ortamda** kapalı, geliştirici logdan okur |
| **`LogError(ex.Message)` yazmak** | İstisna nesnesi yerine mesaj geçilirse stack trace **loga da** düşmez, hata ayıklanamaz | `_logger.LogError(ex, "mesaj {Alan}", deger)` — istisna **ilk parametre** |
| **String interpolasyonlu log** | `_logger.LogInformation($"Kelime: {k}")` yapılandırılmamış tek bir string üretir; alan bazlı arama yapılamaz, ayrıca PII maskeleme atlanır | Guard kapı 5 bunu yasaklıyor |
| **PII maskelemeyi abartmak** | Her şey hash'lenirse hata ayıklanamaz | Yalnızca kullanıcı **içeriği** maskelenir; `Sayfa`, `KitapId`, `Durum` gibi teknik alanlar düz yazılır |
| **`Details` alanını değiştirip kota sorgusunu kırmak** | Kota sayacı `Details`'e bakıyorsa günlük 30 limiti çalışmaz olur | Adım 8 doğrulaması zorunlu |
| **Sessiz başarısızlığı "düzelttim" sanıp arayüzü unutmak** | Backend `Basarili = false` döner, frontend hiç göstermez → kullanıcı hâlâ yanılır | Alan eklenir, arayüz değişikliği **teknik borç olarak raporlanır** |
| **`KullaniciHatasi`'na iç detay koymak** | `throw new KullaniciHatasi($"DB hatası: {ex.Message}")` — istisnanın amacını yok eder | Bu istisna yalnızca **elle yazılmış**, kullanıcıya yönelik metinler taşır |

---

## Teslim şablonu

```markdown
## 1. Kanıtlanarak kapandı
<8 bitti-kriteri komutunun ham çıktısı>
<MUTASYON A çıktısı — sızıntı işaretinin testte YAKALANDIĞI kanıtı>
<MUTASYON B ve C çıktıları>

## 2. Kapanmadı
- Frontend, `ceviriBasarili: false` bayrağını kullanıcıya GÖSTERMİYOR
  → Backend artık durumu bildiriyor ama arayüz sessiz kalıyor; teknik borç
- appsettings'te `Include Error Detail` geliştirme için .env'de kalabilir (bilinçli)

## 3. İnsan müdahalesi gerekiyor
- [ ] Üretimde log toplama altyapısı var mı? (olay kimliği ancak log okunabiliyorsa işe yarar)
- [ ] Destek akışı: kullanıcı "olay kimliği ABC12345" derse bu nasıl aranacak?

## Değiştirilen dosyalar
<git diff --stat>

## Commit
<git log -1 --format='%H %s'>
```
