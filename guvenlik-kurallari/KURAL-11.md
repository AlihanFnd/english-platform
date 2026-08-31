# KURAL-11 — Tarayıcı tarafı savunma

> **Ön koşul:** KURAL-01 tamamlanmış olmalı.

---

## Kural metni

> **Sunucu, tarayıcıya kendini nasıl koruyacağını söyleyecek.**
> Her yanıt güvenlik başlıklarını taşıyacak: içerik kaynağı politikası (CSP), MIME
> türü sabitleme, çerçeveleme engeli, referans politikası. Üretimde HTTPS zorunlu
> olacak. Üçüncü taraf kod CDN'den değil paketten gelecek. İstemci uygulamalarının
> derleme kapıları (tip kontrolü, lint) **açık** olacak.

---

## Envanter

Ölçüm tarihi: **2026-08-20**, commit `d2cfc0f`.

### İhlal 1 — Sıfır güvenlik başlığı 🔴

```
$ grep -rn "UseHsts\|UseHttpsRedirection\|X-Frame-Options\|Content-Security-Policy\|X-Content-Type\|Referrer-Policy" EnglishReadingPlatform/Program.cs
HİÇ YOK — 0 güvenlik başlığı
```

| Başlık | Durum | Eksikliğin sonucu |
|---|---|---|
| `Content-Security-Policy` | ❌ | XSS için hiçbir ikinci savunma hattı yok |
| `X-Content-Type-Options: nosniff` | ❌ | Tarayıcı MIME türü tahmin eder; yüklenen içerik script olarak yorumlanabilir |
| `X-Frame-Options` / `frame-ancestors` | ❌ | Clickjacking: site bir iframe'e gömülebilir |
| `Referrer-Policy` | ❌ | Tam URL (token içerebilir) dış sitelere sızabilir |
| `Permissions-Policy` | ❌ | Kamera/mikrofon izinleri kısıtlanmamış |
| `Strict-Transport-Security` | ❌ | HTTPS zorlanmıyor |

`app.UseHttpsRedirection()` de yok — TLS sonlandırma tamamen ters proxy'ye bırakılmış.

### İhlal 2 — CDN'den SRI'sız script (yönetici panelinde) 🟠

```
$ grep -rn "cdnjs\|unpkg\|jsdelivr" frontend/app admin-panel/app
admin-panel/app/books/page.tsx:123:    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js";
admin-panel/app/books/page.tsx:128:    window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";
```

`integrity` (SRI) ve `crossorigin` yok. CDN ele geçirilirse **yönetici oturumu içinde
keyfi JavaScript** çalışır → `admin_token` doğrudan çalınır.

### İhlal 3 — Token `localStorage`'da: 17 nokta 🟡

```
$ grep -rn "localStorage" frontend/app admin-panel/app | wc -l
      17
```

| Dosya | Anahtar |
|---|---|
| `frontend/app/api.ts:115`, `context/AuthContext.tsx` (×5) | `token` |
| `admin-panel/app/page.tsx:36-37`, 4 sayfa | `admin_token`, `admin_user` |
| `frontend/app/context/ThemeContext.tsx` | `linguist_theme` (hassas değil) |
| `frontend/app/layout-wrapper.tsx` | `welcome_tour_seen` (hassas değil) |

XSS varsa token doğrudan okunabilir. HttpOnly cookie zaten mevcut ama istemciler
kullanmıyor. **Bu kural tam geçişi yapmaz** (mimari değişiklik); CSP ile XSS riskini
azaltır ve tam geçişi teknik borç olarak kaydeder.

### İhlal 4 — `localStorage.clear()` aşırı geniş 🟡

```
$ grep -n "localStorage.clear()" admin-panel/app/components/AdminLayout.tsx
84:            onClick={() => { localStorage.clear(); router.replace("/"); }}
```

Aynı origin'deki tüm veriyi siler.

### İhlal 5 — Yönetici panelinde derleme kapıları kapalı 🔴

```
$ cat admin-panel/next.config.mjs
const nextConfig = {
  output: 'standalone',
  eslint:     { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};
```

Tip hataları ve lint uyarıları build'i durdurmuyor — bozuk kod üretime çıkabiliyor.
`frontend/next.config.ts` **temiz** ✅.

### Özet

| # | İhlal | Nokta |
|---|---|---|
| 1 | Güvenlik başlığı yok | 6 başlık |
| 2 | CDN + SRI yok | 2 |
| 3 | Token localStorage'da | 15 (hassas) |
| 4 | `localStorage.clear()` | 1 |
| 5 | Derleme kapıları kapalı | 2 |
| | **TOPLAM** | **26** |

---

## Merkezî uygulama

### 1. Güvenlik başlıkları middleware'i — `Middleware/GuvenlikBasliklariMiddleware.cs`

```csharp
namespace EnglishReadingPlatform.Middleware;

/// <summary>
/// KURAL-11: Her yanıta güvenlik başlıklarını ekler.
/// Başlık listesi TEK yerde; yeni bir uç eklendiğinde otomatik kapsanır.
/// </summary>
public class GuvenlikBasliklariMiddleware
{
    private readonly RequestDelegate _sonraki;
    private readonly IHostEnvironment _ortam;

    public GuvenlikBasliklariMiddleware(RequestDelegate sonraki, IHostEnvironment ortam)
    {
        _sonraki = sonraki; _ortam = ortam;
    }

    public async Task InvokeAsync(HttpContext ctx)
    {
        var basliklar = ctx.Response.Headers;

        // Başlıklar yanıt yazılmadan ÖNCE eklenmeli.
        ctx.Response.OnStarting(() =>
        {
            // MIME türü tahminini kapat — yüklenen içerik script olarak yorumlanamaz
            basliklar["X-Content-Type-Options"] = "nosniff";

            // Clickjacking: bu API hiçbir çerçeveye gömülmemeli
            basliklar["X-Frame-Options"] = "DENY";

            // Referans bilgisini dış sitelere sızdırma
            basliklar["Referrer-Policy"] = "strict-origin-when-cross-origin";

            // Tarayıcı özelliklerini kapat (bu bir API; hiçbirine ihtiyacı yok)
            basliklar["Permissions-Policy"] =
                "camera=(), microphone=(), geolocation=(), payment=(), usb=()";

            // API yanıtları için en katı CSP: hiçbir kaynak yüklenmesin, çerçevelenmesin.
            // (HTML sunulmuyor; Views/ ölü kod — bkz. docs/00-GENEL-BAKIS.md)
            basliklar["Content-Security-Policy"] =
                "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

            // Kimlik doğrulaması gerektiren yanıtlar önbelleğe alınmasın
            if (ctx.User?.Identity?.IsAuthenticated == true)
            {
                basliklar["Cache-Control"] = "no-store, no-cache, must-revalidate";
                basliklar["Pragma"] = "no-cache";
            }

            // Sunucu parmak izini kaldır
            basliklar.Remove("Server");
            basliklar.Remove("X-Powered-By");

            return Task.CompletedTask;
        });

        await _sonraki(ctx);
    }
}

public static class GuvenlikBasliklariUzantilari
{
    public static IApplicationBuilder GuvenlikBasliklariniKullan(this IApplicationBuilder app)
        => app.UseMiddleware<GuvenlikBasliklariMiddleware>();
}
```

### 2. `Program.cs` — HTTPS ve başlık zinciri

```csharp
var app = builder.Build();

app.HataYakalamayiKullan();          // KURAL-06 — en başta
app.GuvenlikBasliklariniKullan();    // KURAL-11 — hata yanıtları da başlık taşısın

// ── KURAL-11: üretimde HTTPS zorunlu ──
if (!app.Environment.IsDevelopment())
{
    // HSTS: tarayıcıya "bu siteye bir daha HTTP ile gelme" der.
    // 30 gün ile başla; sorunsuz çalıştığı doğrulanınca 1 yıla çıkarılır.
    app.UseHsts();
    app.UseHttpsRedirection();
}

app.UseStaticFiles();
app.UseRouting();
app.UseCors();
app.UseAuthentication();
app.UseRateLimiter();                // KURAL-07
app.UseAuthorization();
app.MapControllers();
```

HSTS yapılandırması:

```csharp
builder.Services.AddHsts(secenekler =>
{
    secenekler.MaxAge = TimeSpan.FromDays(30);
    secenekler.IncludeSubDomains = true;
    secenekler.Preload = false;      // preload listesine girmek GERİ ALINAMAZ — bilinçli kapalı
});
```

> ⚠️ **`UseHttpsRedirection` ters proxy arkasında dikkat gerektirir.** Proxy TLS'i
> sonlandırıp backend'e HTTP gönderiyorsa, backend her isteği yönlendirmeye çalışır ve
> **sonsuz döngü** oluşur. Çözüm: `ForwardedHeaders` middleware'i:
>
> ```csharp
> app.UseForwardedHeaders(new ForwardedHeadersOptions
> {
>     ForwardedHeaders = ForwardedHeaders.XForwardedProto | ForwardedHeaders.XForwardedFor
> });
> ```
> Bu, `app.HataYakalamayiKullan()`'dan **hemen sonra**, `UseHttpsRedirection`'dan
> **önce** gelmelidir. Kullanıcının HTTPS kararına bağlıdır
> (`00-BASLA-BURADAN.md` madde 8).

### 3. Next.js başlıkları — her iki istemci

`frontend/next.config.ts`:

```ts
import type { NextConfig } from "next";

const guvenlikBasliklari = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  {
    // Next.js geliştirmede eval kullanır; üretim derlemesinde gerekmez.
    // 'unsafe-inline' style için gerekli (Tailwind runtime stilleri).
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      // Tesseract.js WASM modelini indirir — kendi origin'inden servis edilmeli
      "worker-src 'self' blob:",
      `connect-src 'self' ${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5001"}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [{ source: "/:path*", headers: guvenlikBasliklari }];
  },
};

export default nextConfig;
```

> ⚠️ **`script-src 'self'` ve Next.js:** Üretim derlemesi inline script kullanmaz,
> ancak Next.js bazı sürümlerde hidrasyon için inline script üretir. Bu durumda
> `nonce` gerekir. Geçiş planı adım 8'de **elle doğrulanacak**; sorun çıkarsa
> `script-src 'self' 'unsafe-inline'` ile başlanıp nonce'a geçiş teknik borç olarak
> kaydedilir. **CSP'yi kaldırmak çözüm değildir.**
>
> ⚠️ **Tesseract.js:** WASM ve dil modelini varsayılan olarak CDN'den indirir.
> `worker-src 'self' blob:` yeterli olmayabilir; `connect-src`'ye Tesseract CDN'ini
> eklemek **ya da** modeli `public/` altına indirip yerelden servis etmek gerekir.
> İkincisi doğru çözümdür — adım 9.

`admin-panel/next.config.mjs`:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // KURAL-11: derleme kapıları AÇIK — tip ve lint hataları build'i durdurur.
  // eslint.ignoreDuringBuilds ve typescript.ignoreBuildErrors KALDIRILDI.
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Content-Security-Policy', value: [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "worker-src 'self' blob:",
        `connect-src 'self' ${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5001'}`,
        "frame-ancestors 'none'",
        "object-src 'none'",
      ].join('; ') },
    ]}];
  },
};

export default nextConfig;
```

### 4. pdf.js'i pakete al — `admin-panel`

```bash
cd admin-panel
npm install pdfjs-dist@4.7.76
```

`app/books/page.tsx` — CDN script bloğunu **sil** ve şununla değiştir:

```tsx
import * as pdfjsLib from "pdfjs-dist";

// Worker'ı yerel dosyadan yükle (CDN yok → CSP 'self' ile uyumlu)
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

// ... useEffect içindeki script yükleme bloğu tamamen kaldırılır
// pdfDoc oluşturma:
const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
```

Bu değişiklik `typescript.ignoreBuildErrors` kapatıldığında **tip hatalarını da ortaya
çıkarır** — `any` kullanımları düzeltilmelidir (geçiş planı adım 6).

### 5. `localStorage.clear()` → hedefli temizlik

`admin-panel/app/components/AdminLayout.tsx`:

```tsx
onClick={async () => {
  const token = localStorage.getItem("admin_token");
  try {
    // KURAL-04: sunucuda da iptal et
    await fetch(`${API}/api/auth/logout`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch { /* ağ hatası çıkışı engellemesin */ }
  localStorage.removeItem("admin_token");
  localStorage.removeItem("admin_user");
  router.replace("/");
}}
```

---

## Otomatik kapı

### A) Başlık testleri — `GuvenlikBasliklariTests.cs`

```csharp
using EnglishReadingPlatform.Tests.Infrastructure;
using FluentAssertions;
using Xunit;

namespace EnglishReadingPlatform.Tests;

[Collection("api")]
public class GuvenlikBasliklariTests
{
    private readonly TestAppFactory _fabrika;
    public GuvenlikBasliklariTests(TestAppFactory fabrika) => _fabrika = fabrika;

    private static readonly (string Ad, string BeklenenParca)[] ZorunluBasliklar =
    {
        ("X-Content-Type-Options", "nosniff"),
        ("X-Frame-Options",        "DENY"),
        ("Referrer-Policy",        "strict-origin"),
        ("Content-Security-Policy","frame-ancestors 'none'"),
        ("Permissions-Policy",     "camera=()"),
    };

    [Theory]
    [Trait("Category", "TarayiciSavunmasi")]
    [InlineData("/api/books")]          // 401 dönecek
    [InlineData("/api/auth/me")]        // 401
    public async Task Her_yanit_guvenlik_basliklarini_tasir(string yol)
    {
        var client = _fabrika.CreateClient();
        var yanit = await client.GetAsync(yol);

        foreach (var (ad, parca) in ZorunluBasliklar)
        {
            yanit.Headers.TryGetValues(ad, out var degerler).Should().BeTrue($"{ad} başlığı eksik");
            string.Join(" ", degerler!).Should().Contain(parca);
        }
    }

    [Fact]
    [Trait("Category", "TarayiciSavunmasi")]
    public async Task Basarili_yanit_da_baslik_tasir()
    {
        var client = _fabrika.CreateClient();
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(o.Token);

        var yanit = await client.GetAsync("/api/books");
        yanit.IsSuccessStatusCode.Should().BeTrue();

        foreach (var (ad, _) in ZorunluBasliklar)
            yanit.Headers.TryGetValues(ad, out _).Should().BeTrue($"{ad} başarılı yanıtta da olmalı");
    }

    [Fact]
    [Trait("Category", "TarayiciSavunmasi")]
    public async Task Hata_yaniti_da_baslik_tasir()
    {
        // KURAL-06 middleware'i yanıtı temizliyor; başlıklar korunmalı.
        var client = _fabrika.CreateClient();
        var yanit = await client.GetAsync("/api/bulunmayan-uc");

        yanit.Headers.TryGetValues("X-Content-Type-Options", out _)
             .Should().BeTrue("hata yanıtları da korunmalı");
    }

    [Fact]
    [Trait("Category", "TarayiciSavunmasi")]
    public async Task Sunucu_parmak_izi_donmez()
    {
        var client = _fabrika.CreateClient();
        var yanit = await client.GetAsync("/api/books");

        yanit.Headers.TryGetValues("Server", out _).Should().BeFalse();
        yanit.Headers.TryGetValues("X-Powered-By", out _).Should().BeFalse();
    }

    [Fact]
    [Trait("Category", "TarayiciSavunmasi")]
    public async Task Kimlikli_yanit_onbellege_alinmaz()
    {
        var client = _fabrika.CreateClient();
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(o.Token);

        var yanit = await client.GetAsync("/api/books/words");

        yanit.Headers.CacheControl?.NoStore.Should().BeTrue();
    }
}
```

### B) Guard script — `scripts/guard/11-tarayici.sh`

```bash
#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
echo "[11] Tarayıcı tarafı savunma"

# 1. Güvenlik başlıkları middleware'i kayıtlı mı?
n=0; grep -q "GuvenlikBasliklariniKullan" EnglishReadingPlatform/Program.cs || n=1
ihlal_bildir "güvenlik başlıkları middleware'i" "$n" "Program.cs'te kayıtlı değil"

# 2. Üretimde HTTPS zorlaması var mı?
n=0; grep -q "UseHttpsRedirection" EnglishReadingPlatform/Program.cs || n=1
ihlal_bildir "UseHttpsRedirection mevcut" "$n" "TLS zorlaması yok"

n=0; grep -q "UseHsts" EnglishReadingPlatform/Program.cs || n=1
ihlal_bildir "UseHsts mevcut" "$n" "HSTS yok"

# 3. CDN'den script yükleniyor mu?
cikti="$(kodda_ara 'https://cdnjs|https://unpkg|https://cdn\.jsdelivr' 'frontend/app/**' 'admin-panel/app/**')"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "CDN'den script yükleme" "$n" "$cikti"

# 4. Derleme kapıları kapalı mı?
cikti="$(grep -n 'ignoreBuildErrors\|ignoreDuringBuilds' admin-panel/next.config.mjs frontend/next.config.ts 2>/dev/null || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "derleme kapısı kapalı" "$n" "$cikti"

# 5. Next.js başlıkları tanımlı mı?
eksik=""
grep -q "Content-Security-Policy" frontend/next.config.ts 2>/dev/null || eksik="${eksik}frontend"$'\n'
grep -q "Content-Security-Policy" admin-panel/next.config.mjs 2>/dev/null || eksik="${eksik}admin-panel"$'\n'
n=$(printf '%s' "$eksik" | grep -c . || true)
ihlal_bildir "Next.js CSP eksik" "$n" "$eksik"

# 6. localStorage.clear() geniş temizlik
cikti="$(kodda_ara 'localStorage\.clear\(\)' 'frontend/app/**' 'admin-panel/app/**')"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "localStorage.clear() kullanımı" "$n" "$cikti"

guard_bitir
```

---

## Bitti kriteri

```bash
cd /Users/alihanfindikci/Desktop/ingilizceproje
docker compose up -d postgres

# 1) Testler — BEKLENEN: Başarısız: 0, Başarılı: 6
dotnet test Linguza.sln --filter "Category=TarayiciSavunmasi" --logger "console;verbosity=normal"
echo "çıkış kodu: $?"

# 2) Guard kapısı — BEKLENEN: TOPLAM İHLAL: 0
bash scripts/guard/11-tarayici.sh; echo "çıkış kodu: $?"

# 3) CDN script — BEKLENEN: 0
grep -rn "cdnjs\|unpkg\|jsdelivr" frontend/app admin-panel/app 2>/dev/null | wc -l

# 4) Derleme kapıları — BEKLENEN: 0
grep -n "ignoreBuildErrors\|ignoreDuringBuilds" admin-panel/next.config.mjs frontend/next.config.ts 2>/dev/null | wc -l

# 5) Yönetici paneli tip kontrolüyle derleniyor mu?  ← EN ÖNEMLİ KOMUT
cd admin-panel && npx tsc --noEmit; echo "tsc çıkış kodu: $?"; cd ..

# 6) Her iki uygulama derleniyor mu?
cd admin-panel && npm run build 2>&1 | tail -8; echo "çıkış kodu: $?"; cd ..
cd frontend && npm run build 2>&1 | tail -8; echo "çıkış kodu: $?"; cd ..

# 7) Başlıklar canlı yanıtta görünüyor mu? (elle doğrulama)
#    (backend çalışırken)
curl -s -D - -o /dev/null http://localhost:5001/api/books | grep -iE "x-content-type|x-frame|referrer|content-security|permissions"

# 8) Tüm kapılar
bash scripts/guard/run-all.sh; echo "çıkış kodu: $?"
```

**Kabul koşulu:** 1'de `Başarısız: 0`; 2, 5, 6 çıkış kodu `0`; 3 ve 4 çıktısı `0`;
7'de beş başlığın hepsi görünmeli.

> 🔴 **Komut 5 bu kuralın en riskli adımıdır.** `ignoreBuildErrors` yıllardır açık
> olduğu için birikmiş tip hataları çıkabilir. Hepsi düzeltilmeden kural kapanmaz.
> Düzeltilemeyenler varsa **sayısı ve gerekçesiyle** raporlanır.

---

## Mutasyon kontrolü (zorunlu)

```bash
# MUTASYON A — bir başlığı kaldır
python3 - <<'PY'
yol = "EnglishReadingPlatform/Middleware/GuvenlikBasliklariMiddleware.cs"
k = open(yol, encoding="utf-8").read()
k = k.replace('basliklar["X-Content-Type-Options"] = "nosniff";', '// MUTASYON')
open(yol, "w", encoding="utf-8").write(k)
PY

dotnet test Linguza.sln --filter "Category=TarayiciSavunmasi"
# BEKLENEN: Başarısız: ≥3 (Theory satırları + Basarili_yanit + Hata_yaniti)

git checkout EnglishReadingPlatform/Middleware/GuvenlikBasliklariMiddleware.cs
dotnet test Linguza.sln --filter "Category=TarayiciSavunmasi"   # BEKLENEN: Başarısız: 0
```

```bash
# MUTASYON B — derleme kapısını geri kapat
python3 - <<'PY'
yol = "admin-panel/next.config.mjs"
k = open(yol, encoding="utf-8").read()
k = k.replace("const nextConfig = {", "const nextConfig = {\n  typescript: { ignoreBuildErrors: true },")
open(yol, "w", encoding="utf-8").write(k)
PY

bash scripts/guard/11-tarayici.sh; echo "çıkış kodu: $?"      # BEKLENEN: 1
git checkout admin-panel/next.config.mjs
bash scripts/guard/11-tarayici.sh; echo "çıkış kodu: $?"      # BEKLENEN: 0
```

```bash
# MUTASYON C — CDN script'i geri ekle
python3 - <<'PY'
yol = "admin-panel/app/books/page.tsx"
k = open(yol, encoding="utf-8").read()
k = 'const MUTASYON = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js";\n' + k
open(yol, "w", encoding="utf-8").write(k)
PY

bash scripts/guard/11-tarayici.sh; echo "çıkış kodu: $?"      # BEKLENEN: 1
git checkout admin-panel/app/books/page.tsx
```

---

## Geçiş planı

| Adım | İş | Nokta | Doğrulama |
|---|---|---|---|
| 1 | `Middleware/GuvenlikBasliklariMiddleware.cs` yaz | — | derlenir |
| 2 | `GuvenlikBasliklariTests.cs` yaz — **merkezî çözüm önce** | — | 6 test yeşil |
| 3 | `Program.cs`: middleware + HSTS + HttpsRedirection (+ ForwardedHeaders?) | 3 | guard kapı 1-2 yeşil |
| 4 | `frontend/next.config.ts` → başlıklar | 1 | `npm run build` geçer |
| 5 | `admin-panel/next.config.mjs` → başlıklar, **kapıları aç** | 3 | ⚠️ tip hataları çıkar |
| 6 | 🔴 **Ortaya çıkan tip/lint hatalarını düzelt** | ? | `npx tsc --noEmit` → 0 |
| 7 | pdf.js'i npm paketine al, CDN bloğunu sil | 2 | guard kapı 3 → 0 |
| 8 | 🔴 **CSP'yi tarayıcıda doğrula** (aşağı bak) | — | elle |
| 9 | Tesseract.js modelini yerelleştir veya `connect-src`'ye ekle | 1 | OCR çalışmalı |
| 10 | `localStorage.clear()` → hedefli + logout çağrısı | 1 | guard kapı 6 → 0 |
| 11 | `scripts/guard/11-tarayici.sh` + `chmod +x` | — | çıkış kodu 0 |
| 12 | İlerleme tablosunu güncelle | — | — |

### Adım 8 — CSP tarayıcı doğrulaması 🔴 **ZORUNLU**

CSP'nin **konsolu hata dolu bırakmadan** çalıştığı doğrulanmalı. Testlerle
yakalanamaz — tarayıcı gerekir.

```bash
cd frontend && npm run build && npm start &
cd admin-panel && npm run build && npm start &
```

Her sayfayı aç, **tarayıcı konsolunu izle**. `Refused to load ...` veya
`Refused to execute inline script` hatası **olmamalı**:

| Sayfa | Özel risk |
|---|---|
| `/login`, `/register` | Next.js hidrasyon inline script'i |
| `/` (Panel) | — |
| `/books` | — |
| `/books/[id]` (Okuyucu) | Web Speech API (TTS) |
| `/words` | — |
| `/ocr` | 🔴 **Tesseract.js WASM + dil modeli indirme** |
| `/groups` | — |
| Yönetici `/books` | 🔴 **pdf.js worker (blob:)** |

**Hata çıkarsa:**
- Inline script → `script-src` için nonce ekle **veya** geçici olarak `'unsafe-inline'`
  koyup teknik borç kaydet
- Tesseract CDN → adım 9'u uygula
- pdf.js worker → `worker-src 'self' blob:` yeterli olmalı; değilse `child-src` ekle

**CSP'yi tamamen kaldırmak kabul edilebilir bir çözüm değildir.** Gevşetilen her
direktif rapora gerekçesiyle yazılır.

### Adım 9 — Tesseract.js yerelleştirme

```bash
cd frontend
npm install tesseract.js-core
```

`app/ocr/page.tsx`:

```ts
const sonuc = await Tesseract.recognize(dosya, "eng", {
  logger: (m) => setOcrProgress(...),
  workerPath: "/tesseract/worker.min.js",
  corePath:   "/tesseract/tesseract-core.wasm.js",
  langPath:   "/tesseract/lang",       // eng.traineddata.gz buraya indirilir
});
```

Dosyalar `frontend/public/tesseract/` altına kopyalanır. Bu, CSP uyumu **ve** ilk
tarama hızını iyileştirir (`docs/05-FRONTEND.md` § 5).

---

## Tuzaklar

| Tuzak | Neden olur | Nasıl kaçınılır |
|---|---|---|
| **Başlıkları `OnStarting` olmadan eklemek** | Yanıt yazılmaya başladıysa başlık eklenemez, sessizce düşer | Middleware `OnStarting` kullanıyor |
| **Güvenlik başlıklarını hata middleware'inden önce koymak** | KURAL-06 middleware'i `Response.Clear()` çağırıyor — başlıklar silinir | Sıra: `HataYakalama` → `GuvenlikBasliklari`. `Hata_yaniti_da_baslik_tasir` testi bunu koruyor |
| **`UseHttpsRedirection`'ı proxy arkasında `ForwardedHeaders` olmadan açmak** | Sonsuz yönlendirme döngüsü — site tamamen erişilemez olur | `00-BASLA-BURADAN.md` madde 8 kararına göre `ForwardedHeaders` eklenir |
| **HSTS `Preload`'u açmak** | Preload listesine girmek **geri alınamaz**; HTTPS bir gün bozulursa site erişilemez kalır | `Preload = false`, `MaxAge = 30 gün` ile başla |
| **HSTS'i geliştirmede açmak** | Tarayıcı `localhost`'u HTTPS'e zorlar, geliştirme durur | `if (!IsDevelopment())` bloğunda |
| **CSP'yi `default-src 'self'` ile API'ye uygulamak** | API HTML sunmuyor; en katı `'none'` uygundur ve daha güvenlidir | API için `default-src 'none'` |
| **`ignoreBuildErrors`'ı açıp hataları görünce geri kapatmak** | Tam olarak kaçınılmak istenen döngü | Adım 6 zorunlu; düzeltilemeyen hata **sayısıyla** raporlanır |
| **pdf.js worker'ını `import.meta.url` olmadan ayarlamak** | Next.js worker dosyasını bundle'a dahil etmez, 404 alınır | `new URL(..., import.meta.url)` deseni |
| **Tesseract CDN'ini `connect-src`'ye ekleyip "çözdüm" demek** | Tedarik zinciri riski sürer; SRI de yok | Yerelleştirme doğru çözüm (adım 9) |
| **`localStorage`'dan cookie'ye geçişi bu kurala sıkıştırmak** | Mimari değişiklik: CSRF token, `credentials: 'include'`, CORS ayarları… tek oturumda bitmez | Bu kural CSP ile riski **azaltır**; tam geçiş teknik borç olarak kaydedilir |
| **CSP'yi yalnızca üretimde test etmek** | Geliştirme derlemesi `eval` kullanır, üretim kullanmaz — biri çalışırken diğeri kırılır | `npm run build && npm start` ile **üretim derlemesinde** test et |

---

## Teslim şablonu

```markdown
## 1. Kanıtlanarak kapandı
<8 bitti-kriteri komutunun ham çıktısı>
<özellikle komut 5: npx tsc --noEmit → 0 hata>
<komut 7: curl başlık çıktısı — beş başlık da görünmeli>
<MUTASYON A, B, C çıktıları>

## 2. Kapanmadı
- Token hâlâ localStorage'da (15 nokta) — cookie'ye tam geçiş ayrı bir iş, teknik borç
- CSP'de gevşetilen direktifler: <varsa listele + gerekçe>
- admin-panel'de düzeltilemeyen tip hatası: <sayı + gerekçe>

## 3. İnsan müdahalesi gerekiyor
- [ ] HTTPS kararı — 00-BASLA-BURADAN.md madde 8
      Seçime göre ForwardedHeaders eklendi mi?
- [ ] Adım 8: CSP tarayıcı doğrulaması — 8 sayfayı elle aç, konsolu kontrol et
- [ ] HSTS MaxAge 30 gün → sorunsuz çalıştığı doğrulanınca 1 yıla çıkarılmalı (takvim notu)
- [ ] Preload listesine girilecek mi? (geri alınamaz karar)

## Değiştirilen dosyalar
<git diff --stat>

## Commit
<git log -1 --format='%H %s'>
```
