# KURAL-03 — Varsayılan reddet: her uç açıkça yetkilendirilir

> **Ön koşul:** KURAL-01 tamamlanmış olmalı.

---

## Kural metni

> **Hiçbir HTTP ucu yetkilendirme kararı belirsiz bırakılarak yazılamaz.**
> Varsayılan davranış *reddetmektir*: kimlik doğrulaması global fallback politikasıyla
> zorunlu kılınır. Her uç ya açık bir `[Authorize(...)]` politikasıyla korunur, ya da
> bilinçli olarak `[AllowAnonymous]` ile işaretlenir ve bu işaretleme beyaz listede yer alır.
> "Sadece `[Authorize]`" yetkilendirme değildir — *hangi rolün, hangi kaydın* sorusu
> yanıtlanmadıysa uç eksiktir.

---

## Envanter

Ölçüm tarihi: **2026-08-20**, commit `d2cfc0f`.

```
$ grep -rn "\[Http\(Get\|Post\|Put\|Delete\|Patch\)" EnglishReadingPlatform/Controllers/ | wc -l
      38

$ grep -rn "^\s*\[Authorize" EnglishReadingPlatform/Controllers/
EnglishReadingPlatform/Controllers/BooksController.cs:11:    [Authorize]
EnglishReadingPlatform/Controllers/ActivityController.cs:12:    [Authorize]
EnglishReadingPlatform/Controllers/FeedbackController.cs:12:    [Authorize]
EnglishReadingPlatform/Controllers/FeedbackController.cs:59:        [Authorize(Policy = "AdminOnly")]
EnglishReadingPlatform/Controllers/AppControllers.cs:11:    [Authorize]
EnglishReadingPlatform/Controllers/AppControllers.cs:247:    [Authorize]
EnglishReadingPlatform/Controllers/AppControllers.cs:349:    [Authorize]
EnglishReadingPlatform/Controllers/AdminController.cs:16:    [Authorize(Roles = "admin")]

$ grep -rn "AllowAnonymous" EnglishReadingPlatform/Controllers/
(çıktı yok — hiç yok)
```

### Uç bazında yetkilendirme haritası

| Controller | Uç sayısı | Sınıf özniteliği | Durum |
|---|---|---|---|
| `AuthController` | 4 | **YOK** | 🔴 Anonim ama `[AllowAnonymous]` işareti de yok — belirsiz |
| `BooksController` | 9 | `[Authorize]` | 🟡 Sahiplik filtresi sorguda var, öznitelikte belirtilmemiş |
| `GroupsController` | 5 | `[Authorize]` | 🟡 Üyelik kontrolü gövde içinde |
| `TranslateController` | 3 | `[Authorize]` | ✅ Kullanıcı bazlı, yeterli |
| `DashboardController` | 3 | `[Authorize]` | ✅ |
| `ActivityController` | 2 | `[Authorize]` | 🔴 `stats` ucu admin olmalı, değil |
| `FeedbackController` | 2 | `[Authorize]` + `AdminOnly` (list) | ✅ |
| `AdminController` | 10 | `[Authorize(Roles="admin")]` | ✅ |
| **TOPLAM** | **38** | | |

### 🔴 Ana ihlal: `GET /api/activity/stats`

`EnglishReadingPlatform/Controllers/ActivityController.cs:72-76`

```csharp
// GET /api/activity/stats
[HttpGet("stats")]
public async Task<IActionResult> GetStats()
{
    // İleride admin kontrolü de eklenebilir, şu an genel liste dönüyoruz
    var stats = await _db.UserActivityLogs
        .Include(l => l.User)
        .OrderByDescending(l => l.Timestamp)
        .Take(100)
        ...
```

Herhangi bir öğrenci tokenıyla **tüm kullanıcıların** adı, hangi kitabı okuduğu,
ne kadar süre harcadığı ve `"Word: {kelime}"` biçiminde hangi kelimeleri bilmediği
çekilebiliyor. Kodda bırakılan yorum, bunun bilinen ama ertelenmiş bir eksik olduğunu
gösteriyor.

Bu ucu **yönetici paneli dashboard'u** kullanıyor
(`admin-panel/app/dashboard/page.tsx:61`), yani meşru tüketicisi zaten admin.

### 🔴 İkincil ihlal: `AuthController`'da hiç öznitelik yok

4 uç (`login`, `register`, `logout`, `me`) hiçbir öznitelik taşımıyor. Bugün çalışıyorlar
çünkü global bir fallback politikası yok. **Fallback politikası eklendiği anda hepsi
401 dönmeye başlar** — bu yüzden bu kural, `[AllowAnonymous]` işaretlerini eklemeden
uygulanamaz.

Ayrıca `me` ucu yetkilendirmeyi elle yapıyor:

```csharp
var userIdClaim = claimsPrincipal.FindFirst(ClaimTypes.NameIdentifier);
if (userIdClaim == null) return Unauthorized(...);
```

Bu, `[Authorize]` ile yapılması gerekeni gövdede tekrar etmektir.

### 🟡 Üçüncül: `logout` ucu token okuyamıyor

`logout` anonim olduğu için `User` claim'leri **doldurulmuş olabilir de olmayabilir de**.
KURAL-04'te `jti` claim'ini okuması gerekecek. Bu kural `logout`'u `[Authorize]` yapar
ve KURAL-04'ün önünü açar.

---

## Merkezî uygulama

### 1. Global fallback politikası — `Program.cs`

Mevcut blok:

```csharp
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("AdminOnly", policy => policy.RequireRole("admin"));
});
```

**Yerine:**

```csharp
using Microsoft.AspNetCore.Authorization;

builder.Services.AddAuthorization(options =>
{
    // ── KURAL-03: VARSAYILAN REDDET ────────────────────────────
    // Öznitelik taşımayan her uç otomatik olarak kimlik doğrulaması ister.
    // Bir ucun herkese açık olması İSTENİYORSA [AllowAnonymous] ile
    // açıkça işaretlenmeli ve YetkilendirmeSozlesmesiTests beyaz listesine eklenmelidir.
    options.FallbackPolicy = new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build();

    options.AddPolicy("AdminOnly", policy => policy.RequireRole("admin"));

    // Öğretmen VEYA admin gerektiren ileri kullanımlar için hazır politika.
    options.AddPolicy("EgitmenVeyaAdmin", policy => policy.RequireRole("teacher", "admin"));
});
```

### 2. Anonim uçları açıkça işaretle — `AuthController.cs`

```csharp
[HttpPost("login")]
[AllowAnonymous]                       // ← EKLENECEK
public async Task<IActionResult> Login([FromBody] LoginRequest req)

[HttpPost("register")]
[AllowAnonymous]                       // ← EKLENECEK
public async Task<IActionResult> Register([FromBody] RegisterRequest req)
```

`logout` ve `me` **anonim olmayacak** — token gerektirir:

```csharp
[HttpPost("logout")]
[Authorize]                            // ← EKLENECEK (KURAL-04 jti claim'ini okuyacak)
public IActionResult Logout()

[HttpGet("me")]
[Authorize]                            // ← EKLENECEK
public async Task<IActionResult> Me()
```

`Me()` içindeki elle kontrol sadeleşir:

```csharp
[HttpGet("me")]
[Authorize]
public async Task<IActionResult> Me()
{
    // [Authorize] sayesinde claim'in varlığı garanti; yine de savunmacı TryParse.
    var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
    if (!int.TryParse(userIdStr, out var userId))
        return Unauthorized(new { error = "Oturum bilgisi geçersiz." });

    var user = await _db.Users.FindAsync(userId);
    if (user == null) return NotFound(new { error = "Kullanıcı bulunamadı." });

    return Ok(new { user = new { user.Id, user.Username, user.Email, user.Role } });
}
```

> ⚠️ **`logout` için davranış değişikliği:** Artık süresi dolmuş token'la çıkış yapılamaz
> (401 döner). Frontend `AuthContext.logout` zaten `api.logout()` hatasını yutuyor
> (`catch (e) { /* Ignore */ }`), dolayısıyla kullanıcı deneyimi bozulmaz. Geçiş
> planında doğrulanacak.

### 3. Ana ihlali kapat — `ActivityController.cs`

```csharp
// GET /api/activity/stats
[HttpGet("stats")]
[Authorize(Policy = "AdminOnly")]      // ← EKLENECEK
public async Task<IActionResult> GetStats()
{
    var stats = await _db.UserActivityLogs
        ...
```

Ve kafa karıştıran yorumu sil:

```csharp
// SİLİNECEK: // İleride admin kontrolü de eklenebilir, şu an genel liste dönüyoruz
```

### 4. Sahiplik kontrolünü görünür kıl — `Authorization/SahiplikExtensions.cs`

`[Authorize]` "giriş yapmış olmak" der; "bu kayıt sana mı ait" demez. Bu kontrol şu an
27 ayrı LINQ ifadesinde dağınık. Bu kural onları **taşımaz** (KURAL-08'in işi), ama
tek bir yardımcı sunarak yeni kodun doğru deseni kullanmasını sağlar:

```csharp
using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;

namespace EnglishReadingPlatform.Authorization;

/// <summary>
/// KURAL-03: Kimlik ve sahiplik yardımcıları.
/// Amaç: her controller'da tekrarlanan
///   int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!)
/// deseninin tek bir güvenli noktaya toplanması.
/// </summary>
public static class KullaniciExtensions
{
    /// <summary>Oturum açan kullanıcının Id'si. Claim yoksa/bozuksa istisna fırlatmaz.</summary>
    public static bool KullaniciIdAl(this ControllerBase controller, out int kullaniciId)
        => int.TryParse(controller.User.FindFirstValue(ClaimTypes.NameIdentifier), out kullaniciId);

    /// <summary>
    /// Oturum açan kullanıcının Id'si. [Authorize] altındaki uçlarda güvenle kullanılır.
    /// Claim yoksa 401'e karşılık gelen istisna yerine açık bir hata verir.
    /// </summary>
    public static int KullaniciId(this ControllerBase controller)
        => controller.KullaniciIdAl(out var id)
            ? id
            : throw new UnauthorizedAccessException(
                "NameIdentifier claim'i bulunamadı — bu uç [Authorize] ile korunmuyor olabilir.");

    public static bool AdminMi(this ControllerBase controller)
        => controller.User.IsInRole("admin");
}
```

> Mevcut `CurrentUserId => int.Parse(...!)` özellikleri bu kuralda **silinmiyor**
> (5 controller'da tekrarlanıyor, taşınması KURAL-08'e ait). Ancak `int.Parse` +
> `!` kombinasyonu claim yoksa `ArgumentNullException` → **500** üretir. Fallback
> politikası eklendiği için artık claim'siz istek controller'a hiç ulaşmaz, yani bu
> kural yan etki olarak o 500 riskini de kapatır.

---

## Otomatik kapı

### A) Yansıma (reflection) tabanlı sözleşme testi — asıl kapı

Bu testin gücü şurada: **yeni bir uç eklendiğinde otomatik olarak kapsanır.**
Geliştirici `[Authorize]` yazmayı unutursa test kırmızı olur.

`EnglishReadingPlatform.Tests/YetkilendirmeSozlesmesiTests.cs`:

```csharp
using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using FluentAssertions;
using Xunit;

namespace EnglishReadingPlatform.Tests;

/// <summary>
/// KURAL-03: Her HTTP ucunun yetkilendirme kararı AÇIK olmalı.
/// Bu test tüm controller action'larını yansımayla gezer.
/// </summary>
public class YetkilendirmeSozlesmesiTests
{
    /// <summary>
    /// Bilinçli olarak herkese açık bırakılan uçlar.
    /// Buraya bir uç eklemek GÜVENLİK KARARIDIR — gerekçesi yorumda yazılmalı.
    /// </summary>
    private static readonly HashSet<string> AnonimBeyazListe = new()
    {
        "AuthController.Login",     // giriş: token almadan önce çağrılır
        "AuthController.Register",  // kayıt: token almadan önce çağrılır
    };

    /// <summary>Yalnızca yönetici erişebilmesi gereken uçlar.</summary>
    private static readonly HashSet<string> AdminGerektirenler = new()
    {
        "ActivityController.GetStats",       // tüm kullanıcıların aktivite akışı
        "FeedbackController.GetFeedbackList" // tüm kullanıcıların geri bildirimleri
        // AdminController'ın tamamı sınıf özniteliğiyle kapsanıyor
    };

    private static IEnumerable<(Type Controller, MethodInfo Action, string Ad)> TumAksiyonlar()
    {
        var assembly = typeof(Program).Assembly;
        var controllerTipleri = assembly.GetTypes()
            .Where(t => typeof(ControllerBase).IsAssignableFrom(t) && !t.IsAbstract);

        foreach (var tip in controllerTipleri)
        {
            var aksiyonlar = tip.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
                .Where(m => m.GetCustomAttributes<HttpMethodAttribute>().Any());

            foreach (var aksiyon in aksiyonlar)
                yield return (tip, aksiyon, $"{tip.Name}.{aksiyon.Name}");
        }
    }

    private static (bool Anonim, bool Yetkili, string? Rol, string? Politika) YetkiDurumu(Type tip, MethodInfo aksiyon)
    {
        var anonim = aksiyon.GetCustomAttribute<AllowAnonymousAttribute>() != null
                  || tip.GetCustomAttribute<AllowAnonymousAttribute>() != null;

        var aksiyonYetki = aksiyon.GetCustomAttribute<AuthorizeAttribute>();
        var sinifYetki   = tip.GetCustomAttribute<AuthorizeAttribute>();
        var etkin = aksiyonYetki ?? sinifYetki;

        return (anonim, etkin != null, etkin?.Roles, etkin?.Policy);
    }

    [Fact]
    [Trait("Category", "Yetkilendirme")]
    public void Her_ucun_yetkilendirme_karari_acik_olmali()
    {
        var belirsizler = new List<string>();

        foreach (var (tip, aksiyon, ad) in TumAksiyonlar())
        {
            var (anonim, yetkili, _, _) = YetkiDurumu(tip, aksiyon);

            if (anonim)
            {
                if (!AnonimBeyazListe.Contains(ad))
                    belirsizler.Add($"{ad} → [AllowAnonymous] var ama beyaz listede DEĞİL");
                continue;
            }

            if (!yetkili)
                belirsizler.Add($"{ad} → ne [Authorize] ne [AllowAnonymous] var");
        }

        belirsizler.Should().BeEmpty(
            "her uç ya [Authorize(...)] ile korunmalı ya da [AllowAnonymous] + beyaz liste ile " +
            "bilinçli olarak açılmalı. Belirsiz uçlar:\n" + string.Join("\n", belirsizler));
    }

    [Fact]
    [Trait("Category", "Yetkilendirme")]
    public void Admin_gerektiren_uclar_rol_veya_politika_tasimali()
    {
        var eksikler = new List<string>();

        foreach (var (tip, aksiyon, ad) in TumAksiyonlar())
        {
            if (!AdminGerektirenler.Contains(ad)) continue;

            var (_, _, rol, politika) = YetkiDurumu(tip, aksiyon);
            var adminKapsiyor = (rol?.Contains("admin") ?? false) || politika == "AdminOnly";

            if (!adminKapsiyor)
                eksikler.Add($"{ad} → admin gerektiriyor ama Roles/Policy yok (Roles={rol}, Policy={politika})");
        }

        eksikler.Should().BeEmpty("admin uçları rol veya politika taşımalı:\n" + string.Join("\n", eksikler));
    }

    [Fact]
    [Trait("Category", "Yetkilendirme")]
    public void Beyaz_liste_gercekten_anonim_uclarla_eslesmeli()
    {
        // Beyaz listede olup artık anonim OLMAYAN uçlar temizlenmeli (liste çürümesin).
        var gercekAnonimler = TumAksiyonlar()
            .Where(x => YetkiDurumu(x.Controller, x.Action).Anonim)
            .Select(x => x.Ad)
            .ToHashSet();

        var hayaletler = AnonimBeyazListe.Except(gercekAnonimler).ToList();

        hayaletler.Should().BeEmpty(
            "beyaz listede olup artık anonim olmayan uçlar var, liste güncellenmeli: "
            + string.Join(", ", hayaletler));
    }
}
```

### B) Uçtan uca davranış testi

`EnglishReadingPlatform.Tests/ActivityYetkiTests.cs`:

```csharp
using System.Net;
using EnglishReadingPlatform.Tests.Infrastructure;
using FluentAssertions;
using Xunit;

namespace EnglishReadingPlatform.Tests;

[Collection("api")]
public class ActivityYetkiTests
{
    private readonly TestAppFactory _fabrika;
    public ActivityYetkiTests(TestAppFactory fabrika) => _fabrika = fabrika;

    [Fact]
    [Trait("Category", "Yetkilendirme")]
    public async Task Ogrenci_aktivite_istatistiklerini_GOREMEZ()
    {
        var client = _fabrika.CreateClient();
        var ogrenci = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(ogrenci.Token);

        var yanit = await client.GetAsync("/api/activity/stats");

        yanit.StatusCode.Should().Be(HttpStatusCode.Forbidden,
            "öğrenci tüm kullanıcıların aktivite akışını görmemeli");
    }

    [Fact]
    [Trait("Category", "Yetkilendirme")]
    public async Task Admin_aktivite_istatistiklerini_gorebilir()
    {
        var client = _fabrika.CreateClient();
        var admin = await AuthHelper.AdminOlarakGirisYapAsync(client);
        client.TokenIle(admin.Token);

        var yanit = await client.GetAsync("/api/activity/stats");

        yanit.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    [Trait("Category", "Yetkilendirme")]
    public async Task Tokensiz_istek_401_alir()
    {
        var client = _fabrika.CreateClient();
        var yanit = await client.GetAsync("/api/activity/stats");
        yanit.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Theory]
    [Trait("Category", "Yetkilendirme")]
    [InlineData("/api/books")]
    [InlineData("/api/books/words")]
    [InlineData("/api/groups")]
    [InlineData("/api/dashboard/stats")]
    [InlineData("/api/dashboard/ocr")]
    [InlineData("/api/admin/stats")]
    [InlineData("/api/admin/users")]
    [InlineData("/api/admin/books")]
    [InlineData("/api/admin/groups")]
    [InlineData("/api/feedback/list")]
    [InlineData("/api/auth/me")]
    public async Task Korumali_uclar_tokensiz_401_doner(string yol)
    {
        var client = _fabrika.CreateClient();
        var yanit = await client.GetAsync(yol);
        yanit.StatusCode.Should().Be(HttpStatusCode.Unauthorized, $"{yol} korumasız kalmamalı");
    }

    [Theory]
    [Trait("Category", "Yetkilendirme")]
    [InlineData("/api/admin/stats")]
    [InlineData("/api/admin/users")]
    [InlineData("/api/admin/books")]
    [InlineData("/api/admin/groups")]
    [InlineData("/api/feedback/list")]
    public async Task Admin_uclarina_ogrenci_erisemez(string yol)
    {
        var client = _fabrika.CreateClient();
        var ogrenci = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(ogrenci.Token);

        var yanit = await client.GetAsync(yol);

        yanit.StatusCode.Should().Be(HttpStatusCode.Forbidden, $"{yol} yalnızca admin'e açık olmalı");
    }

    [Fact]
    [Trait("Category", "Yetkilendirme")]
    public async Task Giris_ve_kayit_anonim_kalmali()
    {
        var client = _fabrika.CreateClient();

        // Yanlış şifreyle bile 401 gelmeli — 401 "kimlik doğrulanmadı" değil
        // "kimlik bilgileri hatalı" anlamında; önemli olan uca ERİŞİLEBİLMESİ.
        var yanit = await client.PostAsJsonAsync("/api/auth/login",
            new { email = "yok@yok.local", password = "yanlis" });

        yanit.StatusCode.Should().BeOneOf(HttpStatusCode.Unauthorized, HttpStatusCode.BadRequest);
        // 404 veya 405 gelirse uç fallback politikası tarafından kapatılmış demektir.
    }
}
```

### C) Guard script — `scripts/guard/03-yetkilendirme.sh`

```bash
#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
echo "[03] Varsayılan reddet — yetkilendirme"

# 1. FallbackPolicy tanımlı mı?
n=0; grep -q "FallbackPolicy" EnglishReadingPlatform/Program.cs || n=1
ihlal_bildir "FallbackPolicy tanımlı" "$n" "Program.cs içinde AddAuthorization → FallbackPolicy yok"

# 2. activity/stats admin politikası taşıyor mu?
n=0
grep -A2 'HttpGet("stats")' EnglishReadingPlatform/Controllers/ActivityController.cs \
  | grep -q 'AdminOnly' || n=1
ihlal_bildir "activity/stats AdminOnly" "$n" "ActivityController.GetStats admin korumasında değil"

# 3. Ertelenmiş güvenlik yorumu kaldı mı? (teknik borç işaretleri)
cikti="$(kodda_ara 'İleride admin kontrolü|ileride yetki|TODO.*yetki|FIXME.*auth' 'EnglishReadingPlatform/Controllers/*.cs')"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "ertelenmiş yetki yorumu" "$n" "$cikti"

# 4. AuthController'daki anonim uçlar açıkça işaretli mi?
n=0
grep -q "AllowAnonymous" EnglishReadingPlatform/Controllers/AuthController.cs || n=1
ihlal_bildir "anonim uçlar açık işaretli" "$n" "AuthController'da [AllowAnonymous] yok"

# 5. Sözleşme testi dosyası duruyor mu? (silinerek kapı devre dışı bırakılmasın)
n=0; [ -f "EnglishReadingPlatform.Tests/YetkilendirmeSozlesmesiTests.cs" ] || n=1
ihlal_bildir "sözleşme testi mevcut" "$n" "YetkilendirmeSozlesmesiTests.cs silinmiş"

guard_bitir
```

---

## Bitti kriteri

```bash
cd /Users/alihanfindikci/Desktop/ingilizceproje
docker compose up -d postgres

# 1) Sözleşme testleri — BEKLENEN: Başarısız: 0
dotnet test Linguza.sln --filter "Category=Yetkilendirme" --logger "console;verbosity=normal"
echo "çıkış kodu: $?"

# 2) Guard kapısı — BEKLENEN: TOPLAM İHLAL: 0
bash scripts/guard/03-yetkilendirme.sh; echo "çıkış kodu: $?"

# 3) Öznitelik taşımayan uç kaldı mı? — BEKLENEN: 0
#    (sözleşme testi bunu zaten yapıyor; bu, kaba bir çapraz kontrol)
dotnet test Linguza.sln --filter "FullyQualifiedName~Her_ucun_yetkilendirme_karari_acik_olmali" \
  2>&1 | grep -c "Başarılı!"

# 4) Ertelenmiş yetki yorumu — BEKLENEN: 0
grep -rn "İleride admin kontrolü" EnglishReadingPlatform/Controllers/ | wc -l

# 5) Tüm kapılar — BEKLENEN: TOPLAM İHLAL: 0
bash scripts/guard/run-all.sh; echo "çıkış kodu: $?"

# 6) Tüm test takımı hâlâ yeşil mi? (regresyon kontrolü)
dotnet test Linguza.sln --logger "console;verbosity=normal"
```

**Kabul koşulu:**

| # | Beklenen |
|---|---|
| 1 | `Başarısız: 0`, en az **20** test başarılı (`Theory` satırları dahil) |
| 2 | `TOPLAM İHLAL: 0`, çıkış kodu `0` |
| 3 | `1` |
| 4 | `0` |
| 5 | çıkış kodu `0` |
| 6 | `Başarısız: 0` — KURAL-01 ve KURAL-02 testleri bozulmamış |

---

## Mutasyon kontrolü (zorunlu)

```bash
# MUTASYON A — activity/stats korumasını kaldır
sed -i '' '/\[Authorize(Policy = "AdminOnly")\]/d' \
  EnglishReadingPlatform/Controllers/ActivityController.cs

dotnet test Linguza.sln --filter "Category=Yetkilendirme"
# BEKLENEN: Başarısız: ≥2
#   • Ogrenci_aktivite_istatistiklerini_GOREMEZ      → 200 geldi, 403 bekleniyordu (KIRMIZI)
#   • Admin_gerektiren_uclar_rol_veya_politika_tasimali → sözleşme ihlali (KIRMIZI)

bash scripts/guard/03-yetkilendirme.sh; echo "çıkış kodu: $?"   # BEKLENEN: 1

git checkout EnglishReadingPlatform/Controllers/ActivityController.cs
dotnet test Linguza.sln --filter "Category=Yetkilendirme"       # BEKLENEN: Başarısız: 0
```

```bash
# MUTASYON B — FallbackPolicy'yi kaldır, korumasız uç testi kırmızı olmalı
#   Not: Bu mutasyon yalnızca ÖZNİTELİKSİZ bir uç varsa etkili olur.
#   Bu yüzden geçici bir korumasız uç ekleyerek kapının çalıştığını kanıtla.

cat >> EnglishReadingPlatform/Controllers/ActivityController.cs.bak <<'EOF'
(yedek alındı)
EOF
cp EnglishReadingPlatform/Controllers/ActivityController.cs /tmp/ActivityController.cs.orig

# Öznitelik taşımayan yeni bir uç ekle (mutasyon)
python3 - <<'PY'
yol = "EnglishReadingPlatform/Controllers/ActivityController.cs"
kaynak = open(yol, encoding="utf-8").read()
mutasyon = '''
        // MUTASYON TESTİ — geçici, yetkilendirme öznitelği YOK
        [HttpGet("mutasyon-testi")]
        public IActionResult MutasyonTesti() => Ok(new { veri = "sizinti" });
'''
son = kaynak.rstrip().rfind("}")             # sınıf kapanışından önce ekle
son = kaynak.rstrip().rfind("}", 0, son)
open(yol, "w", encoding="utf-8").write(kaynak[:son] + mutasyon + kaynak[son:])
PY

dotnet test Linguza.sln --filter "FullyQualifiedName~Her_ucun_yetkilendirme_karari_acik_olmali"
# BEKLENEN: Başarısız: 1
#   "ActivityController.MutasyonTesti → ne [Authorize] ne [AllowAnonymous] var"

cp /tmp/ActivityController.cs.orig EnglishReadingPlatform/Controllers/ActivityController.cs
rm -f EnglishReadingPlatform/Controllers/ActivityController.cs.bak
dotnet test Linguza.sln --filter "Category=Yetkilendirme"       # BEKLENEN: Başarısız: 0
```

> **Mutasyon B neden önemli:** Sözleşme testinin *gelecekteki* uçları da yakaladığını
> kanıtlar. Sadece bugünkü ihlali düzeltmek yeterli değil — kapının **yeni ihlali**
> yakalaması gerekiyor. Bu, "önce merkezî çözüm" ilkesinin kanıtıdır.

---

## Geçiş planı

| Adım | İş | Etkilenen uç | Doğrulama |
|---|---|---|---|
| 1 | `Program.cs`'e `FallbackPolicy` ekle | 38 (hepsi) | derlenir |
| 2 | `AuthController.Login`/`Register` → `[AllowAnonymous]` | 2 | login testi geçer |
| 3 | `AuthController.Logout`/`Me` → `[Authorize]` | 2 | `/api/auth/me` tokensiz 401 |
| 4 | `Me()` gövdesindeki elle kontrolü `TryParse`'a çevir | 1 | derlenir |
| 5 | `ActivityController.GetStats` → `[Authorize(Policy="AdminOnly")]` + yorumu sil | 1 | öğrenci 403 alır |
| 6 | `Authorization/KullaniciExtensions.cs` ekle | — | derlenir |
| 7 | `YetkilendirmeSozlesmesiTests.cs` yaz | — | 3 test yeşil |
| 8 | `ActivityYetkiTests.cs` yaz | — | ~20 test yeşil |
| 9 | `scripts/guard/03-yetkilendirme.sh` + `chmod +x` | — | çıkış kodu 0 |
| 10 | **Frontend regresyon kontrolü** (aşağı bak) | — | elle |
| 11 | İlerleme tablosunu güncelle | — | — |

### Adım 10 — frontend regresyon kontrolü (elle, zorunlu)

`FallbackPolicy` eklendiği için daha önce sessizce geçen istekler artık 401 dönebilir.
Şu akışları elle dene:

```bash
./start-dev.sh
```

| Akış | Beklenen |
|---|---|
| `/login` sayfası açılıyor mu? | ✅ Açılmalı (anonim) |
| Giriş yapılabiliyor mu? | ✅ |
| Kayıt olunabiliyor mu? | ✅ |
| Çıkış yapılabiliyor mu? | ✅ (artık `[Authorize]`, geçerli token'la çalışır) |
| **Süresi dolmuş token'la çıkış** | 🟡 401 döner — `AuthContext.logout` hatayı yutuyor, kullanıcı yine `/login`'e gider |
| Yönetici paneli dashboard'u | ✅ Aktivite akışı görünmeli (admin token'ı var) |
| Yönetici paneline **öğrenci** tokenıyla girmeye çalış | ✅ 403 almalı |

---

## Tuzaklar

| Tuzak | Neden olur | Nasıl kaçınılır |
|---|---|---|
| **`FallbackPolicy` yerine `DefaultPolicy` yazmak** | `DefaultPolicy`, `[Authorize]` özniteliği **varken** hangi politikanın uygulanacağını belirler. Özniteliği olmayan uçları kapsamaz — yani hiçbir şey değişmez, kişi "yaptım" sanır | `FallbackPolicy` = özniteliksiz uçlar için. İkisi farklı şeydir |
| **`AuthController`'a `[AllowAnonymous]` eklemeyi unutmak** | Fallback devreye girer, giriş ucu 401 döner, **kimse giriş yapamaz** — canlıda tam kesinti | Adım 1 ve 2 **aynı commit'te** yapılmalı. Adım 2 olmadan deploy etmeyin |
| **Sınıfa `[AllowAnonymous]` koymak** | `AuthController`'ın tamamı anonim olur; `me` ve `logout` da açılır | Öznitelik **metot** seviyesinde konur |
| **403 yerine 401 beklemek** | Token geçerli ama rol yetersizse ASP.NET Core **403** döner, 401 değil. Test 401 beklerse yanlış yerde kırmızı olur | Tokensiz → 401, yanlış rol → 403. Testler bunu ayırıyor |
| **Beyaz listeyi "geçici" diye şişirmek** | Her yeni uç için beyaz listeye satır eklenir, kapı anlamsızlaşır | Beyaz liste bir **güvenlik kararıdır**; her satırın gerekçesi yorumda olmalı. `Beyaz_liste_gercekten_anonim_uclarla_eslesmeli` testi çürümeyi engelliyor |
| **Sözleşme testinin `DeclaredOnly` bayrağını unutmak** | `ControllerBase`'in miras alınan public metotları da taranır, yüzlerce sahte ihlal çıkar | `BindingFlags.DeclaredOnly` zorunlu |
| **`[Authorize]`'ı yetkilendirme sanmak** | "Giriş yapmış olmak" ≠ "bu kaydı görmeye hakkı olmak". `BooksController` sahiplik filtresini sorguda yapıyor; öznitelik bunu söylemiyor | Bu kural *açıklık* getirir; nesne sahipliği KURAL-08'in konusu. İkisi birlikte tamamlanır |
| **Minimal API uçlarını unutmak** | `app.MapGet(...)` ile eklenen uçlar controller taramasına girmez | Bu projede minimal API yok (`app.MapControllers()` tek eşleme). Eklenirse sözleşme testi **genişletilmelidir** — tuzağı burada not ettik |

---

## Teslim şablonu

```markdown
## 1. Kanıtlanarak kapandı
<6 bitti-kriteri komutunun ham çıktısı>
<mutasyon A ve B çıktıları — kırmızı → yeşil>
<özellikle: "Ogrenci_aktivite_istatistiklerini_GOREMEZ" testinin mutasyonda 200 döndüğü kanıtı>

## 2. Kapanmadı
<örn: nesne sahipliği kontrolleri hâlâ sorgu içinde dağınık — KURAL-08'e ait>

## 3. İnsan müdahalesi gerekiyor
- [ ] Frontend regresyon kontrolü (geçiş planı adım 10) — 7 akışı elle dene
- [ ] Canlı ortam varsa: adım 1 ve 2 aynı deploy'da gitmeli, ayrı gidersе giriş kesilir

## Değiştirilen dosyalar
<git diff --stat>

## Commit
<git log -1 --format='%H %s'>
```
