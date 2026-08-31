# KURAL-05 — Her girdi merkezden doğrulanır

> **Ön koşul:** KURAL-01 tamamlanmış olmalı.

---

## Kural metni

> **İstemciden gelen hiçbir değer, doğrulanmadan veritabanına veya iş mantığına ulaşmayacak.**
> Uzunluk, biçim ve izinli değer kümesi **istek DTO'sunda** bildirilecek; doğrulama
> `[ApiController]` altyapısıyla merkezden yapılacak. Doğrulama hatası **400** üretecek —
> asla 500. Her string alanın sınırı, yazıldığı veritabanı kolonunun sınırından **büyük
> olamayacak** ve bu eşleşme testle zorlanacak. İzinli değer kümeleri whitelist ile
> tanımlanacak, blocklist ile değil.

---

## Envanter

Ölçüm tarihi: **2026-08-20**, commit `d2cfc0f`.

### Doğrulama özniteliği: sıfır

```
$ grep -rn "\[Required\]\|\[StringLength\|\[MaxLength" EnglishReadingPlatform/Controllers/
HİÇ YOK — sıfır doğrulama özniteliği

$ grep -rn "ModelState" EnglishReadingPlatform/
HİÇ YOK
```

### 15 istek DTO'su, hiçbirinde doğrulama yok

```
$ grep -rn "public class .*Request\|public record .*Req" EnglishReadingPlatform/Controllers/
ActivityController.cs:22:        public class LogActivityRequest
AppControllers.cs:71:           public class CreateGroupRequest
AppControllers.cs:111:          public class JoinGroupRequest
AppControllers.cs:214:          public class AssignBookRequest
AppControllers.cs:265:          public record TReq(string Text, string? Context = null, bool UseAI = false)
AppControllers.cs:409:          public class SaveOcrRequest
FeedbackController.cs:22:       public class CreateFeedbackRequest
AuthController.cs:26:           public class LoginRequest
AuthController.cs:32:           public class RegisterRequest
AdminController.cs:84:          public class UpdateRoleRequest
AdminController.cs:152:         public class BookUploadRequest
AdminController.cs:232:         public class BookUploadPagesRequest
AdminController.cs:337:         public class BookUpdateRequest
BooksController.cs:212:         public class AddWordRequest
BooksController.cs:344:         public class SubmitQuizRequest
```

### DTO ↔ kolon sınırı uyuşmazlıkları — 500 üreten noktalar

`[MaxLength]` **doğrulama yapmaz**, yalnızca kolonu `varchar(n)` yapar. Sınırı aşan değer
PostgreSQL'de `22001 string data right truncation` hatası fırlatır → yakalanmamış istisna → **500**.

| DTO alanı | Yazıldığı kolon | Kolon sınırı | Doğrulama | Risk |
|---|---|---|---|---|
| `AddWordRequest.Context` | `WordListItem.Context` | **200** | ❌ | 🔴 **Normal kullanımda tetiklenir** — okuyucuda uzun bir cümledeki kelimeyi kaydetmek yeterli |
| `AddWordRequest.Word` | `WordListItem.Word` | 200 | ❌ | 🟠 Çok kelimeli "kalıp" seçimi |
| `AddWordRequest.Translation` | `WordListItem.Translation` | 500 | ❌ | 🟠 Groq uzun yanıt dönerse |
| `LogActivityRequest.Details` | `UserActivityLog.Details` | **200** | ❌ | 🔴 İstemci kontrollü |
| `LogActivityRequest.ActivityType` | `UserActivityLog.ActivityType` | **50** | ❌ | 🔴 İstemci kontrollü |
| `CreateFeedbackRequest.Message` | `Feedback.Message` | 1000 | ❌ | 🟠 |
| `RegisterRequest.Username` | `User.Username` | 100 | ❌ | 🟠 |
| `RegisterRequest.Email` | `User.Email` | 200 | ❌ | 🟠 |
| `CreateGroupRequest.Name` | `Group.Name` | 200 | ❌ | 🟠 |
| `CreateGroupRequest.Description` | `Group.Description` | 500 | ❌ | 🟠 |
| `BookUpdateRequest.Title` | `Book.Title` | 200 | ❌ | 🟠 |
| `BookUpdateRequest.Author` | `Book.Author` | 200 | ❌ | 🟠 |
| `BookUpdateRequest.Description` | `Book.Description` | 500 | ❌ | 🟠 |
| `BookUpdateRequest.Level` | `Book.Level` | 50 | ❌ | 🟠 |
| `BookUpdateRequest.Category` | `Book.Category` | 50 | ❌ | 🟠 |
| `BookUpload*Request.*` | aynı `Book` alanları | 50–500 | ❌ | 🟠 |

**Toplam korumasız alan: 24.** (18 entity `MaxLength` kısıtı, 15 DTO.)

### Sınırsız alanlar (kolon `text`, yani taşma yok ama kaynak tüketimi var)

| Alan | Risk |
|---|---|
| `TReq.Text` (`/translate/analyze`) | 🔴 **Sınırsız metin LLM'e gidiyor** — token maliyeti ve 5 dk timeout |
| `TReq.Context` | 🟠 Önbellek anahtarı, sınırsız büyür |
| `SaveOcrRequest.Text` | 🟠 `OcrRecord.ExtractedText` `text` kolonu — sınırsız |
| `SubmitQuizRequest.Answers` | 🟠 Sınırsız sözlük — bellek |

### Whitelist eksikleri

| Alan | Mevcut kontrol | Olması gereken |
|---|---|---|
| `UpdateRoleRequest.Role` | ✅ whitelist var (`AdminController.cs:88`) | ✅ Doğru örnek |
| `RegisterRequest.Role` | ✅ örtük whitelist (`teacher` değilse `student`) | ✅ |
| `BookUpdateRequest.Level` | ❌ serbest metin | CEFR whitelist |
| `BookUpdateRequest.Category` | ❌ serbest metin | Kategori whitelist |
| `LogActivityRequest.ActivityType` | ❌ serbest metin | Bilinen tip whitelist'i |
| `SubmitQuizRequest.Answers` değerleri | ❌ serbest metin | `A`\|`B`\|`C`\|`D` |

> `Level`/`Category` whitelist'i ayrıca frontend ile senkron olmayan taksonomi sorununu
> da çözer (`docs/05-FRONTEND.md` § 5).

---

## Merkezî uygulama

### 1. Tek kaynak: alan sınırları — `EnglishReadingPlatform/Validation/AlanSinirlari.cs`

Entity `MaxLength` değerleriyle DTO `StringLength` değerleri **aynı sabitten** okunur.
İkisinin ayrışması böylece imkânsızlaşır.

```csharp
namespace EnglishReadingPlatform.Validation;

/// <summary>
/// KURAL-05: Alan uzunluk sınırlarının TEK kaynağı.
/// Hem entity [MaxLength] hem DTO [StringLength] bu sabitleri kullanır.
/// AlanSinirlariTests, entity ile DTO'nun ayrışmadığını yansımayla doğrular.
/// </summary>
public static class AlanSinirlari
{
    // Kullanıcı
    public const int KullaniciAdi = 100;
    public const int Eposta       = 200;
    public const int SifreEnAz    = 10;    // KURAL-09 bunu sertleştirecek
    public const int SifreEnCok   = 128;   // BCrypt 72 bayt sonrası yok sayar; DoS'a karşı üst sınır

    // Kitap
    public const int KitapBasligi  = 200;
    public const int KitapYazari   = 200;
    public const int KitapAciklama = 500;
    public const int Seviye        = 50;
    public const int Kategori      = 50;
    public const int Dil           = 10;

    // Kelime listesi
    public const int Kelime        = 200;
    public const int Ceviri        = 500;
    public const int Baglam        = 200;

    // Grup
    public const int GrupAdi       = 200;
    public const int GrupAciklama  = 500;
    public const int DavetKodu     = 32;

    // Aktivite / geri bildirim
    public const int AktiviteTipi  = 50;
    public const int AktiviteDetay = 200;
    public const int GeriBildirim  = 1000;

    // Serbest metin üst sınırları (kolon 'text' olsa da kaynak tüketimi sınırlanır)
    public const int CeviriMetni   = 20_000;   // /translate/analyze — LLM maliyeti
    public const int CeviriKelime  = 300;      // /translate/word
    public const int OcrMetni      = 50_000;   // taranmış sayfa
    public const int QuizCevapSayisi = 100;    // tek quiz'de makul üst sınır
}

/// <summary>KURAL-05: İzinli değer kümeleri (whitelist, blocklist DEĞİL).</summary>
public static class IzinliDegerler
{
    public static readonly string[] Roller = { "student", "teacher", "admin" };

    public static readonly string[] Seviyeler =
    {
        "A1", "A1-A2", "A2", "A2-B1", "B1", "B1-B2",
        "B2", "B2-C1", "C1", "C1-C2", "C2"
    };

    public static readonly string[] Kategoriler = { "story", "article", "other" };

    public static readonly string[] Diller = { "en" };

    public static readonly string[] AktiviteTipleri =
    {
        "PageView", "ReadBook", "TakeQuiz", "AuthView", "ai_word_translation"
    };

    public static readonly string[] QuizSiklari = { "A", "B", "C", "D" };
}
```

> **Seviyeler listesi**, `frontend/app/books/page.tsx` içindeki `LEVELS` sabitiyle
> **birebir aynı** olmalıdır. Geçiş planı adım 8 bunu bir uca dönüştürüyor.

### 2. Whitelist doğrulama özniteliği — `Validation/IzinliDegerAttribute.cs`

```csharp
using System.ComponentModel.DataAnnotations;

namespace EnglishReadingPlatform.Validation;

/// <summary>
/// KURAL-05: Değerin izinli küme içinde olmasını zorlar (whitelist).
/// Kullanım: [IzinliDeger(nameof(IzinliDegerler.Seviyeler))]
/// </summary>
[AttributeUsage(AttributeTargets.Property | AttributeTargets.Parameter)]
public sealed class IzinliDegerAttribute : ValidationAttribute
{
    private readonly string[] _izinliler;
    private readonly bool _bosaIzinVer;

    public IzinliDegerAttribute(string[] izinliler, bool bosaIzinVer = false)
    {
        _izinliler = izinliler;
        _bosaIzinVer = bosaIzinVer;
    }

    protected override ValidationResult? IsValid(object? deger, ValidationContext ctx)
    {
        if (deger is null || (deger is string bos && string.IsNullOrWhiteSpace(bos)))
            return _bosaIzinVer ? ValidationResult.Success
                                : new ValidationResult($"{ctx.MemberName} zorunludur.");

        var metin = deger.ToString()!;
        return _izinliler.Contains(metin, StringComparer.Ordinal)
            ? ValidationResult.Success
            : new ValidationResult(
                $"{ctx.MemberName} geçersiz. İzinli değerler: {string.Join(", ", _izinliler)}");
    }
}
```

### 3. Doğrulama hatası biçimi — `Validation/DogrulamaYanitFabrikasi.cs`

`[ApiController]` varsayılan olarak RFC 7807 `ProblemDetails` döner. Projenin tüm
hataları `{ "error": "..." }` biçiminde olduğu için istemciler bunu bekliyor
(`frontend/app/api.ts:124` → `errorData.error`). Biçimi **korumak** zorunludur.

`Program.cs`:

```csharp
using EnglishReadingPlatform.Validation;
using Microsoft.AspNetCore.Mvc;

builder.Services.AddControllers();

// ── KURAL-05: doğrulama hatası biçimi projenin { error } sözleşmesine uyar ──
builder.Services.Configure<ApiBehaviorOptions>(options =>
{
    options.InvalidModelStateResponseFactory = ctx =>
    {
        var ilkHata = ctx.ModelState
            .Where(kv => kv.Value?.Errors.Count > 0)
            .SelectMany(kv => kv.Value!.Errors)
            .Select(e => e.ErrorMessage)
            .FirstOrDefault(m => !string.IsNullOrWhiteSpace(m))
            ?? "Gönderilen veri geçersiz.";

        // Tüm hataları da ver (istemci isterse gösterebilir), ama 'error' alanı korunur.
        var tumHatalar = ctx.ModelState
            .Where(kv => kv.Value?.Errors.Count > 0)
            .ToDictionary(
                kv => kv.Key,
                kv => kv.Value!.Errors.Select(e => e.ErrorMessage).ToArray());

        return new BadRequestObjectResult(new { error = ilkHata, hatalar = tumHatalar });
    };
});
```

### 4. DTO'ları donat — örnekler

`BooksController.AddWordRequest`:

```csharp
using System.ComponentModel.DataAnnotations;
using EnglishReadingPlatform.Validation;

public class AddWordRequest
{
    [Required(ErrorMessage = "Kelime zorunludur.")]
    [StringLength(AlanSinirlari.Kelime, MinimumLength = 1,
        ErrorMessage = "Kelime en fazla {1} karakter olabilir.")]
    public string Word { get; set; } = "";

    [Required(ErrorMessage = "Çeviri zorunludur.")]
    [StringLength(AlanSinirlari.Ceviri,
        ErrorMessage = "Çeviri en fazla {1} karakter olabilir.")]
    public string Translation { get; set; } = "";

    [StringLength(AlanSinirlari.Baglam,
        ErrorMessage = "Bağlam en fazla {1} karakter olabilir.")]
    public string Context { get; set; } = "";
}
```

> ⚠️ **`Context` için özel durum:** Okuyucuda seçilen cümle 200 karakteri kolayca aşar.
> Kullanıcıya "cümlen çok uzun" demek kötü bir deneyimdir. Doğru çözüm **kırpmaktır**:
>
> ```csharp
> // BooksController.AddWord içinde, kaydetmeden önce:
> Context = (req.Context ?? "").Trim().KirpEnCok(AlanSinirlari.Baglam),
> ```
>
> Bu yüzden `Context` alanının `StringLength`'i **400** (kullanıcıya hata verilecek üst
> sınır) yapılır ve kayıt sırasında 200'e kırpılır. `AlanSinirlari.BaglamGirdi = 400`
> sabiti eklenir. Alternatif: kolonu `text`'e genişleten bir migration — daha temiz,
> KURAL-12'de değerlendirilecek.

`ActivityController.LogActivityRequest`:

```csharp
public class LogActivityRequest
{
    [Required]
    [IzinliDeger(new[] { "PageView", "ReadBook", "TakeQuiz", "AuthView", "ai_word_translation" })]
    public string ActivityType { get; set; } = "";

    [StringLength(AlanSinirlari.AktiviteDetay)]
    public string Details { get; set; } = "";

    [Range(0, 3600, ErrorMessage = "Süre 0-3600 saniye arasında olmalıdır.")]
    public int DurationSeconds { get; set; }
}
```

> `DurationSeconds` için `[Range]` **yeni bir korumadır**: şu an istemci
> `durationSeconds: 999999999` göndererek istatistikleri bozabiliyor.

`TranslateController.TReq` (record → doğrulanabilir sınıfa çevrilir):

```csharp
public class CeviriIstegi
{
    [Required(ErrorMessage = "Metin zorunludur.")]
    [StringLength(AlanSinirlari.CeviriMetni,
        ErrorMessage = "Metin en fazla {1} karakter olabilir.")]
    public string Text { get; set; } = "";

    [StringLength(AlanSinirlari.CeviriMetni)]
    public string? Context { get; set; }

    public bool UseAI { get; set; }
}
```

> Kelime ucu için ayrı bir DTO (`KelimeCeviriIstegi`) kullanılır; `Text` sınırı
> `AlanSinirlari.CeviriKelime` (300) olur. Aynı DTO'yu üç uçta paylaşmak, kelime ucuna
> 20.000 karakter gönderilmesine izin verir.

`AdminController.BookUpdateRequest`:

```csharp
public class BookUpdateRequest
{
    [Required] [StringLength(AlanSinirlari.KitapBasligi, MinimumLength = 1)]
    public string Title { get; set; } = "";

    [StringLength(AlanSinirlari.KitapYazari)]  public string Author { get; set; } = "";
    [StringLength(AlanSinirlari.KitapAciklama)] public string Description { get; set; } = "";

    [IzinliDeger(new[] { "en" })]              public string Language { get; set; } = "en";

    [IzinliDeger(new[] { "A1","A1-A2","A2","A2-B1","B1","B1-B2","B2","B2-C1","C1","C1-C2","C2" })]
    public string Level { get; set; } = "A1";

    [IzinliDeger(new[] { "story", "article", "other" })]
    public string Category { get; set; } = "story";
}
```

`BooksController.SubmitQuizRequest`:

```csharp
public class SubmitQuizRequest
{
    [Range(1, int.MaxValue)] public int QuizId { get; set; }

    [Required]
    [MaxLength(AlanSinirlari.QuizCevapSayisi, ErrorMessage = "Çok fazla cevap gönderildi.")]
    public Dictionary<int, string> Answers { get; set; } = new();
}
```

Şık değerlerinin whitelist kontrolü değerlendirme döngüsünde yapılır:

```csharp
foreach (var q in quiz.Questions)
{
    req.Answers.TryGetValue(q.Id, out var ans);
    // KURAL-05: whitelist — geçersiz şık boş sayılır
    if (ans is not null && !IzinliDegerler.QuizSiklari.Contains(ans)) ans = null;
    bool isCorrect = ans == q.CorrectAnswer;
    ...
}
```

### 5. Kırpma yardımcısı — `Validation/MetinUzantilari.cs`

```csharp
namespace EnglishReadingPlatform.Validation;

public static class MetinUzantilari
{
    /// <summary>
    /// Metni en fazla verilen uzunluğa kırpar. null-güvenlidir.
    /// KURAL-05: kolon sınırına yazılmadan önce SON savunma hattı.
    /// </summary>
    public static string KirpEnCok(this string? metin, int enCok)
    {
        if (string.IsNullOrEmpty(metin)) return "";
        var temiz = metin.Trim();
        return temiz.Length <= enCok ? temiz : temiz[..enCok];
    }
}
```

---

## Otomatik kapı

### A) Sözleşme testi: DTO sınırı ≤ kolon sınırı — `AlanSinirlariTests.cs`

Bu, kuralın **en değerli kapısıdır**: yeni bir DTO alanı eklenip sınırı unutulursa
veya entity sınırı küçültülürse test kırmızı olur.

```csharp
using System.ComponentModel.DataAnnotations;
using System.Reflection;
using FluentAssertions;
using Xunit;

namespace EnglishReadingPlatform.Tests;

public class AlanSinirlariTests
{
    /// <summary>DTO alanı → yazıldığı entity alanı eşlemesi. Yeni DTO eklenince buraya da eklenir.</summary>
    private static readonly (Type Dto, string DtoAlan, Type Entity, string EntityAlan)[] Eslesmeler =
    {
        (typeof(EnglishReadingPlatform.Controllers.BooksController.AddWordRequest), "Word",
         typeof(EnglishReadingPlatform.Models.WordListItem), "Word"),
        (typeof(EnglishReadingPlatform.Controllers.BooksController.AddWordRequest), "Translation",
         typeof(EnglishReadingPlatform.Models.WordListItem), "Translation"),
        (typeof(EnglishReadingPlatform.Controllers.ActivityController.LogActivityRequest), "ActivityType",
         typeof(EnglishReadingPlatform.Models.UserActivityLog), "ActivityType"),
        (typeof(EnglishReadingPlatform.Controllers.ActivityController.LogActivityRequest), "Details",
         typeof(EnglishReadingPlatform.Models.UserActivityLog), "Details"),
        (typeof(EnglishReadingPlatform.Controllers.FeedbackController.CreateFeedbackRequest), "Message",
         typeof(EnglishReadingPlatform.Models.Feedback), "Message"),
        (typeof(EnglishReadingPlatform.Controllers.AdminController.BookUpdateRequest), "Title",
         typeof(EnglishReadingPlatform.Models.Book), "Title"),
        (typeof(EnglishReadingPlatform.Controllers.AdminController.BookUpdateRequest), "Author",
         typeof(EnglishReadingPlatform.Models.Book), "Author"),
        (typeof(EnglishReadingPlatform.Controllers.AdminController.BookUpdateRequest), "Description",
         typeof(EnglishReadingPlatform.Models.Book), "Description"),
        // Not: AddWordRequest.Context bilinçli olarak kolondan BÜYÜK (kırpılıyor) —
        // istisna listesinde.
    };

    private static readonly HashSet<string> KirpilanAlanlar = new()
    {
        "AddWordRequest.Context",   // 400 girdi sınırı, 200'e kırpılarak yazılır
    };

    private static int? Sinir(Type tip, string alan)
    {
        var ozellik = tip.GetProperty(alan);
        ozellik.Should().NotBeNull($"{tip.Name}.{alan} bulunamadı");
        return ozellik!.GetCustomAttribute<StringLengthAttribute>()?.MaximumLength
            ?? ozellik.GetCustomAttribute<MaxLengthAttribute>()?.Length;
    }

    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public void Her_DTO_alani_uzunluk_siniri_bildirmeli()
    {
        var eksikler = new List<string>();

        foreach (var (dto, dtoAlan, _, _) in Eslesmeler)
            if (Sinir(dto, dtoAlan) is null)
                eksikler.Add($"{dto.Name}.{dtoAlan}");

        eksikler.Should().BeEmpty("bu DTO alanlarında [StringLength] yok: " + string.Join(", ", eksikler));
    }

    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public void DTO_siniri_kolon_sinirini_ASMAMALI()
    {
        var ihlaller = new List<string>();

        foreach (var (dto, dtoAlan, entity, entityAlan) in Eslesmeler)
        {
            if (KirpilanAlanlar.Contains($"{dto.Name}.{dtoAlan}")) continue;

            var dtoSinir = Sinir(dto, dtoAlan);
            var entitySinir = Sinir(entity, entityAlan);

            if (dtoSinir is null || entitySinir is null) continue;

            if (dtoSinir > entitySinir)
                ihlaller.Add($"{dto.Name}.{dtoAlan}={dtoSinir} > {entity.Name}.{entityAlan}={entitySinir}");
        }

        ihlaller.Should().BeEmpty(
            "DTO sınırı kolon sınırından büyükse 400 yerine 500 alınır:\n" + string.Join("\n", ihlaller));
    }
}
```

### B) Uçtan uca 400 testleri — `GirdiDogrulamaTests.cs`

```csharp
using System.Net;
using System.Net.Http.Json;
using EnglishReadingPlatform.Tests.Infrastructure;
using FluentAssertions;
using Xunit;

namespace EnglishReadingPlatform.Tests;

[Collection("api")]
public class GirdiDogrulamaTests
{
    private readonly TestAppFactory _fabrika;
    public GirdiDogrulamaTests(TestAppFactory fabrika) => _fabrika = fabrika;

    private async Task<HttpClient> OgrenciClientAsync()
    {
        var client = _fabrika.CreateClient();
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        return client.TokenIle(o.Token);
    }

    private static string UzunMetin(int uzunluk) => new('x', uzunluk);

    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public async Task Uzun_baglam_400_doner_500_DEGIL()
    {
        // ANA REGRESYON TESTİ: bu senaryo normal kullanımda 500 üretiyordu.
        var client = await OgrenciClientAsync();

        var yanit = await client.PostAsJsonAsync("/api/books/addword", new
        {
            word = "gaunt",
            translation = "bitkin",
            context = UzunMetin(5000)
        });

        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest,
            "uzun bağlam doğrulama hatası vermeli, sunucu hatası değil");
        yanit.StatusCode.Should().NotBe(HttpStatusCode.InternalServerError);
    }

    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public async Task Uzun_kelime_400_doner()
    {
        var client = await OgrenciClientAsync();
        var yanit = await client.PostAsJsonAsync("/api/books/addword",
            new { word = UzunMetin(1000), translation = "x", context = "" });

        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public async Task Uzun_aktivite_detayi_400_doner()
    {
        var client = await OgrenciClientAsync();
        var yanit = await client.PostAsJsonAsync("/api/activity/log", new
        {
            activityType = "PageView",
            details = UzunMetin(5000),
            durationSeconds = 30
        });

        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public async Task Bilinmeyen_aktivite_tipi_reddedilir()
    {
        var client = await OgrenciClientAsync();
        var yanit = await client.PostAsJsonAsync("/api/activity/log", new
        {
            activityType = "uydurma_tip",
            details = "x",
            durationSeconds = 10
        });

        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest, "whitelist dışı tip kabul edilmemeli");
    }

    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public async Task Absurt_sure_reddedilir()
    {
        var client = await OgrenciClientAsync();
        var yanit = await client.PostAsJsonAsync("/api/activity/log", new
        {
            activityType = "PageView",
            details = "Ana Sayfa",
            durationSeconds = 999_999_999
        });

        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest, "istatistikler bozulmamalı");
    }

    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public async Task Uzun_geri_bildirim_400_doner()
    {
        var client = await OgrenciClientAsync();
        var yanit = await client.PostAsJsonAsync("/api/feedback", new { message = UzunMetin(50_000) });
        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public async Task Cok_uzun_ceviri_metni_reddedilir()
    {
        var client = await OgrenciClientAsync();
        var yanit = await client.PostAsJsonAsync("/api/translate/analyze",
            new { text = UzunMetin(200_000) });

        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest,
            "sınırsız metin LLM'e gönderilmemeli");
    }

    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public async Task Gecersiz_seviye_reddedilir()
    {
        var client = _fabrika.CreateClient();
        var admin = await AuthHelper.AdminOlarakGirisYapAsync(client);
        client.TokenIle(admin.Token);

        var yanit = await client.PutAsJsonAsync("/api/admin/books/1", new
        {
            title = "Test", author = "", description = "",
            language = "en", level = "Z9", category = "story"
        });

        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest, "CEFR whitelist dışı seviye reddedilmeli");
    }

    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public async Task Hata_yaniti_error_alani_tasimali()
    {
        // Frontend api.ts errorData.error okuyor — biçim korunmalı.
        var client = await OgrenciClientAsync();
        var yanit = await client.PostAsJsonAsync("/api/books/addword",
            new { word = "", translation = "", context = "" });

        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var govde = await yanit.Content.ReadAsStringAsync();
        govde.Should().Contain("\"error\"", "istemci sözleşmesi { error } biçimini bekliyor");
    }

    [Fact]
    [Trait("Category", "GirdiDogrulama")]
    public async Task Gecerli_istek_hala_calisiyor()
    {
        // Regresyon: doğrulama eklemek meşru kullanımı bozmamalı.
        var client = await OgrenciClientAsync();
        var yanit = await client.PostAsJsonAsync("/api/books/addword", new
        {
            word = "gaunt",
            translation = "bitkin, sıska",
            context = "The old man was thin and gaunt."
        });

        yanit.StatusCode.Should().Be(HttpStatusCode.OK);
    }
}
```

### C) Guard script — `scripts/guard/05-girdi.sh`

```bash
#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
echo "[05] Girdi doğrulama"

DTO_DOSYALARI="EnglishReadingPlatform/Controllers/*.cs"

# 1. Doğrulama özniteliği taşımayan DTO sınıfı var mı?
#    Her "public class XxxRequest" bloğunda en az bir [Required] veya [StringLength] olmalı.
eksik=""
for dosya in EnglishReadingPlatform/Controllers/*.cs; do
  while IFS= read -r satir; do
    ad="$(echo "$satir" | sed -E 's/.*public class ([A-Za-z0-9_]+).*/\1/')"
    no="$(echo "$satir" | cut -d: -f1)"
    # sınıf gövdesinin ilk 25 satırında doğrulama özniteliği ara
    if ! sed -n "${no},$((no+25))p" "$dosya" | grep -qE '\[(Required|StringLength|Range|IzinliDeger|MaxLength)'; then
      eksik="${eksik}${dosya}:${no}: ${ad}"$'\n'
    fi
  done < <(grep -n "public class .*Request" "$dosya" 2>/dev/null)
done
n=$(printf '%s' "$eksik" | grep -c . || true)
ihlal_bildir "doğrulamasız istek DTO'su" "$n" "$eksik"

# 2. InvalidModelStateResponseFactory yapılandırılmış mı? ({ error } sözleşmesi)
n=0; grep -q "InvalidModelStateResponseFactory" EnglishReadingPlatform/Program.cs || n=1
ihlal_bildir "hata biçimi { error } korunuyor" "$n" "ApiBehaviorOptions yapılandırılmamış"

# 3. Sabitler tek kaynaktan mı geliyor? (elle yazılmış sayı sınırı)
cikti="$(kodda_ara 'StringLength\([0-9]+' 'EnglishReadingPlatform/Controllers/*.cs')"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "elle yazılmış StringLength sayısı" "$n" "$cikti"

# 4. Blocklist deseni (whitelist kullanılmalı)
cikti="$(kodda_ara 'Blacklist|blocklist|yasakliKelimeler|BannedWords' 'EnglishReadingPlatform/**/*.cs')"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "blocklist deseni" "$n" "$cikti"

# 5. Sözleşme testi duruyor mu?
n=0; [ -f "EnglishReadingPlatform.Tests/AlanSinirlariTests.cs" ] || n=1
ihlal_bildir "sınır sözleşmesi testi mevcut" "$n" "AlanSinirlariTests.cs silinmiş"

guard_bitir
```

> **Kapı 3 neden var:** `[StringLength(200)]` yerine `[StringLength(AlanSinirlari.Baglam)]`
> yazılmasını zorlar. Elle yazılan sayılar, entity ile DTO'nun sessizce ayrışmasının
> kaynağıdır.

---

## Bitti kriteri

```bash
cd /Users/alihanfindikci/Desktop/ingilizceproje
docker compose up -d postgres

# 1) Girdi doğrulama testleri — BEKLENEN: Başarısız: 0, Başarılı: 12
dotnet test Linguza.sln --filter "Category=GirdiDogrulama" --logger "console;verbosity=normal"
echo "çıkış kodu: $?"

# 2) Guard kapısı — BEKLENEN: TOPLAM İHLAL: 0
bash scripts/guard/05-girdi.sh; echo "çıkış kodu: $?"

# 3) Doğrulama özniteliği sayısı — BEKLENEN: ≥ 24 (0 değil)
grep -rc "\[Required\]\|\[StringLength\|\[Range\|\[IzinliDeger" EnglishReadingPlatform/Controllers/*.cs \
  | awk -F: '{t+=$2} END {print t}'

# 4) Elle yazılmış sınır sayısı — BEKLENEN: 0
grep -rn "StringLength([0-9]" EnglishReadingPlatform/Controllers/ | wc -l

# 5) Tüm kapılar — BEKLENEN: TOPLAM İHLAL: 0
bash scripts/guard/run-all.sh; echo "çıkış kodu: $?"

# 6) Regresyon
dotnet test Linguza.sln --logger "console;verbosity=normal"
```

---

## Mutasyon kontrolü (zorunlu)

```bash
# MUTASYON A — Context sınırını kaldır, 500 geri gelmeli
cp EnglishReadingPlatform/Controllers/BooksController.cs /tmp/BooksController.orig.cs
python3 - <<'PY'
yol = "EnglishReadingPlatform/Controllers/BooksController.cs"
k = open(yol, encoding="utf-8").read()
k = k.replace('[StringLength(AlanSinirlari.BaglamGirdi,', '// MUTASYON [StringLength(')
open(yol, "w", encoding="utf-8").write(k)
PY

dotnet test Linguza.sln --filter "FullyQualifiedName~Uzun_baglam_400_doner"
# BEKLENEN: Başarısız: 1 — "Expected BadRequest, but found InternalServerError"
#   ← ORİJİNAL HATANIN TA KENDİSİ

cp /tmp/BooksController.orig.cs EnglishReadingPlatform/Controllers/BooksController.cs
dotnet test Linguza.sln --filter "Category=GirdiDogrulama"     # BEKLENEN: Başarısız: 0
```

```bash
# MUTASYON B — DTO sınırını kolondan büyük yap, sözleşme testi kırmızı olmalı
sed -i '' 's|public const int Kelime        = 200;|public const int Kelime        = 5000;|' \
  EnglishReadingPlatform/Validation/AlanSinirlari.cs

dotnet test Linguza.sln --filter "FullyQualifiedName~DTO_siniri_kolon_sinirini_ASMAMALI"
# BEKLENEN: Başarısız: 1 — "AddWordRequest.Word=5000 > WordListItem.Word=200"

git checkout EnglishReadingPlatform/Validation/AlanSinirlari.cs
dotnet test Linguza.sln --filter "Category=GirdiDogrulama"     # BEKLENEN: Başarısız: 0
```

```bash
# MUTASYON C — whitelist'i kaldır
sed -i '' 's|\[IzinliDeger(new\[\] { "PageView"|// MUTASYON [IzinliDeger(new[] { "PageView"|' \
  EnglishReadingPlatform/Controllers/ActivityController.cs

dotnet test Linguza.sln --filter "FullyQualifiedName~Bilinmeyen_aktivite_tipi_reddedilir"
# BEKLENEN: Başarısız: 1

git checkout EnglishReadingPlatform/Controllers/ActivityController.cs
```

```bash
# MUTASYON D — hata biçimini boz, istemci sözleşmesi testi kırmızı olmalı
sed -i '' 's|new { error = ilkHata, hatalar = tumHatalar }|new { message = ilkHata }|' \
  EnglishReadingPlatform/Program.cs

dotnet test Linguza.sln --filter "FullyQualifiedName~Hata_yaniti_error_alani_tasimali"
# BEKLENEN: Başarısız: 1

git checkout EnglishReadingPlatform/Program.cs
```

---

## Geçiş planı

| Adım | İş | Nokta | Doğrulama |
|---|---|---|---|
| 1 | `Validation/AlanSinirlari.cs` + `IzinliDegerler` yaz | — | derlenir |
| 2 | `Validation/IzinliDegerAttribute.cs` yaz | — | derlenir |
| 3 | `Validation/MetinUzantilari.cs` yaz | — | derlenir |
| 4 | `Program.cs` → `InvalidModelStateResponseFactory` | — | `{ error }` biçimi korunur |
| 5 | `AlanSinirlariTests.cs` yaz — **merkezî çözüm önce kanıtlanır** | — | 2 test yeşil |
| 6 | Entity `[MaxLength(200)]` → `[MaxLength(AlanSinirlari.Baglam)]` (18 nokta) | 18 | migration **gerekmez** (değerler aynı) |
| 7 | 15 DTO'yu donat | 24 alan | derlenir |
| 8 | `AddWord` içinde `Context`'i `KirpEnCok` ile kırp | 1 | uzun bağlam 400 değil, kırpılarak 200 |
| 9 | `SubmitQuiz` şık whitelist'i | 1 | derlenir |
| 10 | `GirdiDogrulamaTests.cs` yaz | — | 10 test yeşil |
| 11 | `scripts/guard/05-girdi.sh` + `chmod +x` | — | çıkış kodu 0 |
| 12 | **Frontend uyum kontrolü** (aşağı bak) | — | elle |
| 13 | İlerleme tablosunu güncelle | — | — |

> **Adım 6 uyarısı:** Entity `[MaxLength]` değerleri **değişmiyor**, sadece sabite
> bağlanıyor. Değer değişirse migration gerekir. Değişiklik yaptıysanız:
> ```bash
> cd EnglishReadingPlatform && dotnet ef migrations add AlanSinirlariSabitlendi
> dotnet ef migrations script --idempotent -o /tmp/kural05.sql && grep -i "ALTER TABLE" /tmp/kural05.sql
> ```
> Çıktı boşsa şema değişmemiş demektir ✅.

### Adım 12 — frontend uyum kontrolü (elle)

| Akış | Risk | Beklenen |
|---|---|---|
| Okuyucuda **uzun bir cümledeki** kelimeyi kaydet | 🔴 Eskiden 500 | Kaydedilmeli, bağlam kırpılmış olmalı |
| Kelime listesinde satır içi düzenleme | 🟠 `updateWord` aynı DTO'yu kullanıyor | Çalışmalı |
| OCR sayfasında uzun metin analizi | 🟠 20.000 karakter sınırı | 20.000'in altı çalışmalı, üstü net hata vermeli |
| Yönetici panelinden kitap düzenleme | 🔴 `Level`/`Category` whitelist | Panelde seçili değerler whitelist'te olmalı |
| Aktivite heartbeat (30 sn) | 🔴 `activityType` whitelist | `useActivityTracker` yalnızca 5 tipi gönderiyor — uyumlu |

> ⚠️ **Adım 12'nin en kritik noktası:** `frontend/app/books/page.tsx` içindeki `LEVELS`
> listesi ile `IzinliDegerler.Seviyeler` **birebir aynı** olmalı. Farklıysa yönetici
> paneli kitap düzenleyemez hale gelir. İki listeyi yan yana koyup karşılaştır:
>
> ```bash
> grep -o "id: '[^']*'" frontend/app/books/page.tsx | head -13
> grep -A4 "Seviyeler =" EnglishReadingPlatform/Validation/AlanSinirlari.cs
> ```
>
> Kalıcı çözüm: `GET /api/books/taxonomy` ucu ekleyip iki frontend'in de oradan çekmesi.
> Bu, bu kuralın kapsamı dışıdır ama **teknik borç olarak raporlanmalıdır**.

---

## Tuzaklar

| Tuzak | Neden olur | Nasıl kaçınılır |
|---|---|---|
| **`[MaxLength]`'i doğrulama sanmak** | EF Core'da `[MaxLength]` yalnızca kolon tipi belirler; doğrulama **yapmaz**. Bu hatanın ta kendisi | DTO'da `[StringLength]`, entity'de `[MaxLength]` |
| **`[ApiController]` olmadan doğrulama beklemek** | Otomatik 400 yalnızca `[ApiController]` ile gelir; sınıfta yoksa `ModelState` elle kontrol edilmeli | Tüm controller'larda `[ApiController]` var ✅ — yeni controller eklerken unutma |
| **Hata biçimini `ProblemDetails`'a bırakmak** | Frontend `errorData.error` okuyor; `ProblemDetails` `title`/`errors` döner → istemci "HTTP error! status: 400" gösterir, kullanıcı ne olduğunu anlamaz | `InvalidModelStateResponseFactory` zorunlu |
| **`record` DTO'ya öznitelik koymaya çalışmak** | `public record TReq(string Text, ...)` konumsal parametrelerde öznitelik sözdizimi farklıdır (`[property: StringLength(...)]`) ve kafa karıştırır | Doğrulanacak DTO'ları normal `class` yap |
| **Kırpma yerine hata vermek** | Okuyucuda 300 karakterlik bir cümle seçmek **normal**. 400 vermek özelliği kullanılamaz kılar | `Context` gibi türetilmiş alanlar kırpılır, kullanıcı girdisi reddedilir |
| **Aynı DTO'yu üç uçta paylaşmak** | `TReq` hem `word` hem `sentence` hem `analyze` ucunda kullanılıyor; tek sınır koyunca ya kelime ucu 20.000 karakter kabul eder ya analiz ucu 300'de kalır | Uç başına ayrı DTO |
| **`MinimumLength` koymayı unutmak** | `[StringLength(200)]` boş stringi kabul eder; `[Required]` de `""` için (varsayılan olarak) geçer | `[Required]` + `MinimumLength = 1` birlikte |
| **Whitelist'i iki yerde tutmak** | Backend `IzinliDegerler.Seviyeler` ve frontend `LEVELS` ayrışır → kitaplar kaybolur | Guard kapı 3 elle yazılan sabitleri yasaklıyor; taksonomi ucu teknik borç olarak raporlanmalı |
| **`Dictionary` boyutunu sınırlamamak** | `SubmitQuizRequest.Answers` sınırsız; milyon anahtarlı bir sözlük belleği tüketir | `[MaxLength]` sözlükte de çalışır |
| **Doğrulamayı ekleyip mevcut testleri koşmamak** | `Gecerli_istek_hala_calisiyor` testi yoksa, doğrulama meşru kullanımı sessizce bozar | Regresyon testi zorunlu |

---

## Teslim şablonu

```markdown
## 1. Kanıtlanarak kapandı
<6 bitti-kriteri komutunun ham çıktısı>
<MUTASYON A çıktısı — "Expected BadRequest, but found InternalServerError" GÖRÜNMELİ>
<MUTASYON B, C, D çıktıları>

## 2. Kapanmadı
- Seviye/kategori taksonomisi hâlâ üç yerde ayrı tanımlı (backend + 2 frontend)
  → Kalıcı çözüm GET /api/books/taxonomy ucu; bu kuralın kapsamı dışı, teknik borç

## 3. İnsan müdahalesi gerekiyor
- [ ] Frontend uyum kontrolü (geçiş planı adım 12) — 5 akışı elle dene
- [ ] LEVELS listesi karşılaştırması — iki liste birebir aynı mı?

## Değiştirilen dosyalar
<git diff --stat>

## Commit
<git log -1 --format='%H %s'>
```
