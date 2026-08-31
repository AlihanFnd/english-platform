# KURAL-01 — Kanıt altyapısı

> **Bu kural diğer 11 kuralın temelidir.** Test projesi ve guard mekanizması kurulmadan
> hiçbir kuralın "bitti kriteri" çalıştırılamaz, hiçbir mutasyon testi yapılamaz.
> Bu yüzden ilk sırada.

---

## Kural metni

> **Her güvenlik iddiası, çalıştırılabilir bir komutla kanıtlanacak.**
> Kod okuması kanıt değildir. Projede `dotnet test` ile koşan bir test projesi,
> `bash scripts/guard/run-all.sh` ile koşan bir ihlal tarayıcısı ve bunları her
> commit'te çalıştıran bir CI hattı bulunacak. Bağımlılık zafiyetleri otomatik taranacak.

---

## Envanter

Ölçüm tarihi: **2026-08-20**, commit `d2cfc0f`.

### Mevcut durum: sıfır

```
$ find . -name "*.Tests.csproj" -o -name "*Test*.csproj" | grep -v node_modules
YOK

$ ls -la .github 2>/dev/null || echo "YOK"
YOK

$ ls *.sln 2>/dev/null || echo "YOK"
YOK
```

| Öğe | Sayı | Durum |
|---|---|---|
| Test projesi | **0** | Yok |
| Test dosyası | **0** | Yok |
| CI iş akışı (`.github/workflows/`) | **0** | Yok |
| Guard script | **0** | Yok |
| Çözüm dosyası (`.sln`) | **0** | Yok |
| Bağımlılık zafiyet taraması | **0** | Hiç çalıştırılmamış |

### Korunması gereken yüzey (diğer kuralların hedefi)

```
$ grep -rn "\[Http\(Get\|Post\|Put\|Delete\|Patch\)" EnglishReadingPlatform/Controllers/ | wc -l
      38
```

| Ölçüm | Sayı |
|---|---|
| Toplam HTTP ucu | **38** |
| Yazma ucu (POST/PUT/DELETE) | **22** |
| Controller sınıfı | **8** |
| İstek DTO sınıfı | **15** |

### Ortam doğrulaması (bu makinede çalıştırıldı)

```
$ dotnet --list-sdks
10.0.302 [/opt/homebrew/Cellar/dotnet/10.0.302/libexec/sdk]

$ dotnet --list-runtimes
Microsoft.AspNetCore.App 10.0.10 [...]
Microsoft.NETCore.App 10.0.10 [...]

$ dotnet build EnglishReadingPlatform/EnglishReadingPlatform.csproj
Oluşturma başarılı oldu.
    0 Uyarı
    0 Hata
Geçen Süre 00:00:24.34
```

**🔴 Doğrulanmış engel:** Proje `net8.0` hedefliyor ama makinede **yalnızca .NET 10
runtime** kurulu. `dotnet new xunit` şablonu da sadece `net10.0` sunuyor
(`-f net8.0` → exit 127). Doğrudan `dotnet test` çalıştırıldığında alınan hata:

```
'.../Smoke.dll' kaynağı için testhost işleminden şu hatayla çıkıldı:
You must install or update .NET to run this application.
Framework: 'Microsoft.NETCore.App', version '8.0.0' (arm64)
The following frameworks were found:
  10.0.10 at [/opt/homebrew/Cellar/dotnet/10.0.302/libexec/shared/Microsoft.NETCore.App]
```

**Çözüm doğrulandı:** `.csproj` içine `<RollForward>LatestMajor</RollForward>` eklendiğinde:

```
Başarılı!  - Başarısız:     0, Başarılı:     1, Atlanan:     0, Toplam:     1, Süre: 3 ms - Smoke.dll (net8.0)
```

Bu satır aşağıdaki merkezî çözümde **zorunludur**, silinirse tüm test altyapısı çalışmaz.

---

## Merkezî uygulama

### 1. Test projesi — `EnglishReadingPlatform.Tests/EnglishReadingPlatform.Tests.csproj`

```xml
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <IsPackable>false</IsPackable>
    <!-- ZORUNLU: makinede net8.0 runtime yok, net10'a roll-forward gerekiyor.
         Bu satır silinirse "You must install or update .NET" hatası alınır. -->
    <RollForward>LatestMajor</RollForward>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.11.1" />
    <PackageReference Include="xunit" Version="2.9.2" />
    <PackageReference Include="xunit.runner.visualstudio" Version="2.8.2" />
    <PackageReference Include="Microsoft.AspNetCore.Mvc.Testing" Version="8.0.11" />
    <PackageReference Include="FluentAssertions" Version="6.12.1" />
  </ItemGroup>

  <ItemGroup>
    <ProjectReference Include="../EnglishReadingPlatform/EnglishReadingPlatform.csproj" />
  </ItemGroup>

</Project>
```

`WebApplicationFactory<Program>` çalışması için backend projesinin `Program` sınıfı
test projesinden görünmelidir. `EnglishReadingPlatform/Program.cs` dosyasının **en
altına** şu satırı ekle:

```csharp
// Test projesinin WebApplicationFactory<Program> kullanabilmesi için.
public partial class Program { }
```

Ve `EnglishReadingPlatform/EnglishReadingPlatform.csproj` içindeki `<PropertyGroup>`'a:

```xml
<InternalsVisibleTo Include="EnglishReadingPlatform.Tests" />
```

### 2. Test uygulama fabrikası — `EnglishReadingPlatform.Tests/Infrastructure/TestAppFactory.cs`

```csharp
using EnglishReadingPlatform.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace EnglishReadingPlatform.Tests.Infrastructure;

/// <summary>
/// Testler için uygulama örneği.
/// Pazarlıksız madde 4: gerçek veritabanına ASLA yazmaz — englishreadingdb_test kullanır.
/// Şema, gerçek migration'larla üretilir (InMemory sağlayıcı DEĞİL) çünkü
/// varchar(n) taşması gibi PostgreSQL'e özgü davranışlar test edilebilmeli.
/// </summary>
public class TestAppFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    public const string TestJwtKey = "TEST_ONLY_KEY_do_not_use_in_production_32+chars!!";

    private static string ConnectionString =>
        Environment.GetEnvironmentVariable("TEST_DB_CONNECTION")
        ?? "Host=localhost;Database=englishreadingdb_test;Username=appuser;Password=StrongPass@2026!";

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");

        builder.ConfigureAppConfiguration((_, config) =>
        {
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:Default"] = ConnectionString,
                ["Jwt:Key"]      = TestJwtKey,
                ["Jwt:Issuer"]   = "EnglishPlatform",
                ["Jwt:Audience"] = "EnglishPlatformUsers",
                ["Groq:ApiKey"]  = "",          // testlerde dış API çağrısı yapılmasın
                ["CorsOrigins"]  = "http://localhost:3000",
            });
        });
    }

    public async Task InitializeAsync()
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.Database.EnsureDeletedAsync();   // her koşuda temiz şema klonu
        await db.Database.MigrateAsync();
    }

    public new async Task DisposeAsync()
    {
        await base.DisposeAsync();
    }
}

[CollectionDefinition("api")]
public class ApiCollection : ICollectionFixture<TestAppFactory> { }
```

### 3. Ortak test yardımcıları — `EnglishReadingPlatform.Tests/Infrastructure/AuthHelper.cs`

```csharp
using System.Net.Http.Headers;
using System.Net.Http.Json;

namespace EnglishReadingPlatform.Tests.Infrastructure;

public static class AuthHelper
{
    public record TokenSonucu(string Token, int UserId, string Role);

    /// <summary>Yeni bir öğrenci hesabı açar ve token'ını döner.</summary>
    public static async Task<TokenSonucu> OgrenciOlarakGirisYapAsync(HttpClient client, string? ek = null)
    {
        var benzersiz = ek ?? Guid.NewGuid().ToString("N")[..8];
        var res = await client.PostAsJsonAsync("/api/auth/register", new
        {
            username = $"ogr_{benzersiz}",
            email    = $"ogr_{benzersiz}@test.local",
            password = "TestSifre123!",
            role     = "student"
        });
        res.EnsureSuccessStatusCode();
        var body = await res.Content.ReadFromJsonAsync<KayitYaniti>();
        return new TokenSonucu(body!.token, body.user.id, body.user.role);
    }

    /// <summary>Seed admin hesabıyla giriş yapar.</summary>
    public static async Task<TokenSonucu> AdminOlarakGirisYapAsync(HttpClient client)
    {
        var res = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email = "admin@platform.com",
            password = "Admin@2026!"
        });
        res.EnsureSuccessStatusCode();
        var body = await res.Content.ReadFromJsonAsync<KayitYaniti>();
        return new TokenSonucu(body!.token, body.user.id, body.user.role);
    }

    public static HttpClient TokenIle(this HttpClient client, string token)
    {
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    private record KullaniciDto(int id, string username, string email, string role);
    private record KayitYaniti(string token, KullaniciDto user);
}
```

> **Not:** `AdminOlarakGirisYapAsync` seed şifresini kullanıyor. KURAL-02 seed şifresini
> değiştirdiğinde bu yardımcı da güncellenmelidir — KURAL-02'nin geçiş planında yazıyor.

### 4. Guard script çatısı — `scripts/guard/`

Guard script'ler, **test yazılamayan** ihlalleri (kod deseni, dosya varlığı, yapılandırma)
yakalar. Her biri ihlal sayısını basar ve ihlal varsa `exit 1` yapar.

`scripts/guard/_lib.sh`:

```bash
#!/usr/bin/env bash
# Ortak guard yardımcıları. Her guard script bunu source eder.

set -uo pipefail

PROJE_KOK="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJE_KOK"

TOPLAM_IHLAL=0

# Takip edilen (git ls-files) dosyalarda desen ara. Üretilmiş/vendor dizinleri hariç.
kodda_ara() {
  local desen="$1"; shift
  git ls-files -- "$@" 2>/dev/null \
    | grep -v -E '^(dotnet_sdk/|.*/node_modules/|.*/\.next/|.*/wwwroot/lib/|guvenlik-kurallari/|docs/|scripts/guard/)' \
    | xargs -I{} grep -Hn -E "$desen" {} 2>/dev/null
}

ihlal_bildir() {
  local baslik="$1" sayi="$2" ayrinti="${3:-}"
  if [ "$sayi" -eq 0 ]; then
    printf '  %-42s %d ihlal  ✓\n' "$baslik" "$sayi"
  else
    printf '  %-42s %d ihlal  ✗\n' "$baslik" "$sayi"
    [ -n "$ayrinti" ] && printf '%s\n' "$ayrinti" | sed 's/^/      /'
    TOPLAM_IHLAL=$((TOPLAM_IHLAL + sayi))
  fi
}

guard_bitir() {
  echo ""
  echo "  TOPLAM İHLAL: $TOPLAM_IHLAL"
  [ "$TOPLAM_IHLAL" -eq 0 ] && exit 0 || exit 1
}
```

`scripts/guard/01-altyapi.sh` — bu kuralın kendi kapısı:

```bash
#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
echo "[01] Kanıt altyapısı"

# 1. Test projesi var mı?
n=0; [ -f "EnglishReadingPlatform.Tests/EnglishReadingPlatform.Tests.csproj" ] || n=1
ihlal_bildir "test projesi mevcut" "$n" "EnglishReadingPlatform.Tests bulunamadı"

# 2. RollForward satırı duruyor mu? (silinirse testler hiç koşmaz)
n=0
grep -q "<RollForward>LatestMajor</RollForward>" \
  EnglishReadingPlatform.Tests/EnglishReadingPlatform.Tests.csproj 2>/dev/null || n=1
ihlal_bildir "RollForward LatestMajor mevcut" "$n" "net8.0 runtime yok; bu satır zorunlu"

# 3. CI iş akışı var mı?
n=0; [ -f ".github/workflows/guvenlik.yml" ] || n=1
ihlal_bildir "CI iş akışı mevcut" "$n" ".github/workflows/guvenlik.yml bulunamadı"

# 4. run-all.sh çalıştırılabilir mi?
n=0; [ -x "scripts/guard/run-all.sh" ] || n=1
ihlal_bildir "run-all.sh çalıştırılabilir" "$n" "chmod +x scripts/guard/run-all.sh"

guard_bitir
```

`scripts/guard/run-all.sh`:

```bash
#!/usr/bin/env bash
# Tüm guard script'lerini sırayla çalıştırır.
# Çıkış kodu: 0 = hiç ihlal yok, 1 = en az bir ihlal var.

set -uo pipefail
KLASOR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

GENEL_SONUC=0
echo "════════════════════════════════════════════════════════"
echo " GÜVENLİK KAPILARI"
echo "════════════════════════════════════════════════════════"

for script in "$KLASOR"/[0-9][0-9]-*.sh; do
  [ -e "$script" ] || continue
  bash "$script" || GENEL_SONUC=1
  echo ""
done

echo "════════════════════════════════════════════════════════"
if [ "$GENEL_SONUC" -eq 0 ]; then
  echo " SONUÇ: tüm kapılar geçildi ✓"
else
  echo " SONUÇ: EN AZ BİR KAPI KIRILDI ✗"
fi
echo "════════════════════════════════════════════════════════"
exit "$GENEL_SONUC"
```

### 5. Çözüm dosyası — kökte `Linguza.sln`

```bash
dotnet new sln -n Linguza
dotnet sln add EnglishReadingPlatform/EnglishReadingPlatform.csproj
dotnet sln add EnglishReadingPlatform.Tests/EnglishReadingPlatform.Tests.csproj
```

### 6. CI iş akışı — `.github/workflows/guvenlik.yml`

```yaml
name: Güvenlik Kapıları

on:
  push:
    branches: [main]
  pull_request:

jobs:
  backend:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15-alpine
        env:
          POSTGRES_DB: englishreadingdb_test
          POSTGRES_USER: appuser
          POSTGRES_PASSWORD: ci_test_password
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U appuser"
          --health-interval 10s --health-timeout 5s --health-retries 5

    env:
      TEST_DB_CONNECTION: "Host=localhost;Database=englishreadingdb_test;Username=appuser;Password=ci_test_password"

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '8.0.x'

      - name: Derle
        run: dotnet build Linguza.sln --configuration Release

      - name: Testler
        run: dotnet test Linguza.sln --configuration Release --no-build --logger "console;verbosity=normal"

      - name: Güvenlik kapıları
        run: bash scripts/guard/run-all.sh

      - name: Bağımlılık zafiyet taraması (.NET)
        run: |
          dotnet list Linguza.sln package --vulnerable --include-transitive 2>&1 | tee zafiyet.txt
          if grep -qE '(High|Critical)' zafiyet.txt; then
            echo "::error::Yüksek/kritik seviye zafiyetli paket bulundu"
            exit 1
          fi

  frontend:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        uygulama: [frontend, admin-panel]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: ${{ matrix.uygulama }}/package-lock.json
      - run: npm ci
        working-directory: ${{ matrix.uygulama }}
      - name: npm audit
        run: npm audit --audit-level=high
        working-directory: ${{ matrix.uygulama }}
      - run: npm run build
        working-directory: ${{ matrix.uygulama }}
```

### 7. İlk duman testi — `EnglishReadingPlatform.Tests/AltyapiTests.cs`

```csharp
using System.Net;
using EnglishReadingPlatform.Tests.Infrastructure;
using FluentAssertions;
using Xunit;

namespace EnglishReadingPlatform.Tests;

[Collection("api")]
public class AltyapiTests
{
    private readonly TestAppFactory _fabrika;
    public AltyapiTests(TestAppFactory fabrika) => _fabrika = fabrika;

    [Fact]
    [Trait("Category", "Altyapi")]
    public async Task Uygulama_ayaga_kalkiyor_ve_korumali_uc_401_donuyor()
    {
        var client = _fabrika.CreateClient();
        var yanit = await client.GetAsync("/api/books");
        yanit.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    [Trait("Category", "Altyapi")]
    public async Task Ogrenci_kaydolup_token_alabiliyor()
    {
        var client = _fabrika.CreateClient();
        var sonuc = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        sonuc.Token.Should().NotBeNullOrWhiteSpace();
        sonuc.Role.Should().Be("student");
    }

    [Fact]
    [Trait("Category", "Altyapi")]
    public async Task Test_veritabani_gercek_veritabani_DEGIL()
    {
        // Pazarlıksız madde 4'ün otomatik kontrolü.
        using var scope = _fabrika.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<EnglishReadingPlatform.Data.AppDbContext>();
        var baglanti = db.Database.GetConnectionString() ?? "";
        baglanti.Should().Contain("englishreadingdb_test");
        baglanti.Should().NotContain("Database=englishreadingdb;");
    }
}
```

---

## Otomatik kapı

| Kapı | Ne yakalar | Nasıl kırılır |
|---|---|---|
| `scripts/guard/01-altyapi.sh` | Test projesi, `RollForward`, CI dosyası veya `run-all.sh` silinirse | Dosyalardan biri silinir → `exit 1` |
| `AltyapiTests.Test_veritabani_gercek_veritabani_DEGIL` | Birisi testleri gerçek DB'ye yönlendirirse | Bağlantı dizesi değişir → test kırmızı |
| CI `Testler` adımı | Herhangi bir test kırmızıya dönerse | PR merge edilemez |
| CI `Bağımlılık zafiyet taraması` | High/Critical zafiyetli NuGet paketi eklenirse | `exit 1` |
| CI `npm audit` | High seviye npm zafiyeti eklenirse | `exit 1` |

---

## Bitti kriteri

Aşağıdaki komutların **hepsi** çalıştırılacak ve **ham çıktıları** rapora konacak.

```bash
cd /Users/alihanfindikci/Desktop/ingilizceproje

# 0) Test veritabanını hazırla
docker compose up -d postgres
docker exec english_postgres psql -U appuser -d postgres \
  -c "DROP DATABASE IF EXISTS englishreadingdb_test;" \
  -c "CREATE DATABASE englishreadingdb_test;"

# 1) Çözüm derleniyor mu?  → 0 Hata
dotnet build Linguza.sln
echo "çıkış kodu: $?"

# 2) Testler yeşil mi?  → Başarısız: 0
dotnet test Linguza.sln --logger "console;verbosity=normal"
echo "çıkış kodu: $?"

# 3) Guard kapıları geçiliyor mu?  → TOPLAM İHLAL: 0
bash scripts/guard/run-all.sh
echo "çıkış kodu: $?"

# 4) Zafiyetli paket var mı?  → çıktı boş olmalı
dotnet list Linguza.sln package --vulnerable --include-transitive 2>&1 | grep -E "High|Critical" | wc -l

# 5) CI dosyası geçerli YAML mı?
python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/guvenlik.yml')); print('YAML geçerli')"
```

**Kabul koşulu — hepsi sağlanmalı:**

| # | Beklenen |
|---|---|
| 1 | `0 Hata`, çıkış kodu `0` |
| 2 | `Başarısız: 0`, en az **3** test başarılı, çıkış kodu `0` |
| 3 | `TOPLAM İHLAL: 0`, çıkış kodu `0` |
| 4 | çıktı `0` |
| 5 | `YAML geçerli` |

---

## Mutasyon kontrolü (zorunlu)

Kapının gerçekten ölçtüğünü kanıtla:

```bash
# MUTASYON A — RollForward satırını sil, kapı kırılmalı
sed -i '' '/<RollForward>LatestMajor<\/RollForward>/d' \
  EnglishReadingPlatform.Tests/EnglishReadingPlatform.Tests.csproj

bash scripts/guard/01-altyapi.sh; echo "çıkış kodu: $?"    # BEKLENEN: 1 (KIRMIZI)
dotnet test Linguza.sln 2>&1 | tail -5                     # BEKLENEN: runtime hatası

# GERİ AL
git checkout EnglishReadingPlatform.Tests/EnglishReadingPlatform.Tests.csproj
bash scripts/guard/01-altyapi.sh; echo "çıkış kodu: $?"    # BEKLENEN: 0 (YEŞİL)
```

```bash
# MUTASYON B — testleri gerçek veritabanına yönlendir, test kırmızı olmalı
TEST_DB_CONNECTION="Host=localhost;Database=englishreadingdb;Username=appuser;Password=StrongPass@2026!" \
  dotnet test Linguza.sln --filter "FullyQualifiedName~Test_veritabani_gercek_veritabani_DEGIL"
# BEKLENEN: Başarısız: 1  ← koruma çalışıyor

# ⚠️ Bu mutasyon gerçek DB'ye BAĞLANMAYI dener ama InitializeAsync EnsureDeleted çağırır.
#    Bu yüzden mutasyonu ÇALIŞTIRMADAN ÖNCE yedek al:
docker exec english_postgres pg_dump -U appuser englishreadingdb > yedek-mutasyon-b.sql
ls -la yedek-mutasyon-b.sql
```

> 🔴 **Mutasyon B için uyarı:** `TestAppFactory.InitializeAsync` içinde
> `EnsureDeletedAsync()` var. Yanlış bağlantı dizesiyle çalıştırılırsa **gerçek
> veritabanını siler.** Bu yüzden mutasyon B'yi yapmadan önce yedek al, ya da
> mutasyonu şu güvenli biçimde yap: testi geçici olarak `.Should().Contain("asla_eslesmez")`
> hâline getir, kırmızıya döndüğünü gör, geri al. **Güvenli yol tercih edilmelidir.**

---

## Geçiş planı

Bu kural yeni altyapı kurar, mevcut kod taşınmaz. Sıra:

| Adım | İş | Doğrulama |
|---|---|---|
| 1 | `EnglishReadingPlatform.Tests/` klasörü + `.csproj` oluştur | `dotnet build` geçer |
| 2 | `Program.cs` sonuna `public partial class Program { }` ekle | `dotnet build` geçer |
| 3 | `Infrastructure/TestAppFactory.cs` + `AuthHelper.cs` yaz | derlenir |
| 4 | `Linguza.sln` oluştur, iki projeyi ekle | `dotnet sln list` iki proje gösterir |
| 5 | Test DB'sini oluştur | `psql -l` içinde `englishreadingdb_test` görünür |
| 6 | `AltyapiTests.cs` yaz | `dotnet test` → 3 başarılı |
| 7 | `scripts/guard/_lib.sh`, `01-altyapi.sh`, `run-all.sh` yaz + `chmod +x` | `run-all.sh` → 0 |
| 8 | `.github/workflows/guvenlik.yml` yaz | YAML geçerli |
| 9 | `.gitignore`'a ekle: `yedek-*.sql`, `zafiyet.txt`, `TestResults/` | `git status` temiz |
| 10 | `00-BASLA-BURADAN.md` ilerleme tablosunu güncelle | — |

---

## Tuzaklar

| Tuzak | Neden olur | Nasıl kaçınılır |
|---|---|---|
| **`dotnet new xunit -f net8.0` denemek** | Şablon net10.0'dan başkasını sunmuyor, exit 127 verir | `.csproj`'u elle yaz (yukarıdaki gibi) |
| **`RollForward` satırını unutmak** | Testler derlenir ama koşmaz; hata mesajı "install .NET" der, kişi SDK kurmaya çalışır | Guard script bunu kontrol ediyor |
| **InMemory sağlayıcı kullanmak** | Kolay görünür ama `varchar(n)` taşmasını, unique index ihlalini, cascade davranışını yakalamaz → KURAL-05 ve KURAL-12'nin mutasyon testleri anlamsızlaşır | Gerçek PostgreSQL şema klonu kullan |
| **Test DB'si ile gerçek DB'yi karıştırmak** | Bağlantı dizesi kopyalanırken `_test` eki düşer → `EnsureDeleted` gerçek veriyi siler | `Test_veritabani_gercek_veritabani_DEGIL` testi bunu yakalar; ayrıca yedek al |
| **`Program` sınıfını public yapmayı unutmak** | `WebApplicationFactory<Program>` derlenmez, hata mesajı kafa karıştırıcıdır ("Program is inaccessible due to its protection level") | Adım 2'yi atlama |
| **Testleri paralel koşturmak** | Aynı DB'ye yazan testler birbirini bozar, rastgele kırmızılar | `[Collection("api")]` ile aynı koleksiyona al (xUnit koleksiyon içini sıralı koşar) |
| **CI'da `npm audit`'i `--audit-level` olmadan yazmak** | Her `low` uyarısında build kırılır, ekip kapıyı devre dışı bırakır | `--audit-level=high` |
| **Guard script'i `set -e` ile yazmak** | İlk `grep` bulamayınca (exit 1) script erken ölür, "0 ihlal" sanılır | `_lib.sh` bilinçli olarak `set -uo pipefail` kullanıyor, `-e` yok |
| **`chmod +x` unutmak** | `run-all.sh` çalışmaz, CI'da "Permission denied" | Guard script bunu kontrol ediyor |

---

## Teslim şablonu

Oturum sonunda şu üç başlığı doldur:

```markdown
## 1. Kanıtlanarak kapandı
<dotnet build / dotnet test / run-all.sh ham çıktıları buraya>

## 2. Kapanmadı
<varsa>

## 3. İnsan müdahalesi gerekiyor
- [ ] GitHub'da Actions'ın açık olduğunu doğrula (Settings → Actions → Allow all)
- [ ] CI'nin ilk koşusunun yeşil olduğunu kontrol et
<varsa diğerleri>

## Değiştirilen dosyalar
<git diff --stat çıktısı>

## Commit
<git log -1 --format='%H %s'>
```
