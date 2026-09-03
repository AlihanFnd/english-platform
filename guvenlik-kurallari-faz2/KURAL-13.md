# KURAL-13 — Köken ve kaynak denetimi

> **Ön koşul:** Faz 1 (KURAL-01…12) kapalı olmalı.
> **Bu, faz 2'nin ilk kuralıdır ve en yüksek etkili olanıdır.**

---

## Kural metni

> **API'ye kimin tarayıcı üzerinden erişebileceği, tek bir beyaz listeden okunacak.**
> Hiçbir yerde "her kökene izin ver" ifadesi bulunmayacak; kimlik bilgisi taşıyan
> (`AllowCredentials`) bir politika **asla** joker kökenle birleşmeyecek.
> Kabul edilen kökenler ve kabul edilen `Host` başlıkları aynı yapılandırma
> kaynağından gelecek ve otomatik bir kapı bunu her derlemede denetleyecek.

---

## Envanter

Ölçüm tarihi: **2026-09-02**, commit `03b8adc`.

### İhlal 1 — CORS her kökene, üstelik kimlik bilgisiyle açık 🔴

```
$ grep -n "AddCors" -A9 EnglishReadingPlatform/Program.cs
284:builder.Services.AddCors(opt =>
285-    opt.AddDefaultPolicy(policy =>
286-        policy
287-            .SetIsOriginAllowed(origin => true)      ← HER KÖKEN
288-            .AllowAnyHeader()
289-            .AllowAnyMethod()
290-            .AllowCredentials()));                   ← + KİMLİK BİLGİSİ

$ grep -n "app.UseCors" EnglishReadingPlatform/Program.cs
364:app.UseCors();
```

Bu, CORS'un **en kötü yapılandırmasıdır**. `AllowCredentials()` ile birlikte
joker köken, spesifikasyonun açıkça yasakladığı bileşimdir —
`.AllowAnyOrigin()` kullanılsaydı ASP.NET Core çalışma zamanında **istisna
fırlatırdı**. `SetIsOriginAllowed(origin => true)` aynı sonucu üretir ama
o kontrolü **atlatır**: istek yapan kökenin kendisi `Access-Control-Allow-Origin`
başlığına yansıtılır ve `Access-Control-Allow-Credentials: true` ile birlikte döner.

### İhlal 2 — Yapılandırma var, okunmuyor 🔴

```
$ grep -rn "CorsOrigins" EnglishReadingPlatform --include="*.cs" | grep -v Migrations
(çıktı yok)

$ grep -n "CorsOrigins" EnglishReadingPlatform.Tests/Infrastructure/TestAppFactory.cs
95:        Environment.SetEnvironmentVariable("CorsOrigins", "http://localhost:3000");
114:                ["CorsOrigins"]  = "http://localhost:3000",

$ grep -n "CorsOrigins\|CORS" .env.example
(çıktı yok)
```

`CorsOrigins` ayarı **testlerde tanımlanıyor ama üretim kodunda hiç okunmuyor.**
Yani biri bir noktada doğru şeyi yapmaya başlamış, yarım kalmış. Testlerin bu
değeri tanımlaması, ayarın işe yaradığı yanılsamasını üretiyor.

### İhlal 3 — `AllowedHosts` joker 🟠

```
$ grep -n "AllowedHosts" EnglishReadingPlatform/appsettings*.json
appsettings.json:23:  "AllowedHosts": "*",
```

`Host` başlığı doğrulanmıyor. Render'ın proxy'si arkasında doğrudan etki sınırlı,
ama **mutlak URL üreten her yer** (şifre sıfırlama bağlantısı — KURAL-14'ün konusu)
Host zehirlenmesine açıktır: saldırgan `Host: kotu.example` gönderir, sıfırlama
bağlantısı kendi alan adına üretilir.

### İhlal 4 — Hiçbir kapı CORS'a bakmıyor 🔴

```
$ grep -rln "Cors\|SetIsOriginAllowed\|AllowedHosts" scripts/guard/
(çıktı yok)
```

Faz 1'in 12 kapısının **hiçbiri** kökene bakmıyor. KURAL-11 "tarayıcı tarafı
savunma" başlığını taşımasına rağmen CSP/HSTS/başlıklarla sınırlı kaldı.
Bu yüzden ihlal 1, on iki kural boyunca fark edilmedi.

### Bugün neden hesap ele geçirilmiyor?

Dürüst olalım: **tek bir ayar** engelliyor.

```
$ grep -n "SameSite" EnglishReadingPlatform/Controllers/AuthController.cs
157:                SameSite = SameSiteMode.Lax,
211:                SameSite = SameSiteMode.Lax,
```

`SameSite=Lax`, çerezi siteler arası `fetch`/XHR isteklerinde göndermez.
Bearer token da `localStorage`'da olduğu için başka kökenden okunamaz.
Yani bugün sömürü zinciri **kapalı** — ama savunma CORS'tan değil, çerezin
`SameSite` ayarından geliyor. O ayar `None`'a çekildiği gün (üçüncü taraf gömme,
farklı alt alan adı, mobil webview senaryosu) **aradaki tek engel kalkar.**

> Bir güvenlik kontrolünün işlevini başka bir kontrolün yan etkisine bırakmak,
> o kontrolün olmaması demektir.

### Özet

| # | İhlal | Nokta |
|---|---|---|
| 1 | Joker köken + kimlik bilgisi | 1 (Program.cs:284-290) |
| 2 | `CorsOrigins` okunmuyor | 1 yapılandırma, 2 test referansı |
| 3 | `AllowedHosts: "*"` | 1 |
| 4 | Kapı yok | 0 kapı |
| | **TOPLAM** | **3 kod noktası + 1 eksik kapı** |

---

## Merkezî uygulama

### 1. Tek kaynak — `Configuration/GuvenilirKokenler.cs`

```csharp
namespace EnglishReadingPlatform.Configuration;

/// <summary>
/// KURAL-13: Tarayıcıdan gelen isteklerde kabul edilen KÖKEN listesi.
///
/// Neden tek sınıf: köken listesi hem CORS politikasında hem AllowedHosts'ta
/// gerekiyor. İki yerde ayrı ayrı yazılırsa biri güncellenir, diğeri unutulur —
/// ve "unutulan" taraf her zaman gevşek olandır.
///
/// Kaynak: CorsOrigins yapılandırması (virgülle ayrılmış tam kökenler).
/// Örnek:  CorsOrigins=https://linguza.vercel.app,https://admin.linguza.app
/// </summary>
public static class GuvenilirKokenler
{
    public const string Anahtar = "CorsOrigins";

    /// <summary>Geliştirmede varsayılan — üretimde ASLA kullanılmaz.</summary>
    private static readonly string[] GelistirmeKokenleri =
    {
        "http://localhost:3000",
        "http://localhost:3001",
    };

    /// <summary>
    /// Yapılandırmadan kökenleri okur.
    ///
    /// ÜRETİMDE BOŞSA İSTİSNA FIRLATIR. Sessizce "hepsine izin ver"e ya da
    /// sessizce "hiçbirine izin verme"ye düşmek, iki farklı biçimde yanıltıcıdır:
    /// birincisi açığı geri getirir, ikincisi uygulamayı sebebi anlaşılmadan bozar.
    /// </summary>
    public static string[] Oku(IConfiguration yapilandirma, IHostEnvironment ortam)
    {
        var ham = yapilandirma[Anahtar];

        if (string.IsNullOrWhiteSpace(ham))
        {
            if (ortam.IsDevelopment()) return GelistirmeKokenleri;

            throw new InvalidOperationException(
                $"{Anahtar} tanımlı değil. Üretimde tarayıcı kökenleri açıkça " +
                "listelenmelidir. Ortam değişkeni: CorsOrigins " +
                "(virgülle ayrılmış, ör. https://linguza.vercel.app,https://admin.linguza.app)");
        }

        var kokenler = ham
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(k => k.TrimEnd('/'))          // "https://x.app/" ile "https://x.app" aynı köken
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        // Joker kökenin yapılandırmadan sızmasını engelle: "*" yazıp
        // AllowCredentials ile birleştirmek tam olarak kapattığımız açıktır.
        var joker = kokenler.FirstOrDefault(k => k == "*" || k.Contains('*'));
        if (joker is not null)
            throw new InvalidOperationException(
                $"{Anahtar} joker değer içeriyor ('{joker}'). Kimlik bilgisi taşıyan " +
                "bir CORS politikası joker kökenle birleştirilemez. Kökenleri tek tek yazın.");

        foreach (var k in kokenler)
        {
            if (!Uri.TryCreate(k, UriKind.Absolute, out var uri))
                throw new InvalidOperationException($"{Anahtar} geçersiz köken içeriyor: '{k}'");

            if (uri.Scheme != Uri.UriSchemeHttps && !ortam.IsDevelopment())
                throw new InvalidOperationException(
                    $"{Anahtar} üretimde http köken içeremez: '{k}'");
        }

        return kokenler;
    }

    /// <summary>
    /// Kökenlerin ana bilgisayar adları — AllowedHosts için.
    /// API kendi alan adından da çağrılabildiği için o da eklenmelidir;
    /// PublicHost yapılandırmasıyla verilir.
    /// </summary>
    public static string[] AnaBilgisayarlar(string[] kokenler, string? apiAnaBilgisayari)
        => kokenler
            .Select(k => new Uri(k).Host)
            .Concat(string.IsNullOrWhiteSpace(apiAnaBilgisayari)
                ? Array.Empty<string>()
                : new[] { apiAnaBilgisayari })
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
}
```

### 2. `Program.cs` — CORS politikası

```csharp
// ─── KURAL-13: köken beyaz listesi ────────────────────────────
// SetIsOriginAllowed(origin => true) BURADAN KALDIRILDI.
// O ifade, ASP.NET Core'un "AllowAnyOrigin + AllowCredentials" için attığı
// çalışma zamanı istisnasını ATLATIYORDU: sonuç aynı, uyarı yok.
var guvenilirKokenler = GuvenilirKokenler.Oku(builder.Configuration, builder.Environment);

builder.Services.AddCors(opt =>
    opt.AddDefaultPolicy(policy => policy
        .WithOrigins(guvenilirKokenler)
        .AllowAnyHeader()
        .AllowAnyMethod()
        .AllowCredentials()
        // Tarayıcı ön-uçuş (preflight) sonucunu 10 dakika saklasın:
        // her yazma isteğinden önce ikinci bir tur atmasın.
        .SetPreflightMaxAge(TimeSpan.FromMinutes(10))));
```

### 3. `Program.cs` — `AllowedHosts`

```csharp
// ─── KURAL-13: Host başlığı doğrulaması ───────────────────────
// Mutlak URL üreten her yer (şifre sıfırlama bağlantısı) Host'a güvenir.
// Joker bırakılırsa saldırgan Host: kotu.example gönderip bağlantıyı
// kendi alan adına ürettirebilir.
if (!builder.Environment.IsDevelopment())
{
    var izinliHostlar = GuvenilirKokenler.AnaBilgisayarlar(
        guvenilirKokenler, builder.Configuration["PublicHost"]);

    builder.Services.Configure<HostFilteringOptions>(o =>
    {
        o.AllowedHosts = izinliHostlar;
        o.AllowEmptyHosts = false;
    });
}
```

Ve `appsettings.json`'daki `"AllowedHosts": "*"` satırı **silinir**
(değer artık koddan geliyor; iki kaynak bırakmak faz 1'in tekrar tekrar
düzelttiği hatadır).

### 4. `.env.example` güncellenir

```
# KURAL-13: tarayıcıdan API'ye erişebilecek kökenler (virgülle ayrılmış).
# Üretimde ZORUNLU — tanımsızsa uygulama başlamaz.
CorsOrigins=https://linguza.vercel.app,https://linguza-admin.vercel.app
# API'nin kendi alan adı (Host başlığı doğrulaması için)
PublicHost=linguza-api.onrender.com
```

---

## Otomatik kapı

### A) Sözleşme testi — `KokenSozlesmesiTests.cs`

```csharp
using System.Net;
using System.Net.Http.Headers;
using EnglishReadingPlatform.Configuration;
using EnglishReadingPlatform.Tests.Infrastructure;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace EnglishReadingPlatform.Tests;

[Collection("api")]
public class KokenSozlesmesiTests
{
    private readonly TestAppFactory _fabrika;
    public KokenSozlesmesiTests(TestAppFactory fabrika) => _fabrika = fabrika;

    /// <summary>
    /// ANA REGRESYON: yabancı bir köken, kimlik bilgisi taşıyan bir CORS
    /// yanıtı ALMAMALI. Bu test kırmızıysa herhangi bir web sitesi API'ye
    /// kullanıcı adına istek atıp yanıtı okuyabilir.
    /// </summary>
    [Fact]
    [Trait("Category", "Koken")]
    public async Task Yabanci_koken_CORS_izni_ALAMAZ()
    {
        var client = _fabrika.CreateClient();

        using var istek = new HttpRequestMessage(HttpMethod.Options, "/api/books");
        istek.Headers.Add("Origin", "https://kotu-site.example");
        istek.Headers.Add("Access-Control-Request-Method", "GET");

        var yanit = await client.SendAsync(istek);

        yanit.Headers.Contains("Access-Control-Allow-Origin").Should().BeFalse(
            "yabancı kökene Access-Control-Allow-Origin verilmemeli");
    }

    [Fact]
    [Trait("Category", "Koken")]
    public async Task Yabanci_kokene_kimlik_bilgisi_izni_VERILMEZ()
    {
        var client = _fabrika.CreateClient();

        using var istek = new HttpRequestMessage(HttpMethod.Options, "/api/books");
        istek.Headers.Add("Origin", "https://kotu-site.example");
        istek.Headers.Add("Access-Control-Request-Method", "POST");

        var yanit = await client.SendAsync(istek);

        yanit.Headers.Contains("Access-Control-Allow-Credentials").Should().BeFalse(
            "kimlik bilgisi izni yalnızca beyaz listedeki kökene verilir");
    }

    /// <summary>
    /// TUZAK KONTROLÜ: "her kökeni reddet" de bir hatadır ve yukarıdaki iki
    /// testi yeşil bırakır. Bu test, beyaz listedeki kökenin GERÇEKTEN
    /// çalıştığını kanıtlar — aksi hâlde istemciler sessizce kırılır.
    /// </summary>
    [Fact]
    [Trait("Category", "Koken")]
    public async Task Beyaz_listedeki_koken_izin_ALIR()
    {
        var client = _fabrika.CreateClient();

        using var istek = new HttpRequestMessage(HttpMethod.Options, "/api/books");
        istek.Headers.Add("Origin", "http://localhost:3000");   // TestAppFactory'nin verdiği
        istek.Headers.Add("Access-Control-Request-Method", "GET");

        var yanit = await client.SendAsync(istek);

        yanit.Headers.GetValues("Access-Control-Allow-Origin")
            .Should().ContainSingle().Which.Should().Be("http://localhost:3000");
        yanit.Headers.GetValues("Access-Control-Allow-Credentials")
            .Should().ContainSingle().Which.Should().Be("true");
    }

    [Fact]
    [Trait("Category", "Koken")]
    public void Uretimde_koken_listesi_bos_birakILAMAZ()
    {
        var yapilandirma = new ConfigurationBuilder().Build();     // boş
        var ortam = new SahteOrtam("Production");

        var eylem = () => GuvenilirKokenler.Oku(yapilandirma, ortam);

        eylem.Should().Throw<InvalidOperationException>()
            .WithMessage("*CorsOrigins*");
    }

    [Fact]
    [Trait("Category", "Koken")]
    public void Joker_koken_yapilandirmadan_da_GECEMEZ()
    {
        var yapilandirma = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["CorsOrigins"] = "*" })
            .Build();

        var eylem = () => GuvenilirKokenler.Oku(yapilandirma, new SahteOrtam("Production"));

        eylem.Should().Throw<InvalidOperationException>().WithMessage("*joker*");
    }

    [Fact]
    [Trait("Category", "Koken")]
    public void Uretimde_http_koken_KABUL_EDILMEZ()
    {
        var yapilandirma = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
                { ["CorsOrigins"] = "http://linguza.example" })
            .Build();

        var eylem = () => GuvenilirKokenler.Oku(yapilandirma, new SahteOrtam("Production"));

        eylem.Should().Throw<InvalidOperationException>().WithMessage("*http*");
    }

    private sealed class SahteOrtam : IHostEnvironment
    {
        public SahteOrtam(string ad) => EnvironmentName = ad;
        public string EnvironmentName { get; set; }
        public string ApplicationName { get; set; } = "test";
        public string ContentRootPath { get; set; } = ".";
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } = null!;
    }
}
```

### B) Guard script — `scripts/guard/13-koken.sh`

```bash
#!/usr/bin/env bash
# KURAL-13 — köken ve kaynak denetimi kapısı.
#
# TASARIM NOTU (faz 1 dersi 1): bu kapı "doğru satır var mı" diye değil,
# "yasak satır YOK mu" diye sorar. Yasağı aramak, yorumla kandırılmaya
# daha dirençlidir — çünkü yorum satırları ayıklanarak taranıyor.
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
echo "[13] Köken ve kaynak denetimi"

KOD="$(grep -v '^[[:space:]]*//' EnglishReadingPlatform/Program.cs)"

# 1. Joker köken ifadesi kodda var mı?
cikti="$(printf '%s' "$KOD" | grep -nE 'SetIsOriginAllowed|AllowAnyOrigin' || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "joker köken ifadesi" "$n" "$cikti"

# 2. Köken listesi merkezî kaynaktan okunuyor mu?
n=0
printf '%s' "$KOD" | grep -q 'GuvenilirKokenler.Oku' || n=1
ihlal_bildir "köken listesi merkezden okunuyor" "$n" \
  "Program.cs GuvenilirKokenler.Oku çağırmıyor — liste elle yazılmış olabilir"

# 3. WithOrigins gerçekten kullanılıyor mu?
n=0
printf '%s' "$KOD" | grep -q 'WithOrigins(' || n=1
ihlal_bildir "CORS beyaz listesi bağlı" "$n" "WithOrigins çağrısı yok"

# 4. appsettings'te joker AllowedHosts kaldı mı?
cikti="$(grep -n '"AllowedHosts"[[:space:]]*:[[:space:]]*"\*"' \
         EnglishReadingPlatform/appsettings*.json 2>/dev/null || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "joker AllowedHosts" "$n" "$cikti"

# 5. .env.example köken anahtarını belgeliyor mu?
n=0; grep -q '^CorsOrigins=' .env.example || n=1
ihlal_bildir ".env.example CorsOrigins içeriyor" "$n" \
  "yeni bir ortam kuran kişi bu değeri bilemez"

# 6. Sözleşme testi duruyor mu?
n=0; [ -f EnglishReadingPlatform.Tests/KokenSozlesmesiTests.cs ] || n=1
ihlal_bildir "köken sözleşme testi mevcut" "$n" "KokenSozlesmesiTests.cs silinmiş"

guard_bitir
```

---

## Bitti kriteri

```bash
cd /Users/alihanfindikci/Desktop/ingilizceproje
docker compose up -d postgres

# 1) Testler — BEKLENEN: Başarısız: 0, Başarılı: 6
dotnet test Linguza.sln --filter "Category=Koken" --logger "console;verbosity=normal"
echo "çıkış kodu: $?"

# 2) Guard kapısı — BEKLENEN: TOPLAM İHLAL: 0
bash scripts/guard/13-koken.sh; echo "çıkış kodu: $?"

# 3) Joker köken ifadesi kodda kalmadı — BEKLENEN: 0
grep -c "SetIsOriginAllowed\|AllowAnyOrigin" EnglishReadingPlatform/Program.cs || echo 0

# 4) Joker AllowedHosts kalmadı — BEKLENEN: 0
grep -c '"AllowedHosts": "\*"' EnglishReadingPlatform/appsettings.json || echo 0

# 5) Yabancı kökene izin verilmiyor (canlı sunucu ile) — BEKLENEN: başlık YOK
#    Uygulama ayaktayken:
curl -s -I -X OPTIONS http://localhost:5001/api/books \
  -H "Origin: https://kotu-site.example" \
  -H "Access-Control-Request-Method: GET" | grep -i "access-control-allow-origin" \
  || echo "Access-Control-Allow-Origin dönmedi ✓"

# 6) Beyaz listedeki köken izin ALIYOR — BEKLENEN: başlık VAR
curl -s -I -X OPTIONS http://localhost:5001/api/books \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: GET" | grep -i "access-control-allow-origin"

# 7) TÜM kapılar (faz 1 dâhil) — BEKLENEN: TOPLAM İHLAL: 0
bash scripts/guard/run-all.sh; echo "çıkış kodu: $?"

# 8) TÜM test takımı — faz 1 regresyonu var mı
dotnet test Linguza.sln --logger "console;verbosity=normal"
```

---

## Mutasyon kontrolü (zorunlu)

```bash
# MUTASYON A — joker kökeni geri getir
python3 - <<'PY'
yol = "EnglishReadingPlatform/Program.cs"
k = open(yol, encoding="utf-8").read()
k = k.replace(".WithOrigins(guvenilirKokenler)",
              ".SetIsOriginAllowed(origin => true)   // MUTASYON A")
open(yol, "w", encoding="utf-8").write(k)
PY
grep -c "MUTASYON A" EnglishReadingPlatform/Program.cs     # BEKLENEN: 1 (uygulandı mı?)

dotnet test Linguza.sln --filter "FullyQualifiedName~Yabanci_koken_CORS_izni"
# BEKLENEN: Başarısız: 1 — yabancı kökene Access-Control-Allow-Origin döndü
bash scripts/guard/13-koken.sh; echo "çıkış kodu: $?"     # BEKLENEN: 1

git checkout EnglishReadingPlatform/Program.cs
```

```bash
# MUTASYON B — "her şeyi reddet" hatası da yakalanıyor mu?
# (Beyaz listeyi boşaltmak, A'daki iki testi YEŞİL bırakır ama istemcileri kırar.)
python3 - <<'PY'
yol = "EnglishReadingPlatform/Program.cs"
k = open(yol, encoding="utf-8").read()
k = k.replace(".WithOrigins(guvenilirKokenler)",
              ".WithOrigins(System.Array.Empty<string>())   // MUTASYON B")
open(yol, "w", encoding="utf-8").write(k)
PY
grep -c "MUTASYON B" EnglishReadingPlatform/Program.cs     # BEKLENEN: 1

dotnet test Linguza.sln --filter "FullyQualifiedName~Beyaz_listedeki_koken_izin_ALIR"
# BEKLENEN: Başarısız: 1
#   ← Bu mutasyon, kuralın "kapat" değil "DOĞRU KAPAT" olduğunu kanıtlar

git checkout EnglishReadingPlatform/Program.cs
```

```bash
# MUTASYON C — yapılandırma doğrulamasını gevşet
python3 - <<'PY'
yol = "EnglishReadingPlatform/Configuration/GuvenilirKokenler.cs"
k = open(yol, encoding="utf-8").read()
k = k.replace('if (joker is not null)', 'if (false)   // MUTASYON C')
open(yol, "w", encoding="utf-8").write(k)
PY
grep -c "MUTASYON C" EnglishReadingPlatform/Configuration/GuvenilirKokenler.cs   # BEKLENEN: 1

dotnet test Linguza.sln --filter "FullyQualifiedName~Joker_koken_yapilandirmadan"
# BEKLENEN: Başarısız: 1

git checkout EnglishReadingPlatform/Configuration/GuvenilirKokenler.cs
dotnet test Linguza.sln --filter "Category=Koken"          # BEKLENEN: Başarısız: 0
```

---

## Geçiş planı

| Adım | İş | Nokta | Doğrulama |
|---|---|---|---|
| 1 | `Configuration/GuvenilirKokenler.cs` yaz | 1 | derlenir |
| 2 | `Program.cs` CORS bloğunu beyaz listeye bağla | 1 | derlenir |
| 3 | `Program.cs` `HostFilteringOptions` ekle | 1 | derlenir |
| 4 | `appsettings.json`'dan `"AllowedHosts": "*"` sil | 1 | guard 4 → 0 |
| 5 | `.env.example`'a `CorsOrigins` ve `PublicHost` ekle | 1 | guard 5 → 0 |
| 6 | `.env`'e yerel değerleri yaz | — | uygulama açılır |
| 7 | `TestAppFactory` zaten `CorsOrigins` veriyor — **değiştirme** | 0 | testler geçer |
| 8 | `KokenSozlesmesiTests.cs` yaz | — | 6 test yeşil |
| 9 | `scripts/guard/13-koken.sh` + `chmod +x` | — | çıkış kodu 0 |
| 10 | Her iki istemcide uçtan uca dene (giriş + kitap açma) | — | tarayıcıda çalışır |
| 11 | `docs/07-GUVENLIK.md` ve `docs/01-MIMARI.md` güncelle | — | — |
| 12 | İlerleme tablosunu işaretle | — | — |

### Adım 6 — yerel `.env` değerleri

```
CorsOrigins=http://localhost:3000,http://localhost:3001
PublicHost=localhost
```

> Geliştirmede `GuvenilirKokenler` zaten bu ikisine düşüyor; yine de açıkça
> yazmak, "üretimde tanımlamayı unutma" refleksini yerleştirir.

---

## Tuzaklar

| Tuzak | Neden olur | Nasıl kaçınılır |
|---|---|---|
| **`AllowAnyOrigin()` ile düzeltmeye çalışmak** | `AllowCredentials()` ile birlikte ASP.NET Core çalışma zamanında istisna fırlatır; uygulama ilk istekte ölür | `WithOrigins(...)` kullan |
| **Sondaki eğik çizgi** | `https://x.app/` ile `https://x.app` **farklı köken** sayılır; istemci sessizce CORS hatası alır | `TrimEnd('/')` merkezde yapılıyor |
| **Vercel önizleme (preview) dağıtımlarını unutmak** | Her PR farklı bir `*.vercel.app` alt alan adı üretir; beyaz liste onları kapsamaz ve önizlemeler kırılır | Önizleme gerekiyorsa ayrı bir ortam değişkeniyle ekle — joker **ekleme** |
| **`AllowedHosts`'u koda alıp `appsettings`'te bırakmak** | İki kaynak; biri güncellenir diğeri unutulur | `appsettings` satırı silinir |
| **Testin yalnızca "reddediyor mu" diye bakması** | Beyaz listeyi boşaltmak testi yeşil bırakır ama üretimi kırar | `Beyaz_listedeki_koken_izin_ALIR` testi zorunlu (MUTASYON B) |
| **Yalnızca `OPTIONS` denemesi** | Basit istekler (`GET`) ön-uçuş yapmaz; yanıt başlığı asıl istekte de kontrol edilmeli | Bitti kriteri 5–6 hem OPTIONS hem gerçek istekle çalıştırılır |
| **Geliştirmede fark etmemek** | `IsDevelopment()` dalı `localhost`'a izin veriyor; hata yalnızca üretimde çıkar | Sözleşme testi `Production` ortamını sahte nesneyle sınıyor |

---

## Teslim şablonu

```markdown
## 1. Kanıtlanarak kapandı
<8 bitti-kriteri komutunun ham çıktısı>
<MUTASYON A, B, C çıktıları — üçü de kırmızı, sonra geri alındı>
<tarayıcıda uçtan uca deneme: giriş yapıldı, kitap açıldı>

## 2. Kapanmadı
- Vercel önizleme dağıtımları beyaz listede değil (karar gerekiyorsa yaz)
- Token hâlâ localStorage'da (00 madde 4 kararı)

## 3. İnsan müdahalesi gerekiyor
- [ ] Render'da `CorsOrigins` ve `PublicHost` tanımlandı mı?
- [ ] Gerçek alan adları neler? (Vercel proje adları)
- [ ] Canlıda yabancı kökenle `curl` denemesi yapıldı mı?

## Değiştirilen dosyalar
<git diff --stat>

## Commit
<git log -1 --format='%H %s'>
```
