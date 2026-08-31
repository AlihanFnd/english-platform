# KURAL-02 — Sırlar koda ve repoya girmez

> **Ön koşul:** KURAL-01 tamamlanmış olmalı (test projesi ve guard çatısı gerekiyor).

---

## Kural metni

> **Hiçbir sır (imzalama anahtarı, veritabanı şifresi, API anahtarı, seed şifresi)
> kaynak kodda, yapılandırma dosyasında veya sürüm kontrolünde bulunmayacak.**
> Sırlar yalnızca ortam değişkeninden okunacak. Sır eksikse uygulama **başlamayacak** —
> varsayılan değere düşmeyecek. Bilinen sızmış değerler kod tabanında yasaklı liste
> hâline getirilip otomatik taranacak.

---

## Envanter

Ölçüm tarihi: **2026-08-20**, commit `d2cfc0f`.

### Sızmış sır değerleri — 14 nokta

```
$ grep -rn "EnglishPlatformSuperSecretKey2026\|StrongPass@2026\|Admin@2026\|admin123" \
    --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=obj --exclude-dir=bin \
    --exclude-dir=dotnet_sdk --exclude-dir=.git --exclude-dir=docs .

docker-compose.yml:23:      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-StrongPass@2026!}
docker-compose.yml:43:      PGADMIN_DEFAULT_PASSWORD: ${PGADMIN_PASSWORD:-admin123}
docker-compose.yml:64:      ConnectionStrings__Default: "Host=postgres;...;Password=${POSTGRES_PASSWORD:-StrongPass@2026!}"
docker-compose.yml:65:      Jwt__Key: ${JWT_KEY:-EnglishPlatformSuperSecretKey2026_MustBe32Chars!!}
proje-dokumani.md:95:- **Varsayılan Admin Seed**: `admin@platform.com` / `Admin@2026!` ...
.env.example:9:POSTGRES_PASSWORD=StrongPass@2026!
.env.example:13:PGADMIN_PASSWORD=admin123
.env.example:16:JWT_KEY=EnglishPlatformSuperSecretKey2026_MustBe32Chars!!
faz-0-baslangic.md:58:| Şifre | `Admin@2026!` |
faz-0-baslangic.md:123:| **Şifre** | `Admin@2026!` |
faz-0-baslangic.md:150:2. Giriş: `admin@admin.com` / `admin123`
faz-0-baslangic.md:156:   - Password: `StrongPass@2026!`
EnglishReadingPlatform/appsettings.json:3:    "Default": "...Password=StrongPass@2026!;Include Error Detail=true"
EnglishReadingPlatform/appsettings.json:13:    "Key": "EnglishPlatformSuperSecretKey2026_MustBe32Chars!!",
EnglishReadingPlatform/Data/AppDbContext.cs:47:  PasswordHash = BCrypt.Net.BCrypt.HashPassword("Admin@2026!"),
```

| Sır sınıfı | Nokta sayısı | Kritiklik |
|---|---|---|
| JWT imzalama anahtarı | **3** (`appsettings.json`, `.env.example`, `docker-compose.yml`) | 🔴 Sahte admin tokenı üretilebilir |
| PostgreSQL şifresi | **4** | 🔴 Doğrudan veri erişimi |
| Seed admin şifresi | **4** (1 kod + 3 doküman) | 🔴 Yönetici paneline giriş |
| pgAdmin şifresi | **3** | 🟠 |
| **TOPLAM** | **14** | |

### Varsayılana düşen yapılandırma — 3 nokta

```
$ grep -n "?? \"" EnglishReadingPlatform/Program.cs
15:var jwtKey = builder.Configuration["Jwt:Key"] ?? "SuperSecretKey_ChangeInProduction_32chars!";
24:            ValidIssuer = builder.Configuration["Jwt:Issuer"] ?? "EnglishPlatform",
26:            ValidAudience = builder.Configuration["Jwt:Audience"] ?? "EnglishPlatformUsers",
```

Satır 15 en tehlikelisi: anahtar hiç tanımlı değilse uygulama **sessizce** herkesin
bildiği bir varsayılanla çalışmaya devam eder.

### Sürüm kontrolünde duran hassas dosyalar

```
$ git ls-files | grep -E "appsettings|\.db$|\.env"
.env.example
EnglishReadingPlatform/appsettings.Development.json
EnglishReadingPlatform/appsettings.json          ← sır içeriyor
EnglishReadingPlatform/englishplatform.db        ← 5 kullanıcı + şifre hash'i (KURAL-12)

$ grep -n "appsettings\|\.db" .gitignore
(çıktı yok — hiçbiri dışlanmamış)
```

---

## Merkezî uygulama

### 1. Başlangıç doğrulayıcısı — `EnglishReadingPlatform/Configuration/SirDogrulayici.cs`

Bütün sır kontrolü **tek yerde**. Uygulama açılışında çağrılır, eksik/zayıf/yasaklı
değer varsa `InvalidOperationException` fırlatır ve uygulama hiç ayağa kalkmaz.

```csharp
namespace EnglishReadingPlatform.Configuration;

/// <summary>
/// KURAL-02: Sırlar yalnızca ortamdan okunur, eksikse uygulama başlamaz.
/// Fail-fast: sessizce varsayılana düşmek, açığın kendisidir.
/// </summary>
public static class SirDogrulayici
{
    /// <summary>
    /// Sürüm kontrolüne girmiş, artık kullanılması yasak değerler.
    /// Yeni bir sır sızarsa buraya eklenir; guard script ve bu doğrulayıcı
    /// aynı listeyi paylaşır.
    /// </summary>
    public static readonly string[] YasakliDegerler =
    {
        "EnglishPlatformSuperSecretKey2026_MustBe32Chars!!",
        "SuperSecretKey_ChangeInProduction_32chars!",
        "StrongPass@2026!",
        "Admin@2026!",
        "admin123",
    };

    private const int AsgariAnahtarUzunlugu = 32;

    public static void Dogrula(IConfiguration yapilandirma, IHostEnvironment ortam)
    {
        var hatalar = new List<string>();

        // ── JWT imzalama anahtarı ──────────────────────────────
        var jwtKey = yapilandirma["Jwt:Key"];
        if (string.IsNullOrWhiteSpace(jwtKey))
            hatalar.Add("Jwt:Key tanımlı değil. Ortam değişkeni: Jwt__Key (veya JWT_KEY).");
        else if (jwtKey.Length < AsgariAnahtarUzunlugu)
            hatalar.Add($"Jwt:Key en az {AsgariAnahtarUzunlugu} karakter olmalı (şu an {jwtKey.Length}).");
        else if (YasakliDegerler.Contains(jwtKey))
            hatalar.Add("Jwt:Key sürüm kontrolüne sızmış bir değer. Yeni anahtar üretin: openssl rand -base64 48");

        // ── Veritabanı bağlantısı ──────────────────────────────
        var baglanti = yapilandirma.GetConnectionString("Default");
        if (string.IsNullOrWhiteSpace(baglanti))
            hatalar.Add("ConnectionStrings:Default tanımlı değil.");
        else
        {
            foreach (var yasakli in YasakliDegerler.Where(v => v.Contains("Pass") || v == "admin123"))
                if (baglanti.Contains(yasakli, StringComparison.Ordinal))
                    hatalar.Add($"ConnectionStrings:Default sızmış bir şifre içeriyor ({Maskele(yasakli)}).");

            // Üretimde ayrıntılı hata detayı kapalı olmalı (KURAL-06 ile örtüşür)
            if (!ortam.IsDevelopment() &&
                baglanti.Contains("Include Error Detail=true", StringComparison.OrdinalIgnoreCase))
                hatalar.Add("Üretimde 'Include Error Detail=true' kullanılamaz — iç şema bilgisi sızdırır.");
        }

        // ── Issuer / Audience ──────────────────────────────────
        if (string.IsNullOrWhiteSpace(yapilandirma["Jwt:Issuer"]))
            hatalar.Add("Jwt:Issuer tanımlı değil.");
        if (string.IsNullOrWhiteSpace(yapilandirma["Jwt:Audience"]))
            hatalar.Add("Jwt:Audience tanımlı değil.");

        if (hatalar.Count > 0)
        {
            var mesaj = "Güvenlik yapılandırması geçersiz — uygulama başlatılamıyor:\n"
                      + string.Join("\n", hatalar.Select(h => "  • " + h))
                      + "\n\nÇözüm: proje kökündeki .env dosyasını doldurun "
                      + "(bkz. guvenlik-kurallari/00-BASLA-BURADAN.md → İnsan kararı gereken işler).";
            throw new InvalidOperationException(mesaj);
        }
    }

    private static string Maskele(string s) =>
        s.Length <= 4 ? "****" : s[..2] + new string('*', s.Length - 4) + s[^2..];
}
```

### 2. `Program.cs` — fallback'leri kaldır, doğrulayıcıyı çağır

**Mevcut (satır 15-26) — SİLİNECEK:**

```csharp
var jwtKey = builder.Configuration["Jwt:Key"] ?? "SuperSecretKey_ChangeInProduction_32chars!";
...
ValidIssuer = builder.Configuration["Jwt:Issuer"] ?? "EnglishPlatform",
ValidAudience = builder.Configuration["Jwt:Audience"] ?? "EnglishPlatformUsers",
```

**Yerine:**

```csharp
using EnglishReadingPlatform.Configuration;

var builder = WebApplication.CreateBuilder(args);

// ─── KURAL-02: Sır doğrulaması — her şeyden önce ──────────────
SirDogrulayici.Dogrula(builder.Configuration, builder.Environment);

var jwtKey    = builder.Configuration["Jwt:Key"]!;        // doğrulandı, null olamaz
var jwtIssuer = builder.Configuration["Jwt:Issuer"]!;
var jwtAudience = builder.Configuration["Jwt:Audience"]!;
```

ve `TokenValidationParameters` içinde:

```csharp
ValidIssuer = jwtIssuer,
ValidAudience = jwtAudience,
```

### 3. `appsettings.json` — sırları boşalt

```json
{
  "ConnectionStrings": {
    "Default": ""
  },
  "Kestrel": {
    "Endpoints": { "Http": { "Url": "http://0.0.0.0:8080" } }
  },
  "Jwt": {
    "Key": "",
    "Issuer": "EnglishPlatform",
    "Audience": "EnglishPlatformUsers"
  },
  "Logging": {
    "LogLevel": { "Default": "Information", "Microsoft.AspNetCore": "Warning" }
  },
  "AllowedHosts": "*",
  "Groq": { "ApiKey": "", "Model": "llama-3.3-70b-versatile" }
}
```

> `Gemini` bloğu kaldırıldı — kod artık Groq kullanıyor, kalıntıydı (bkz. `docs/04-BACKEND.md`).
> `Issuer`/`Audience` sır değildir, kalabilir.

Yerel geliştirme için `appsettings.Development.json` **git'e girmeyecek** biçimde
kullanılabilir; ama tercih edilen yol `.env` + ortam değişkenidir.

### 4. `docker-compose.yml` — varsayılan fallback'leri kaldır

`${DEGISKEN:-varsayılan}` yerine `${DEGISKEN:?hata mesajı}` kullanılır; değişken
tanımsızsa `docker compose` **başlamaz**:

```yaml
  postgres:
    environment:
      POSTGRES_DB: englishreadingdb
      POSTGRES_USER: ${POSTGRES_USER:?POSTGRES_USER tanımlı değil — .env dosyasını doldurun}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD tanımlı değil}

  pgadmin:
    environment:
      PGADMIN_DEFAULT_EMAIL: ${PGADMIN_EMAIL:?PGADMIN_EMAIL tanımlı değil}
      PGADMIN_DEFAULT_PASSWORD: ${PGADMIN_PASSWORD:?PGADMIN_PASSWORD tanımlı değil}

  backend:
    environment:
      ConnectionStrings__Default: "Host=postgres;Database=englishreadingdb;Username=${POSTGRES_USER};Password=${POSTGRES_PASSWORD}"
      Jwt__Key: ${JWT_KEY:?JWT_KEY tanımlı değil — openssl rand -base64 48 ile üretin}
      Jwt__Issuer: EnglishPlatform
      Jwt__Audience: EnglishPlatformUsers
      ASPNETCORE_ENVIRONMENT: Production
      Groq__ApiKey: ${GROQ_API_KEY:-}
```

> `Gemini__ApiKey` satırı silinir (kullanılmıyor).
> `Groq__ApiKey` isteğe bağlı olduğu için `:-}` (boş varsayılan) kalabilir.

### 5. `.env.example` — gerçek değer yerine yer tutucu

```bash
# ──────────────────────────────────────────────────────────────────
# .env — Ortam değişkenleri
# GÜVENLİK: Bu dosyayı .env olarak kopyalayın ve DEĞERLERİ DOLDURUN.
#           .env dosyası .gitignore içindedir, asla commit edilmez.
# ──────────────────────────────────────────────────────────────────

# PostgreSQL
POSTGRES_USER=appuser
# Üret:  openssl rand -base64 24
POSTGRES_PASSWORD=<DOLDURUN>

# pgAdmin (yalnızca geliştirme)
PGADMIN_EMAIL=<DOLDURUN>
# Üret:  openssl rand -base64 16
PGADMIN_PASSWORD=<DOLDURUN>

# JWT imzalama anahtarı — en az 32 karakter
# Üret:  openssl rand -base64 48
JWT_KEY=<DOLDURUN>

# Groq API anahtarı (isteğe bağlı; yoksa Google Translate'e düşer)
GROQ_API_KEY=
```

### 6. Seed admin şifresi — ortamdan oku

`Data/AppDbContext.cs` içindeki `BCrypt.HashPassword("Admin@2026!")` **derleme zamanı
sabiti olmadığı için** EF seed'inde sorunludur (her migration'da fark üretir) ve şifreyi
koda gömer. Seed'den çıkarılıp **başlangıçta bir kez** çalışan tohumlayıcıya taşınır.

`Data/AppDbContext.cs` — kullanıcı seed bloğunu **sil**:

```csharp
// SİLİNECEK:
// modelBuilder.Entity<User>().HasData(new User { Id = 1, Username = "admin", ... });
```

Yerine `EnglishReadingPlatform/Data/YoneticiTohumlayici.cs`:

```csharp
using EnglishReadingPlatform.Models;
using Microsoft.EntityFrameworkCore;

namespace EnglishReadingPlatform.Data;

/// <summary>
/// KURAL-02: Yönetici hesabı ortam değişkeninden tohumlanır, koda gömülmez.
/// Değişkenler tanımlı değilse hiçbir yönetici oluşturulmaz (sessizce geçilir),
/// ancak Production'da hiç yönetici yoksa uyarı loglanır.
/// </summary>
public static class YoneticiTohumlayici
{
    public static async Task TohumlaAsync(AppDbContext db, IConfiguration cfg, ILogger logger)
    {
        var email  = cfg["Seed:AdminEmail"];
        var sifre  = cfg["Seed:AdminPassword"];

        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(sifre))
        {
            if (!await db.Users.AnyAsync(u => u.Role == "admin"))
                logger.LogWarning(
                    "Sistemde hiç yönetici yok ve Seed:AdminEmail/Seed:AdminPassword tanımlı değil. " +
                    "Yönetici paneline giriş yapılamayacak.");
            return;
        }

        if (SirDogrulayiciYasakliMi(sifre))
            throw new InvalidOperationException(
                "Seed:AdminPassword sürüm kontrolüne sızmış bir değer. Yeni bir şifre belirleyin.");

        var normalize = email.Trim().ToLowerInvariant();
        if (await db.Users.AnyAsync(u => u.Email == normalize)) return;   // idempotent

        db.Users.Add(new User
        {
            Username     = "admin",
            Email        = normalize,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(sifre),
            Role         = "admin",
            CreatedAt    = DateTime.UtcNow
        });
        await db.SaveChangesAsync();
        logger.LogInformation("Yönetici hesabı tohumlandı: {Email}", normalize);
    }

    private static bool SirDogrulayiciYasakliMi(string deger) =>
        Configuration.SirDogrulayici.YasakliDegerler.Contains(deger);
}
```

`Program.cs` migrate bloğunu güncelle:

```csharp
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    db.Database.Migrate();
    await YoneticiTohumlayici.TohumlaAsync(db, app.Configuration, logger);
}
```

Yeni migration gerekir (seed satırı kalktığı için):

```bash
cd EnglishReadingPlatform
dotnet ef migrations add SeedAdminOrtamaTasindi
```

`.env`'e eklenecek:

```bash
Seed__AdminEmail=<DOLDURUN>
Seed__AdminPassword=<DOLDURUN>
```

### 7. `.gitignore` — hassas dosyaları dışla

Mevcut dosyanın sonuna ekle:

```gitignore
# ─── KURAL-02: sırlar ve hassas çıktılar ───────────────────
EnglishReadingPlatform/appsettings.Production.json
EnglishReadingPlatform/appsettings.Local.json
*.pfx
*.p12
yedek-*.sql
zafiyet.txt
TestResults/
```

> `appsettings.json` **dışlanmıyor** — boşaltıldıktan sonra takipte kalması doğrudur
> (yapı bilgisi taşıyor, sır taşımıyor). Guard script içinde sır olmadığını doğruluyor.

---

## Otomatik kapı

### A) Guard script — `scripts/guard/02-sirlar.sh`

```bash
#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
echo "[02] Sırlar koda ve repoya girmez"

# Yasaklı liste — SirDogrulayici.YasakliDegerler ile aynı olmalı
YASAKLI='EnglishPlatformSuperSecretKey2026|SuperSecretKey_ChangeInProduction|StrongPass@2026|Admin@2026|admin123'

# 1. Takip edilen dosyalarda sızmış sır var mı?
cikti="$(kodda_ara "$YASAKLI" '*.cs' '*.json' '*.yml' '*.yaml' '*.ts' '*.tsx' '*.sh' '*.example')"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "sızmış sır değeri" "$n" "$cikti"

# 2. Program.cs'te sır fallback'i (?? "...") kaldı mı?
cikti="$(grep -n 'Configuration\["Jwt:Key"\].*??' EnglishReadingPlatform/Program.cs 2>/dev/null || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "Jwt:Key varsayılana düşüyor" "$n" "$cikti"

# 3. docker-compose'da sır için :- varsayılanı kaldı mı?
cikti="$(grep -nE '(JWT_KEY|POSTGRES_PASSWORD|PGADMIN_PASSWORD):-' docker-compose.yml 2>/dev/null || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "docker-compose sır varsayılanı" "$n" "$cikti"

# 4. appsettings.json içinde dolu Key/Password alanı var mı?
cikti="$(grep -nE '"(Key|Password)"[[:space:]]*:[[:space:]]*"[^"]+"' \
         EnglishReadingPlatform/appsettings.json 2>/dev/null || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "appsettings.json'da dolu sır alanı" "$n" "$cikti"

# 5. Bağlantı dizesinde gömülü Password= var mı?
cikti="$(grep -nE 'Password=[^;"$]+' EnglishReadingPlatform/appsettings*.json 2>/dev/null || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "appsettings'te gömülü Password=" "$n" "$cikti"

# 6. .env dosyası yanlışlıkla takibe girmiş mi?
cikti="$(git ls-files | grep -E '(^|/)\.env$' || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir ".env sürüm kontrolünde" "$n" "$cikti"

# 7. Yaygın API anahtarı desenleri (Groq gsk_, OpenAI sk-, AWS AKIA)
cikti="$(kodda_ara 'gsk_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}' '*')"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "API anahtarı deseni" "$n" "$cikti"

guard_bitir
```

### B) Test — `EnglishReadingPlatform.Tests/SirDogrulayiciTests.cs`

```csharp
using EnglishReadingPlatform.Configuration;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace EnglishReadingPlatform.Tests;

public class SirDogrulayiciTests
{
    private static IConfiguration Yapilandir(params (string, string?)[] degerler) =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(degerler.ToDictionary(d => d.Item1, d => d.Item2))
            .Build();

    private sealed class SahteOrtam : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Production";
        public string ApplicationName { get; set; } = "Test";
        public string ContentRootPath { get; set; } = ".";
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } = null!;
    }

    private const string GecerliAnahtar = "bu_anahtar_test_icindir_ve_32_karakterden_uzundur";
    private const string GecerliBaglanti = "Host=localhost;Database=x;Username=u;Password=p";

    [Fact]
    [Trait("Category", "Sirlar")]
    public void Jwt_anahtari_yoksa_uygulama_baslamaz()
    {
        var cfg = Yapilandir(
            ("ConnectionStrings:Default", GecerliBaglanti),
            ("Jwt:Issuer", "i"), ("Jwt:Audience", "a"));

        var eylem = () => SirDogrulayici.Dogrula(cfg, new SahteOrtam());

        eylem.Should().Throw<InvalidOperationException>()
             .WithMessage("*Jwt:Key tanımlı değil*");
    }

    [Fact]
    [Trait("Category", "Sirlar")]
    public void Jwt_anahtari_kisaysa_uygulama_baslamaz()
    {
        var cfg = Yapilandir(
            ("Jwt:Key", "kisa"),
            ("ConnectionStrings:Default", GecerliBaglanti),
            ("Jwt:Issuer", "i"), ("Jwt:Audience", "a"));

        var eylem = () => SirDogrulayici.Dogrula(cfg, new SahteOrtam());

        eylem.Should().Throw<InvalidOperationException>()
             .WithMessage("*en az 32 karakter*");
    }

    [Theory]
    [Trait("Category", "Sirlar")]
    [InlineData("EnglishPlatformSuperSecretKey2026_MustBe32Chars!!")]
    [InlineData("SuperSecretKey_ChangeInProduction_32chars!")]
    public void Sizmis_anahtar_reddedilir(string sizmisAnahtar)
    {
        var cfg = Yapilandir(
            ("Jwt:Key", sizmisAnahtar),
            ("ConnectionStrings:Default", GecerliBaglanti),
            ("Jwt:Issuer", "i"), ("Jwt:Audience", "a"));

        var eylem = () => SirDogrulayici.Dogrula(cfg, new SahteOrtam());

        eylem.Should().Throw<InvalidOperationException>()
             .WithMessage("*sürüm kontrolüne sızmış*");
    }

    [Fact]
    [Trait("Category", "Sirlar")]
    public void Sizmis_db_sifresi_reddedilir()
    {
        var cfg = Yapilandir(
            ("Jwt:Key", GecerliAnahtar),
            ("ConnectionStrings:Default", "Host=localhost;Database=x;Username=u;Password=StrongPass@2026!"),
            ("Jwt:Issuer", "i"), ("Jwt:Audience", "a"));

        var eylem = () => SirDogrulayici.Dogrula(cfg, new SahteOrtam());

        eylem.Should().Throw<InvalidOperationException>()
             .WithMessage("*sızmış bir şifre*");
    }

    [Fact]
    [Trait("Category", "Sirlar")]
    public void Uretimde_Include_Error_Detail_reddedilir()
    {
        var cfg = Yapilandir(
            ("Jwt:Key", GecerliAnahtar),
            ("ConnectionStrings:Default", GecerliBaglanti + ";Include Error Detail=true"),
            ("Jwt:Issuer", "i"), ("Jwt:Audience", "a"));

        var eylem = () => SirDogrulayici.Dogrula(cfg, new SahteOrtam { EnvironmentName = "Production" });

        eylem.Should().Throw<InvalidOperationException>()
             .WithMessage("*Include Error Detail*");
    }

    [Fact]
    [Trait("Category", "Sirlar")]
    public void Gecerli_yapilandirma_kabul_edilir()
    {
        var cfg = Yapilandir(
            ("Jwt:Key", GecerliAnahtar),
            ("ConnectionStrings:Default", GecerliBaglanti),
            ("Jwt:Issuer", "i"), ("Jwt:Audience", "a"));

        var eylem = () => SirDogrulayici.Dogrula(cfg, new SahteOrtam());

        eylem.Should().NotThrow();
    }
}
```

---

## Bitti kriteri

```bash
cd /Users/alihanfindikci/Desktop/ingilizceproje

# 1) Sızmış sır kalmadı mı?  → BEKLENEN: 0
git ls-files \
  | grep -v -E '^(dotnet_sdk/|guvenlik-kurallari/|docs/|proje-dokumani.md|faz-0-baslangic.md)' \
  | xargs grep -l -E 'EnglishPlatformSuperSecretKey2026|SuperSecretKey_ChangeInProduction|StrongPass@2026|Admin@2026|admin123' 2>/dev/null \
  | wc -l

# 2) Program.cs'te sır fallback'i kaldı mı?  → BEKLENEN: 0
grep -c 'Configuration\["Jwt:Key"\].*??' EnglishReadingPlatform/Program.cs || echo 0

# 3) appsettings.json'da dolu sır alanı?  → BEKLENEN: 0
grep -cE '"(Key|Password)"[[:space:]]*:[[:space:]]*"[^"]+"' EnglishReadingPlatform/appsettings.json || echo 0

# 4) docker-compose'da sır varsayılanı?  → BEKLENEN: 0
grep -cE '(JWT_KEY|POSTGRES_PASSWORD|PGADMIN_PASSWORD):-' docker-compose.yml || echo 0

# 5) Guard kapısı  → BEKLENEN: TOPLAM İHLAL: 0, çıkış kodu 0
bash scripts/guard/02-sirlar.sh; echo "çıkış kodu: $?"

# 6) Testler  → BEKLENEN: Başarısız: 0, Başarılı: 7
dotnet test Linguza.sln --filter "Category=Sirlar" --logger "console;verbosity=normal"

# 7) Anahtarsız uygulama gerçekten başlamıyor mu?  → BEKLENEN: InvalidOperationException
cd EnglishReadingPlatform
env -u Jwt__Key -u JWT_KEY ASPNETCORE_ENVIRONMENT=Production dotnet run --no-build 2>&1 | head -20
cd ..

# 8) Tüm kapılar  → BEKLENEN: TOPLAM İHLAL: 0
bash scripts/guard/run-all.sh; echo "çıkış kodu: $?"
```

**Kabul koşulu:** 1–4 komutları `0`, 5 ve 8 çıkış kodu `0`, 6'da `Başarısız: 0`,
7'de `Güvenlik yapılandırması geçersiz` mesajı görünmeli.

> **Not (1. komut):** `proje-dokumani.md` ve `faz-0-baslangic.md` hariç tutuldu çünkü
> bunlar tarihsel belgelerdir. Yine de içlerindeki şifreleri `<eski-şifre-kaldırıldı>`
> ile değiştirmek doğru olur — geçiş planı adım 9'da yapılıyor. O adım bitince
> hariç tutma kaldırılabilir.

---

## Mutasyon kontrolü (zorunlu)

```bash
# MUTASYON A — yasaklı listeyi boşalt, sızmış anahtar testleri kırmızı olmalı
sed -i '' 's|"EnglishPlatformSuperSecretKey2026_MustBe32Chars!!",|// mutasyon|' \
  EnglishReadingPlatform/Configuration/SirDogrulayici.cs

dotnet test Linguza.sln --filter "Category=Sirlar"
# BEKLENEN: Başarısız: 1 veya daha fazla (Sizmis_anahtar_reddedilir KIRMIZI)

git checkout EnglishReadingPlatform/Configuration/SirDogrulayici.cs
dotnet test Linguza.sln --filter "Category=Sirlar"
# BEKLENEN: Başarısız: 0
```

```bash
# MUTASYON B — Program.cs'e fallback'i geri koy, guard kırmızı olmalı
sed -i '' 's|var jwtKey    = builder.Configuration\["Jwt:Key"\]!;|var jwtKey = builder.Configuration["Jwt:Key"] ?? "SuperSecretKey_ChangeInProduction_32chars!";|' \
  EnglishReadingPlatform/Program.cs

bash scripts/guard/02-sirlar.sh; echo "çıkış kodu: $?"
# BEKLENEN: çıkış kodu 1, "Jwt:Key varsayılana düşüyor  1 ihlal ✗"

git checkout EnglishReadingPlatform/Program.cs
bash scripts/guard/02-sirlar.sh; echo "çıkış kodu: $?"
# BEKLENEN: çıkış kodu 0
```

```bash
# MUTASYON C — appsettings.json'a sırrı geri koy
sed -i '' 's|"Key": ""|"Key": "EnglishPlatformSuperSecretKey2026_MustBe32Chars!!"|' \
  EnglishReadingPlatform/appsettings.json

bash scripts/guard/02-sirlar.sh; echo "çıkış kodu: $?"   # BEKLENEN: 1
git checkout EnglishReadingPlatform/appsettings.json
bash scripts/guard/02-sirlar.sh; echo "çıkış kodu: $?"   # BEKLENEN: 0
```

---

## Geçiş planı

14 sır noktası ve 3 fallback şu sırayla taşınır:

| Adım | İş | Etkilenen nokta | Doğrulama |
|---|---|---|---|
| 1 | `SirDogrulayici.cs` yaz | — | derlenir |
| 2 | `Program.cs`'te 3 fallback'i kaldır, doğrulayıcıyı çağır | 3 | `grep '??' Program.cs` → 0 sır fallback'i |
| 3 | `appsettings.json`'ı boşalt, `Gemini` bloğunu sil | 2 | guard #4, #5 → 0 |
| 4 | `docker-compose.yml`'de `:-` → `:?` | 4 | guard #3 → 0 |
| 5 | `.env.example`'ı yer tutucuya çevir | 3 | guard #1 → azalır |
| 6 | Seed admin'i `YoneticiTohumlayici`'ya taşı, migration üret | 1 | `dotnet ef migrations list` yeni migration'ı gösterir |
| 7 | `.gitignore`'a hassas desenleri ekle | — | `git status` temiz |
| 8 | `AuthHelper.AdminOlarakGirisYapAsync`'i yeni seed'e uyarla | — | KURAL-01 testleri hâlâ yeşil |
| 9 | `proje-dokumani.md` ve `faz-0-baslangic.md`'deki şifreleri maskele | 4 | guard #1 → 0 |
| 10 | `SirDogrulayiciTests.cs` yaz | — | 7 test yeşil |
| 11 | `scripts/guard/02-sirlar.sh` yaz + `chmod +x` | — | çıkış kodu 0 |
| 12 | İlerleme tablosunu güncelle | — | — |

### ⚠️ Adım 6'nın kırılgan noktası

Seed kullanıcısı silinince `AppDbContextModelSnapshot.cs` değişir ve **var olan
veritabanındaki Id=1 kullanıcısı migration ile silinir**. Bu, o kullanıcıya bağlı
tüm veriyi cascade siler.

Bu yüzden adım 6'dan önce **mutlaka**:

```bash
docker exec english_postgres pg_dump -U appuser englishreadingdb > yedek-kural02-$(date +%s).sql
ls -la yedek-kural02-*.sql
```

Ve migration'ı uygulamadan önce üretilen SQL'i incele:

```bash
cd EnglishReadingPlatform
dotnet ef migrations script --idempotent -o /tmp/kural02.sql
grep -i "DELETE FROM" /tmp/kural02.sql
```

`DELETE FROM "Users"` görürsen ve o kullanıcı canlıda kullanılıyorsa, migration'a elle
"sil değil, güncelle" mantığı yazılmalıdır.

---

## Tuzaklar

| Tuzak | Neden olur | Nasıl kaçınılır |
|---|---|---|
| **Sırrı silip anahtarı iptal etmemek** | "Dosyadan sildim, tamam" sanılır. Ama sır git geçmişinde ve muhtemelen dışarıda | Anahtarı **değiştir** — silmek yetmez. `00-BASLA-BURADAN.md` madde 1 |
| **`appsettings.Development.json`'a sır koymak** | "Zaten sadece geliştirme" denir, sonra commit edilir | `.gitignore`'a `appsettings.Local.json` eklendi; geliştirmede de `.env` kullan |
| **Guard'ın yasaklı listesi ile `SirDogrulayici`'nınkinin ayrışması** | İki yerde elle tutulur, biri güncellenir diğeri unutulur | Guard script'in başındaki `YASAKLI` değişkenine yorum ekle: *"SirDogrulayici.YasakliDegerler ile senkron tut"*. İdeali: guard'ın listeyi `.cs` dosyasından `grep` ile okuması |
| **`docker compose` `:?` sözdizimini yanlış yazmak** | `${VAR:?mesaj}` yerine `${VAR?mesaj}` yazılırsa boş değer geçer | `:?` iki karakter birlikte — boş **ve** tanımsız değeri reddeder |
| **Seed migration'ını yedeksiz uygulamak** | Id=1 kullanıcısı ve tüm bağlı verisi cascade silinir | Adım 6'daki yedek + `ef migrations script` incelemesi |
| **Testlerde `TestJwtKey`'in yasaklı listeye girmesi** | Test anahtarı `TEST_ONLY_KEY_...` ile başlıyor, listede yok — ama biri "test" değerini de yasaklarsa tüm testler kırılır | Yasaklı listeye yalnızca **gerçekten sızmış** değerler eklenir |
| **`Include Error Detail=true`'yu geliştirmede de kaldırmak** | Hata ayıklama zorlaşır, ekip geri ekler | Doğrulayıcı yalnızca `!IsDevelopment()` durumunda reddediyor |
| **`.env`'i `.env.example`'dan kopyalayıp doldurmamak** | `<DOLDURUN>` değeri 32 karakterden kısa → uygulama açılmaz, kişi kodu suçlar | Hata mesajı zaten `.env`'i ve `00-BASLA-BURADAN.md`'yi işaret ediyor |

---

## Teslim şablonu

```markdown
## 1. Kanıtlanarak kapandı
<8 bitti-kriteri komutunun ham çıktısı>
<mutasyon A/B/C çıktıları — kırmızı → yeşil>

## 2. Kapanmadı
<örn: git geçmişi temizliği yapılmadı çünkü kullanıcı kararı bekleniyor>

## 3. İnsan müdahalesi gerekiyor
- [ ] `openssl rand -base64 48` ile yeni JWT anahtarı üret, `.env`'e yaz
- [ ] `openssl rand -base64 24` ile yeni DB şifresi üret, `.env`'e yaz + ALTER USER çalıştır
- [ ] `Seed__AdminEmail` ve `Seed__AdminPassword` değerlerini `.env`'e yaz
- [ ] Groq anahtarı git'e girmiş mi kontrol: `git log -p --all -S "gsk_" | head -40`
- [ ] Git geçmişi temizliği gerekli mi? (repo paylaşıldı mı?) — karar
<detaylı anlatım: 00-BASLA-BURADAN.md → İnsan kararı gereken işler, madde 1-4 ve 9>

## Değiştirilen dosyalar
<git diff --stat>

## Commit
<git log -1 --format='%H %s'>
```
