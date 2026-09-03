# KURAL-15 — Dağıtım kapısı

> **Ön koşul:** KURAL-13 ve KURAL-14 kapalı olmalı — bu kural onların
> **canlıda doğrulanmasını** tekrarlanabilir hâle getirir.

---

## Kural metni

> **Bir dağıtımın sağlıklı olup olmadığı tahmin edilmeyecek, ÖLÇÜLECEK.**
> Uygulama kendi sağlığını bildiren bir uç yayımlayacak; hangi ortam
> değişkenlerinin hangi ortamda zorunlu olduğu tek bir sözleşmede yazılı olacak
> ve bir testle doğrulanacak; üretim log seviyeleri hassas veriyi ve gürültüyü
> dışarıda bırakacak; dağıtım öncesi ve sonrası kontroller **çalıştırılabilir
> betikler** hâlinde olacak — kontrol listesi bir belge değil, bir komuttur.

---

## Envanter

Ölçüm tarihi: **2026-09-02**, commit `03b8adc`.

### İhlal 1 — Sağlık kontrolü ucu yok 🟠

```
$ grep -rn "MapHealthChecks\|AddHealthChecks\|\"/health\"" EnglishReadingPlatform --include="*.cs"
(çıktı yok)
```

Render dağıtımın sağlıklı olup olmadığını anlayamıyor. Bu, tek başına can
sıkıcı; **`Database.Migrate()` ile birleşince tehlikeli**:

```
$ grep -n "Database.Migrate" EnglishReadingPlatform/Program.cs
294:    db.Database.Migrate();
```

Migration açılışta çalışıyor. Düşerse (KURAL-12'nin tekillik kısıtları üretimde
mükerrer kayda çarparsa) **uygulama hiç ayağa kalkmaz** — ama platform bunu
ancak istekler hata vermeye başlayınca fark eder. Sağlık ucu, kötü bir dağıtımın
kullanıcıya ulaşmadan geri alınmasını sağlar.

### İhlal 2 — Ortam değişkeni sözleşmesi yalnızca 5 değeri kapsıyor 🟠

`SirDogrulayici` (KURAL-02) şunları zorunlu tutuyor:

```
Jwt:Key · Jwt:Issuer · Jwt:Audience · ConnectionStrings:Default · Seed:AdminPassword
```

Ama üretimin çalışması için gereken **10 değer** var. Eksik olanlar:

| Değişken | Eksikse | Fark edilir mi? |
|---|---|---|
| `CorsOrigins` | KURAL-13 sonrası uygulama açılmaz | ✅ (13'te eklendi) |
| `PublicHost` | Host doğrulaması eksik | ❌ sessiz |
| `Resend:ApiKey` | Sıfırlama kapalı | ✅ (14'te eklendi) |
| `App:FrontendUrl` | Sıfırlama kapalı | ✅ (14'te eklendi) |
| `Seed:AdminEmail` | **Yönetici hiç oluşmaz** | ❌ sessiz |
| `Groq:ApiKey` | Çeviri bozulur | ❌ sessiz |
| `ASPNETCORE_ENVIRONMENT` | **HSTS, HTTPS ve ForwardedHeaders hiç kurulmaz** | ❌ sessiz |
| `NEXT_PUBLIC_API_URL` (Vercel ×2) | **Tüm API çağrıları CSP'ye takılır** | ❌ sessiz |

Son üçü en tehlikelisi: hepsi **sessiz**. `ASPNETCORE_ENVIRONMENT` `Production`
değilse `Program.cs`'in üretim dalı hiç çalışmaz ve KURAL-11'in bütün
tarayıcı savunması sessizce devre dışı kalır.

```
$ grep -n "IsDevelopment()" EnglishReadingPlatform/Program.cs | head -5
252:    if (!builder.Environment.IsDevelopment())
337:if (!app.Environment.IsDevelopment())
```

### İhlal 3 — Üretimde her SQL sorgusu loglanıyor 🟡

```
$ grep -n "Logging" -A5 EnglishReadingPlatform/appsettings.json
  "Logging": {
    "LogLevel": {
      "Default": "Information",              ← EF Command bu seviyede loglar
      "Microsoft.AspNetCore": "Warning"
    }
  }
```

`Microsoft.EntityFrameworkCore.Database.Command` varsayılan olarak
`Information` seviyesinde her SQL ifadesini yazıyor.

İyi haber: `EnableSensitiveDataLogging` **kapalı** (doğrulandı — parametre
değerleri `?` olarak maskeleniyor), yani şifre sızmıyor.
Kötü haber: şema bilgisi, sorgu desenleri ve **log hacmi**. KURAL-14'ten sonra
bu projede loglar hassas bir yüzey; gürültü, içindeki gerçek uyarıyı gizler.

### İhlal 4 — Dağıtım yapılandırması depoda yok 🟠

```
$ ls -a | grep -iE "render|vercel|fly|railway|procfile"
(çıktı yok)
$ find . -maxdepth 2 -name "render.yaml" -o -maxdepth 2 -name "vercel.json"
(çıktı yok)
```

Dağıtım tamamen panelden yapılandırılmış. Yani ortam değişkenleri
**kod incelemesinden geçmiyor**, sürüm kontrolünde izi yok, bir kişi
değiştirdiğinde kimse görmüyor. KURAL-14'ün kapattığı sızıntının aylarca fark
edilmemesinin sebebi tam olarak budur.

### İhlal 5 — Dağıtım öncesi/sonrası kontroller belge hâlinde 🟡

Faz 1'in KURAL-11'i iki canlı doğrulama bıraktı (HTTPS yönlendirmesi,
`X-Forwarded-For` en sağdaki girdi) — **ikisi de hâlâ yapılmadı.**
Sebebi basit: bir markdown maddesi çalıştırılamaz, unutulur.

### Özet

| # | İhlal | Nokta |
|---|---|---|
| 1 | Sağlık ucu yok | 0 uç |
| 2 | Ortam sözleşmesi eksik | 8 değişken |
| 3 | Üretimde SQL logu | 1 yapılandırma |
| 4 | Dağıtım yapılandırması depoda yok | 2 platform |
| 5 | Canlı kontroller belge hâlinde | 2 bekleyen doğrulama |
| | **TOPLAM** | **13 nokta** |

---

## Merkezî uygulama

### 1. Ortam sözleşmesi — `Configuration/OrtamSozlesmesi.cs`

```csharp
namespace EnglishReadingPlatform.Configuration;

/// <summary>
/// KURAL-15: Hangi ortam değişkeni hangi ortamda zorunlu — TEK kaynak.
///
/// Neden SirDogrulayici'ya eklemiyoruz: o sınıf "sır" kavramına odaklı
/// (sızmış değer kontrolü, asgari anahtar uzunluğu). Burada sorulan soru
/// farklı: "bu dağıtım eksiksiz mi?" Bir değer sır olmayabilir
/// (ASPNETCORE_ENVIRONMENT) ama eksikliği bütün güvenlik katmanını düşürebilir.
/// </summary>
public record OrtamDegiskeni(
    string Anahtar,
    bool UretimdeZorunlu,
    string EksikseNeOlur);

public static class OrtamSozlesmesi
{
    public static readonly OrtamDegiskeni[] Degiskenler =
    {
        // ── Faz 1'den (SirDogrulayici zaten zorunlu tutuyor) ──
        new("Jwt:Key",                    true, "Kimlik doğrulama çalışmaz."),
        new("Jwt:Issuer",                 true, "Token doğrulaması başarısız olur."),
        new("Jwt:Audience",               true, "Token doğrulaması başarısız olur."),
        new("ConnectionStrings:Default",  true, "Hiçbir uç çalışmaz."),
        new("Seed:AdminPassword",         true, "Yönetici hesabı oluşturulamaz."),

        // ── KURAL-13 ──
        new("CorsOrigins", true, "Tarayıcıdan hiçbir istemci bağlanamaz."),
        new("PublicHost",  true, "Host başlığı doğrulanamaz; sıfırlama bağlantısı zehirlenebilir."),

        // ── KURAL-14 ──
        new("Resend:ApiKey",    true, "Şifre sıfırlama ve e-posta doğrulama 503 döner."),
        new("App:FrontendUrl",  true, "Sıfırlama bağlantısı üretilemez."),

        // ── KURAL-15 (bu kural) ──
        new("Seed:AdminEmail", true,
            "Yönetici hesabı HİÇ OLUŞMAZ ve bu sessizce olur — panele kimse giremez."),
        new("Groq:ApiKey", false,
            "Yapay zekâ çevirisi çalışmaz; sözlük yedeği kullanılır. Zorunlu değil."),
    };

    /// <summary>
    /// Üretimde eksik olan zorunlu değişkenler.
    /// Program.cs bunu açılışta çağırır ve eksik varsa BAŞLATMAZ.
    /// </summary>
    public static IReadOnlyList<OrtamDegiskeni> EksikZorunlular(IConfiguration yapilandirma)
        => Degiskenler
            .Where(d => d.UretimdeZorunlu)
            .Where(d => string.IsNullOrWhiteSpace(yapilandirma[d.Anahtar]))
            .ToList();

    public static void UretimdeDogrula(IConfiguration yapilandirma, IHostEnvironment ortam)
    {
        if (ortam.IsDevelopment()) return;

        var eksikler = EksikZorunlular(yapilandirma);
        if (eksikler.Count == 0) return;

        var satirlar = eksikler.Select(d =>
            $"  • {d.Anahtar} tanımlı değil. Ortam değişkeni: {d.Anahtar.Replace(":", "__")}\n" +
            $"    Eksikse: {d.EksikseNeOlur}");

        throw new InvalidOperationException(
            "Dağıtım eksik — uygulama başlatılamıyor:\n" +
            string.Join("\n", satirlar) +
            "\n\nÇözüm: bu değerleri dağıtım platformunun ortam değişkenlerine ekleyin.");
    }
}
```

### 2. Sağlık ucu — `Program.cs`

```csharp
// ─── KURAL-15: sağlık kontrolü ────────────────────────────────
// Yalnızca "ayakta mıyım" değil, "veritabanına ULAŞABİLİYOR muyum".
// İkincisi olmadan, migration'ı düşmüş bir örnek de 'sağlıklı' görünür.
builder.Services.AddHealthChecks()
    .AddDbContextCheck<AppDbContext>("veritabani");
```

```csharp
// app.MapControllers()'dan ÖNCE:
//
// GÜVENLİK NOTU: yanıt gövdesinde AYRINTI YOK. Varsayılan
// UIResponseWriter kütüphane adlarını ve istisna metinlerini döker;
// bu, KURAL-06'nın kapattığı iç detay sızıntısının geri gelmesidir.
app.MapHealthChecks("/health", new HealthCheckOptions
{
    ResponseWriter = async (ctx, rapor) =>
    {
        ctx.Response.ContentType = "text/plain";
        await ctx.Response.WriteAsync(rapor.Status == HealthStatus.Healthy ? "OK" : "BOZUK");
    }
}).AllowAnonymous();
```

### 3. Üretim log seviyeleri — `appsettings.Production.json` (YENİ)

```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Warning",
      "EnglishReadingPlatform": "Information",
      "Microsoft.AspNetCore": "Warning",
      "Microsoft.EntityFrameworkCore.Database.Command": "Warning",
      "Microsoft.EntityFrameworkCore.Migrations": "Information"
    }
  }
}
```

> `EnglishReadingPlatform` ad alanı **`Information`'da bırakılıyor**: KURAL-06'nın
> `GuvenliLog` ile temizlediği kendi kayıtlarımız ve KURAL-14'ün açılış raporu
> görünür kalmalı. `Migrations` da `Information` — migration'ın uygulandığını
> görmek, düşmüş bir dağıtımı teşhis etmenin en hızlı yolu.
>
> ⚠️ `appsettings.Production.json` **`.gitignore`'da olabilir** (KURAL-02
> `appsettings.Production.json` satırını eklemişti — sır tutmasın diye).
> Bu dosya sır içermiyor; `.gitignore`'dan çıkarılmalı, **yoksa üretime hiç gitmez**
> ve bu kural sessizce hiçbir şey yapmaz. Geçiş planı adım 4 bunu kontrol ediyor.

### 4. Dağıtım öncesi betiği — `scripts/dagitim/on-kontrol.sh` (YENİ)

```bash
#!/usr/bin/env bash
# KURAL-15 — DAĞITIMDAN ÖNCE çalıştırılır.
#
# Kontrol listesi bir belge değil, bir komuttur: markdown maddeleri unutulur,
# çıkış kodu unutulmaz.
#
# Kullanım:  DB_URL="postgres://..." bash scripts/dagitim/on-kontrol.sh
set -uo pipefail
SONUC=0
echo "════ DAĞITIM ÖNCESİ KONTROL ════"

bildir() {  # ad · durum(0/1) · ayrıntı
  if [ "$2" -eq 0 ]; then printf '  %-46s ✓\n' "$1"
  else printf '  %-46s ✗\n' "$1"; [ -n "${3:-}" ] && printf '      %s\n' "$3"; SONUC=1; fi
}

# 1. Yerelde her şey yeşil mi?
dotnet test Linguza.sln --logger "console;verbosity=quiet" >/dev/null 2>&1
bildir "test takımı" $? "dotnet test kırmızı — dağıtma"

bash scripts/guard/run-all.sh >/dev/null 2>&1
bildir "güvenlik kapıları" $? "bir kapı kırık — dağıtma"

# 2. ÜRETİM veritabanında mükerrer kayıt var mı?
#    KURAL-12'nin tekillik kısıtları açılışta uygulanıyor; mükerrer varsa
#    migration düşer ve UYGULAMA HİÇ AÇILMAZ.
if [ -n "${DB_URL:-}" ]; then
  mukerrer=$(psql "$DB_URL" -tAc "
    SELECT COALESCE(SUM(n),0) FROM (
      SELECT COUNT(*) n FROM (SELECT \"UserId\",\"BookId\" FROM \"ReadingProgresses\" GROUP BY 1,2 HAVING COUNT(*)>1) a
      UNION ALL SELECT COUNT(*) FROM (SELECT \"UserId\",\"Word\" FROM \"WordListItems\" GROUP BY 1,2 HAVING COUNT(*)>1) b
      UNION ALL SELECT COUNT(*) FROM (SELECT \"QueryText\",\"ContextText\" FROM \"TranslationCaches\" GROUP BY 1,2 HAVING COUNT(*)>1) c
      UNION ALL SELECT COUNT(*) FROM (SELECT \"GroupId\",\"UserId\" FROM \"GroupMembers\" GROUP BY 1,2 HAVING COUNT(*)>1) d
      UNION ALL SELECT COUNT(*) FROM (SELECT \"GroupId\",\"BookId\" FROM \"GroupBookAssignments\" GROUP BY 1,2 HAVING COUNT(*)>1) e
      UNION ALL SELECT COUNT(*) FROM (SELECT \"BookId\",\"PageNumber\" FROM \"BookPages\" GROUP BY 1,2 HAVING COUNT(*)>1) f
      UNION ALL SELECT COUNT(*) FROM (SELECT \"ChapterId\" FROM \"Quizzes\" GROUP BY 1 HAVING COUNT(*)>1) g
    ) t;" 2>/dev/null)
  [ "${mukerrer:-1}" = "0" ]
  bildir "üretimde mükerrer kayıt yok" $? \
    "$mukerrer mükerrer grup var — migration DÜŞER, uygulama açılmaz (KURAL-12.md adım 2)"
else
  bildir "üretimde mükerrer kayıt yok" 1 "DB_URL verilmedi — kontrol ATLANDI"
fi

echo ""
[ "$SONUC" -eq 0 ] && echo "  SONUÇ: dağıtıma hazır ✓" || echo "  SONUÇ: DAĞITMA ✗"
exit "$SONUC"
```

### 5. Dağıtım sonrası betiği — `scripts/dagitim/canli-dogrula.sh` (YENİ)

```bash
#!/usr/bin/env bash
# KURAL-15 — DAĞITIMDAN SONRA çalıştırılır.
# Faz 1'in KURAL-11'inden devreden iki doğrulama burada otomatikleşiyor.
#
# Kullanım:  bash scripts/dagitim/canli-dogrula.sh https://linguza-api.onrender.com
set -uo pipefail
TABAN="${1:?kullanım: canli-dogrula.sh https://api-adresi}"
SONUC=0
echo "════ CANLI DOĞRULAMA — $TABAN ════"

bildir() {
  if [ "$2" -eq 0 ]; then printf '  %-46s ✓\n' "$1"
  else printf '  %-46s ✗\n' "$1"; [ -n "${3:-}" ] && printf '      %s\n' "$3"; SONUC=1; fi
}

# 1. Sağlık
kod=$(curl -s -o /dev/null -w "%{http_code}" "$TABAN/health")
[ "$kod" = "200" ]; bildir "sağlık ucu 200 dönüyor" $? "dönen: $kod"

# 2. HTTP → HTTPS yönlendirmesi (KURAL-11'den devreden)
httpTaban="${TABAN/https:/http:}"
yon=$(curl -s -o /dev/null -w "%{redirect_url}" "$httpTaban/health")
case "$yon" in https://*) n=0 ;; *) n=1 ;; esac
bildir "http → https yönlendiriyor" $n "yönlendirme: '${yon:-yok}'"

# 3. Güvenlik başlıkları (KURAL-11)
basliklar=$(curl -s -I "$TABAN/health")
for b in "strict-transport-security" "x-content-type-options" \
         "referrer-policy" "x-frame-options"; do
  printf '%s' "$basliklar" | grep -qi "^$b:"; bildir "başlık: $b" $?
done

# 4. Kestrel Server başlığı sızmıyor (KURAL-11)
printf '%s' "$basliklar" | grep -qi "^server:.*kestrel"; n=$?
[ "$n" -ne 0 ]; bildir "Server başlığı sızmıyor" $?

# 5. CORS: yabancı köken reddediliyor (KURAL-13)
yabanci=$(curl -s -I -X OPTIONS "$TABAN/api/books" \
  -H "Origin: https://kotu-site.example" \
  -H "Access-Control-Request-Method: GET" | grep -ci "access-control-allow-origin")
[ "$yabanci" = "0" ]; bildir "yabancı köken CORS izni almıyor" $? \
  "Access-Control-Allow-Origin döndü — KURAL-13 üretimde çalışmıyor"

# 6. Şifre sıfırlama sızdırmıyor (KURAL-14)
kod=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$TABAN/api/auth/forgot-password" \
  -H "Content-Type: application/json" -d '{"eposta":"kontrol@example.invalid"}')
case "$kod" in
  200) bildir "şifre sıfırlama yapılandırılmış" 0 ;;
  503) bildir "şifre sıfırlama yapılandırılmış" 1 \
         "503 — Resend__ApiKey ya da App__FrontendUrl eksik (KURAL-14)" ;;
  *)   bildir "şifre sıfırlama yapılandırılmış" 1 "beklenmeyen kod: $kod" ;;
esac

echo ""
echo "  ⚠️ ELLE YAPILACAK (betik ölçemez):"
echo "     • X-Forwarded-For'un EN SAĞDAKİ girdisi gerçek istemci IP'si mi?"
echo "       Değilse tüm kullanıcılar tek hız sınırı kovasını paylaşır."
echo "     • İstemci sayfasını aç ve BİR ŞEYE TIKLA — CSP nonce zinciri"
echo "       kırılırsa sayfa hatasız görünür ama etkileşimsiz kalır."
echo ""
[ "$SONUC" -eq 0 ] && echo "  SONUÇ: canlı doğrulama geçti ✓" || echo "  SONUÇ: SORUN VAR ✗"
exit "$SONUC"
```

---

## Otomatik kapı

### A) Testler — `DagitimSozlesmesiTests.cs`

```csharp
using System.Net;
using EnglishReadingPlatform.Configuration;
using EnglishReadingPlatform.Tests.Infrastructure;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace EnglishReadingPlatform.Tests;

[Collection("api")]
public class DagitimSozlesmesiTests
{
    private readonly TestAppFactory _fabrika;
    public DagitimSozlesmesiTests(TestAppFactory fabrika) => _fabrika = fabrika;

    [Fact]
    [Trait("Category", "Dagitim")]
    public async Task Saglik_ucu_anonim_erisilebilir_ve_200_doner()
    {
        var yanit = await _fabrika.CreateClient().GetAsync("/health");
        yanit.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    /// <summary>
    /// Sağlık ucu bir BİLGİ SIZINTISI yüzeyidir. Varsayılan yanıt yazıcısı
    /// kütüphane adlarını ve istisna metinlerini döker — KURAL-06'nın
    /// kapattığı iç detay sızıntısının geri gelmesi olurdu.
    /// </summary>
    [Fact]
    [Trait("Category", "Dagitim")]
    public async Task Saglik_ucu_ic_detay_SIZDIRMAZ()
    {
        var govde = await _fabrika.CreateClient().GetStringAsync("/health");

        govde.Should().Be("OK");
        govde.Should().NotContainAny("Npgsql", "EntityFramework", "Exception", "at ");
    }

    /// <summary>
    /// Sağlık ucu veritabanını GERÇEKTEN kontrol etmeli. Yalnızca "ayaktayım"
    /// diyen bir uç, migration'ı düşmüş bir örneği de sağlıklı gösterir ve
    /// kötü dağıtımın geri alınmasını engeller.
    /// </summary>
    [Fact]
    [Trait("Category", "Dagitim")]
    public void Saglik_kontrolu_veritabanini_da_KAPSAR()
    {
        var kaynak = File.ReadAllText("../../../../EnglishReadingPlatform/Program.cs");
        kaynak.Should().Contain("AddDbContextCheck",
            "veritabanına ulaşamayan bir örnek 'sağlıklı' görünmemeli");
    }

    [Fact]
    [Trait("Category", "Dagitim")]
    public void Uretimde_eksik_zorunlu_degisken_uygulamayi_DURDURUR()
    {
        var bos = new ConfigurationBuilder().Build();
        var ortam = new SahteOrtam("Production");

        var eylem = () => OrtamSozlesmesi.UretimdeDogrula(bos, ortam);

        eylem.Should().Throw<InvalidOperationException>()
            .WithMessage("*Dağıtım eksik*");
    }

    /// <summary>
    /// Hata mesajı SORUNU ÇÖZEBİLİR olmalı: hangi değişken, ortam değişkeni
    /// adı ne, eksikse ne olur. "Yapılandırma hatası" diyen bir mesaj,
    /// operatörü koda bakmaya zorlar.
    /// </summary>
    [Fact]
    [Trait("Category", "Dagitim")]
    public void Eksik_degisken_mesaji_YOL_GOSTERIR()
    {
        var bos = new ConfigurationBuilder().Build();

        var istisna = Assert.Throws<InvalidOperationException>(
            () => OrtamSozlesmesi.UretimdeDogrula(bos, new SahteOrtam("Production")));

        istisna.Message.Should().Contain("Jwt__Key");        // ortam değişkeni biçimi
        istisna.Message.Should().Contain("Eksikse:");        // sonucu da söylüyor
    }

    [Fact]
    [Trait("Category", "Dagitim")]
    public void Gelistirmede_eksik_degisken_uygulamayi_DURDURMAZ()
    {
        var bos = new ConfigurationBuilder().Build();
        var eylem = () => OrtamSozlesmesi.UretimdeDogrula(bos, new SahteOrtam("Development"));
        eylem.Should().NotThrow("geliştirme ortamı eksik yapılandırmayla çalışabilmeli");
    }

    private sealed class SahteOrtam : Microsoft.Extensions.Hosting.IHostEnvironment
    {
        public SahteOrtam(string ad) => EnvironmentName = ad;
        public string EnvironmentName { get; set; }
        public string ApplicationName { get; set; } = "test";
        public string ContentRootPath { get; set; } = ".";
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } = null!;
    }
}
```

### B) Guard script — `scripts/guard/15-dagitim.sh`

```bash
#!/usr/bin/env bash
# KURAL-15 — dağıtım kapısı.
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
echo "[15] Dağıtım kapısı"

KOD="$(grep -v '^[[:space:]]*//' EnglishReadingPlatform/Program.cs)"

# 1. Sağlık ucu bağlı mı?
n=0; printf '%s' "$KOD" | grep -q 'MapHealthChecks' || n=1
ihlal_bildir "sağlık ucu yayımlanmış" "$n" "MapHealthChecks yok"

# 2. Sağlık kontrolü veritabanını kapsıyor mu?
n=0; printf '%s' "$KOD" | grep -q 'AddDbContextCheck' || n=1
ihlal_bildir "sağlık kontrolü veritabanını kapsıyor" "$n" \
  "yalnızca 'ayaktayım' diyen uç, migration'ı düşmüş örneği sağlıklı gösterir"

# 3. Ortam sözleşmesi bağlı mı?
n=0; printf '%s' "$KOD" | grep -q 'OrtamSozlesmesi.UretimdeDogrula' || n=1
ihlal_bildir "ortam sözleşmesi doğrulanıyor" "$n" "Program.cs sözleşmeyi çağırmıyor"

# 4. Üretim log yapılandırması VAR ve ÜRETİME GİDİYOR mu?
n=0; [ -f EnglishReadingPlatform/appsettings.Production.json ] || n=1
ihlal_bildir "appsettings.Production.json mevcut" "$n" "dosya yok"

n=0
if [ -f EnglishReadingPlatform/appsettings.Production.json ]; then
  git check-ignore -q EnglishReadingPlatform/appsettings.Production.json && n=1
fi
ihlal_bildir "üretim log ayarı depoya giriyor" "$n" \
  ".gitignore'a takılıyor — dosya ÜRETİME HİÇ GİTMEZ, kural sessizce çalışmaz"

# 5. EF komut logu üretimde kısılmış mı?
n=0
grep -q '"Microsoft.EntityFrameworkCore.Database.Command": *"Warning"' \
  EnglishReadingPlatform/appsettings.Production.json 2>/dev/null || n=1
ihlal_bildir "üretimde SQL logu kısılmış" "$n" "her sorgu loga akıyor"

# 6. Dağıtım betikleri var ve çalıştırılabilir mi?
for betik in scripts/dagitim/on-kontrol.sh scripts/dagitim/canli-dogrula.sh; do
  n=0; [ -x "$betik" ] || n=1
  ihlal_bildir "$(basename "$betik") çalıştırılabilir" "$n" "yok ya da chmod +x eksik"
done

# 7. Sözleşme testi duruyor mu?
n=0; [ -f EnglishReadingPlatform.Tests/DagitimSozlesmesiTests.cs ] || n=1
ihlal_bildir "dağıtım sözleşme testi mevcut" "$n" "test dosyası silinmiş"

guard_bitir
```

---

## Bitti kriteri

```bash
cd /Users/alihanfindikci/Desktop/ingilizceproje
docker compose up -d postgres

# 1) Testler — BEKLENEN: Başarısız: 0, Başarılı: 6
dotnet test Linguza.sln --filter "Category=Dagitim" --logger "console;verbosity=normal"
echo "çıkış kodu: $?"

# 2) Guard kapısı — BEKLENEN: TOPLAM İHLAL: 0
bash scripts/guard/15-dagitim.sh; echo "çıkış kodu: $?"

# 3) Sağlık ucu yerelde — BEKLENEN: 200 ve gövde "OK"
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5001/health
curl -s http://localhost:5001/health; echo

# 4) Üretim log dosyası depoya giriyor mu — BEKLENEN: dosya listelenir
git ls-files | grep appsettings.Production.json

# 5) Dağıtım öncesi betik — BEKLENEN: çıkış kodu 0
bash scripts/dagitim/on-kontrol.sh; echo "çıkış kodu: $?"

# 6) Canlı doğrulama betiği (yayındaki adresle)
bash scripts/dagitim/canli-dogrula.sh https://SENIN-API-ADRESIN; echo "çıkış kodu: $?"

# 7) TÜM kapılar — BEKLENEN: TOPLAM İHLAL: 0
bash scripts/guard/run-all.sh; echo "çıkış kodu: $?"

# 8) TÜM test takımı
dotnet test Linguza.sln --logger "console;verbosity=normal"
```

---

## Mutasyon kontrolü (zorunlu)

```bash
# MUTASYON A — sağlık kontrolünden veritabanını çıkar
python3 - <<'PY'
yol = "EnglishReadingPlatform/Program.cs"
k = open(yol, encoding="utf-8").read()
k = k.replace('.AddDbContextCheck<AppDbContext>("veritabani");', ';   // MUTASYON A')
open(yol, "w", encoding="utf-8").write(k)
PY
grep -c "MUTASYON A" EnglishReadingPlatform/Program.cs        # BEKLENEN: 1

dotnet test Linguza.sln --filter "FullyQualifiedName~veritabanini_da_KAPSAR"
# BEKLENEN: Başarısız: 1
bash scripts/guard/15-dagitim.sh; echo "çıkış kodu: $?"       # BEKLENEN: 1

git checkout EnglishReadingPlatform/Program.cs
```

```bash
# MUTASYON B — sağlık ucuna ayrıntılı yanıt yazıcısı koy
python3 - <<'PY'
yol = "EnglishReadingPlatform/Program.cs"
k = open(yol, encoding="utf-8").read()
k = k.replace('await ctx.Response.WriteAsync(rapor.Status == HealthStatus.Healthy ? "OK" : "BOZUK");',
              'await ctx.Response.WriteAsync(string.Join(";", rapor.Entries.Select(e => e.Key + "=" + e.Value.Exception?.ToString())));   // MUTASYON B')
open(yol, "w", encoding="utf-8").write(k)
PY
grep -c "MUTASYON B" EnglishReadingPlatform/Program.cs        # BEKLENEN: 1

dotnet test Linguza.sln --filter "FullyQualifiedName~ic_detay_SIZDIRMAZ"
# BEKLENEN: Başarısız: 1
#   ← Sağlık ucunun bir sızıntı yüzeyi olduğunu kanıtlar

git checkout EnglishReadingPlatform/Program.cs
```

```bash
# MUTASYON C — sözleşmeden bir değişkeni düşür
python3 - <<'PY'
yol = "EnglishReadingPlatform/Configuration/OrtamSozlesmesi.cs"
k = open(yol, encoding="utf-8").read()
k = k.replace('new("Seed:AdminEmail", true,', 'new("Seed:AdminEmail", false,   // MUTASYON C')
open(yol, "w", encoding="utf-8").write(k)
PY
grep -c "MUTASYON C" EnglishReadingPlatform/Configuration/OrtamSozlesmesi.cs   # BEKLENEN: 1

# Eksik değişken artık uygulamayı durdurmuyor → dağıtım sessizce yöneticisiz kalır.
dotnet test Linguza.sln --filter "Category=Dagitim"
# BEKLENEN: en az 1 başarısız

git checkout EnglishReadingPlatform/Configuration/OrtamSozlesmesi.cs
dotnet test Linguza.sln --filter "Category=Dagitim"           # BEKLENEN: Başarısız: 0
```

---

## Geçiş planı

| Adım | İş | Nokta | Doğrulama |
|---|---|---|---|
| 1 | `Configuration/OrtamSozlesmesi.cs` yaz | 1 | derlenir |
| 2 | `Program.cs`: `UretimdeDogrula` çağrısı (`SirDogrulayici`'dan hemen SONRA) | 1 | guard 3 → 0 |
| 3 | `Program.cs`: `AddHealthChecks` + `MapHealthChecks` | 2 | guard 1,2 → 0 |
| 4 | 🔴 `appsettings.Production.json` yaz **ve `.gitignore`'dan çıkar** | 2 | guard 4 → 0 |
| 5 | `scripts/dagitim/on-kontrol.sh` + `chmod +x` | 1 | çalışır |
| 6 | `scripts/dagitim/canli-dogrula.sh` + `chmod +x` | 1 | çalışır |
| 7 | `DagitimSozlesmesiTests.cs` yaz | — | 6 test yeşil |
| 8 | `scripts/guard/15-dagitim.sh` + `chmod +x` | — | çıkış kodu 0 |
| 9 | Render'da health check path `/health` olarak ayarla | — | 🧍 insan |
| 10 | `on-kontrol.sh`'i üretim `DB_URL`'iyle çalıştır | — | 🧍 insan |
| 11 | `docs/08-GELISTIRME-REHBERI.md`'ye dağıtım bölümü ekle | — | — |
| 12 | İlerleme tablosunu işaretle | — | — |

### Adım 4 — `.gitignore` tuzağı 🔴

```bash
grep -n "appsettings.Production.json" .gitignore
```

KURAL-02 bu satırı **sır sızmasın diye** eklemişti. Yeni dosya sır içermiyor —
yalnızca log seviyeleri. Satır kalırsa dosya **üretime hiç gitmez** ve bu kural
sessizce hiçbir şey yapmaz. Faz 1'in KURAL-01'i tam olarak bu sınıfı
"üretime gitmeyen güvenlik dosyası" diye tanımlamıştı.

> Sır eklemek istersen `appsettings.Production.Local.json` gibi ayrı bir ad
> kullan ve **onu** yok say.

---

## Tuzaklar

| Tuzak | Neden olur | Nasıl kaçınılır |
|---|---|---|
| **Sağlık ucunu `[Authorize]` arkasına koymak** | Render sağlık kontrolü token gönderemez; dağıtım hep "sağlıksız" görünür | `.AllowAnonymous()` |
| **Varsayılan sağlık yanıt yazıcısı** | Kütüphane adları ve istisna metinleri dışarı döker (KURAL-06 ihlali) | Özel `ResponseWriter`; MUTASYON B bunu ölçüyor |
| **Sağlığa ağır sorgu koymak** | Her 30 saniyede çalışır; pahalı bir kontrol kendi başına yük olur | `AddDbContextCheck` hafif bir `CanConnect` yapar |
| **`appsettings.Production.json`'ı gitignore'da bırakmak** | Dosya üretime gitmez, kural sessizce çalışmaz | Adım 4 |
| **Tüm logları `Warning`'e çekmek** | KURAL-06'nın `GuvenliLog` kayıtları ve KURAL-14'ün açılış raporu görünmez olur | `EnglishReadingPlatform` ad alanı `Information`'da kalır |
| **`ASPNETCORE_ENVIRONMENT`'ı sözleşmeye koymak** | O değişken yapılandırma sisteminin **kendisini** belirler; `IConfiguration`'dan okumak döngüseldir | Ayrı kontrol: `on-kontrol.sh` ve `canli-dogrula.sh` HSTS başlığının varlığından dolaylı ölçer |
| **`on-kontrol.sh`'i `DB_URL` olmadan çalıştırıp geçti sanmak** | Betik o kontrolü ATLADIĞINI söyler ama çıkış kodu yine de 1'dir | Betik atlanan kontrolü ihlal sayıyor — bilinçli |
| **Canlı betiği yalnızca bir kez çalıştırmak** | Ortam değişkeni sonradan değişir | Her dağıtımdan sonra çalıştır; CI'ya bağlanabilir |

---

## Teslim şablonu

```markdown
## 1. Kanıtlanarak kapandı
<8 bitti-kriteri komutunun ham çıktısı>
<MUTASYON A, B, C çıktıları>
<on-kontrol.sh ve canli-dogrula.sh ham çıktıları>

## 2. Kapanmadı
- `render.yaml` / `vercel.json` yazılmadı — dağıtım hâlâ panelden yönetiliyor,
  ortam değişkenleri kod incelemesinden geçmiyor (İhlal 4 kısmen açık)
- `ASPNETCORE_ENVIRONMENT` doğrudan doğrulanamıyor (döngüsel); dolaylı ölçülüyor

## 3. İnsan müdahalesi gerekiyor
- [ ] Render'da health check path `/health` olarak ayarlandı mı?
- [ ] `on-kontrol.sh` üretim `DB_URL`'iyle çalıştırıldı mı? (mükerrer kayıt!)
- [ ] `canli-dogrula.sh` yayındaki adrese karşı çalıştırıldı mı?
- [ ] X-Forwarded-For en sağdaki girdi kontrolü (betik ölçemez)
- [ ] İstemci sayfasında tıklama denemesi (CSP nonce zinciri)

## Değiştirilen dosyalar
<git diff --stat>

## Commit
<git log -1 --format='%H %s'>
```
