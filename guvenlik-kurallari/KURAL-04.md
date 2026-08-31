# KURAL-04 — Token yaşam döngüsü gerçekten çalışır

> **Ön koşul:** KURAL-01 ve KURAL-03 tamamlanmış olmalı.
> (`logout` ucunun `[Authorize]` olması KURAL-03'te yapıldı; bu kural `jti` claim'ini okuyacak.)

---

## Kural metni

> **Bir token'ın iptal edildiği söyleniyorsa, o token gerçekten geçersiz olacak.**
> İptal mekanizması yazma ve okuma tarafında **aynı anahtarı** kullanacak; bu sözleşme
> tipiyle zorlanacak ve testle kanıtlanacak. Kimlik taşıyıcısı olarak `Authorization`
> başlığı her zaman cookie'ye öncelikli olacak. Yetki düşüren her işlem (çıkış, rol
> değişimi, hesap silme) ilgili token'ları iptal edecek. Hiçbir iptal işlemi `200 OK`
> dönüp hiçbir şey yapmayacak.

---

## Envanter

Ölçüm tarihi: **2026-08-20**, commit `d2cfc0f`.

### 🔴 İhlal 1 — İptal anahtarı uyuşmuyor (sessiz başarısızlık)

**Yazma tarafı** — `Controllers/AuthController.cs:142-160`:

```csharp
[HttpPost("logout")]
public IActionResult Logout()
{
    var authHeader = Request.Headers["Authorization"].ToString();
    var tokenStr = Request.Cookies["jwt_token"];
    if (string.IsNullOrEmpty(tokenStr) && !string.IsNullOrEmpty(authHeader) && authHeader.StartsWith("Bearer "))
        tokenStr = authHeader.Substring("Bearer ".Length).Trim();

    if (!string.IsNullOrEmpty(tokenStr))
        _tokenSecurity.RevokeToken(tokenStr, DateTime.UtcNow.AddHours(24));   // ← HAM JWT stringi
    ...
```

**Okuma tarafı** — `Program.cs:48-58`:

```csharp
var jti = principal.FindFirst(JwtRegisteredClaimNames.Jti)?.Value;
...
if (tokenSecurity.IsTokenRevoked(jti ?? ctx.SecurityToken?.ToString(), userId, issuedAt))   // ← JTI (GUID)
```

`RevokeToken` sözlüğe `"eyJhbGciOiJIUzI1NiIs..."` yazıyor, `IsTokenRevoked`
`"a3f9c2d1-..."` arıyor. **Hiçbir dalda eşleşme olmuyor:**

| Dal | Arama anahtarı | Sözlükteki anahtar | Eşleşir mi |
|---|---|---|---|
| `jti` claim'i bulunursa | GUID | ham JWT | ❌ |
| `jti` bulunamazsa | `JwtSecurityToken.ToString()` (header+payload JSON) | ham JWT (compact) | ❌ |

**Sonuç:** Çıkış yapılan token **24 saat (admin için 1 saat) daha tam yetkiyle geçerli.**
Kullanıcıya `200 OK` ve *"Başarıyla çıkış yapıldı ve token iptal edildi."* mesajı dönüyor.

### 🔴 İhlal 2 — Toplu iptal mekanizması hiç çağrılmıyor

```
$ grep -rn "RevokeAllUserTokens" EnglishReadingPlatform/Controllers EnglishReadingPlatform/Services EnglishReadingPlatform/Program.cs
EnglishReadingPlatform/Services/TokenSecurityService.cs:35:        public void RevokeAllUserTokens(int userId)
```

Yalnızca **tanım** var, tek bir çağrı yok. `_userRevokedTimestamps` sözlüğü her zaman boş.

Bunun sonucu iki yerde görünüyor:

| Uç | Sorun |
|---|---|
| `PUT /api/admin/users/{id}/role` | Admin'likten alınan kişi, token ömrü bitene kadar (≤1 saat) admin kalır |
| `DELETE /api/admin/users/{id}` | Silinen kullanıcının token'ı hâlâ geçerli; kullanıcı kaydı silindiği için bazı uçlar 404 verir ama `/api/books` gibi uçlar çalışır |

### 🟠 İhlal 3 — Cookie, `Authorization` başlığını eziyor

`Program.cs:34-40`:

```csharp
OnMessageReceived = ctx =>
{
    var token = ctx.Request.Cookies["jwt_token"];
    if (!string.IsNullOrEmpty(token))
        ctx.Token = token;              // ← header VARSA BİLE cookie kazanır
    return Task.CompletedTask;
},
```

Doğru sıra tersidir. Bugün etkisi sınırlı (frontend `credentials` belirtmiyor, çapraz
origin'de cookie gitmiyor) ama backend ve frontend **aynı origin'e** taşındığında —
planlanan üretim mimarisi budur — istemcinin bilinçli seçtiği kimlik sessizce yok sayılır.

### 🟡 İhlal 4 — İptal durumu süreç belleğinde

`Services/TokenSecurityService.cs:10-15`:

```csharp
private readonly ConcurrentDictionary<string, DateTime> _revokedTokens = new();
private readonly ConcurrentDictionary<int, DateTime> _userRevokedTimestamps = new();
```

`AddSingleton<TokenSecurityService>()` — süreç yeniden başlarsa iptal listesi sıfırlanır,
birden fazla replikada hiç çalışmaz.

### Etkilenen nokta özeti

| # | İhlal | Dosya:satır | Nokta |
|---|---|---|---|
| 1 | Anahtar uyuşmazlığı | `AuthController.cs:155`, `Program.cs:54`, `TokenSecurityService.cs:29,40` | **4** |
| 2 | Toplu iptal çağrılmıyor | `AdminController.cs:86` (UpdateRole), `AdminController.cs:108` (DeleteUser) | **2** |
| 3 | Cookie önceliği | `Program.cs:34-40` | **1** |
| 4 | Bellekte durum | `TokenSecurityService.cs:10-15`, `Program.cs:76` | **2** |
| | **TOPLAM** | | **9** |

---

## Merkezî uygulama

Kök neden: **iptal anahtarının ne olduğu hiçbir yerde tanımlı değil.** Çözüm, sözleşmeyi
bir arayüzle tipe bağlamak ve tek bir yerden anahtar üretmek.

### 1. Sözleşme — `EnglishReadingPlatform/Security/ITokenIptalDeposu.cs`

```csharp
namespace EnglishReadingPlatform.Security;

/// <summary>
/// KURAL-04: Token iptal deposu.
/// Anahtar SÖZLEŞMESİ: her zaman token'ın 'jti' claim değeri kullanılır.
/// Ham JWT stringi, hash'i veya SecurityToken.ToString() ASLA anahtar olarak kullanılmaz.
/// Bu sözleşme TokenIptalSozlesmesiTests ile zorlanır.
/// </summary>
public interface ITokenIptalDeposu
{
    /// <summary>Tek bir token'ı jti değeriyle iptal eder.</summary>
    void JtiIptalEt(string jti, DateTime gecerlilikSonu);

    /// <summary>Kullanıcının bu andan önce üretilmiş TÜM token'larını iptal eder.</summary>
    void KullaniciTumTokenlariniIptalEt(int kullaniciId);

    /// <summary>Token iptal edilmiş mi? jti veya kullanıcı-zaman damgası üzerinden.</summary>
    bool IptalEdilmisMi(string? jti, int kullaniciId, DateTime uretilmeZamaniUtc);
}
```

### 2. Bellek içi uygulama — `EnglishReadingPlatform/Security/BellekTokenIptalDeposu.cs`

```csharp
using System.Collections.Concurrent;

namespace EnglishReadingPlatform.Security;

/// <summary>
/// Tek süreçli dağıtımlar için bellek içi iptal deposu.
/// SINIRLAMA: süreç yeniden başlarsa iptaller kaybolur; çoklu replikada çalışmaz.
/// Yatay ölçekleme gerektiğinde RedisTokenIptalDeposu yazılır — arayüz aynı kalır,
/// Program.cs'te tek satır değişir.
/// </summary>
public class BellekTokenIptalDeposu : ITokenIptalDeposu
{
    private readonly ConcurrentDictionary<string, DateTime> _iptalliJtiler = new();
    private readonly ConcurrentDictionary<int, DateTime> _kullaniciKesimZamanlari = new();
    private readonly ILogger<BellekTokenIptalDeposu> _logger;

    public BellekTokenIptalDeposu(ILogger<BellekTokenIptalDeposu> logger) => _logger = logger;

    public void JtiIptalEt(string jti, DateTime gecerlilikSonu)
    {
        if (string.IsNullOrWhiteSpace(jti))
        {
            // Sessiz başarısızlık YASAK: anahtar yoksa bunu bilmek zorundayız.
            _logger.LogWarning("JtiIptalEt boş jti ile çağrıldı — iptal KAYDEDİLMEDİ.");
            return;
        }
        _iptalliJtiler[jti] = gecerlilikSonu;
    }

    public void KullaniciTumTokenlariniIptalEt(int kullaniciId)
        => _kullaniciKesimZamanlari[kullaniciId] = DateTime.UtcNow;

    public bool IptalEdilmisMi(string? jti, int kullaniciId, DateTime uretilmeZamaniUtc)
    {
        if (!string.IsNullOrEmpty(jti) && _iptalliJtiler.TryGetValue(jti, out var son))
        {
            if (DateTime.UtcNow <= son) return true;
            _iptalliJtiler.TryRemove(jti, out _);      // süresi dolmuş kaydı temizle
        }

        if (_kullaniciKesimZamanlari.TryGetValue(kullaniciId, out var kesim))
        {
            // Kesim anında veya öncesinde üretilmiş token'lar geçersiz.
            // 2 saniyelik pay: iat saniye çözünürlüğünde olduğu için sınır durumları kapsar.
            if (uretilmeZamaniUtc <= kesim.AddSeconds(2)) return true;
        }

        return false;
    }

    /// <summary>Arka plan temizliği için — süresi dolmuş jti kayıtlarını atar.</summary>
    public int SuresiDolanlariTemizle()
    {
        var simdi = DateTime.UtcNow;
        var silinen = 0;
        foreach (var kayit in _iptalliJtiler)
            if (kayit.Value < simdi && _iptalliJtiler.TryRemove(kayit.Key, out _))
                silinen++;
        return silinen;
    }
}
```

### 3. Arka plan temizliği — `EnglishReadingPlatform/Security/TokenTemizlikServisi.cs`

Mevcut `TokenSecurityService` yapıcısındaki `Task.Run(async () => while(true) {...})`
deseni hatalıdır: içinde istisna oluşursa **döngü sessizce ölür** ve temizlik hiç yapılmaz.

```csharp
namespace EnglishReadingPlatform.Security;

/// <summary>
/// KURAL-04: Süresi dolmuş iptal kayıtlarını periyodik temizler.
/// Task.Run(while(true)) yerine BackgroundService: istisna loglanır, host'a bildirilir.
/// </summary>
public class TokenTemizlikServisi : BackgroundService
{
    private readonly BellekTokenIptalDeposu _depo;
    private readonly ILogger<TokenTemizlikServisi> _logger;
    private static readonly TimeSpan Aralik = TimeSpan.FromMinutes(10);

    public TokenTemizlikServisi(ITokenIptalDeposu depo, ILogger<TokenTemizlikServisi> logger)
    {
        _depo = (BellekTokenIptalDeposu)depo;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken durdurmaTokeni)
    {
        while (!durdurmaTokeni.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(Aralik, durdurmaTokeni);
                var silinen = _depo.SuresiDolanlariTemizle();
                if (silinen > 0)
                    _logger.LogInformation("{Sayi} süresi dolmuş token iptal kaydı temizlendi.", silinen);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                // Yutma: logla ve döngüye devam et.
                _logger.LogError(ex, "Token temizliği başarısız oldu, sonraki turda tekrar denenecek.");
            }
        }
    }
}
```

> **Not:** `TokenTemizlikServisi` `BellekTokenIptalDeposu`'na cast ediyor. Redis'e
> geçildiğinde bu servis kaydı kaldırılır (Redis TTL kendi temizler). Cast'i güvenli
> hale getirmek için `Program.cs`'te koşullu kayıt yapılır (aşağıda).

### 4. Doğru kimlik taşıyıcı seçimi — `Program.cs`

```csharp
opt.Events = new JwtBearerEvents
{
    OnMessageReceived = ctx =>
    {
        // ── KURAL-04: Authorization başlığı HER ZAMAN önceliklidir. ──
        // Cookie yalnızca başlık YOKSA kullanılır (tarayıcı navigasyonu senaryosu).
        var authHeader = ctx.Request.Headers.Authorization.ToString();
        if (authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            return Task.CompletedTask;      // başlığı olduğu gibi bırak

        var cookie = ctx.Request.Cookies["jwt_token"];
        if (!string.IsNullOrEmpty(cookie))
            ctx.Token = cookie;

        return Task.CompletedTask;
    },

    OnTokenValidated = ctx =>
    {
        var depo = ctx.HttpContext.RequestServices.GetRequiredService<ITokenIptalDeposu>();
        var principal = ctx.Principal;
        if (principal is null) { ctx.Fail("Kimlik bilgisi çözümlenemedi."); return Task.CompletedTask; }

        var jti = principal.FindFirst(JwtRegisteredClaimNames.Jti)?.Value;
        var userIdStr = principal.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var iatStr = principal.FindFirst(JwtRegisteredClaimNames.Iat)?.Value;

        // ── KURAL-04: jti YOKSA token'a güvenilmez. ──
        // Eskiden ham token'a fallback yapılıyordu ve sessizce hiçbir zaman eşleşmiyordu.
        if (string.IsNullOrEmpty(jti))
        {
            ctx.Fail("Token 'jti' talebi taşımıyor — iptal kontrolü yapılamaz.");
            return Task.CompletedTask;
        }

        if (!int.TryParse(userIdStr, out var userId) || !long.TryParse(iatStr, out var iatSec))
        {
            ctx.Fail("Token zorunlu talepleri taşımıyor.");
            return Task.CompletedTask;
        }

        var uretilme = DateTimeOffset.FromUnixTimeSeconds(iatSec).UtcDateTime;
        if (depo.IptalEdilmisMi(jti, userId, uretilme))
            ctx.Fail("Bu oturum sonlandırılmış.");

        return Task.CompletedTask;
    }
};
```

Servis kayıtları:

```csharp
// ─── KURAL-04: token iptal deposu ─────────────────────────────
builder.Services.AddSingleton<ITokenIptalDeposu, BellekTokenIptalDeposu>();
builder.Services.AddHostedService<TokenTemizlikServisi>();

// TokenSecurityService artık YALNIZCA rate limit sorumluluğunu taşıyor (KURAL-07).
builder.Services.AddSingleton<TokenSecurityService>();
```

### 5. `Logout` — jti ile iptal et

`AuthController.cs`:

```csharp
[HttpPost("logout")]
[Authorize]                        // KURAL-03'te eklendi — claim okuyabilmek için şart
public IActionResult Logout()
{
    var jti = User.FindFirst(JwtRegisteredClaimNames.Jti)?.Value;

    if (!string.IsNullOrEmpty(jti))
    {
        // Token'ın kendi son geçerlilik anına kadar iptal listesinde tut.
        var expStr = User.FindFirst(JwtRegisteredClaimNames.Exp)?.Value;
        var son = long.TryParse(expStr, out var expSec)
            ? DateTimeOffset.FromUnixTimeSeconds(expSec).UtcDateTime
            : DateTime.UtcNow.AddHours(24);

        _iptalDeposu.JtiIptalEt(jti, son);
    }
    else if (User.KullaniciIdAl(out var kullaniciId))
    {
        // jti yoksa güvenli tarafta kal: kullanıcının tüm tokenlarını kes.
        _iptalDeposu.KullaniciTumTokenlariniIptalEt(kullaniciId);
    }

    Response.Cookies.Delete("jwt_token", new CookieOptions
    {
        HttpOnly = true, Secure = !_env.IsDevelopment(), SameSite = SameSiteMode.Lax
    });

    return Ok(new { message = "Oturum sonlandırıldı." });
}
```

Yapıcıda `TokenSecurityService` yerine `ITokenIptalDeposu` enjekte edilir.

### 6. Yetki düşüren işlemler token iptal etsin — `AdminController.cs`

```csharp
[HttpPut("users/{id}/role")]
public async Task<IActionResult> UpdateRole(int id, [FromBody] UpdateRoleRequest req)
{
    ... mevcut doğrulamalar ...

    user.Role = req.Role;
    await _db.SaveChangesAsync();

    // ── KURAL-04: eski rolle üretilmiş tokenları geçersiz kıl ──
    _iptalDeposu.KullaniciTumTokenlariniIptalEt(id);

    return Ok(new { success = true, userId = id, newRole = req.Role });
}

[HttpDelete("users/{id}")]
public async Task<IActionResult> DeleteUser(int id)
{
    ... mevcut doğrulamalar ...

    _db.Users.Remove(user);
    await _db.SaveChangesAsync();

    // ── KURAL-04: silinen kullanıcının tokenları anında geçersiz ──
    _iptalDeposu.KullaniciTumTokenlariniIptalEt(id);

    return Ok(new { success = true });
}
```

### 7. `TokenSecurityService`'i sadeleştir

`RevokeToken`, `RevokeAllUserTokens`, `IsTokenRevoked`, `_revokedTokens`,
`_userRevokedTimestamps` ve yapıcıdaki `Task.Run` döngüsü **silinir**.
Sınıfta yalnızca `IsRateLimitExceeded` ve `_rateLimitWindow` kalır (KURAL-07 devralacak).

`JwtService.ValidateToken()` de silinir — hiçbir yerden çağrılmıyor
(`docs/04-BACKEND.md` § 3'te ölü kod olarak işaretli) ve artık geçersiz bir iptal
kontrolü içeriyor.

---

## Otomatik kapı

### A) Sözleşme testi — `TokenIptalSozlesmesiTests.cs`

```csharp
using EnglishReadingPlatform.Security;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace EnglishReadingPlatform.Tests;

/// <summary>
/// KURAL-04: Depo sözleşmesi — yazılan anahtarla okunan anahtar AYNI olmalı.
/// Bu testler eski hatanın (ham token yaz / jti oku) geri gelmesini engeller.
/// </summary>
public class TokenIptalSozlesmesiTests
{
    private static BellekTokenIptalDeposu Depo() =>
        new(NullLogger<BellekTokenIptalDeposu>.Instance);

    [Fact]
    [Trait("Category", "TokenYasamDongusu")]
    public void Iptal_edilen_jti_iptalli_gorunur()
    {
        var depo = Depo();
        var jti = Guid.NewGuid().ToString();

        depo.JtiIptalEt(jti, DateTime.UtcNow.AddHours(1));

        depo.IptalEdilmisMi(jti, kullaniciId: 5, DateTime.UtcNow).Should().BeTrue();
    }

    [Fact]
    [Trait("Category", "TokenYasamDongusu")]
    public void Iptal_edilmeyen_jti_gecerli_kalir()
    {
        var depo = Depo();
        depo.JtiIptalEt(Guid.NewGuid().ToString(), DateTime.UtcNow.AddHours(1));

        depo.IptalEdilmisMi(Guid.NewGuid().ToString(), 5, DateTime.UtcNow).Should().BeFalse();
    }

    [Fact]
    [Trait("Category", "TokenYasamDongusu")]
    public void Ham_token_stringi_anahtar_olarak_ISE_YARAMAZ()
    {
        // ESKİ HATANIN REGRESYON TESTİ:
        // Ham JWT ile iptal edilip jti ile sorgulanırsa eşleşmemeli —
        // yani çağıranın doğru anahtarı kullanması ZORUNLU.
        var depo = Depo();
        var hamToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.sahte.imza";
        var jti = Guid.NewGuid().ToString();

        depo.JtiIptalEt(hamToken, DateTime.UtcNow.AddHours(1));

        depo.IptalEdilmisMi(jti, 5, DateTime.UtcNow).Should().BeFalse(
            "ham token anahtarı jti sorgusuyla eşleşmez — çağıran jti kullanmalı");
    }

    [Fact]
    [Trait("Category", "TokenYasamDongusu")]
    public void Bos_jti_ile_iptal_sessizce_basarili_olmaz()
    {
        var depo = Depo();
        depo.JtiIptalEt("", DateTime.UtcNow.AddHours(1));

        depo.IptalEdilmisMi("", 5, DateTime.UtcNow).Should().BeFalse();
        // Ayrıca uyarı loglanır — sessiz başarısızlık yok.
    }

    [Fact]
    [Trait("Category", "TokenYasamDongusu")]
    public void Kullanici_toplu_iptali_onceki_tokenlari_keser()
    {
        var depo = Depo();
        var eskiUretilme = DateTime.UtcNow.AddMinutes(-5);

        depo.KullaniciTumTokenlariniIptalEt(kullaniciId: 7);

        depo.IptalEdilmisMi(Guid.NewGuid().ToString(), 7, eskiUretilme).Should().BeTrue();
    }

    [Fact]
    [Trait("Category", "TokenYasamDongusu")]
    public void Kullanici_toplu_iptali_SONRAKI_tokenlari_kesmez()
    {
        var depo = Depo();
        depo.KullaniciTumTokenlariniIptalEt(kullaniciId: 7);

        var yeniUretilme = DateTime.UtcNow.AddSeconds(10);   // kesimden sonra

        depo.IptalEdilmisMi(Guid.NewGuid().ToString(), 7, yeniUretilme).Should().BeFalse();
    }

    [Fact]
    [Trait("Category", "TokenYasamDongusu")]
    public void Toplu_iptal_diger_kullaniciyi_etkilemez()
    {
        var depo = Depo();
        depo.KullaniciTumTokenlariniIptalEt(kullaniciId: 7);

        depo.IptalEdilmisMi(Guid.NewGuid().ToString(), 8, DateTime.UtcNow.AddMinutes(-5))
            .Should().BeFalse();
    }

    [Fact]
    [Trait("Category", "TokenYasamDongusu")]
    public void Suresi_dolan_iptal_kaydi_temizlenir()
    {
        var depo = Depo();
        var jti = Guid.NewGuid().ToString();
        depo.JtiIptalEt(jti, DateTime.UtcNow.AddSeconds(-1));   // zaten dolmuş

        depo.IptalEdilmisMi(jti, 5, DateTime.UtcNow).Should().BeFalse();
        depo.SuresiDolanlariTemizle().Should().BeGreaterThanOrEqualTo(0);
    }
}
```

### B) Uçtan uca davranış testi — `TokenYasamDongusuTests.cs`

```csharp
using System.Net;
using System.Net.Http.Json;
using EnglishReadingPlatform.Tests.Infrastructure;
using FluentAssertions;
using Xunit;

namespace EnglishReadingPlatform.Tests;

[Collection("api")]
public class TokenYasamDongusuTests
{
    private readonly TestAppFactory _fabrika;
    public TokenYasamDongusuTests(TestAppFactory fabrika) => _fabrika = fabrika;

    [Fact]
    [Trait("Category", "TokenYasamDongusu")]
    public async Task Cikis_yapilan_token_ARTIK_CALISMAZ()
    {
        // ANA REGRESYON TESTİ — bu testin var olma sebebi #1 numaralı ihlaldir.
        var client = _fabrika.CreateClient();
        var ogrenci = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(ogrenci.Token);

        // 1) Token çalışıyor
        (await client.GetAsync("/api/auth/me")).StatusCode
            .Should().Be(HttpStatusCode.OK, "çıkıştan önce token geçerli olmalı");

        // 2) Çıkış yap
        (await client.PostAsync("/api/auth/logout", null)).StatusCode
            .Should().Be(HttpStatusCode.OK);

        // 3) AYNI token artık geçersiz olmalı
        (await client.GetAsync("/api/auth/me")).StatusCode
            .Should().Be(HttpStatusCode.Unauthorized,
                "çıkış yapılan token bir daha kullanılamamalı — bu testin kırmızı olması " +
                "logout'un sessizce hiçbir şey yapmadığı anlamına gelir");
    }

    [Fact]
    [Trait("Category", "TokenYasamDongusu")]
    public async Task Cikis_baska_kullanicinin_tokenini_etkilemez()
    {
        var clientA = _fabrika.CreateClient();
        var a = await AuthHelper.OgrenciOlarakGirisYapAsync(clientA);
        clientA.TokenIle(a.Token);

        var clientB = _fabrika.CreateClient();
        var b = await AuthHelper.OgrenciOlarakGirisYapAsync(clientB);
        clientB.TokenIle(b.Token);

        await clientA.PostAsync("/api/auth/logout", null);

        (await clientB.GetAsync("/api/auth/me")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    [Trait("Category", "TokenYasamDongusu")]
    public async Task Rol_degisince_eski_token_gecersiz_olur()
    {
        var adminClient = _fabrika.CreateClient();
        var admin = await AuthHelper.AdminOlarakGirisYapAsync(adminClient);
        adminClient.TokenIle(admin.Token);

        var ogrClient = _fabrika.CreateClient();
        var ogrenci = await AuthHelper.OgrenciOlarakGirisYapAsync(ogrClient);
        ogrClient.TokenIle(ogrenci.Token);

        (await ogrClient.GetAsync("/api/auth/me")).StatusCode.Should().Be(HttpStatusCode.OK);

        // Admin, öğrencinin rolünü değiştirir
        var res = await adminClient.PutAsJsonAsync(
            $"/api/admin/users/{ogrenci.UserId}/role", new { role = "teacher" });
        res.StatusCode.Should().Be(HttpStatusCode.OK);

        // Öğrencinin ESKİ token'ı artık geçersiz olmalı
        (await ogrClient.GetAsync("/api/auth/me")).StatusCode
            .Should().Be(HttpStatusCode.Unauthorized,
                "rol değişince eski rolü taşıyan token kesilmeli");
    }

    [Fact]
    [Trait("Category", "TokenYasamDongusu")]
    public async Task Authorization_basligi_cookieyi_ezer()
    {
        // A kullanıcısının cookie'si + B kullanıcısının Bearer token'ı → B dönmeli.
        var kurulum = _fabrika.CreateClient();
        var a = await AuthHelper.OgrenciOlarakGirisYapAsync(kurulum, "kullanici_a");
        var b = await AuthHelper.OgrenciOlarakGirisYapAsync(kurulum, "kullanici_b");

        var client = _fabrika.CreateClient();
        var istek = new HttpRequestMessage(HttpMethod.Get, "/api/auth/me");
        istek.Headers.Add("Cookie", $"jwt_token={a.Token}");
        istek.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", b.Token);

        var yanit = await client.SendAsync(istek);
        yanit.StatusCode.Should().Be(HttpStatusCode.OK);

        var govde = await yanit.Content.ReadAsStringAsync();
        govde.Should().Contain("kullanici_b",
            "Authorization başlığı cookie'ye önceliklidir");
        govde.Should().NotContain("kullanici_a");
    }

    [Fact]
    [Trait("Category", "TokenYasamDongusu")]
    public async Task Cookie_tek_basina_calisir()
    {
        // Başlık yoksa cookie fallback'i çalışmalı (davranış korunmalı).
        var kurulum = _fabrika.CreateClient();
        var a = await AuthHelper.OgrenciOlarakGirisYapAsync(kurulum);

        var client = _fabrika.CreateClient();
        var istek = new HttpRequestMessage(HttpMethod.Get, "/api/auth/me");
        istek.Headers.Add("Cookie", $"jwt_token={a.Token}");

        (await client.SendAsync(istek)).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    [Trait("Category", "TokenYasamDongusu")]
    public async Task Logout_yaniti_yaptigi_isi_dogru_bildirir()
    {
        // Sessiz başarısızlık yasağı: mesaj gerçeği yansıtmalı.
        var client = _fabrika.CreateClient();
        var ogrenci = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(ogrenci.Token);

        var yanit = await client.PostAsync("/api/auth/logout", null);
        var govde = await yanit.Content.ReadAsStringAsync();

        yanit.StatusCode.Should().Be(HttpStatusCode.OK);
        govde.Should().Contain("sonlandırıldı");
    }
}
```

### C) Guard script — `scripts/guard/04-token.sh`

```bash
#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
echo "[04] Token yaşam döngüsü"

# 1. Eski, hatalı API kalıntısı var mı?
cikti="$(kodda_ara 'RevokeToken\(|IsTokenRevoked\(|RevokeAllUserTokens\(' 'EnglishReadingPlatform/*.cs' 'EnglishReadingPlatform/**/*.cs')"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "eski iptal API'si kullanımda" "$n" "$cikti"

# 2. Ham token / SecurityToken.ToString() anahtar olarak kullanılıyor mu?
cikti="$(kodda_ara 'SecurityToken\?\.ToString\(\)|JtiIptalEt\(token' 'EnglishReadingPlatform/**/*.cs')"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "ham token anahtar olarak kullanılıyor" "$n" "$cikti"

# 3. Cookie başlıktan önce mi okunuyor? (OnMessageReceived sırası)
n=0
awk '/OnMessageReceived/,/OnTokenValidated/' EnglishReadingPlatform/Program.cs \
  | grep -q 'Headers.Authorization' || n=1
ihlal_bildir "Authorization başlığı önce kontrol ediliyor" "$n" \
  "OnMessageReceived içinde başlık kontrolü yok — cookie ezer"

# 4. Rol değişimi ve silme token iptal ediyor mu?
n=0
grep -A25 'HttpPut("users/{id}/role")' EnglishReadingPlatform/Controllers/AdminController.cs \
  | grep -q 'KullaniciTumTokenlariniIptalEt' || n=1
ihlal_bildir "UpdateRole token iptal ediyor" "$n" "rol düşürülen kullanıcı admin kalıyor"

n=0
grep -A20 'HttpDelete("users/{id}")' EnglishReadingPlatform/Controllers/AdminController.cs \
  | grep -q 'KullaniciTumTokenlariniIptalEt' || n=1
ihlal_bildir "DeleteUser token iptal ediyor" "$n" "silinen kullanıcının tokenı geçerli kalıyor"

# 5. Task.Run(while(true)) deseni kaldı mı?
cikti="$(kodda_ara 'Task\.Run\(async \(\) =>' 'EnglishReadingPlatform/**/*.cs')"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "Task.Run sonsuz döngü deseni" "$n" "$cikti"

# 6. Sözleşme testi duruyor mu?
n=0; [ -f "EnglishReadingPlatform.Tests/TokenIptalSozlesmesiTests.cs" ] || n=1
ihlal_bildir "sözleşme testi mevcut" "$n" "TokenIptalSozlesmesiTests.cs silinmiş"

guard_bitir
```

---

## Bitti kriteri

```bash
cd /Users/alihanfindikci/Desktop/ingilizceproje
docker compose up -d postgres

# 1) Token yaşam döngüsü testleri — BEKLENEN: Başarısız: 0, Başarılı: 14
dotnet test Linguza.sln --filter "Category=TokenYasamDongusu" --logger "console;verbosity=normal"
echo "çıkış kodu: $?"

# 2) Guard kapısı — BEKLENEN: TOPLAM İHLAL: 0
bash scripts/guard/04-token.sh; echo "çıkış kodu: $?"

# 3) Eski API kalıntısı — BEKLENEN: 0
grep -rn "RevokeToken(\|IsTokenRevoked(\|RevokeAllUserTokens(" \
  EnglishReadingPlatform/Controllers EnglishReadingPlatform/Services EnglishReadingPlatform/Program.cs | wc -l

# 4) Ölü kod temizlendi mi? — BEKLENEN: 0
grep -c "ValidateToken" EnglishReadingPlatform/Services/AppServices.cs || echo 0

# 5) Tüm kapılar — BEKLENEN: TOPLAM İHLAL: 0
bash scripts/guard/run-all.sh; echo "çıkış kodu: $?"

# 6) Regresyon: tüm test takımı
dotnet test Linguza.sln --logger "console;verbosity=normal"
```

**Kabul koşulu:** 1'de `Başarısız: 0`; 2 ve 5 çıkış kodu `0`; 3 ve 4 çıktısı `0`;
6'da `Başarısız: 0`.

---

## Mutasyon kontrolü (zorunlu)

Bu kuralın **en kritik mutasyonu** budur — eski hatayı geri koyup testin kırmızıya
döndüğünü kanıtlamak:

```bash
# ── MUTASYON A: eski anahtar uyuşmazlığını geri getir ──────────
# Logout'u jti yerine ham token'la iptal edecek hale çevir.
cp EnglishReadingPlatform/Controllers/AuthController.cs /tmp/AuthController.orig.cs

python3 - <<'PY'
yol = "EnglishReadingPlatform/Controllers/AuthController.cs"
k = open(yol, encoding="utf-8").read()
k = k.replace(
    '_iptalDeposu.JtiIptalEt(jti, son);',
    '_iptalDeposu.JtiIptalEt(Request.Headers.Authorization.ToString(), son);  // MUTASYON')
open(yol, "w", encoding="utf-8").write(k)
PY

dotnet test Linguza.sln --filter "FullyQualifiedName~Cikis_yapilan_token_ARTIK_CALISMAZ"
# BEKLENEN: Başarısız: 1
#   "Expected StatusCode to be Unauthorized, but found OK"
#   ← ESKİ HATANIN TA KENDİSİ. Test bunu yakalıyor.

cp /tmp/AuthController.orig.cs EnglishReadingPlatform/Controllers/AuthController.cs
dotnet test Linguza.sln --filter "FullyQualifiedName~Cikis_yapilan_token_ARTIK_CALISMAZ"
# BEKLENEN: Başarısız: 0
```

```bash
# ── MUTASYON B: cookie önceliğini geri getir ───────────────────
cp EnglishReadingPlatform/Program.cs /tmp/Program.orig.cs

python3 - <<'PY'
yol = "EnglishReadingPlatform/Program.cs"
k = open(yol, encoding="utf-8").read()
k = k.replace(
    'if (authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))\n            return Task.CompletedTask;',
    '// MUTASYON: başlık kontrolü devre dışı')
open(yol, "w", encoding="utf-8").write(k)
PY

dotnet test Linguza.sln --filter "FullyQualifiedName~Authorization_basligi_cookieyi_ezer"
# BEKLENEN: Başarısız: 1 — "kullanici_a" bulundu, "kullanici_b" bekleniyordu

cp /tmp/Program.orig.cs EnglishReadingPlatform/Program.cs
dotnet test Linguza.sln --filter "Category=TokenYasamDongusu"   # BEKLENEN: Başarısız: 0
```

```bash
# ── MUTASYON C: rol değişiminde iptali kaldır ──────────────────
sed -i '' '/_iptalDeposu.KullaniciTumTokenlariniIptalEt(id);/d' \
  EnglishReadingPlatform/Controllers/AdminController.cs

dotnet test Linguza.sln --filter "FullyQualifiedName~Rol_degisince_eski_token_gecersiz_olur"
# BEKLENEN: Başarısız: 1
bash scripts/guard/04-token.sh; echo "çıkış kodu: $?"     # BEKLENEN: 1

git checkout EnglishReadingPlatform/Controllers/AdminController.cs
dotnet test Linguza.sln --filter "Category=TokenYasamDongusu"   # BEKLENEN: Başarısız: 0
```

---

## Geçiş planı

| Adım | İş | Nokta | Doğrulama |
|---|---|---|---|
| 1 | `Security/ITokenIptalDeposu.cs` yaz | — | derlenir |
| 2 | `Security/BellekTokenIptalDeposu.cs` yaz | — | derlenir |
| 3 | `Security/TokenTemizlikServisi.cs` yaz | — | derlenir |
| 4 | `TokenIptalSozlesmesiTests.cs` yaz | — | **8 test yeşil** (merkezî çözüm önce kanıtlanır) |
| 5 | `Program.cs`: DI kayıtları + `OnMessageReceived` + `OnTokenValidated` | 3 | derlenir |
| 6 | `AuthController.Logout` → jti ile iptal | 1 | `Cikis_yapilan_token_ARTIK_CALISMAZ` yeşil |
| 7 | `AdminController.UpdateRole` + `DeleteUser` → toplu iptal | 2 | ilgili testler yeşil |
| 8 | `TokenSecurityService`'ten iptal kodunu sil (rate limit kalsın) | 2 | derlenir, KURAL-07 etkilenmez |
| 9 | `JwtService.ValidateToken` sil | 1 | derlenir |
| 10 | `TokenYasamDongusuTests.cs` yaz | — | 6 test yeşil |
| 11 | `scripts/guard/04-token.sh` + `chmod +x` | — | çıkış kodu 0 |
| 12 | Frontend regresyon (aşağı bak) | — | elle |
| 13 | İlerleme tablosunu güncelle | — | — |

> **Adım 4 neden 6'dan önce:** Pazarlıksız madde 1 — *önce merkezî çözüm*. Depo
> sözleşmesi kanıtlanmadan çağrı yerleri taşınmaz.

### Adım 12 — frontend regresyon kontrolü (elle)

```bash
./start-dev.sh
```

| Akış | Beklenen | Neden riskli |
|---|---|---|
| Giriş → çıkış → geri tuşu | Korumalı sayfa açılmamalı, `/login`'e atmalı | Artık token gerçekten ölüyor |
| Çıkış → aynı sekmede tekrar giriş | Çalışmalı | Yeni token yeni `jti` alır |
| İki sekmede aynı hesap → birinde çıkış | **Diğer sekme de düşer** | `jti` aynı token paylaşılıyor — beklenen davranış |
| Yönetici panelinde rol değiştir | Hedef kullanıcının oturumu düşer | Yeni davranış, kullanıcıya bildirilmeli |
| Yönetici paneli "Oturumu Kapat" | Yalnızca `localStorage.clear()` yapıyor, sunucuya haber vermiyor | 🟡 **Bilinen eksik** — aşağı bak |

> 🟡 **Kapsam dışı ama raporlanacak:** `admin-panel/app/components/AdminLayout.tsx:84`
> çıkışta `POST /api/auth/logout` **çağırmıyor**, sadece `localStorage.clear()` yapıyor.
> Bu kural backend'i düzeltir; admin panelinin çıkış akışı düzeltilmezse yönetici
> token'ı sunucuda iptal edilmez. Tek satırlık bir düzeltmedir ve bu kural kapsamında
> yapılması **önerilir**:
>
> ```ts
> onClick={async () => {
>   const t = localStorage.getItem("admin_token");
>   try {
>     await fetch(`${API}/api/auth/logout`, {
>       method: "POST",
>       headers: t ? { Authorization: `Bearer ${t}` } : {},
>     });
>   } catch { /* ağ hatası çıkışı engellemesin */ }
>   localStorage.removeItem("admin_token");
>   localStorage.removeItem("admin_user");
>   router.replace("/");
> }}
> ```
>
> `localStorage.clear()` yerine hedefli `removeItem` kullanılması da ayrı bir
> iyileştirmedir (aynı origin'deki diğer verileri silmemek için).

---

## Tuzaklar

| Tuzak | Neden olur | Nasıl kaçınılır |
|---|---|---|
| **`logout`'a `[Authorize]` koymayı unutmak** | `User` claim'leri boş gelir, `jti` bulunamaz, iptal yine sessizce çalışmaz — üstelik testler `[AllowAnonymous]` ile geçiyormuş gibi görünebilir | KURAL-03'te eklendi; guard bunu kontrol etmiyor, **sözleşme testi** ediyor |
| **`ctx.Fail()` yerine `return` yazmak** | `OnTokenValidated` içinde `return` istek akışını kesmez, token **geçerli sayılır** | Her hata dalında `ctx.Fail(...)` çağrılmalı |
| **`jti` yoksa ham token'a fallback yapmak** | Eski hatanın tam kaynağı. "Bir şeye düşelim" refleksi, sessiz açığa dönüşür | `jti` yoksa `ctx.Fail()` — düşülecek güvenli değer yok |
| **`iat` yerine `nbf` kullanmak** | `nbf` (not before) farklı bir alandır; toplu iptal karşılaştırması yanlış çalışır | `JwtService` `iat` üretiyor, karşılaştırma da `iat` ile |
| **Toplu iptalde `<` yerine `<=` kullanmamak** | `iat` saniye çözünürlüğünde; aynı saniyede üretilen token kesimden kaçar | `uretilmeZamani <= kesim.AddSeconds(2)` — 2 sn pay bilinçli |
| **Rol değişiminden sonra iptal etmek yerine önce etmek** | `SaveChangesAsync` başarısız olursa kullanıcının oturumu boşuna düşer | Önce kaydet, sonra iptal et |
| **`TokenTemizlikServisi`'nde cast'i kontrolsüz yapmak** | Redis'e geçilince `InvalidCastException` ile uygulama açılışta çöker | Redis'e geçerken bu `AddHostedService` kaydı kaldırılır — geçiş notunda yazılı |
| **Testleri paralel koşturmak** | `BellekTokenIptalDeposu` Singleton; bir testin iptali diğerini etkiler | `[Collection("api")]` sıralı koşturur; birim testler kendi deposunu kuruyor |
| **`exp` claim'ini okumayı atlayıp sabit 24 saat vermek** | Admin tokenı 1 saatlik, 24 saat listede tutmak bellekte gereksiz şişme | `Logout` `exp` claim'ini okuyor |
| **Cookie fallback'ini tamamen kaldırmak** | Tarayıcı navigasyonuyla çalışan bir akış varsa sessizce kırılır | Fallback korunuyor, yalnızca **önceliği** değişti; `Cookie_tek_basina_calisir` testi bunu koruyor |

---

## Teslim şablonu

```markdown
## 1. Kanıtlanarak kapandı
<6 bitti-kriteri komutunun ham çıktısı>
<MUTASYON A çıktısı — "Expected Unauthorized, but found OK" satırı GÖRÜNMELİ>
<MUTASYON B ve C çıktıları>

## 2. Kapanmadı
- İptal durumu hâlâ süreç belleğinde (ITokenIptalDeposu arayüzü hazır, Redis uygulaması yazılmadı)
  → Kullanıcı "A: tek sunucu" seçeneğini seçtiği için bilinçli bırakıldı
  → Sunucu yeniden başladığında iptal listesi sıfırlanır; bu kabul edilmiş risktir
<varsa diğerleri>

## 3. İnsan müdahalesi gerekiyor
- [ ] Frontend regresyon kontrolü (geçiş planı adım 12) — 5 akışı elle dene
- [ ] Redis kararı: A (tek sunucu, bellekte) mi B (Redis) mi?
      → detaylı anlatım: 00-BASLA-BURADAN.md → İnsan kararı gereken işler, madde 10
- [ ] Kullanıcılara bildirilecek davranış değişikliği: "rolünüz değişince yeniden giriş yapmanız gerekir"

## Değiştirilen dosyalar
<git diff --stat>

## Commit
<git log -1 --format='%H %s'>
```
