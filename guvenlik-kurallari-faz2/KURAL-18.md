# KURAL-18 — Tedarik zinciri ve kriptografik sertleştirme

> **Ön koşul:** KURAL-15 (dağıtım kapısı) kapalı olmalı — CI disiplini oraya bağlı.

---

## Kural metni

> **Depoya giren üçüncü taraf kodun sürümü sabit, kaynağı belli ve zafiyet
> durumu her derlemede ölçülü olacak.** Bir zafiyet kapısı kırıldığında
> "geliştirme bağımlılığı, önemli değil" diye geçilmeyecek — ya düzeltilecek
> ya da **gerekçesi ve son kullanma tarihiyle** yazılı olarak istisna
> tanımlanacak. Şifre saklama parametreleri tek yerde tanımlanacak ve
> güçlendirildiğinde mevcut hesaplar kademeli olarak taşınacak.

---

## Envanter

Ölçüm tarihi: **2026-09-02**, commit `03b8adc`.

### İhlal 1 — CI şu anda KIRIK 🔴

```
$ cd frontend && npm audit --audit-level=high        ← CI'nin birebir komutu
browserslist  <=4.28.6
Severity: high
  · Unbounded memory growth (no cache eviction) → OOM   GHSA-c83g-rgw3-j3cx
  · Uncaught crash / prototype write (normalizeStats)   GHSA-73wf-gq98-2v4g
fix available via `npm audit fix`
1 high severity vulnerability
çıkış kodu: 1                                        ← 0 = geçer

$ npm ls browserslist
frontend@0.1.0
`-- eslint-config-next@16.3.2
  `-- eslint-plugin-react-hooks@7.1.1
    `-- @babel/core@7.29.7
      `-- @babel/helper-compilation-targets@7.29.7
        `-- browserslist@4.28.4

kurulu: 4.28.4 · düzeltilmiş sürüm: 4.28.8

$ cd admin-panel && npm audit
found 0 vulnerabilities       ← admin-panel ZATEN 4.28.8'de
```

Çalışma zamanı riski yok (lint zincirinden gelen geliştirme bağımlılığı,
tarayıcıya gitmiyor). **Ama kapı kırmızı ve iki istemci ayrışmış durumda** —
biri yamalı, diğeri değil. Bu ayrışma, "hangi sürüm nerede" sorusunun
cevabının kimsede olmadığını gösteriyor.

.NET tarafı temiz:

```
$ dotnet list Linguza.sln package --vulnerable --include-transitive
Belirtilen `EnglishReadingPlatform` projesinin geçerli kaynaklarda güvenlik açığı olan paketi yok.
Belirtilen `EnglishReadingPlatform.Tests` projesinin geçerli kaynaklarda güvenlik açığı olan paketi yok.
```

### İhlal 2 — Kırık kapı için istisna mekanizması yok 🟠

CI şu an kırık. İki seçenek var ve **ikisi de kötü**:
- Düzeltilene kadar bütün dağıtımlar bloke
- `--audit-level` gevşetilir → kapı kalıcı olarak körleşir

Faz 1'in KURAL-01'i `zafiyet.txt` üretiyor ve `High|Critical` görünce kırıyor —
ama **bilinçli bir istisnanın nasıl kaydedileceğine dair bir yol yok.**
Yol olmayınca, baskı altında seçilen her zaman "kapıyı gevşet" olur.

### İhlal 3 — BCrypt maliyet faktörü koda yazılmamış 🟡

```
$ grep -rn "HashPassword(" EnglishReadingPlatform --include="*.cs" | grep -c "workFactor"
0                                    ← iş faktörü hiç verilmemiş

$ SELECT split_part("PasswordHash",'$',2)||' / maliyet='||split_part("PasswordHash",'$',3), COUNT(*)
  FROM "Users" GROUP BY 1;
2a / maliyet=11 | 37
```

Kütüphane varsayılanı (11) kullanılıyor. 2026 önerisi **≥ 12**.
Asıl sorun sayı değil: **sayı hiçbir yerde yazmıyor.** Kütüphane bir gün
varsayılanı düşürse kimse fark etmez; yükseltse eski hash'lerle uyum sorusu
sorulmaz. Parametre bir karar olmalı, bir varsayılan değil.

Dört ayrı yerde hash üretiliyor:

```
$ grep -rn "BCrypt.Net.BCrypt.HashPassword" EnglishReadingPlatform --include="*.cs"
Controllers/AuthController.cs:65    (sahte hash — zamanlama eşitleyici)
Controllers/AuthController.cs:198   (kayıt)
Controllers/AuthController.cs:287   (şifre değiştirme)
Controllers/AuthController.cs:346   (şifre sıfırlama)
Data/YoneticiTohumlayici.cs:55      (yönetici tohumu)
```

### İhlal 4 — Bağımlılık sürümleri sabitlenmemiş 🟡

```
$ grep -E '"(next|react|eslint-config-next)"' frontend/package.json admin-panel/package.json
```

`package-lock.json` var (iyi), ama `package.json` aralık (`^`) kullanıyorsa
`npm install` ile sürüm sessizce kayabilir. `.csproj` tarafında sürümler
sabit — orada sorun yok.

### Özet

| # | İhlal | Nokta |
|---|---|---|
| 1 | CI kırık (yüksek zafiyet) | 1 paket, 1 istemci |
| 2 | İstisna mekanizması yok | 0 |
| 3 | BCrypt parametresi yazılmamış | 5 çağrı noktası |
| 4 | Sürüm aralıkları | 2 `package.json` |
| | **TOPLAM** | **8 nokta** |

---

## Merkezî uygulama

### 1. Zafiyeti düzelt

```bash
cd frontend && npm audit fix && npm audit --audit-level=high; echo "çıkış: $?"
```

> `admin-panel` zaten `browserslist@4.28.8` kullanıyor. İki istemcinin
> ayrışması bu kuralın var olma sebebi — düzeltmeden sonra **ikisi de**
> aynı komutla ölçülür.

### 2. Şifre parametreleri — `Security/SifreHashleme.cs`

```csharp
namespace EnglishReadingPlatform.Security;

/// <summary>
/// KURAL-18: Şifre saklama parametreleri TEK kaynakta ve AÇIKÇA yazılı.
///
/// Neden: BCrypt.Net varsayılanı (11) beş ayrı çağrı yerinde örtük olarak
/// kullanılıyordu. Kütüphane varsayılanı değişse kimse fark etmezdi; artırmak
/// istendiğinde de "eski hash'ler ne olacak" sorusu sorulmazdı.
/// Parametre bir KARARDIR, varsayılan değil.
/// </summary>
public static class SifreHashleme
{
    /// <summary>
    /// BCrypt iş faktörü. 2026 önerisi ≥ 12.
    /// Artırırken ölç: 12 → ~250ms/hash. Çok yükseltmek, giriş ucunu
    /// kendi başına bir DoS yüzeyine çevirir.
    /// </summary>
    public const int IsFaktoru = 12;

    /// <summary>
    /// Bu değerin ALTINDAKİ hash'ler eskidir ve girişte sessizce yenilenir.
    /// </summary>
    public const int AsgariKabulEdilirIsFaktoru = IsFaktoru;

    public static string Hashle(string sifre)
        => BCrypt.Net.BCrypt.HashPassword(sifre, IsFaktoru);

    public static bool Dogrula(string sifre, string hash)
        => BCrypt.Net.BCrypt.Verify(sifre, hash);

    /// <summary>
    /// Bu hash daha zayıf bir iş faktörüyle mi üretilmiş?
    /// Biçim: $2a$11$...  → üçüncü alan iş faktörüdür.
    /// </summary>
    public static bool YenilenmeliMi(string hash)
    {
        var parcalar = hash.Split('$', StringSplitOptions.RemoveEmptyEntries);
        return parcalar.Length >= 2
            && int.TryParse(parcalar[1], out var faktor)
            && faktor < AsgariKabulEdilirIsFaktoru;
    }
}
```

### 3. Kademeli taşıma — `AuthController.Login`

```csharp
var sifreDogru = SifreHashleme.Dogrula(req.Password, user?.PasswordHash ?? SahteHash);

if (user == null || !sifreDogru)
{
    _hesapSayaci.BasarisizDenemeKaydet(hedefAnahtar);
    return Unauthorized(new { error = "Email veya şifre hatalı." });
}

// ── KURAL-18: kademeli yeniden hash'leme ──
// Ham şifre YALNIZCA burada, doğrulandığı anda elimizde. Eski hash'leri
// toplu bir migration'la güçlendirmek İMKÂNSIZDIR — bcrypt tek yönlüdür.
// Tek yol: kullanıcı her giriş yaptığında sessizce yenilemek.
if (SifreHashleme.YenilenmeliMi(user.PasswordHash))
{
    user.PasswordHash = SifreHashleme.Hashle(req.Password);
    await _db.SaveChangesAsync();
    _logger.LogInformation("Şifre hash'i güçlendirildi. KullaniciId={Id}", user.Id);
}
```

> Beş `BCrypt.Net.BCrypt.HashPassword(...)` çağrısının **hepsi**
> `SifreHashleme.Hashle(...)` ile değiştirilir. Sahte hash (zamanlama
> eşitleyici) de aynı iş faktörünü kullanmalıdır — aksi hâlde var olmayan
> kullanıcı için doğrulama **ölçülebilir biçimde daha hızlı** biter ve
> KURAL-09'un kapattığı zamanlama sızıntısı geri gelir.

### 4. İstisna kaydı — `guvenlik/zafiyet-istisnalari.json` (YENİ)

```json
{
  "$aciklama": "KURAL-18: bilinçli olarak kabul edilen zafiyetler. Her kaydın SON KULLANMA TARİHİ vardır; geçince CI yine kırılır.",
  "istisnalar": [
    {
      "tanimlayici": "GHSA-ornek-1234",
      "paket": "ornek-paket",
      "ekosistem": "npm",
      "gerekce": "Yalnızca lint zincirinde; üretim paketine girmiyor (npm ls ile doğrulandı).",
      "dogrulayan": "alihan",
      "sonKullanma": "2026-12-31"
    }
  ]
}
```

```bash
# scripts/guard/18-tedarik.sh içinde kullanılır:
# - Süresi geçmiş istisna = ihlal
# - Kayıtsız yüksek/kritik zafiyet = ihlal
```

> **Neden son kullanma tarihi zorunlu:** tarihsiz istisna kalıcı olur.
> Faz 1'in KURAL-01'i "üretime hiç gitmeyen güvenlik dosyası" sınıfını
> tanımlamıştı; tarihsiz istisna da aynı ailedendir — **var gibi görünen,
> aslında ölmüş bir kontrol.**

---

## Otomatik kapı

### A) Testler — `SifreHashlemeTests.cs`

```csharp
[Fact] [Trait("Category", "Tedarik")]
public void Is_faktoru_asgari_12()
{
    SifreHashleme.IsFaktoru.Should().BeGreaterThanOrEqualTo(12,
        "2026 önerisi ≥ 12; düşürmek sessiz bir zayıflatmadır");
}

[Fact] [Trait("Category", "Tedarik")]
public void Uretilen_hash_dogru_is_faktorunu_TASIR()
{
    var hash = SifreHashleme.Hashle("TestSifre123!");
    hash.Split('$')[2].Should().Be(SifreHashleme.IsFaktoru.ToString("D2"),
        "sabit ile ÜRETİLEN hash aynı olmalı — sabiti değiştirip " +
        "çağrıyı unutmak sessizce eski faktörü sürdürür");
}

[Fact] [Trait("Category", "Tedarik")]
public void Eski_faktorlu_hash_YENILENMELI_isaretlenir()
{
    var eski = BCrypt.Net.BCrypt.HashPassword("x", 10);
    SifreHashleme.YenilenmeliMi(eski).Should().BeTrue();

    var yeni = SifreHashleme.Hashle("x");
    SifreHashleme.YenilenmeliMi(yeni).Should().BeFalse();
}

/// <summary>
/// ANA REGRESYON: eski hash'li kullanıcı giriş yapınca hash GÜÇLENMELİ,
/// ve tabii ki giriş de BAŞARILI olmalı.
/// </summary>
[Fact] [Trait("Category", "Tedarik")]
public async Task Giriste_eski_hash_sessizce_GUCLENDIRILIR()
{
    const string sifre = "TestSifre123!";
    int kullaniciId;

    using (var kapsam = _fabrika.Services.CreateScope())
    {
        var db = kapsam.ServiceProvider.GetRequiredService<AppDbContext>();
        var k = new User
        {
            Username = $"eh_{Guid.NewGuid():N}"[..20],
            Email    = $"eh_{Guid.NewGuid():N}@t.local",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(sifre, 10),   // ESKİ
            Role = "student",
        };
        db.Users.Add(k); await db.SaveChangesAsync();
        kullaniciId = k.Id;

        var giris = await _fabrika.CreateClient()
            .PostAsJsonAsync("/api/auth/login", new { email = k.Email, password = sifre });
        giris.StatusCode.Should().Be(HttpStatusCode.OK, "eski hash'le giriş HÂLÂ çalışmalı");
    }

    using (var kapsam = _fabrika.Services.CreateScope())
    {
        var db = kapsam.ServiceProvider.GetRequiredService<AppDbContext>();
        var guncel = await db.Users.FindAsync(kullaniciId);
        SifreHashleme.YenilenmeliMi(guncel!.PasswordHash).Should().BeFalse(
            "başarılı girişte hash yeni iş faktörüne taşınmalı");
    }
}

/// <summary>
/// Sahte hash (zamanlama eşitleyici) de aynı faktörde olmalı; aksi hâlde
/// "kullanıcı yok" dalı ölçülebilir biçimde hızlı biter ve KURAL-09'un
/// kapattığı enumerasyon zamanlama üzerinden geri gelir.
/// </summary>
[Fact] [Trait("Category", "Tedarik")]
public void Sahte_hash_ayni_is_faktorunde()
{
    var kaynak = File.ReadAllText("../../../../EnglishReadingPlatform/Controllers/AuthController.cs");
    kaynak.Should().NotContain("BCrypt.Net.BCrypt.HashPassword(",
        "tüm hash üretimi SifreHashleme.Hashle üzerinden geçmeli — sahte hash dâhil");
}
```

### B) Guard script — `scripts/guard/18-tedarik.sh`

```bash
#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
echo "[18] Tedarik zinciri ve kripto sertleştirme"

# 1. Doğrudan BCrypt çağrısı kaldı mı?
cikti="$(depoda_ara 'BCrypt\.Net\.BCrypt\.(HashPassword|Verify)' \
         'EnglishReadingPlatform/**/*.cs' \
         | grep -v 'Security/SifreHashleme.cs' || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "merkez dışında BCrypt çağrısı" "$n" "$cikti"

# 2. İş faktörü asgari değerin altında mı?
faktor="$(grep -oE 'IsFaktoru[[:space:]]*=[[:space:]]*[0-9]+' \
          EnglishReadingPlatform/Security/SifreHashleme.cs 2>/dev/null \
          | grep -oE '[0-9]+' | tail -1)"
faktor="${faktor:-0}"
n=0; [ "$faktor" -ge 12 ] 2>/dev/null || n=1
ihlal_bildir "BCrypt iş faktörü >= 12 (mevcut: $faktor)" "$n" \
  "sabit bulunamadı ya da 12'nin altında"

# 3. Kademeli yenileme bağlı mı?
n=0
grep -v '^[[:space:]]*//' EnglishReadingPlatform/Controllers/AuthController.cs \
  | grep -q 'YenilenmeliMi' || n=1
ihlal_bildir "girişte kademeli yeniden hash" "$n" \
  "eski faktörlü hash'ler asla güncellenmez"

# 4. npm zafiyeti (her iki istemci)
for uyg in frontend admin-panel; do
  (cd "$uyg" && npm audit --audit-level=high >/dev/null 2>&1); n=$?
  ihlal_bildir "$uyg npm audit" "$n" "yüksek/kritik zafiyet var — npm audit fix"
done

# 5. .NET zafiyeti
dotnet list Linguza.sln package --vulnerable --include-transitive 2>&1 \
  | grep -qE '(High|Critical)'; n=$?
[ "$n" -ne 0 ]; ihlal_bildir ".NET bağımlılık zafiyeti" $?

# 6. Süresi geçmiş istisna var mı?
if [ -f guvenlik/zafiyet-istisnalari.json ]; then
  cikti="$(python3 - <<'PY'
import json, datetime, pathlib
d = json.loads(pathlib.Path("guvenlik/zafiyet-istisnalari.json").read_text())
bugun = datetime.date.today().isoformat()
for i in d.get("istisnalar", []):
    son = i.get("sonKullanma", "")
    if not son:
        print(f"{i.get('tanimlayici','?')}: son kullanma tarihi YOK")
    elif son < bugun:
        print(f"{i.get('tanimlayici','?')}: süresi doldu ({son})")
PY
)"
  n=$(printf '%s' "$cikti" | grep -c . || true)
  ihlal_bildir "süresi geçmiş zafiyet istisnası" "$n" "$cikti"
fi

guard_bitir
```

---

## Bitti kriteri

```bash
# 1) Testler — BEKLENEN: Başarısız: 0, Başarılı: 5
dotnet test Linguza.sln --filter "Category=Tedarik" --logger "console;verbosity=normal"

# 2) Guard — BEKLENEN: TOPLAM İHLAL: 0
bash scripts/guard/18-tedarik.sh; echo "çıkış kodu: $?"

# 3) Her iki istemci temiz — BEKLENEN: ikisi de 0
(cd frontend && npm audit --audit-level=high >/dev/null 2>&1; echo "frontend: $?")
(cd admin-panel && npm audit --audit-level=high >/dev/null 2>&1; echo "admin-panel: $?")

# 4) .NET temiz
dotnet list Linguza.sln package --vulnerable --include-transitive

# 5) Merkez dışında BCrypt çağrısı — BEKLENEN: 0
git grep -c "BCrypt.Net.BCrypt.HashPassword" -- 'EnglishReadingPlatform/*' \
  ':!EnglishReadingPlatform/Security/SifreHashleme.cs' || echo 0

# 6) Yeni hash'ler 12'de üretiliyor (veritabanından)
docker exec english_postgres psql -U appuser -d englishreadingdb_test -tAc \
  "SELECT split_part(\"PasswordHash\",'\$',3) AS faktor, COUNT(*) FROM \"Users\" GROUP BY 1;"

# 7) CI'nin tamamı yerelde
bash scripts/ci-yerel.sh; echo "çıkış kodu: $?"

# 8) TÜM kapılar + TÜM testler
bash scripts/guard/run-all.sh; echo "çıkış kodu: $?"
dotnet test Linguza.sln --logger "console;verbosity=normal"
```

---

## Mutasyon kontrolü (zorunlu)

```bash
# MUTASYON A — iş faktörünü 10'a düşür
python3 -c "
import io; y='EnglishReadingPlatform/Security/SifreHashleme.cs'
k=io.open(y,encoding='utf-8').read()
io.open(y,'w',encoding='utf-8').write(k.replace('IsFaktoru = 12;','IsFaktoru = 10;   // MUTASYON A'))"
grep -c "MUTASYON A" EnglishReadingPlatform/Security/SifreHashleme.cs   # BEKLENEN: 1
dotnet test Linguza.sln --filter "FullyQualifiedName~Is_faktoru_asgari"  # BEKLENEN: Başarısız: 1
bash scripts/guard/18-tedarik.sh; echo "çıkış: $?"                       # BEKLENEN: 1
git checkout EnglishReadingPlatform/Security/SifreHashleme.cs

# MUTASYON B — kademeli yenilemeyi kaldır
#   if (SifreHashleme.YenilenmeliMi(...)) → if (false)
#   BEKLENEN: Giriste_eski_hash_sessizce_GUCLENDIRILIR KIRMIZI + guard 3 KIRMIZI
#   ← Bu mutasyon en önemlisi: onsuz 37 mevcut kullanıcı SONSUZA KADAR
#     11'de kalır ve kural "yapıldı" görünür ama hiçbir hesabı korumaz

# MUTASYON C — sabiti değiştirip çağrıyı unut (tipik hata)
python3 -c "
import io; y='EnglishReadingPlatform/Security/SifreHashleme.cs'
k=io.open(y,encoding='utf-8').read()
k=k.replace('BCrypt.Net.BCrypt.HashPassword(sifre, IsFaktoru)','BCrypt.Net.BCrypt.HashPassword(sifre)   // MUTASYON C')
io.open(y,'w',encoding='utf-8').write(k)"
grep -c "MUTASYON C" EnglishReadingPlatform/Security/SifreHashleme.cs   # BEKLENEN: 1
dotnet test Linguza.sln --filter "FullyQualifiedName~dogru_is_faktorunu_TASIR"
# BEKLENEN: Başarısız: 1 — sabit 12 diyor, üretilen hash 11
#   ← "Sabiti değiştirdim, iş bitti" yanılgısını yakalar
git checkout EnglishReadingPlatform/Security/SifreHashleme.cs

# MUTASYON D — istisna kaydına süresi geçmiş bir giriş ekle
#   sonKullanma: "2020-01-01" → guard 6 KIRMIZI
#   ← İstisna mekanizmasının kendisinin ölmediğini kanıtlar
```

---

## Geçiş planı

| Adım | İş | Nokta | Doğrulama |
|---|---|---|---|
| 1 | `cd frontend && npm audit fix` | 1 | audit çıkış kodu 0 |
| 2 | `package-lock.json` değişimini **incele** (hangi paket, hangi sürüm) | — | `git diff` |
| 3 | `Security/SifreHashleme.cs` yaz | 1 | derlenir |
| 4 | 5 `BCrypt.Net.BCrypt.HashPassword` çağrısını merkeze taşı | 5 | guard 1 → 0 |
| 5 | `Verify` çağrılarını da merkeze taşı (4 nokta) | 4 | guard 1 → 0 |
| 6 | `Login`'e kademeli yenileme ekle | 1 | guard 3 → 0 |
| 7 | `guvenlik/zafiyet-istisnalari.json` (boş liste ile başlat) | 1 | guard 6 → 0 |
| 8 | `SifreHashlemeTests.cs` | — | 5 test yeşil |
| 9 | `scripts/guard/18-tedarik.sh` + `chmod +x` | — | çıkış kodu 0 |
| 10 | `.github/workflows/guvenlik.yml`'e istisna kontrolü ekle | 1 | CI yeşil |
| 11 | `docs/08-GELISTIRME-REHBERI.md` bağımlılık bölümü | — | — |

### 🧍 Adım 6 sonrası — mevcut 37 kullanıcı

Kademeli yenileme **yalnızca giriş yapanları** taşır. Hiç girmeyen hesaplar
11'de kalır. Bu kabul edilebilir (giriş yapmayan hesap saldırıya da açık
değildir), ama **ölçülebilir olmalı**:

```sql
SELECT split_part("PasswordHash",'$',3) AS faktor, COUNT(*)
FROM "Users" GROUP BY 1 ORDER BY 1;
```

Birkaç hafta sonra tekrar çalıştır; `11` sayısı düşüyor olmalı.
Düşmüyorsa kademeli yenileme çalışmıyordur — MUTASYON B'nin yakaladığı durum.

---

## Tuzaklar

| Tuzak | Neden olur | Nasıl kaçınılır |
|---|---|---|
| **İş faktörünü çok yükseltmek** | 14+ → hash başına ~1sn; giriş ucu kendi başına DoS yüzeyi olur | 12'de kal, ölç |
| **Sabiti değiştirip çağrıyı unutmak** | `HashPassword(sifre)` varsayılanı kullanır; sabit yalan söyler | MUTASYON C ölçüyor |
| **Sahte hash'i (zamanlama eşitleyici) merkez dışında bırakmak** | "Kullanıcı yok" dalı ölçülebilir biçimde hızlanır → KURAL-09 enumerasyonu geri gelir | guard 1 tüm doğrudan çağrıları yakalar |
| **Toplu migration'la hash güçlendirmeye çalışmak** | Bcrypt tek yönlüdür; ham şifre elde yok | Kademeli yenileme tek yoldur |
| **`npm audit fix --force` kullanmak** | Ana sürüm atlar, Next'i kırar | Önce `--dry-run`, sonra `git diff package-lock.json` |
| **Zafiyeti "dev bağımlılığı" diye geçmek** | Bugünkü lint zinciri, yarınki derleme zinciridir; ayrıca kapı körleşir | Ya düzelt ya **tarihli** istisna yaz |
| **Tarihsiz istisna** | Kalıcı olur; kapı var gibi görünür, ölmüştür | `sonKullanma` zorunlu, guard 6 denetliyor |
| **Yalnızca `frontend`'i düzeltmek** | İki istemci ayrışmaya devam eder | guard 4 ikisini de ölçüyor |

---

## Teslim şablonu

```markdown
## 1. Kanıtlanarak kapandı
<8 bitti-kriteri çıktısı> · <MUTASYON A, B, C, D>
<package-lock.json diff özeti: hangi paket hangi sürüme çıktı>
<hash faktör dağılımı: önce/sonra>

## 2. Kapanmadı
- Hiç giriş yapmayan N hesap hâlâ iş faktörü 11'de (kademeli taşıma gereği)
- package.json sürüm aralıkları sabitlenmedi <yapıldıysa sil>

## 3. İnsan müdahalesi gerekiyor
- [ ] Birkaç hafta sonra faktör dağılımını tekrar ölç
- [ ] Zafiyet istisnası eklendiyse son kullanma tarihi takvime girdi mi?
```
