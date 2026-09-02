# 07 — Güvenlik

> ## 🔧 Bu bulgular artık uygulanabilir kural dosyalarına dönüştürüldü
>
> Aşağıdaki tespitler **12 kurala** ayrıştırıldı ve her biri için merkezî çözüm,
> otomatik kapı, bitti kriteri ve mutasyon testi yazıldı:
> **[`guvenlik-kurallari/`](../guvenlik-kurallari/00-BASLA-BURADAN.md)**
>
> | Bu belgedeki bulgu | Kural |
> |---|---|
> | #1 activity/stats yetki | [KURAL-03](../guvenlik-kurallari/KURAL-03.md) |
> | #2 sırlar repoda | [KURAL-02](../guvenlik-kurallari/KURAL-02.md) |
> | #3 logout çalışmıyor, #14 rol değişimi | [KURAL-04](../guvenlik-kurallari/KURAL-04.md) |
> | #4 cookie/header önceliği | [KURAL-04](../guvenlik-kurallari/KURAL-04.md) |
> | #5 rate limit bellek sızıntısı, #7 join limiti | [KURAL-07](../guvenlik-kurallari/KURAL-07.md) ✅ |
> | #6 grup verisi sızıntısı | [KURAL-08](../guvenlik-kurallari/KURAL-08.md) |
> | #8 uzunluk doğrulaması (500 hataları) | [KURAL-05](../guvenlik-kurallari/KURAL-05.md) |
> | #9 hata mesajı sızıntısı | [KURAL-06](../guvenlik-kurallari/KURAL-06.md) ✅ |
> | #10 şifre politikası ve kurtarma | [KURAL-09](../guvenlik-kurallari/KURAL-09.md) |
> | #11 dosya yükleme doğrulaması | [KURAL-10](../guvenlik-kurallari/KURAL-10.md) ✅ |
> | #12 CDN/SRI, #13 localStorage, güvenlik başlıkları | [KURAL-11](../guvenlik-kurallari/KURAL-11.md) |
> | #15 englishplatform.db, unique index eksikleri | [KURAL-12](../guvenlik-kurallari/KURAL-12.md) ✅ |
> | (test altyapısı — tüm kuralların ön koşulu) | [KURAL-01](../guvenlik-kurallari/KURAL-01.md) |
>
> **İnsan kararı gereken işler** sade dille anlatıldı:
> [00-BASLA-BURADAN.md → İnsan kararı gereken işler](../guvenlik-kurallari/00-BASLA-BURADAN.md)

> **Bu belgenin durumu:** Aşağıdaki bulgular **kaynak kodu okunarak** çıkarılmıştır.
> Bu oturumda görev *dokümantasyon* olduğu için **hiçbir açık kapatılmamış ve hiçbir
> çalıştırılabilir test yazılmamıştır.** Hiçbir madde "kapandı" olarak işaretlenmemiştir.
> Her bulgunun altında, düzeltmenin gerçekten çalıştığını kanıtlayacak **test reçetesi**
> verilmiştir; düzeltme yapılırken mutasyon testiyle (düzeltmeyi geri al → testin kırmızı
> olduğunu gör → geri koy) doğrulanmalıdır.
>
> Tam denetim için: `/guvenlik-denetimi`

---

## A. Mevcut ve doğru çalışan önlemler

Bunlar kodda var ve tasarım olarak doğru:

| Önlem | Nerede |
|---|---|
| Şifreler **BCrypt** ile hash'leniyor, düz metin hiçbir yerde saklanmıyor | `AuthController`, `AppDbContext` seed |
| `PasswordHash` **hiçbir API yanıtında dönmüyor** (admin listesi dahil) | `AdminController.GetUsers` |
| Quiz'in doğru cevabı istemciye **gönderilmiyor**, değerlendirme sunucuda | `BooksController.GetQuiz` / `SubmitQuiz` |
| Kelime listesi sorguları **sahiplikle** kısıtlı (`w.UserId == CurrentUserId`) | `BooksController` |
| Grup detayına **yalnızca üyeler** erişebiliyor (`Forbid()`) | `GroupsController.GetGroupDetails` |
| Kitap atama **yalnızca grup sahibi** tarafından yapılabiliyor | `GroupsController.AssignBook` |
| Admin uçları **rol politikasıyla** korunuyor | `[Authorize(Roles = "admin")]` |
| Kayıtta **`admin` rolü alınamıyor** (whitelist ile `student`'a düşürülüyor) | `AuthController.Register` |
| Admin **kendi rolünü değiştiremiyor / kendini silemiyor** | `AdminController` |
| Login hata mesajı **kullanıcı enumerasyonu yapmıyor** ("Email veya şifre hatalı") | `AuthController.Login` |
| JWT `ClockSkew = TimeSpan.Zero` (varsayılan 5 dk tolerans kapalı) | `Program.cs` |
| Admin token ömrü **1 saat**, normal kullanıcı 24 saat | `JwtService` |
| Cookie `HttpOnly` + `SameSite=Lax` + üretimde `Secure` | `AuthController` |
| CORS **yıldız değil**, açık origin listesi; `AllowCredentials` ile birlikte doğru | `Program.cs` |
| Docker imajları **root olmayan kullanıcıyla** çalışıyor | her iki `Dockerfile` |
| EF Core parametreli sorgu kullanıyor → **SQL injection yok** | tüm controller'lar |
| React JSX otomatik kaçış yapıyor, `dangerouslySetInnerHTML` **hiç kullanılmamış** | frontend |
| Dosya yükleme **50 MB** ile sınırlı, dosya **diske yazılmıyor** | `PdfService`, `AdminController` |
| Dosya türü **içerikten** (sihirli bayt) doğrulanıyor, zip-bomb ve sayfa sınırı var | `Files/DosyaDogrulayici.cs` (KURAL-10) |
| Hız sınırlama .NET yerleşik `RateLimiter` ile TEK merkezden (KURAL-07 ✅) | `RateLimiting/HizSinirlamaKurulumu.cs` |
| Her yazma ucu bir politikaya bağlı; sözleşme testi yenisini zorluyor | `HizSiniriSozlesmesiTests` |
| Giriş için IP **ve** hedef e-posta bazlı iki ayrı sayaç | `AuthController`, `RateLimiting/HesapSayaci.cs` |
| LLM/PDF işlerinde eşzamanlılık kapısı (aynı anda 4) | `RateLimiting/AgirIsKapisi.cs` |
| Dış API çağrılarında zaman aşımı **ve** yanıt boyutu sınırı | `Program.cs` (adlandırılmış `HttpClient`) |
| Her API yanıtı 5 güvenlik başlığı taşıyor (CSP, nosniff, DENY, Referrer, Permissions) | `Middleware/GuvenlikBasliklariMiddleware.cs` (KURAL-11) |
| Üretimde HSTS + HTTPS yönlendirmesi; proxy şeması `ForwardedHeaders` ile okunuyor | `Program.cs` (KURAL-11) |
| Sunucu parmak izi yok: Kestrel `Server` ve Next `X-Powered-By` kapalı | `Program.cs`, `next.config.*` (KURAL-11) |
| Her iki istemcide **istek başına nonce'lu CSP**; `script-src`'te `'unsafe-inline'` yok | `proxy.ts` + `guvenlik-basliklari.mjs` (KURAL-11) |
| Üçüncü taraf JS/WASM/yazı tipi CDN'den değil paketten; hepsi kendi origin'imizden | `scripts/*-kopyala.mjs`, `next/font` (KURAL-11) |
| Backend hiç statik dosya sunmuyor — ölü `wwwroot/` ve `Views/` silindi | `Program.cs` (KURAL-11) |

---

## B. Tespit edilen açıklar — KAPATILMADI

Önem sırasına göre.

---

### 🔴 #1 — `GET /api/activity/stats` yetki kontrolü yok

**Dosya:** `EnglishReadingPlatform/Controllers/ActivityController.cs:73`

```csharp
[ApiController]
[Route("api/[controller]")]
[Authorize]                          // ← sadece "giriş yapmış olmak" yeterli
public class ActivityController : ControllerBase
{
    [HttpGet("stats")]
    public async Task<IActionResult> GetStats()
    {
        // İleride admin kontrolü de eklenebilir, şu an genel liste dönüyoruz
        var stats = await _db.UserActivityLogs.Include(l => l.User) …
```

**Etki:** Herhangi bir öğrenci hesabının token'ıyla son 100 aktivite kaydı çekilebiliyor:
her kaydın `Username`, `ActivityType`, `Details` (*"Kitap ID: 5 - Kitap Okuyor"*,
*"Word: ephemeral"*) ve `DurationSeconds` alanları dahil. Yani **tüm kullanıcıların
kim olduğu, ne okuduğu, hangi kelimeleri bilmediği ve ne kadar süre harcadığı** sızıyor.
Yönetici paneli dashboard'u da bu ucu kullanıyor, dolayısıyla panelin gösterdiği her şey
sıradan bir öğrenciye de açık.

Kodda bırakılmış yorum, bunun bilinen ama ertelenmiş bir eksik olduğunu gösteriyor.

**Düzeltme**

```csharp
[HttpGet("stats")]
[Authorize(Policy = "AdminOnly")]     // Program.cs'de zaten tanımlı
public async Task<IActionResult> GetStats()
```

**Kanıt testi (yazılmalı)**
1. `student` rolüyle token al → `GET /api/activity/stats` → **403** bekle
2. `admin` rolüyle token al → aynı uç → **200** ve dolu liste bekle
3. **Mutasyon:** `[Authorize(Policy = "AdminOnly")]` satırını sil → 1. testin **kırmızı**
   olduğunu gör → satırı geri koy → yeşil

**Kardeş yolları da tara:** `[Authorize]` var ama rol kontrolü olmayan **her** uçta
"başkasının verisi dönüyor mu?" sorusu sorulmalı. Bu taramada bulunan diğer aday: #6.

---

### ✅ #2 — Sırlar sürüm kontrolünde — KAPANDI (KURAL-02, 2026-08-23)

**Dosyalar:** `EnglishReadingPlatform/appsettings.json`, `.env.example`,
`docker-compose.yml`, `EnglishReadingPlatform/Data/AppDbContext.cs`

| Sır | Nerede | Değer |
|---|---|---|
| JWT imzalama anahtarı | `appsettings.json` → `Jwt:Key` | `<eski-sır-kaldırıldı — KURAL-02>` |
| Aynı anahtar | `.env.example` → `JWT_KEY` | aynı |
| Aynı anahtar (fallback) | `docker-compose.yml` → `${JWT_KEY:-…}` | aynı |
| DB şifresi | `appsettings.json` → `ConnectionStrings:Default` | `<eski-sır-kaldırıldı — KURAL-02>` |
| Admin şifresi | `AppDbContext.cs` seed | `<eski-sır-kaldırıldı — KURAL-02>` (düz metin, kaynak kodda) |

**Etki:** JWT anahtarını bilen herkes **kendi admin token'ını üretebilir**. İmza doğrulaması
geçer, `[Authorize(Roles="admin")]` aşılır. Bu, tüm yetkilendirme katmanını geçersiz kılar.
Repo herhangi bir şekilde paylaşıldıysa (fork, yedek, CI logu) anahtar sızmış demektir.

Ayrıca `appsettings.json` **`.gitignore`'da değil** — `.gitignore` yalnızca `.env`
dosyalarını dışlıyor.

---

#### Ne yapıldı (KURAL-02)

| Adım | Sonuç |
|---|---|
| `Configuration/SirDogrulayici.cs` | Tek merkezden sır doğrulaması; eksik/kısa/sızmış değerde uygulama **hiç başlamaz** |
| `Program.cs` | `Jwt:Key`, `Jwt:Issuer`, `Jwt:Audience` varsayılanları kaldırıldı |
| `appsettings.json` | Bağlantı dizesi ve `Jwt:Key` boşaltıldı; ölü `Gemini` bloğu silindi |
| `docker-compose.yml` | `${VAR:-sır}` → `${VAR:?hata}`; değişken yoksa compose başlamaz |
| `.env.example` | Gerçek değerler yer tutucuya çevrildi |
| `Data/YoneticiTohumlayici.cs` | Yönetici ortamdan tohumlanır, koda gömülmez |
| `Migrations/…SeedAdminOrtamaTasindi` | Sızmış tohum yöneticisi geçersiz kılındı |
| `scripts/guard/02-sirlar.sh` | 9 kontrollü otomatik kapı; yasaklı listeyi `SirDogrulayici.cs`'ten okur |

#### Anahtar döndürme — ✅ tamamlandı (2026-08-23)

JWT anahtarı, PostgreSQL şifresi ve yönetici hesabı yenilendi; canlı ortamda
doğrulandı (eski DB şifresi dışarıdan reddediliyor, eski yönetici girişi 401).

> ⚠️ **Kalan tek kısım:** Sırlar **git geçmişinde** hâlâ duruyor (3 commit).
> Anahtarlar döndürüldüğü için sızmış değerler artık işe yaramaz; geçmiş
> temizliği yalnızca repo başkalarıyla paylaşıldıysa gerekir.

**Düzeltme**
1. `appsettings.json`'daki `Jwt:Key` ve `ConnectionStrings:Default` değerlerini **boşalt**;
   yalnızca ortam değişkeninden okunsun
2. `Program.cs`'teki fallback'i kaldır ve **anahtar yoksa uygulamayı başlatma**:
   ```csharp
   var jwtKey = builder.Configuration["Jwt:Key"]
       ?? throw new InvalidOperationException("Jwt:Key ortam değişkeni tanımlı değil.");
   if (jwtKey.Length < 32) throw new InvalidOperationException("Jwt:Key en az 32 karakter olmalı.");
   ```
3. `docker-compose.yml`'deki `:-varsayılan` fallback'lerini kaldır
4. **Yeni bir anahtar üret ve eskisini iptal say** — anahtar değişince tüm mevcut tokenlar
   geçersiz olur (istenen davranış)
5. Seed admin şifresini ortam değişkeninden al veya ilk açılışta zorunlu değişim iste

**Kanıt testi**
- `Jwt__Key` tanımsızken uygulama **başlamamalı** (istisna bekle)
- 32 karakterden kısa anahtarla **başlamamalı**
- **Mutasyon:** `throw`'u `?? "default"`e çevir → test kırmızı olsun

**⚠️ İnsan müdahalesi gerekiyor:** Anahtar üretimi, üretim ortamına yazılması ve eski
anahtarla üretilmiş tokenların iptali kod tarafından yapılamaz.

---

### ✅ #3 — Token iptali (logout) sessizce çalışmıyor — KAPANDI (KURAL-04, 2026-08-23)

> İptal anahtarı sözleşmesi `Security/ITokenIptalDeposu.cs` ile tipe bağlandı: her zaman `jti`.
> `Logout` artık `jti`'yi iptal ediyor, `Program.cs` `jti` ile sorguluyor; `jti` taşımayan token
> reddediliyor (ham token'a fallback kaldırıldı). Kanıt: `TokenYasamDongusuTests.Cikis_yapilan_token_ARTIK_CALISMAZ`.

<details><summary>Eski bulgu metni</summary>

**Dosyalar:** `AuthController.cs:155`, `Program.cs:54`, `TokenSecurityService.cs:29,40`

Logout **ham JWT stringini** blacklist'e yazıyor:

```csharp
// AuthController.Logout
_tokenSecurity.RevokeToken(tokenStr, DateTime.UtcNow.AddHours(24));
// → _revokedTokens["eyJhbGciOiJIUzI1NiIs..."] = exp
```

Doğrulama ise **`jti` claim'iyle** arıyor:

```csharp
// Program.cs OnTokenValidated
var jti = principal.FindFirst(JwtRegisteredClaimNames.Jti)?.Value;
if (tokenSecurity.IsTokenRevoked(jti ?? ctx.SecurityToken?.ToString(), userId, issuedAt))
// → _revokedTokens["a3f9…-guid"] aranıyor → BULUNAMAZ
```

`jti` bulunursa arama anahtarı GUID olur (ham token değil). `jti` bulunamazsa fallback
`ctx.SecurityToken?.ToString()` olur — bu da `JwtSecurityToken.ToString()` çıktısıdır,
compact JWT stringi **değildir**. **Her iki dalda da anahtar eşleşmez.**

**Etki:** Kullanıcı "Çıkış Yap" dediğinde arayüz başarı mesajı gösterir, cookie silinir —
ama token **24 saat daha (admin için 1 saat) tam yetkiyle geçerlidir**. Token'ı ele
geçirmiş biri (ortak bilgisayar, tarayıcı geçmişi, XSS) çıkış yapılmasına rağmen kullanmaya
devam edebilir. Bu, **Kural 6 — sessiz başarısızlık** kapsamındadır: uç `200 OK`
dönüyor ama hiçbir şey yapmıyor.

Ayrıca ikinci mekanizma `RevokeAllUserTokens(userId)` **hiçbir yerden çağrılmıyor**
(`grep` ile doğrulandı — yalnızca tanım var). Yani `_userRevokedTimestamps` sözlüğü
her zaman boş; toplu iptal de çalışmıyor.

**Düzeltme**

```csharp
// AuthController.Logout — jti claim'ini oku ve ONU blacklist'e al
var jti = User.FindFirst(JwtRegisteredClaimNames.Jti)?.Value;
if (!string.IsNullOrEmpty(jti))
    _tokenSecurity.RevokeToken(jti, DateTime.UtcNow.AddHours(24));
else
    _tokenSecurity.RevokeAllUserTokens(CurrentUserId);   // güvenli tarafta kal
```

`[Authorize]` özniteliği `Logout`'a eklenmelidir (claim okuyabilmek için).
Ayrıca `AdminController.UpdateRole` ve `DeleteUser` içinde `RevokeAllUserTokens(id)`
çağrılmalıdır — rol düşürülen kullanıcı anında yetkisini kaybetsin.

**Kanıt testi (bu bulgu için ZORUNLU)**
1. Login ol → token al
2. Token'la `GET /api/auth/me` → **200**
3. `POST /api/auth/logout` (aynı token'la)
4. **Aynı token'la** tekrar `GET /api/auth/me` → **401 bekle**
5. **Mutasyon:** düzeltmeyi geri al (`RevokeToken(tokenStr, …)` haline getir) →
   4. adımın **200 döndüğünü** (yani testin kırmızı olduğunu) gör → düzeltmeyi geri koy

> ⚠️ Bu bulgu kod okumasıyla tespit edilmiştir, çalışan sunucuda **doğrulanmamıştır**.
> Yukarıdaki 4 adımlık test, düzeltmeden **önce** çalıştırılıp mevcut davranışın
> gerçekten 200 döndüğü gösterilmelidir.

---

</details>

### ✅ #4 — Cookie, `Authorization` başlığını eziyor — KAPANDI (KURAL-04, 2026-08-23)

> `OnMessageReceived` önce `Authorization` başlığına bakıyor; cookie yalnızca başlık yoksa
> kullanılıyor. Kanıt: `Authorization_basligi_cookieyi_ezer` + `Cookie_tek_basina_calisir`.

<details><summary>Eski bulgu metni</summary>

**Dosya:** `Program.cs:34-40`

```csharp
OnMessageReceived = ctx =>
{
    var token = ctx.Request.Cookies["jwt_token"];
    if (!string.IsNullOrEmpty(token))
        ctx.Token = token;              // ← header VARSA BİLE cookie kazanır
    return Task.CompletedTask;
},
```

Doğru sıra tersidir: `Authorization` başlığı varsa **o** kullanılmalı, cookie yalnızca
fallback olmalıdır.

**Etki:** Aynı origin üzerinden hem cookie hem başlık gönderilen bir senaryoda, istemcinin
kasten seçtiği kimlik yok sayılır ve tarayıcının otomatik gönderdiği cookie kullanılır.
Bugün frontend `credentials` belirtmediği için (varsayılan `same-origin`) çapraz origin'de
cookie gitmiyor; ancak backend ve frontend aynı origin'e taşınırsa (ters proxy arkasında
tek domain — planlanan üretim mimarisi) bu **aktif bir kafa karışıklığı/yetki hatası**
haline gelir. Ayrıca cookie tabanlı kimlik + durum değiştiren `POST` uçları =
CSRF yüzeyi (`SameSite=Lax` çoğunu kesiyor ama tek savunma o).

**Düzeltme**

```csharp
OnMessageReceived = ctx =>
{
    var authHeader = ctx.Request.Headers["Authorization"].ToString();
    if (authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        return Task.CompletedTask;              // header öncelikli, dokunma
    var cookie = ctx.Request.Cookies["jwt_token"];
    if (!string.IsNullOrEmpty(cookie)) ctx.Token = cookie;
    return Task.CompletedTask;
},
```

**Kanıt testi:** A kullanıcısının cookie'si + B kullanıcısının Bearer token'ı ile
`GET /api/auth/me` → **B** dönmeli. Mutasyon: düzeltmeyi geri al → A dönsün.

---

</details>

### ✅ #5 — Rate limit sözlüğü hiç temizlenmiyor — KAPANDI (KURAL-07, 2026-08-25)

> **Çözüm doğrudan temizlik eklemek DEĞİL oldu:** elle yazılmış sayaç servisi tamamen
> silindi, yerine .NET 8'in yerleşik `PartitionedRateLimiter`'ı geçti. O, boşta kalan
> bölümleri kendi zamanlayıcısıyla serbest bırakır — yani sızıntı **tasarım gereği**
> ortadan kalkar, elle temizlenmesi gereken bir sözlük kalmaz.
> Kalıntı kontrolü: `grep -rn "IsRateLimitExceeded\|TokenSecurityService" EnglishReadingPlatform/ --include=*.cs` → **0**.
> Kapı: `scripts/guard/07-hiz-siniri.sh`. Test: `HizSiniriSozlesmesiTests.Eski_elle_yazilmis_sinirlayici_kalmamali`.

<details><summary>Özgün bulgu (tarihsel kayıt)</summary>

**Dosya:** `TokenSecurityService.cs:14, 67, 81`

```csharp
private readonly ConcurrentDictionary<string, ConcurrentQueue<DateTime>> _rateLimitWindow = new();
…
private void CleanupExpiredTokens()          // yalnızca _revokedTokens'ı geziyor
```

`_rateLimitWindow` anahtarları **asla silinmiyor**. Anahtarlar `login_{ip}` ve
`register_{ip}` biçiminde, yani **saldırgan kontrolünde**. IPv6 ile veya bir botnet ile
milyonlarca farklı anahtar yaratılabilir. Her anahtar boş bir `ConcurrentQueue` bile olsa
sözlükte kalır.

**Etki:** Yavaş ama kesin bellek tükenmesi → OOM → servis dışı kalma (DoS).

**Düzeltme:** `CleanupExpiredTokens()` içine ekle:

```csharp
foreach (var kvp in _rateLimitWindow)
{
    // 60 saniyeden eski tüm damgaları at
    while (kvp.Value.TryPeek(out var t) && (now - t).TotalSeconds > 60)
        kvp.Value.TryDequeue(out _);
    if (kvp.Value.IsEmpty)
        _rateLimitWindow.TryRemove(kvp.Key, out _);
}
```

Ayrıca bu temizlik döngüsü `Task.Run(while(true) …)` yerine `BackgroundService` olmalı —
şu haliyle içeride bir istisna oluşursa döngü **sessizce ölür** ve temizlik hiç yapılmaz.

**Kanıt testi:** 10 000 farklı anahtarla `IsRateLimitExceeded` çağır → temizliği tetikle →
sözlük boyutunun düştüğünü doğrula. Mutasyon: temizlik bloğunu kaldır → sayı düşmesin.

</details>

---

### 🟠 #6 — Grup detayı, üyelerin **tüm** okuma geçmişini sızdırıyor

**Dosya:** `AppControllers.cs` → `GroupsController.GetGroupDetails`

Üyelik kontrolü doğru yapılıyor ✅, ancak dönen veri fazla:

```csharp
var progresses = await _db.ReadingProgresses
    .Where(p => memberIds.Contains(p.UserId))     // ← gruba atanmış kitap filtresi YOK
```

**Etki:** Bir gruba katılan herkes, diğer tüm üyelerin **gruptan bağımsız** kişisel okuma
geçmişini (hangi kitabı, yüzde kaç, ne zaman) ve tüm quiz sonuçlarını görür.
Davet kodu bilen biri gruba katılıp bu veriyi toplayabilir (bkz. #7).

**Düzeltme:** Sorguyu gruba atanmış kitaplarla sınırla:

```csharp
var assignedBookIds = group.BookAssignments.Select(a => a.BookId).ToList();
var progresses = await _db.ReadingProgresses
    .Where(p => memberIds.Contains(p.UserId) && assignedBookIds.Contains(p.BookId))
```

Ürün kararı gerekirse: "sadece grup admini görsün" de bir seçenektir.

**Kanıt testi:** İki üyeli grup, üyelerden biri gruba atanmamış bir kitap okusun →
diğer üye `GET /api/groups/{id}` çağırsın → o kitap **listede olmasın**.

---

### ✅ #7 — `POST /api/groups/join` rate limit yok — KAPANDI (KURAL-07, 2026-08-25)

**Dosya:** `AppControllers.cs` → `GroupsController.Join`

Davet kodu 8 hex karakter (`Guid.NewGuid().ToString("N")[..8].ToUpper()`). Uçta hız
sınırı olmadığı için kaba kuvvetle denenebilirdi; başarılı bir tahmin #6 ile birleşince
tüm sınıfın okuma verisine erişim demektir.

**Uygulanan düzeltme:** `[EnableRateLimiting(HizSinirlari.DavetKodu)]` — kullanıcı başına
dakikada 5 deneme, aşımda `429` + `Retry-After`.
Test: `HizSiniriTests.Davet_kodu_kaba_kuvvete_karsi_korunur`.
Mutasyon: özniteliği sil → test kırmızıya döner (kanıtlandı).

> **KAPANMADI:** Davet kodunun **entropisi** hâlâ 8 hex karakter ve `Guid` üzerinden
> üretiliyor. Hız sınırı denemeyi pahalı hale getirir ama kodu güçlendirmez.
> `RandomNumberGenerator` ile 10-12 karakter üretimi KURAL-12'nin (veri bütünlüğü)
> kapsamındadır.

---

### ✅ #8 — İstemci kontrollü uzunluklar 500 üretiyor — KAPANDI (KURAL-05, 2026-08-23)

**Dosyalar:** `BooksController.AddWord`, `ActivityController.LogActivity`,
`FeedbackController.CreateFeedback`

EF Core'un `[MaxLength]` özniteliği **doğrulama yapmaz**, yalnızca kolonu `varchar(n)`
yapar. Sınırı aşan değer PostgreSQL'de `22001` hatası fırlatır → yakalanmamış istisna → **500**.

| Alan | Sınır | Uç |
|---|---|---|
| `WordListItem.Context` | 200 | `POST /books/addword` — **uzun bir cümle seçmek yeterli** |
| `UserActivityLog.Details` | 200 | `POST /activity/log` |
| `UserActivityLog.ActivityType` | 50 | `POST /activity/log` |
| `Feedback.Message` | 1000 | `POST /feedback` |

`Context` alanı özellikle gerçekçi: okuyucuda uzun bir cümledeki kelimeyi kaydetmek
doğal bir kullanıcı davranışıdır ve **normal kullanımda 500 üretir**.

**Düzeltme:** İstek DTO'larına `[StringLength(n)]` ekle (`[ApiController]` sayesinde
otomatik 400 döner) veya kaydetmeden önce `Substring` ile kırp.

**Kanıt testi:** 500 karakterlik `context` ile `addword` → **400** bekle (şu an 500).

#### Ne yapıldı (KURAL-05)

**Merkezî çözüm — `EnglishReadingPlatform/Validation/`:**

| Dosya | İşi |
|---|---|
| `AlanSinirlari.cs` | Uzunluk sınırlarının **tek kaynağı**. Entity `[MaxLength]` ve DTO `[StringLength]` aynı sabiti okur — ayrışmaları imkânsız. `IzinliDegerler` whitelist kümeleri de burada. |
| `IzinliDegerAttribute.cs` | Whitelist özniteliği. Kümeye **adıyla** bağlanır (`[IzinliDeger(nameof(IzinliDegerler.Seviyeler))]`), diziyi özniteliğe kopyalamaz. |
| `MetinUzantilari.cs` | `KirpEnCok` — kolona yazılmadan önceki son savunma hattı. |
| `Program.cs` | `InvalidModelStateResponseFactory` — otomatik 400'ler `{ error }` biçimini korur (istemci sözleşmesi). |

**Reddetmek mi, kırpmak mı:** kullanıcının bilerek yazdığı alan (kelime, çeviri, mesaj)
**reddedilir**; seçimden/dosyadan/LLM'den türetilen alan (bağlam, bölüm başlığı) **kırpılır**.
Okuyucuda 300 karakterlik bir cümle seçmek normaldir; ona 400 vermek özelliği kullanılamaz kılar.
Bu yüzden `AddWordRequest.Context` girdi sınırı 400, kayıtta 200'e kırpılıyor.

**Envanterde OLMAYAN, taramada bulunan kardeş yollar:**

| Yol | Sorun |
|---|---|
| `BooksController.UpdateWord` | `AddWord` ile aynı DTO ve aynı kolonlar — yalnızca `AddWord` düzeltilseydi açığın yarısı açık kalırdı |
| `TranslateController.Word` → `Details = $"Word: {clean}"` | `varchar(200)` kolona 206 karakter yazma riski |
| `TranslationService` → `TranslationCache.QueryText` (255) / `WordType` (50) | Taşma `try/catch`'e düşüp **sessizce** yutuluyordu: önbellek hiç yazılmıyor, kimse fark etmiyordu |
| `PdfService.SplitIntoChaptersRegex` | Bölüm başlığı PDF'in ilk satırından türetiliyor, `Chapter.Title` `varchar(200)` — uzun satırlı bir PDF yüklemeyi 500 ile düşürürdü |
| `GET /books/{id}/read?chapter=` | **Sorgu parametresi de girdidir.** Doğrulanmadan aritmetiğe girip `ReadingProgress`'e yazılıyordu: `?chapter=-999999` isteği **200** dönüp veritabanına `progressPercent = -49999950` yazıyordu |

**Gövde dışı girdi taşıyıcıları — ikinci tarama turunda kapatıldı:**

| Taşıyıcı | Neydi | Şimdi |
|---|---|---|
| **Sayfa seçim ifadesi** | `"1-2000000000"` aralığı **önce genişletilip sonra** filtreleniyordu: 12 karakterlik bir alan, tek sayfalık bir PDF'te bile 2 milyar elemanlı bir `HashSet` doğuruyordu | `PdfService.SayfaSeciminiCoz` aralığı genişletmeden ÖNCE `[1, sayfaSayısı]` aralığına kırpar; üretilebilecek azami eleman belgeye bağlı |
| **Rota parametreleri** (9 uç) | `(int id)` çıplak | `[Range(1, int.MaxValue)]` |
| **JWT claim'i** | `int.Parse(User.FindFirstValue(...)!)` — bozuk `NameIdentifier` **500** üretiyordu (imzalama anahtarı gerekmeden) | `TryParse` tabanlı `KullaniciId()` → **401** |
| **İstek gövdesi boyutu** | `[StringLength]` gövde ÇÖZÜMLENDİKTEN sonra çalışır; 30 MB'lık gövde önce belleğe alınıyordu | Kestrel `MaxRequestBodySize = 2 MB` → doğrulamaya ulaşmadan **413** |
| **Koleksiyon İÇİ değerler** | `[MaxLength]` sözlükte yalnızca ELEMAN SAYISINI sınırlar. "En fazla 100 cevap" kuralı varken tek bir cevabın 200.000 karakter olmasını hiçbir öznitelik engellemiyordu (kanıt: 200 OK) | `[OgeIzinliDeger]` / `[OgeUzunlugu]` öznitelikleri; `Answers` artık `A\|B\|C\|D` whitelist'ine bağlı |
| **Kapının kör noktası** | Yansıma taraması `if (PropertyType != typeof(string)) continue;` diyordu — yani `List<string>` / `Dictionary<_,string>` alanları HİÇ denetlenmiyordu. Yarın eklenecek sınırsız bir koleksiyon alanı sessizce geçerdi | Tarama artık sözlük değer tipini ve dizi eleman tipini çözüyor; koleksiyondan **iki** sınır istiyor (sayı + içerik) |
| **Tohum verisi zaman damgası** | `HasData` içinde `DateTime.UtcNow`; her `migrations add` sahte `UpdateData` üretiyor, gerçek bir şema değişikliği o gürültüde kayboluyordu | Sabit `TohumTarihi`; `has-pending-model-changes` artık temiz |

**Taksonomi tek kaynağa indirildi:** `GET /api/books/taxonomy` whitelist'in kendisini
yayımlıyor. **Üç kopya bire indi** — yönetici paneli statik `<option>` listesi,
öğrenci arayüzü de statik `LEVELS`/`CATEGORIES` dizisi tutmuyor; ikisi de uçtan
besleniyor ve yalnızca görünüm bilgisini (etiket, renk, ikon) yerelde tutuyor.

**Yeni korumalar:** `DurationSeconds` için `[Range(0, 3600)]` (istemci `999999999` gönderip
istatistikleri bozabiliyordu), kayıtta `admin` rolü istenemez (`KayitRolleri` whitelist'i),
quiz şıkları `A|B|C|D` whitelist'i, `CoverColor` için `#rrggbb` deseni, sayfa seçimi deseni.

**Otomatik kapı:** `scripts/guard/05-girdi.sh` (**17 kontrol**, hepsi mutasyonla
ateşlediği doğrulandı) + `AlanSinirlariTests` (7 test).
`Tum_istek_DTO_string_alanlari_sinir_bildirmeli`, yansımayla **her** istek DTO'sunun
**her** string alanını tarar: sınırsız yeni bir alan eklenirse test kırmızı olur.
`Frontend_seviye_listesi_...` ve `Admin_panel_secenekleri_...` testleri, taksonominin
üç yerde ayrışmasını makine ile engeller.

**Kanıt (mutasyon):** düzeltme geri alındığında test tam da orijinal hatayı gösteriyor —
`22001: value too long for type character varying(200)` → HTTP 500.

---

### ✅ #9 — Hata mesajlarında iç detay sızıyor — KAPANDI (KURAL-06, 2026-08-25)

**Neydi:**

| Yer | Mesaj |
|---|---|
| `AdminController.UploadBook` | `"Dosya işlenirken hata oluştu: " + ex.Message` |
| `AdminController.UploadBookPages` | `$"{pageNum}. sayfa okunurken hata oluştu: {ex.Message}"` |
| `TranslateController.Analyze` | `"Çeviri hatası: " + ex.Message` |
| `appsettings.json` | Connection string'de `Include Error Detail=true` |

`TranslateController.Analyze` en tehlikelisiydi: `TranslationService`
`$"HTTP {durum} from Groq: {errContent}"` fırlattığı için **Groq'un ham yanıt gövdesi**
istemciye gidiyordu.

**Merkezî çözüm:** `Middleware/HataYakalamaMiddleware.cs` — zincirin **en başında**.
Yakalanmamış her istisna burada durur; istemciye genel mesaj + 8 haneli **olay kimliği**,
loga tam ayrıntı + aynı kimlik gider. `Exceptions/KullaniciHatasi.cs` ise
**gösterilmesi gereken** mesajları (yanlış uzantı, boyut aşımı, bozuk dosya)
gösterilmemesi gerekenlerden ayırır — controller'larda artık hiç `catch` yok.

> **Bilinçli tercih:** istisna metni **Development'ta da** gizlenir. "Sadece geliştirmede
> açık" ayrımı, yanlış yapılandırılmış tek bir ortam değişkeniyle üretime sızar.

**Yan kazanımlar:**

| İhlal | Nokta | Şimdi |
|---|---|---|
| `Console.WriteLine` | **18** (envanterde 14 yazıyordu; ölçüm sonrası 4 nokta daha eklenmiş) | 0 — hepsi `ILogger<T>` + adlandırılmış yer tutucu |
| Log/DB'ye PII | 2 | `GuvenliLog.KullaniciMetni()` (uzunluk + kısa hash); `Details = "ai_kelime_cevirisi"` |
| Sessiz başarısızlık | 3 | `TranslateSentenceAsync` artık `CeviriSonucu { Metin, Basarili, Kaynak }` döner **ve arayüz bunu gösteriyor** — okuyucu/OCR'da amber uyarı + "Yeniden dene" |
| `Include Error Detail` | 1 | `appsettings.json`'da yok (KURAL-02); `SirDogrulayici` üretimde reddediyor |

**Kardeş yollar — envanterde OLMAYAN, taramada bulunanlar:**

| Yol | Sorun |
|---|---|
| `AdminController.cs:367` `Console.WriteLine($"...{ex.ToString()}")` | Envanter bunu "ihlal 1" olarak saymamıştı; **tam yığın izini** konsola basıyordu |
| `PdfService` `PdfDocument.Open` / `WordprocessingDocument.Open` | Bozuk/şifreli dosya ham kütüphane istisnası fırlatıyordu → kullanıcı-tetiklemeli 500. Artık `KullaniciHatasi` ile 400 |
| `UploadBookPages` hata dalı | Hata döndüğünde **yarım kalan `Book` satırı** siliniyordu ("metin çıkarılamadı" dalı temizliyor, sayfa-okuma hatası dalı temizlemiyordu) |

**Otomatik kapı:** `scripts/guard/06-hata-log.sh` (**13 kontrol**). Kapsam yalnızca
`Controllers/` + `Services/` değil, **tüm** `EnglishReadingPlatform/**` — bir sınıfı
bir dizinde kapatıp diğerinde açık bırakmak yarım kapatmadır.

**Kanıt (mutasyon):** 5 mutasyon, hepsi kırmızıya döndü. `error = ex.ToString()`
mutasyonu altında test gövdesi tam olarak şunu gösterdi:
`"Password=SUPER_GIZLI_PAROLA;Host=10.9.9.9"` + mutlak dosya yolları + yığın izi.

> ⚠️ **Mutasyon bir testi de düşürdü:** `Development_ortaminda_da_istisna_metni_sizmaz`
> testi Türkçe `İ` içeren bir işaretçi kullanıyordu. `System.Text.Json` non-ASCII'yi
> kaçırdığı için (`GİZLİ` → `G\u0130ZL\u0130`) arama **hiçbir zaman** eşleşemezdi —
> yani test sızıntı olsa bile yeşil kalırdı. İşaretçi ASCII'ye çevrildi.

---

### 🟡 #10 — Şifre politikası ve hesap kurtarma yok

| Eksik | Detay |
|---|---|
| Şifre karmaşıklığı | Yalnızca **6 karakter** minimum; `123456` kabul edilir |
| E-posta doğrulama | Yok — sahte adreslerle sınırsız hesap açılabilir |
| Şifre sıfırlama | **Uç yok** — şifresini unutan kullanıcı kilitleniyor |
| Şifre değiştirme | **Uç yok** |
| Hesap kilitleme | ✅ KURAL-07 ile geldi — hedef e-posta başına 15 dakikada 10 **başarısız** deneme |

**~~Ek risk~~ — KAPANDI (KURAL-07, 2026-08-25):** Login rate limit artık yalnızca IP bazlı
değil. `RateLimiting/HesapSayaci.cs` hedef e-postayı sayar; her IP'den 10 deneme yapan
dağıtık bir saldırı da kesilir. Kontrol şifre doğrulamasından **önce** yapılır, yani bütçe
dolduğunda doğru şifre de kabul edilmez. Yalnızca başarısız denemeler sayılır — başarılı
girişleri de saymak, birden çok cihazdan giren meşru kullanıcıyı kilitlerdi.
Testler: `HesapSayaciTests` (5 test), mutasyon D ile doğrulandı.

**Ek:** `Register` "Bu email veya kullanıcı adı zaten kullanımda" diyerek **kullanıcı
enumerasyonu** yapıyor (login yapmıyor ✅). Kayıt formunda bu genelde kabul edilebilir bir
ödünleşmedir, ama bilinçli bir karar olmalı.

---

### ✅ #11 — Dosya yükleme uzantıya göre doğrulanıyor — KAPANDI (KURAL-10, 2026-08-29)

**Eski hâli** (`PdfService.cs:107`):

```csharp
var ext = Path.GetExtension(file.FileName).ToLower();     // ← istemcinin verdiği isim
if (!AllowedExtensions.Contains(ext)) throw …
```

İçerik (magic byte) kontrolü yoktu. Dosya diske yazılmadığı için doğrudan kod çalıştırma
riski yoktu ✅, ancak keyfi içerik doğrudan `PdfPig` ve `OpenXml` ayrıştırıcılarına gidiyordu.

**Şimdi:** tür `Files/DosyaDogrulayici.cs` içinde **sihirli baytlardan** belirleniyor;
uzantı yalnızca ilk eleme, `Content-Type` hiç okunmuyor. Ek olarak:

| Kapatılan | Nasıl |
|---|---|
| Zip-bomb (DOCX) | 200 MB açılmış boyut + 100:1 oran + giriş sayısı sınırı |
| Sınırsız sayfa | `EnCokSayfa = 500`, **dosya açılmadan önce** uygulanır |
| O(n²) ayrıştırma | Sayfa başına yeniden açan API silindi; tek açış, tek geçiş |
| Sınırsız süre | 60 sn ayrıştırma bütçesi, döngü içinde kontrol edilir |
| Yetim `Book` kaydı | Kitap artık metin çıkarıldıktan **sonra** oluşturuluyor |

**Kanıt:** 26 test (`Category=DosyaYukleme`), 9 kapı kontrolü (`scripts/guard/10-dosya.sh`),
5 mutasyon. Mutasyon A (içerik kontrolünü kaldır) **6 testi** kırmızıya çeviriyor.

---

### ✅ #12 — Üçüncü taraf kod CDN'den geliyordu — KAPANDI (KURAL-11, 2026-09-01)

> pdf.js artık `pdfjs-dist` **paketinden** geliyor, worker ve WASM çözücüler derleme
> öncesi `public/pdfjs/` altına kopyalanıyor. CDN'den tek satır script çekilmiyor.
> Kapı: `scripts/guard/11-tarayici.sh` → "CDN'den script yükleme".
>
> **Denetim sırasında ortaya çıkan üç ek bulgu — hepsi kapatıldı:**
>
> 1. **Çekilen sürüm zaten zafiyetliydi.** `pdf.js 2.16.105`, CVE-2024-4367
>    (kötü niyetli PDF açmak → keyfî JS çalıştırma) kapsamında. Yani CDN'in ele
>    geçirilmesine bile gerek yoktu: panelde **dışarıdan gelen bir PDF açmak**
>    yeterliydi. `pdfjs-dist@6.3.289` yamalı sürümdür (`npm audit` → 0 açık).
>    Ara sürüm 5.7.x de GHSA-hq66-cqwq-w95j ile aynı sınıfa dahildir, bilinçli olarak
>    atlandı.
> 2. **Tesseract.js sessiz bir CDN bağımlılığıydı.** Kodda hiç URL yoktu ama
>    kütüphanenin varsayılanı worker'ı ve WASM çekirdeğini `cdn.jsdelivr.net`'ten
>    çekip `importScripts` ile ÇALIŞTIRIYORDU. Envanterdeki grep yalnızca literal
>    CDN dizesi aradığı için bunu göremezdi. Artık üçü de (`workerPath`, `corePath`,
>    `langPath`) kendi origin'imizi gösteriyor.
> 3. **Yazı tipleri `fonts.googleapis.com`'dan çekiliyordu** (`globals.css` @import).
>    `next/font/google` ile derleme sırasında indirilip kendi origin'imizden
>    servis ediliyor; her ziyaretçinin IP'si Google'a gitmiyor.

<details><summary>Eski bulgu metni</summary>

**Dosya:** `admin-panel/app/books/page.tsx:121-133`

```js
script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js";
```

`integrity` (SRI) ve `crossorigin` yok. CDN ele geçirilirse veya DNS/MITM saldırısı olursa,
**yönetici oturumu içinde keyfi JavaScript** çalışır — `admin_token` doğrudan çalınabilir.

**Düzeltme:** `npm i pdfjs-dist` ile pakete al (en temizi), ya da en azından `integrity`
hash'i ekle.

</details>

---

### 🟡 #13 — Token `localStorage`'da (XSS ile çalınabilir)

Her iki Next.js uygulaması token'ı `localStorage`'a yazıyor. XSS varsa token doğrudan
okunabilir. HttpOnly cookie **zaten mevcut ve daha güvenli**, ama istemciler onu kullanmıyor.

Bugün XSS yüzeyi düşük (React kaçış yapıyor, `dangerouslySetInnerHTML` hiç kullanılmamış),
ancak #12 ile birleştiğinde gerçek bir zincir oluşur.

**Düzeltme (orta vadeli):** Cookie tabanlı kimliğe tam geçiş + CSRF token'ı.

> 🟨 **KURAL-11 (2026-09-01) — riskin ikinci savunma hattı kuruldu, kök neden duruyor.**
> Token hâlâ `localStorage`'da (15 hassas nokta). Ancak XSS'i sömürmenin önündeki engel
> ciddi biçimde yükseldi: her iki istemci de **istek başına nonce'lu CSP** gönderiyor,
> `script-src` içinde `'unsafe-inline'` YOK. Enjekte edilen bir `<script>` etiketi
> nonce'u bilemeyeceği için çalışmaz.
> Kalan iş — cookie'ye tam geçiş — mimari bir değişikliktir (CSRF token'ı,
> `credentials: 'include'`, CORS daraltması) ve teknik borç olarak açık bırakıldı.

---

### ✅ #14 — Rol değişikliği mevcut token'ı iptal etmiyor — KAPANDI (KURAL-04, 2026-08-23)

> `UpdateRole` ve `DeleteUser` artık `KullaniciTumTokenlariniIptalEt(id)` çağırıyor.
> Kanıt: `Rol_degisince_eski_token_gecersiz_olur`, `Silinen_kullanicinin_tokeni_gecersiz_olur`.
> Kapı: `scripts/guard/04-token.sh` bu iki çağrının silinmesini yakalar.

<details><summary>Eski bulgu metni</summary>

**Dosya:** `AdminController.UpdateRole`

Admin rolü alınan kullanıcı, token'ının ömrü bitene kadar (≤1 saat) **admin kalmaya devam
eder**. Aynı şekilde silinen kullanıcı da token'ı geçerliyken API kullanmaya devam edebilir
(veriler silindiği için çoğu uç 404 verir, ama `/api/books` gibi uçlar çalışır).

**Düzeltme:** `_tokenSecurity.RevokeAllUserTokens(id)` çağır — mekanizma mevcut ama
hiç kullanılmıyor (#3 ile aynı kök neden).

---

</details>

### 🔵 #15 — Diğer notlar

| Konu | Not |
|---|---|
| HTTPS zorlaması | ✅ KURAL-11: üretimde `UseHsts()` + `UseHttpsRedirection()` açık, hedef port (443) **açıkça** verildi (verilmezse yönlendirme sessizce hiç çalışmaz). `UseForwardedHeaders` proxy arkasındaki sonsuz döngüyü engelliyor |
| Prompt injection | Kullanıcı PDF içeriği doğrudan Groq prompt'una ekleniyor. Etki sınırlı (çıktı sadece gösteriliyor) ama model yanıltılabilir |
| PII loglama | `UserActivityLogs.Details` alanına `"Word: {kelime}"` yazılıyor — kullanıcının bilmediği kelimeler kalıcı loga düşüyor. **KURAL-12 ile 90 günlük saklama süresi geldi** (süresiz değil artık); alanın içeriği hâlâ açık borç |
| Otomatik migrate | `Database.Migrate()` her açılışta çalışıyor; çoklu replikada yarış durumu |
| `englishplatform.db` | 🟨 Repodan çıkarıldı ve `.gitignore` artık **`*.db`** deseniyle uzantı bazlı dışlıyor (KURAL-12; tek dosya adı dışlamak yetmezdi). Kapı: `12-butunluk.sh`. **Diskte hâlâ duruyor** ve git geçmişinde de var — ikisi de kullanıcı kararı bekliyor ([00-BASLA-BURADAN madde 5 ve 9](../guvenlik-kurallari/00-BASLA-BURADAN.md)) |
| Mantıksal tekillik | ✅ KURAL-12: 7 tabloya unique index eklendi (ilerleme, kelime, üyelik, atama, sayfa, quiz, çeviri önbelleği). Yarış durumunda mükerrer satır artık veritabanı tarafından reddediliyor; API idempotent kaldı (`BenzersizKaydetAsync`) |
| Bilinçsiz cascade | ✅ KURAL-12: `Groups.AdminUserId` → `ON DELETE RESTRICT`. Öğretmen hesabını silmek eskiden yönettiği tüm grupları **sessizce** siliyordu; artık yol gösteren 400 dönüyor |
| Kişisel veri saklama | ✅ KURAL-12: `SaklamaTemizligiServisi` (aktivite 90 gün, çeviri önbelleği 365 gün, sıfırlama jetonu 7 gün) + kullanıcının kendi OCR kaydını silebildiği uç. `OcrRecords` için **otomatik** süre yok — ürün kararı |
| Derlenmiş araç ikilisi | ✅ KURAL-12: `EnglishReadingPlatform/dotnet-ef` + `.store/**` — 2,6 MB gözden geçirilmemiş çalıştırılabilir (Windows `.exe`'leri dâhil) sürüm kontrolündeydi. Repodan çıkarıldı; yerine sürümü metin olarak sabitleyen `.config/dotnet-tools.json` geldi |
| Ölü `Views/` + `wwwroot/` | ✅ KAPANDI (2026-09-01, kullanıcı kararı). Klasörler ve `app.UseStaticFiles()` silindi. Öncesinde `/js/site.js`, `/css/site.css`, `/lib/jquery-validation…js` **kimlik doğrulaması olmadan 200 dönüyordu**; şimdi 401. Kapı: `11-tarayici.sh` → "statik dosya sunumu geri gelmiş" + "ölü klasörler geri gelmiş" |
| Bağımlılık taraması | ✅ KURAL-01'de eklendi. KURAL-11'de CI Node sürümü 20 → 22'ye çıkarıldı: `pdfjs-dist` 6.x `engines: node >= 22.13` istiyor ve npm bunu yalnızca UYARI olarak geçiyordu |

---

## C. Üç başlıklı özet (Kural 1 / Madde 8)

### 1. Kanıtlanarak kapandı
**Hiçbiri.** Bu oturumda görev dokümantasyondu; kod değiştirilmedi, test yazılmadı,
hiçbir açık kapatılmadı.

### 2. Kapanmadı — ne gerekiyor
Yukarıdaki **#1–#15**'in tamamı açık. Her biri için düzeltme reçetesi ve kanıt testi
verildi. Önerilen sıra:

| Sıra | Bulgu | Neden önce |
|---|---|---|
| 1 | #2 sırlar | Diğer tüm yetkilendirmeyi geçersiz kılıyor |
| 2 | #1 activity/stats | Tek satırlık düzeltme, doğrudan veri sızıntısı |
| 3 | #3 logout | Sessiz başarısızlık, kullanıcı yanıltılıyor |
| 4 | #4 cookie/header | Üretim mimarisine geçerken patlayacak |
| 5 | #5 bellek sızıntısı | DoS |
| 6 | #6, #7 grup verisi | Gizlilik |
| 7 | ~~#8 500 hataları~~ | ✅ KURAL-05 ile kapandı |
| 8 | #9–#15 | Sertleştirme |

### 3. İnsan müdahalesi gerekiyor
Kodun yapamayacağı, karar veya erişim gerektiren adımlar:

1. **Yeni JWT anahtarı üretilip üretim ortamına yazılması** ve eski anahtarın iptal sayılması
2. **Yeni yönetici hesabının `.env` üzerinden tanımlanması** (`Seed__AdminEmail` / `Seed__AdminPassword`) — eski tohum hesabı KURAL-02 ile geçersiz kılındı
3. **PostgreSQL şifresinin döndürülmesi** (repoda düz metin durduğu için sızmış kabul edilmeli)
4. **Groq API anahtarının** repoda/CI loglarında görünüp görünmediğinin denetlenmesi;
   şüpheliyse Groq konsolundan iptal edilip yenilenmesi
5. `EnglishReadingPlatform/englishplatform.db` dosyasının **içinin incelenmesi** —
   gerçek kullanıcı verisi (e-posta, şifre hash'i) içeriyorsa git geçmişinden temizlenmesi
6. **Ürün kararı:** Grup üyeleri birbirlerinin okuma verisini görmeli mi? (#6'nın düzeltme
   biçimi buna bağlı)
7. **Ürün kararı:** Kayıtta e-posta doğrulaması zorunlu olacak mı? (#10)
8. **`NEXT_PUBLIC_API_URL` her iki Vercel projesinde tanımlı olmalı.** CSP'nin
   `connect-src` direktifi bu değerden üretiliyor (`guvenlik-basliklari.mjs`); tanımsızsa
   `http://localhost:5001`'e düşer ve üretimde **tüm API çağrıları CSP tarafından
   engellenir**. (Uygulama kodu da aynı değişkene bakıyor, yani tanımsızsa zaten
   çalışmazdı — ama artık belirti "sessiz ağ hatası" yerine konsolda açık bir CSP
   ihlali olur.)
9. Üretim ortamında **HTTPS'i sonlandıran katmanın** doğrulanması (#15).
   KURAL-11'de **varsayım** yapıldı: TLS'i Render (backend) / Vercel (istemciler)
   sonlandırıyor, uygulamaya düz HTTP + `X-Forwarded-Proto` geliyor. Doğrulanacak iki şey:
   (a) düz HTTP isteği gerçekten HTTPS'e yönleniyor mu, (b) `X-Forwarded-For`'un EN SAĞDAKİ
   değeri gerçek istemci IP'si mi (hız sınırları buna bağlı — bkz. `Program.cs` yorumu)

---

## D. Yeni kod yazarken kontrol listesi

Her yeni uç/özellik için (Kural 1 / Madde 7):

- [ ] **Yetki:** Giriş yapmış olmak yeterli mi, yoksa rol/sahiplik/grup üyeliği de mi gerekiyor?
      → `CurrentUserId` filtresi sorguda var mı?
- [ ] **Girdi:** Uzunluk sınırı kontrol ediliyor mu? (`[StringLength]`) Whitelist mi kullanılıyor?
- [ ] **Kütle atama:** İstek DTO'su entity'nin kendisi değil, ayrı bir sınıf mı?
      (`Role`, `Id`, `UserId` alanları istemciden gelmemeli)
- [ ] **Rate limit:** Yazma ucuysa `[EnableRateLimiting(HizSinirlari.…)]` var mı?
      Doğru politikayı mı seçtin (kaba kuvvete açık uçlar `DavetKodu`, LLM `AgirAnaliz`)?
      → `HizSiniriSozlesmesiTests` unutursan build'i zaten kırar.
- [ ] **Eşzamanlılık:** İş pahalıysa (LLM, PDF, büyük bellek) `AgirIsKapisi` içinden mi geçiyor?
- [ ] **Dış çağrı:** Adlandırılmış `HttpClient` mı kullanıyorsun (zaman aşımı + boyut sınırı)?
- [ ] **Sızıntı:** Yanıt yalnızca gereken alanları mı içeriyor? Hata mesajı iç detay veriyor mu?
- [ ] **Log:** PII, kelime, token, e-posta log'a düşüyor mu?
- [ ] **Test:** Güvenlik açısından kritik davranış için bir test yazıldı mı?
      Mutasyonla doğrulandı mı?
