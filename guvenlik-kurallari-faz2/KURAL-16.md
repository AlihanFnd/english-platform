# KURAL-16 — Hesap yaşam döngüsü

> **Ön koşul:** KURAL-14 kapalı olmalı — e-posta doğrulama ve kurtarma,
> çalışan bir e-posta servisi ister.

---

## Kural metni

> **Bir hesabın kimliği doğrulanmadan yetki kazanmayacak, sahibi hesabına
> erişimini kaybettiğinde geri alabilecek, ve rolünü kendisi seçemeyecek.**
> E-posta adresi doğrulanacak; kurtarma akışı **arayüzden erişilebilir**
> olacak; rol ataması yalnızca yetkili bir kaynaktan yapılacak.

---

## Envanter

Ölçüm tarihi: **2026-09-02**, commit `03b8adc`.

### İhlal 1 — E-posta doğrulaması hiç yok 🟠

```
$ grep -rn "EmailVerified\|EpostaDogrula\|verify-email\|DogrulanmisMi" \
       EnglishReadingPlatform --include="*.cs" | grep -v Migrations
HİÇBİR YERDE YOK
```

`User` modelinde doğrulama alanı yok, uç yok, kayıtta kontrol yok.
`asdf@asdf.com` yazan biri anında hesap açıp token alıyor.

**Bu, ilan edilmiş bir kapsamın eksiği.** Faz 1'in `00-BASLA-BURADAN.md`
madde 7'si şöyle diyordu:

> *Kapsam: e-posta doğrulama + şifre sıfırlama + **şifre gücü zorlaması***

Üçten **ikisi** yapıldı. İlerleme tablosunun KURAL-09 satırında eksik olduğu
**yazmıyor** — yani o ✅ bu konuda olduğundan iyimser. Faz 2'nin var olma
sebeplerinden biri budur.

### İhlal 2 — Kurtarma akışı arayüzden erişilemiyor 🟠

```
$ ls frontend/app/
api.ts  books  components  context  favicon.ico  globals.css  groups
hooks  layout-wrapper.tsx  layout.tsx  login  ocr  page.tsx  register  words
                                        ↑ yalnızca login ve register

$ grep -n "login:\|register:\|logout:\|changePassword\|forgotPassword\|resetPassword" frontend/app/api.ts
156:  login: (email: string, password: string) =>
159:  register: (username: string, email: string, password: string, role: string) =>
165:  logout: () =>
```

Backend'de **üç uç çalışıyor** (`change-password`, `forgot-password`,
`reset-password`) ama `api.ts`'te karşılıkları yok ve ekran yok.
KURAL-09 bunu kendi satırında kabul ediyor: *"Frontend ekranları yapılmadı"*.

Sonuç: şifresini unutan kullanıcı hâlâ hesabına giremiyor. **KURAL-09'un
çözmeye çalıştığı asıl sorun kullanıcı gözünde duruyor.**

### İhlal 3 — Rolü kullanıcı kendisi seçiyor 🟡 (mayın)

```
$ grep -n "req.Role" EnglishReadingPlatform/Controllers/AuthController.cs
199:  Role = req.Role == "teacher" ? "teacher" : "student",

$ grep -n "AddPolicy" EnglishReadingPlatform/Program.cs
137:    options.AddPolicy("AdminOnly", policy =>
141:    options.AddPolicy("EgitmenVeyaAdmin", policy =>

$ grep -rn "EgitmenVeyaAdmin" EnglishReadingPlatform/Controllers/
(çıktı yok)          ← politika TANIMLI ama HİÇBİR UCA BAĞLI DEĞİL
```

Bugün zararsız: `teacher` rolü hiçbir yetki taşımıyor.
**Ama `EgitmenVeyaAdmin` politikası hazır duruyor.** Birisi onu bir uca
eklediği gün, kayıt formundan "öğretmen" seçen herkes o yetkiyi
**sessizce** kazanır. Değişikliği yapan kişi ilgisiz bir dosyadaki
kayıt satırını görmeyecektir.

> Bu bir açık değil, bir **mayın**. Mayın, patladığında hiçbir kapının
> uyarmayacağı bir düzenlemedir.

### Özet

| # | İhlal | Nokta |
|---|---|---|
| 1 | E-posta doğrulaması yok | 0 alan, 0 uç |
| 2 | Kurtarma arayüzü yok | 3 uç erişilemez, 0 ekran |
| 3 | Rol kayıtta seçilebiliyor | 1 satır + 1 bağlanmamış politika |
| | **TOPLAM** | **5 nokta** |

---

## Merkezî uygulama

### 1. Model — `User.EpostaDogrulandiAt`

```csharp
// Models/AppModels.cs → class User
/// <summary>
/// KURAL-16: e-posta adresinin doğrulandığı an. null = doğrulanmamış.
///
/// Neden bool değil DateTime?: "ne zaman doğrulandı" sorusu KVKK
/// (KURAL-19) ve destek için gerekiyor; bool bu bilgiyi kalıcı olarak yok eder.
/// </summary>
public DateTime? EpostaDogrulandiAt { get; set; }
```

### 2. Doğrulama jetonu — mevcut deseni YENİDEN KULLAN

`SifreSifirlamaJetonu` (KURAL-09) zaten doğru deseni kuruyor:
CSPRNG, SHA-256 saklama, tek kullanımlık, süreli. **İkinci bir jeton sınıfı
yazmayın** — aynı tabloya bir `Amac` (amaç) kolonu ekleyin.

```csharp
// Models/AppModels.cs → class SifreSifirlamaJetonu
/// <summary>
/// KURAL-16: jetonun ne için üretildiği.
///
/// NEDEN AYRI KOLON: amaç ayrımı olmadan, şifre sıfırlama için üretilen bir
/// jeton e-posta doğrulama ucunda kullanılabilirdi (ve tersi). İki akış aynı
/// tabloyu paylaşacaksa amaç KISITIN PARÇASI olmalıdır, yoksa jeton
/// karıştırma (token confusion) açığı doğar.
/// </summary>
[Required, MaxLength(AlanSinirlari.JetonAmaci)] public string Amac { get; set; } = JetonAmaclari.SifreSifirlama;
```

```csharp
// Security/JetonAmaclari.cs
namespace EnglishReadingPlatform.Security;

public static class JetonAmaclari
{
    public const string SifreSifirlama  = "sifre-sifirlama";
    public const string EpostaDogrulama = "eposta-dogrulama";

    public static readonly string[] Hepsi = { SifreSifirlama, EpostaDogrulama };
}
```

Ve `SifreSifirlamaServisi` amaç alır:

```csharp
public async Task<string> JetonUretAsync(int kullaniciId, string amac) { … }

/// <summary>
/// Jetonu doğrular. AMAÇ EŞLEŞMEZSE reddeder — sıfırlama jetonuyla
/// e-posta doğrulanamaz, doğrulama jetonuyla şifre sıfırlanamaz.
/// </summary>
public async Task<int?> JetonuKullanAsync(string hamJeton, string beklenenAmac) { … }
```

### 3. Yeni uçlar — `AuthController`

```csharp
// POST /api/auth/resend-verification   (giriş yapmış kullanıcı)
// GET  /api/auth/verify-email?token=…  (anonim, tek kullanımlık)
```

```csharp
[HttpGet("verify-email")]
[AllowAnonymous]
[EnableRateLimiting(HizSinirlari.KimlikDogrulama)]
public async Task<IActionResult> EpostaDogrula([FromQuery] string token)
{
    var kullaniciId = await _sifirlamaServisi.JetonuKullanAsync(
        token, JetonAmaclari.EpostaDogrulama);

    // Geçersiz/süresi dolmuş/yanlış amaçlı jeton — hepsi AYNI yanıtı alır.
    // Ayrım yapmak, geçerli jeton aramasını bir oracle'a çevirirdi.
    if (kullaniciId is null)
        return BadRequest(new { error = "Doğrulama bağlantısı geçersiz ya da süresi dolmuş." });

    var kullanici = await _db.Users.FindAsync(kullaniciId.Value);
    if (kullanici is null)
        return BadRequest(new { error = "Doğrulama bağlantısı geçersiz ya da süresi dolmuş." });

    // Idempotent: ikinci kez doğrulamak hata değil.
    kullanici.EpostaDogrulandiAt ??= DateTime.UtcNow;
    await _db.SaveChangesAsync();

    _logger.LogInformation("E-posta doğrulandı. KullaniciId={Id}", kullanici.Id);
    return Ok(new { success = true });
}
```

### 4. Rol ataması — kayıt kanalını KAPAT

```csharp
// AuthController.Register
var newUser = new User
{
    Username = req.Username.KirpEnCok(AlanSinirlari.KullaniciAdi),
    Email    = req.Email.KirpEnCok(AlanSinirlari.Eposta).ToLower(),
    PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),

    // ── KURAL-16: rol İSTEMCİDEN ALINMAZ ──
    // Eski hâli: req.Role == "teacher" ? "teacher" : "student"
    // 'teacher' bugün yetki taşımıyor, ama EgitmenVeyaAdmin politikası
    // Program.cs'te HAZIR duruyor. O politika bir uca bağlandığı gün,
    // kayıt formundan öğretmen seçen herkes o yetkiyi sessizce kazanırdı.
    // Rol yükseltmesi tek kanaldan yapılır: PUT /api/admin/users/{id}/role
    //
    // NOT: kod tabanında `RolAdlari` diye bir sınıf YOKTUR (doğrulandı).
    // Roller `Validation/AlanSinirlari.cs` içindeki `IzinliDegerler.Roller`
    // dizisinde duruyor. Sabit bir "student"
    // yazmak yerine oradan okuyun ya da bu kural kapsamında küçük bir
    // `RolAdlari` sabit sınıfı ekleyin — hangisini seçerseniz seçin,
    // rol adı ÜÇ yerde birden (model varsayılanı, kayıt, admin ucu)
    // elle yazılı olmaktan çıkmalı.
    Role = "student",

    CreatedAt = DateTime.UtcNow,
};
```

> `RegisterRequest.Role` alanı **tamamen kaldırılır** — okunmayan bir alan
> bırakmak, bir sonraki geliştiriciye "bu değer işleniyor" der.
> İstemcilerdeki rol seçici de kaldırılır.

### 5. `api.ts` — üç eksik metot

```typescript
// KURAL-16: backend'de KURAL-09'dan beri çalışan üç uç, ilk kez
// istemciye bağlanıyor. Uçların var olması yetmez; erişilemeyen bir
// kurtarma akışı, olmayan bir kurtarma akışıdır.
changePassword: (mevcutSifre: string, yeniSifre: string) =>
  apiRequest<{ success: boolean }>('/auth/change-password', 'POST',
    { mevcutSifre, yeniSifre }),

forgotPassword: (eposta: string) =>
  apiRequest<{ message: string }>('/auth/forgot-password', 'POST', { eposta }),

resetPassword: (token: string, yeniSifre: string) =>
  apiRequest<{ success: boolean }>('/auth/reset-password', 'POST', { token, yeniSifre }),

resendVerification: () =>
  apiRequest<{ success: boolean }>('/auth/resend-verification', 'POST'),
```

### 6. Ekranlar — `frontend/app/`

| Yol | Ne yapar |
|---|---|
| `forgot-password/page.tsx` | E-posta al, her durumda aynı mesajı göster (enumerasyon) |
| `reset-password/page.tsx` | `?token=` oku, yeni şifre al, politika hatalarını göster |
| `hesap/page.tsx` | Giriş yapmışken şifre değiştir + doğrulama e-postasını yeniden gönder |

> ⚠️ Bu ekranlar **KURAL-11'in nonce'lu CSP'si** altında çalışacak.
> `frontend/AGENTS.md` uyarısını ve `proxy.ts` nonce zincirini bozma.

---

## Otomatik kapı

### A) Testler — `HesapYasamDongusuTests.cs`

```csharp
[Fact] [Trait("Category", "Hesap")]
public async Task Kayitta_rol_SECILEMEZ()
{
    var client = _fabrika.CreateClient();
    var benzersiz = Guid.NewGuid().ToString("N")[..8];

    using var istek = new HttpRequestMessage(HttpMethod.Post, "/api/auth/register")
    {
        Content = JsonContent.Create(new
        {
            username = $"rol_{benzersiz}", email = $"rol_{benzersiz}@test.local",
            password = "TestSifre123!", role = "teacher"      // ← istemci deniyor
        })
    };
    istek.Headers.Add(TestIstemciIpFiltresi.Baslik, "10.9.9.1");
    var yanit = await client.SendAsync(istek);
    yanit.EnsureSuccessStatusCode();

    using var kapsam = _fabrika.Services.CreateScope();
    var db = kapsam.ServiceProvider.GetRequiredService<AppDbContext>();
    var kullanici = await db.Users.FirstAsync(u => u.Username == $"rol_{benzersiz}");

    kullanici.Role.Should().Be("student",
        "rol istemciden alınamaz — EgitmenVeyaAdmin politikası bir uca bağlandığı gün " +
        "bu satır sessiz bir yetki yükseltmesine dönüşürdü");
}

[Fact] [Trait("Category", "Hesap")]
public async Task Yeni_hesap_DOGRULANMAMIS_baslar()
{
    var client = _fabrika.CreateClient();
    var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);

    using var kapsam = _fabrika.Services.CreateScope();
    var db = kapsam.ServiceProvider.GetRequiredService<AppDbContext>();
    (await db.Users.FindAsync(o.UserId))!.EpostaDogrulandiAt.Should().BeNull();
}

/// <summary>
/// JETON KARIŞTIRMA: şifre sıfırlama jetonu e-posta doğrulamada
/// KULLANILAMAMALI. İki akış aynı tabloyu paylaştığı için bu, gerçek bir
/// karıştırma yüzeyidir — amaç kolonu kısıtın parçası olmalı.
/// </summary>
[Fact] [Trait("Category", "Hesap")]
public async Task Sifirlama_jetonu_eposta_dogrulamada_KULLANILAMAZ()
{
    using var kapsam = _fabrika.Services.CreateScope();
    var servis = kapsam.ServiceProvider.GetRequiredService<SifreSifirlamaServisi>();
    var db = kapsam.ServiceProvider.GetRequiredService<AppDbContext>();

    var kullanici = new User { Username = $"jk_{Guid.NewGuid():N}"[..20],
        Email = $"jk_{Guid.NewGuid():N}@t.local", PasswordHash = "x", Role = "student" };
    db.Users.Add(kullanici); await db.SaveChangesAsync();

    var jeton = await servis.JetonUretAsync(kullanici.Id, JetonAmaclari.SifreSifirlama);

    var sonuc = await servis.JetonuKullanAsync(jeton, JetonAmaclari.EpostaDogrulama);

    sonuc.Should().BeNull("amaç eşleşmeyen jeton reddedilmeli");
}

[Fact] [Trait("Category", "Hesap")]
public async Task Kullanilmis_dogrulama_jetonu_IKINCI_KEZ_gecmez()
{
    // (jeton üret → kullan → tekrar kullan) — ikincisi null dönmeli
}

/// <summary>
/// Kurtarma akışı ERİŞİLEBİLİR olmalı. Uçların var olması yetmez —
/// KURAL-09 tam olarak burada yarım kaldı.
/// </summary>
[Fact] [Trait("Category", "Hesap")]
public void Kurtarma_akisi_istemciden_ERISILEBILIR()
{
    var api = File.ReadAllText("../../../../frontend/app/api.ts");
    api.Should().Contain("forgotPassword");
    api.Should().Contain("resetPassword");
    api.Should().Contain("changePassword");

    Directory.Exists("../../../../frontend/app/forgot-password").Should().BeTrue();
    Directory.Exists("../../../../frontend/app/reset-password").Should().BeTrue();
}
```

### B) Guard script — `scripts/guard/16-hesap.sh`

```bash
#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
echo "[16] Hesap yaşam döngüsü"

# 1. Rol istemciden alınıyor mu?
cikti="$(depoda_ara 'Role\s*=\s*req\.Role' 'EnglishReadingPlatform/**/*.cs' || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "rol istemciden alınıyor" "$n" "$cikti"

# 2. Okunmayan Role alanı kayıt isteğinde duruyor mu?
n=0
grep -v '^[[:space:]]*//' EnglishReadingPlatform/Controllers/AuthController.cs \
  | grep -A20 'class RegisterRequest' | grep -q 'public string Role' && n=1
ihlal_bildir "kayıt isteğinde ölü Role alanı" "$n" \
  "okunmayan alan, bir sonraki geliştiriciye 'bu işleniyor' der"

# 3. Doğrulama alanı modelde var mı?
n=0; grep -q 'EpostaDogrulandiAt' EnglishReadingPlatform/Models/AppModels.cs || n=1
ihlal_bildir "e-posta doğrulama alanı mevcut" "$n" "User.EpostaDogrulandiAt yok"

# 4. Jeton amacı kısıtın parçası mı?
n=0; grep -q 'JetonAmaclari' EnglishReadingPlatform/Security/SifreSifirlamaServisi.cs || n=1
ihlal_bildir "jeton amacı doğrulanıyor" "$n" \
  "amaç ayrımı yoksa sıfırlama jetonuyla e-posta doğrulanabilir"

# 5. Kurtarma uçları istemciye bağlı mı?
eksik=""
for metot in forgotPassword resetPassword changePassword; do
  grep -q "$metot" frontend/app/api.ts || eksik="${eksik}${metot}"$'\n'
done
n=$(printf '%s' "$eksik" | grep -c . || true)
ihlal_bildir "kurtarma uçları api.ts'te" "$n" "$eksik"

# 6. Ekranlar var mı?
eksik=""
for ekran in forgot-password reset-password; do
  [ -d "frontend/app/$ekran" ] || eksik="${eksik}frontend/app/${ekran}"$'\n'
done
n=$(printf '%s' "$eksik" | grep -c . || true)
ihlal_bildir "kurtarma ekranları mevcut" "$n" "$eksik"

# 7. HTTP çağrısı api.ts DIŞINDAN yapılmıyor (CLAUDE.md kuralı)
cikti="$(grep -rn "fetch(" frontend/app --include="*.tsx" 2>/dev/null | grep -v "api.ts" || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "api.ts dışında fetch" "$n" "$cikti"

guard_bitir
```

---

## Bitti kriteri

```bash
# 1) Testler — BEKLENEN: Başarısız: 0, Başarılı: 5
dotnet test Linguza.sln --filter "Category=Hesap" --logger "console;verbosity=normal"

# 2) Guard — BEKLENEN: TOPLAM İHLAL: 0
bash scripts/guard/16-hesap.sh; echo "çıkış kodu: $?"

# 3) Rol istemciden alınmıyor — BEKLENEN: 0
git grep -cE 'Role\s*=\s*req\.Role' || echo 0

# 4) Migration üretildi ve tek şey ekliyor
cd EnglishReadingPlatform && Jwt__Key='...' … dotnet dotnet-ef migrations script --idempotent -o /tmp/k16.sql && cd ..
grep -iE "ADD COLUMN" /tmp/k16.sql | tail -5      # EpostaDogrulandiAt + Amac

# 5) İstemciler derleniyor
cd frontend && npx tsc --noEmit; echo "frontend: $?"; cd ..
cd admin-panel && npx tsc --noEmit; echo "admin: $?"; cd ..

# 6) TÜM kapılar — BEKLENEN: TOPLAM İHLAL: 0
bash scripts/guard/run-all.sh; echo "çıkış kodu: $?"

# 7) TÜM testler
dotnet test Linguza.sln --logger "console;verbosity=normal"

# 8) TARAYICIDA uçtan uca (kod ölçemez):
#    kayıt ol → doğrulama e-postası gelsin → bağlantıya tıkla → doğrulandı
#    şifremi unuttum → e-posta gelsin → yeni şifre → eski şifreyle giriş REDDEDİLSİN
```

---

## Mutasyon kontrolü (zorunlu)

```bash
# MUTASYON A — rolü istemciye geri ver
python3 -c "
import io; y='EnglishReadingPlatform/Controllers/AuthController.cs'
k=io.open(y,encoding='utf-8').read()
io.open(y,'w',encoding='utf-8').write(k.replace('Role = "student",','Role = req.Role == \"teacher\" ? \"teacher\" : \"student\",   // MUTASYON A'))"
grep -c "MUTASYON A" EnglishReadingPlatform/Controllers/AuthController.cs   # BEKLENEN: 1
dotnet test Linguza.sln --filter "FullyQualifiedName~Kayitta_rol_SECILEMEZ"   # BEKLENEN: Başarısız: 1
bash scripts/guard/16-hesap.sh; echo "çıkış: $?"                              # BEKLENEN: 1
git checkout EnglishReadingPlatform/Controllers/AuthController.cs

# MUTASYON B — jeton amacı kontrolünü kaldır (jeton karıştırma)
#   BEKLENEN: Sifirlama_jetonu_eposta_dogrulamada_KULLANILAMAZ kırmızı
#   ← Bu mutasyon, iki akışın aynı tabloyu paylaşmasının BEDELİNİ gösterir

# MUTASYON C — api.ts'ten forgotPassword'ü sil
#   BEKLENEN: Kurtarma_akisi_istemciden_ERISILEBILIR kırmızı + guard 5 kırmızı
#   ← "uç var ama erişilemiyor" durumunun tekrar oluşmasını engeller
```

---

## Geçiş planı

| Adım | İş | Nokta | Doğrulama |
|---|---|---|---|
| 1 | `User.EpostaDogrulandiAt` + `SifreSifirlamaJetonu.Amac` | 2 | derlenir |
| 2 | `Security/JetonAmaclari.cs` | 1 | derlenir |
| 3 | `SifreSifirlamaServisi` amaç parametresi alsın | 1 | test yeşil |
| 4 | Migration üret, SQL'i incele (`ADD COLUMN` dışında bir şey OLMAMALI) | — | /tmp/k16.sql |
| 5 | `verify-email` + `resend-verification` uçları | 2 | test yeşil |
| 6 | Kayıtta rolü kapat, `RegisterRequest.Role` alanını SİL | 2 | guard 1,2 → 0 |
| 6b | `IzinliDegerler.KayitRolleri` artık ÖLÜ — sil (yalnızca kayıt rolü için vardı) | 1 | derlenir |
| 7 | Kayıtta doğrulama e-postası gönder (KURAL-14 servisi) | 1 | e-posta gelir |
| 8 | `api.ts` dört metot | 4 | guard 5 → 0 |
| 9 | Üç ekran (`forgot-password`, `reset-password`, `hesap`) | 3 | guard 6 → 0 |
| 10 | İstemcilerden rol seçiciyi kaldır | 2 | tsc 0 hata |
| 11 | `HesapYasamDongusuTests.cs` | — | 5 test yeşil |
| 12 | `scripts/guard/16-hesap.sh` + `chmod +x` | — | çıkış kodu 0 |
| 13 | Tarayıcıda uçtan uca dene | — | 🧍 insan |
| 14 | `docs/03-API-REFERANSI.md` + `docs/05-FRONTEND.md` | — | — |

### 🔴 Adım 6 — mevcut öğretmenler ne olacak?

```sql
SELECT COUNT(*) FROM "Users" WHERE "Role" = 'teacher';
```

Kayıt kanalı kapanınca **mevcut** `teacher` rolleri değişmez. Bu bilinçlidir:
geriye dönük rol düşürmek meşru öğretmenleri kilitler. Ama sayıyı **bil** —
hepsi kendi seçtiyse ve `EgitmenVeyaAdmin` bir uca bağlanacaksa, önce
listeyi gözden geçir.

### E-posta doğrulaması ne kadar ZORLAYICI olsun? (varsayılan seçim)

| Seçenek | Ne olur |
|---|---|
| **A** — Doğrulanmamış hesap giriş yapar, ama bir uyarı şeridi görür | Kullanıcı kaybı yok ⭐ **varsayılan** |
| **B** — Doğrulanmadan hiçbir şey yapamaz | En güvenli, en yüksek terk oranı |
| **C** — Doğrulanmadan grup kurup kitap yükleyemez | Orta yol |

Karar gelmezse **A** uygulanır ve rapora yazılır. B veya C isteniyorsa
`[Authorize]` yanına bir `EpostaDogrulanmis` politikası eklenir.

---

## Tuzaklar

| Tuzak | Neden olur | Nasıl kaçınılır |
|---|---|---|
| **İkinci bir jeton tablosu açmak** | İki ayrı süre/iptal/temizlik mantığı doğar; biri unutulur (KURAL-12'nin saklama temizliği yalnızca birini bilir) | Aynı tablo + `Amac` kolonu |
| **Amaç kontrolünü unutmak** | Sıfırlama jetonuyla e-posta doğrulanır; daha kötüsü tersi | MUTASYON B bunu ölçüyor |
| **`verify-email`'i POST yapmak** | E-posta istemcileri bağlantıyı GET ile açar; akış hiç çalışmaz | GET + tek kullanımlık jeton |
| **Geçersiz jetona ayrıntılı hata** | "süresi dolmuş" ile "böyle jeton yok" ayrımı bir oracle'dır | Tek tip mesaj |
| **Doğrulamayı zorunlu yapıp mevcut kullanıcıları kilitlemek** | 37 mevcut kullanıcının hiçbiri doğrulanmamış | Varsayılan **A**; ya da mevcutlara `EpostaDogrulandiAt = CreatedAt` yaz |
| **`RegisterRequest.Role`'u bırakıp yalnızca okumayı kesmek** | Alan API sözleşmesinde kalır, sonraki geliştirici işlendiğini sanır | Alanı SİL, guard 2 denetliyor |
| **Ekranı `fetch` ile yazmak** | `CLAUDE.md`: HTTP çağrıları yalnızca `api.ts` üzerinden | guard 7 denetliyor |
| **Nonce zincirini bozmak** | Yeni sayfada `await headers()` yoksa statik ön-render → sayfa sessizce etkileşimsiz | `scripts/guard/11-tarayici.sh` yakalar |

---

## Teslim şablonu

```markdown
## 1. Kanıtlanarak kapandı
<8 bitti-kriteri komutunun ham çıktısı> · <MUTASYON A, B, C>
<tarayıcı uçtan uca: kayıt→doğrulama, unuttum→sıfırlama ekran görüntüleri/çıktıları>

## 2. Kapanmadı
- Doğrulama zorlayıcılığı: <A/B/C — hangisi uygulandı>
- Mevcut N öğretmen rolü olduğu gibi bırakıldı (geriye dönük düşürme yapılmadı)

## 3. İnsan müdahalesi gerekiyor
- [ ] Doğrulama zorlayıcılığı kararı (A/B/C)
- [ ] Resend'de gönderen alan adı doğrulandı mı? (KURAL-14'ten devreden)
- [ ] Mevcut 'teacher' rolleri gözden geçirildi mi?
```
