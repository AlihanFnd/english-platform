# KURAL-09 — Kimlik doğrulama sertleştirmesi

> **Ön koşul:** KURAL-01, KURAL-05 ve KURAL-07 tamamlanmış olmalı.

---

## Kural metni

> **Hesap sahipliği, tahmin edilebilir bir şifreyle veya sınırsız denemeyle ele geçirilemeyecek.**
> Şifre politikası tek bir serviste tanımlanacak ve tüm şifre kabul eden yollarda
> uygulanacak. Kullanıcı şifresini **değiştirebilecek** ve unuttuğunda **kurtarabilecek**.
> Şifre değişimi mevcut oturumları sonlandıracak. Giriş denemeleri hem IP hem **hedef
> hesap** bazında sınırlanacak. Kimlik doğrulama yanıtları hesabın varlığını sızdırmayacak.

---

## Envanter

Ölçüm tarihi: **2026-08-20**, commit `d2cfc0f`.

### İhlal 1 — Şifre politikası: yalnızca uzunluk, o da 6 🔴

`Controllers/AuthController.cs:98-101`:

```csharp
if (req.Password.Length < 6)
    return BadRequest(new { error = "Şifre en az 6 karakter olmalıdır." });
```

`123456`, `password`, `aaaaaa` kabul edilir. Karmaşıklık kuralı, yaygın şifre listesi
veya kullanıcı adı benzerliği kontrolü **yok**.

### İhlal 2 — Şifre değiştirme ve sıfırlama uçları YOK 🔴

```
$ grep -rn "change-password\|reset-password\|forgot\|SifreDegistir" EnglishReadingPlatform/Controllers/
(çıktı yok)
```

| Eksik | Sonuç |
|---|---|
| Şifre değiştirme | Şifresi ele geçirilen kullanıcı **kendini koruyamıyor** |
| Şifre sıfırlama | Şifresini unutan kullanıcı hesabına **bir daha giremiyor** |
| E-posta doğrulama | Sahte adreslerle sınırsız hesap açılabiliyor |

Bu, güvenlik açığı olmanın yanında **işlevsel bir kayıptır**.

### İhlal 3 — Giriş sınırı yalnızca IP bazında 🟠

`AuthController.cs:44-48`:

```csharp
var ip = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown_ip";
if (_tokenSecurity.IsRateLimitExceeded($"login_{ip}", 10))
```

Dağıtık bir saldırı (her IP'den 10 deneme) tek bir hesaba **sınırsız** deneme yapabilir.

> KURAL-07 `HesapSayaci`'nı ekledi. Bu kural onu **kullanıma sokar** ve başarılı girişte
> sıfırlama davranışını ekler.

### İhlal 4 — Kayıt ucu kullanıcı enumerasyonu yapıyor 🟡

`AuthController.cs:105-109`:

```csharp
var existingUser = await _db.Users.AnyAsync(u => u.Email == ... || u.Username == ...);
if (existingUser)
    return BadRequest(new { error = "Bu email veya kullanıcı adı zaten kullanımda." });
```

Bir e-postanın sistemde kayıtlı olup olmadığı öğrenilebiliyor.
Giriş ucu bunu **yapmıyor** ✅ (`"Email veya şifre hatalı."`).

### İhlal 5 — Şifre üst sınırı yok 🟡

BCrypt 72 bayttan sonrasını yok sayar. 1 MB'lık bir şifre gönderilirse hash'leme
gereksiz CPU tüketir (KURAL-05 `SifreEnCok = 128` sabitini tanımladı, henüz uygulanmadı).

### İhlal 6 — Zamanlama sızıntısı 🟡

```csharp
var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == ...);
if (user == null || !BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
    return Unauthorized(...);
```

Kullanıcı **yoksa** `BCrypt.Verify` hiç çalışmaz → yanıt belirgin biçimde daha hızlı gelir.
Mesaj aynı olsa da **süre farkı** hesabın varlığını sızdırır.

### Özet

| # | İhlal | Nokta |
|---|---|---|
| 1 | Zayıf şifre politikası | 1 (register) |
| 2 | Değiştirme/sıfırlama ucu yok | 3 eksik uç |
| 3 | Hesap bazlı sınır yok | 1 |
| 4 | Kayıt enumerasyonu | 1 |
| 5 | Şifre üst sınırı yok | 2 (login, register) |
| 6 | Zamanlama sızıntısı | 1 |
| | **TOPLAM** | **9** |

---

## Merkezî uygulama

### 1. Şifre politikası servisi — `Security/SifrePolitikasi.cs`

```csharp
using System.Text.RegularExpressions;

namespace EnglishReadingPlatform.Security;

public record SifreDogrulamaSonucu(bool Gecerli, IReadOnlyList<string> Hatalar)
{
    public static SifreDogrulamaSonucu Basarili() => new(true, Array.Empty<string>());
    public string BirlesikMesaj => string.Join(" ", Hatalar);
}

/// <summary>
/// KURAL-09: Şifre kurallarının TEK kaynağı.
/// Kayıt, şifre değiştirme ve şifre sıfırlama yollarının HEPSİ buradan geçer.
/// </summary>
public class SifrePolitikasi
{
    public const int EnAzUzunluk = 10;
    public const int EnCokUzunluk = 128;   // BCrypt 72 bayt sonrasını yok sayar; DoS üst sınırı

    /// <summary>
    /// En sık kullanılan şifreler. Üretimde bu liste bir dosyadan yüklenmelidir
    /// (ör. SecLists top-10000). Buradaki küçük liste asgari savunmadır.
    /// </summary>
    private static readonly HashSet<string> YayginSifreler = new(StringComparer.OrdinalIgnoreCase)
    {
        "password", "parola", "123456", "12345678", "123456789", "1234567890",
        "qwerty", "qwerty123", "asdasd", "111111", "123123", "abc123",
        "sifre123", "parola123", "admin123", "iloveyou", "welcome",
        "monkey", "dragon", "letmein", "football", "password1", "password123",
        "linguza", "linguza123", "ingilizce", "turkiye", "galatasaray",
        "fenerbahce", "besiktas", "trabzonspor"
    };

    public SifreDogrulamaSonucu Dogrula(string? sifre, string? kullaniciAdi = null, string? eposta = null)
    {
        var hatalar = new List<string>();

        if (string.IsNullOrWhiteSpace(sifre))
            return new SifreDogrulamaSonucu(false, new[] { "Şifre zorunludur." });

        if (sifre.Length < EnAzUzunluk)
            hatalar.Add($"Şifre en az {EnAzUzunluk} karakter olmalıdır.");

        if (sifre.Length > EnCokUzunluk)
            hatalar.Add($"Şifre en fazla {EnCokUzunluk} karakter olabilir.");

        // Karmaşıklık: dört sınıftan en az üçü
        var siniflar = 0;
        if (Regex.IsMatch(sifre, "[a-zçğıöşü]")) siniflar++;
        if (Regex.IsMatch(sifre, "[A-ZÇĞİÖŞÜ]")) siniflar++;
        if (Regex.IsMatch(sifre, "[0-9]"))        siniflar++;
        if (Regex.IsMatch(sifre, @"[^\p{L}\p{N}]")) siniflar++;

        if (siniflar < 3)
            hatalar.Add("Şifre; küçük harf, büyük harf, rakam ve sembol türlerinden en az üçünü içermelidir.");

        if (YayginSifreler.Contains(sifre))
            hatalar.Add("Bu şifre çok yaygın kullanılıyor, başka bir şifre seçin.");

        // Tek karakter tekrarı: aaaaaaaaaa
        if (sifre.Distinct().Count() <= 3)
            hatalar.Add("Şifre yeterince çeşitli karakter içermiyor.");

        // Kullanıcı bilgisiyle benzerlik
        if (!string.IsNullOrWhiteSpace(kullaniciAdi) &&
            sifre.Contains(kullaniciAdi, StringComparison.OrdinalIgnoreCase))
            hatalar.Add("Şifre kullanıcı adınızı içeremez.");

        if (!string.IsNullOrWhiteSpace(eposta))
        {
            var yerel = eposta.Split('@')[0];
            if (yerel.Length >= 3 && sifre.Contains(yerel, StringComparison.OrdinalIgnoreCase))
                hatalar.Add("Şifre e-posta adresinizi içeremez.");
        }

        return hatalar.Count == 0 ? SifreDogrulamaSonucu.Basarili()
                                  : new SifreDogrulamaSonucu(false, hatalar);
    }
}
```

Kayıt: `builder.Services.AddSingleton<SifrePolitikasi>();`

### 2. Şifre sıfırlama jetonu — model + migration

`Models/AppModels.cs`'e ekle:

```csharp
// ─── Şifre Sıfırlama Jetonu ────────────────────────────────
public class SifreSifirlamaJetonu
{
    [Key] public int Id { get; set; }
    public int UserId { get; set; }
    [ForeignKey("UserId")] public User User { get; set; } = null!;

    /// <summary>Jetonun SHA-256 hash'i. Ham jeton veritabanında SAKLANMAZ.</summary>
    [Required, MaxLength(64)] public string JetonHash { get; set; } = "";

    public DateTime GecerlilikSonu { get; set; }
    public DateTime? KullanildiAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
```

`AppDbContext`'e:

```csharp
public DbSet<SifreSifirlamaJetonu> SifreSifirlamaJetonlari => Set<SifreSifirlamaJetonu>();
// OnModelCreating içinde:
modelBuilder.Entity<SifreSifirlamaJetonu>().HasIndex(j => j.JetonHash).IsUnique();
```

```bash
cd EnglishReadingPlatform && dotnet ef migrations add SifreSifirlamaJetonu
```

### 3. Sıfırlama servisi — `Security/SifreSifirlamaServisi.cs`

```csharp
using System.Security.Cryptography;
using EnglishReadingPlatform.Data;
using EnglishReadingPlatform.Models;
using Microsoft.EntityFrameworkCore;

namespace EnglishReadingPlatform.Security;

public class SifreSifirlamaServisi
{
    private readonly AppDbContext _db;
    private readonly ILogger<SifreSifirlamaServisi> _logger;
    private static readonly TimeSpan Gecerlilik = TimeSpan.FromMinutes(30);

    public SifreSifirlamaServisi(AppDbContext db, ILogger<SifreSifirlamaServisi> logger)
    {
        _db = db; _logger = logger;
    }

    /// <summary>Kriptografik olarak güvenli jeton üretir ve HASH'ini saklar.</summary>
    public async Task<string> JetonUretAsync(int kullaniciId)
    {
        // Aynı kullanıcının bekleyen jetonlarını geçersiz kıl (tek aktif jeton)
        var eskiler = await _db.SifreSifirlamaJetonlari
            .Where(j => j.UserId == kullaniciId && j.KullanildiAt == null)
            .ToListAsync();
        foreach (var e in eskiler) e.KullanildiAt = DateTime.UtcNow;

        var hamJeton = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));

        _db.SifreSifirlamaJetonlari.Add(new SifreSifirlamaJetonu
        {
            UserId = kullaniciId,
            JetonHash = Hashle(hamJeton),
            GecerlilikSonu = DateTime.UtcNow.Add(Gecerlilik)
        });
        await _db.SaveChangesAsync();

        return hamJeton;   // yalnızca burada görünür; DB'de yalnızca hash var
    }

    /// <summary>Jetonu doğrular ve tüketir. Geçersizse null döner.</summary>
    public async Task<User?> JetonuTuketAsync(string hamJeton)
    {
        if (string.IsNullOrWhiteSpace(hamJeton)) return null;

        var hash = Hashle(hamJeton);
        var kayit = await _db.SifreSifirlamaJetonlari
            .Include(j => j.User)
            .FirstOrDefaultAsync(j => j.JetonHash == hash);

        if (kayit is null)                          { _logger.LogWarning("Bilinmeyen sıfırlama jetonu."); return null; }
        if (kayit.KullanildiAt is not null)         { _logger.LogWarning("Kullanılmış sıfırlama jetonu tekrar denendi. KullaniciId={Id}", kayit.UserId); return null; }
        if (kayit.GecerlilikSonu < DateTime.UtcNow) { _logger.LogInformation("Süresi dolmuş sıfırlama jetonu. KullaniciId={Id}", kayit.UserId); return null; }

        kayit.KullanildiAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return kayit.User;
    }

    private static string Hashle(string ham)
        => Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(ham)));
}
```

### 4. E-posta gönderimi — soyutlama (uygulama insan kararına bağlı)

```csharp
namespace EnglishReadingPlatform.Security;

public interface IEpostaGondericisi
{
    Task SifreSifirlamaGonderAsync(string eposta, string sifirlamaBaglantisi);
}

/// <summary>
/// Gerçek e-posta servisi yapılandırılmamışken kullanılan uygulama.
/// Bağlantıyı LOGA yazar — geliştirme ve "B seçeneği" için yeterlidir.
/// Üretimde gerçek bir gönderici (Resend/SendGrid/SES) ile değiştirilmelidir.
/// </summary>
public class LoglayanEpostaGondericisi : IEpostaGondericisi
{
    private readonly ILogger<LoglayanEpostaGondericisi> _logger;
    public LoglayanEpostaGondericisi(ILogger<LoglayanEpostaGondericisi> logger) => _logger = logger;

    public Task SifreSifirlamaGonderAsync(string eposta, string baglanti)
    {
        _logger.LogWarning(
            "E-POSTA SERVİSİ YAPILANDIRILMAMIŞ. Şifre sıfırlama bağlantısı gönderilemedi. " +
            "Alıcı={Alici} Baglanti={Baglanti}",
            Logging.GuvenliLog.Eposta(eposta), baglanti);
        return Task.CompletedTask;
    }
}
```

> ⚠️ **Bu, `00-BASLA-BURADAN.md` madde 7'deki karara bağlıdır.**
> Kullanıcı **A** seçerse gerçek bir gönderici yazılır; **B** seçerse yalnızca şifre
> değiştirme ucu eklenir ve sıfırlama akışı devre dışı bırakılır; **C** seçerse ikisi de yapılmaz.
> **Karar gelmezse varsayılan B'dir** — şifre değiştirme eklenir, sıfırlama uçları
> `LoglayanEpostaGondericisi` ile hazır dururlar ama üretimde etkin değildirler.

### 5. Yeni uçlar — `AuthController`

```csharp
public class SifreDegistirIstegi
{
    [Required] public string MevcutSifre { get; set; } = "";
    [Required] [StringLength(SifrePolitikasi.EnCokUzunluk, MinimumLength = SifrePolitikasi.EnAzUzunluk)]
    public string YeniSifre { get; set; } = "";
}

// POST /api/auth/change-password
[HttpPost("change-password")]
[Authorize]
[EnableRateLimiting(HizSinirlari.KimlikDogrulama)]
public async Task<IActionResult> SifreDegistir([FromBody] SifreDegistirIstegi req)
{
    var kullaniciId = this.KullaniciId();
    var kullanici = await _db.Users.FindAsync(kullaniciId);
    if (kullanici is null) return Unauthorized(new { error = "Oturum geçersiz." });

    if (!BCrypt.Net.BCrypt.Verify(req.MevcutSifre, kullanici.PasswordHash))
        return BadRequest(new { error = "Mevcut şifreniz hatalı." });

    var sonuc = _sifrePolitikasi.Dogrula(req.YeniSifre, kullanici.Username, kullanici.Email);
    if (!sonuc.Gecerli) return BadRequest(new { error = sonuc.BirlesikMesaj });

    if (BCrypt.Net.BCrypt.Verify(req.YeniSifre, kullanici.PasswordHash))
        return BadRequest(new { error = "Yeni şifre eskisiyle aynı olamaz." });

    kullanici.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.YeniSifre);
    await _db.SaveChangesAsync();

    // ── KURAL-04 + KURAL-09: şifre değişimi TÜM oturumları sonlandırır ──
    _iptalDeposu.KullaniciTumTokenlariniIptalEt(kullaniciId);
    Response.Cookies.Delete("jwt_token", new CookieOptions
    { HttpOnly = true, Secure = !_env.IsDevelopment(), SameSite = SameSiteMode.Lax });

    _logger.LogInformation("Şifre değiştirildi. KullaniciId={Id}", kullaniciId);
    return Ok(new { message = "Şifreniz değiştirildi. Lütfen yeniden giriş yapın." });
}

// POST /api/auth/forgot-password
[HttpPost("forgot-password")]
[AllowAnonymous]
[EnableRateLimiting(HizSinirlari.KimlikDogrulama)]
public async Task<IActionResult> SifremiUnuttum([FromBody] SifremiUnuttumIstegi req)
{
    var eposta = (req.Eposta ?? "").Trim().ToLowerInvariant();
    var kullanici = await _db.Users.FirstOrDefaultAsync(u => u.Email == eposta);

    if (kullanici is not null)
    {
        var jeton = await _sifirlamaServisi.JetonUretAsync(kullanici.Id);
        var taban = _configuration["App:FrontendUrl"] ?? "http://localhost:3000";
        await _epostaGondericisi.SifreSifirlamaGonderAsync(
            kullanici.Email, $"{taban}/reset-password?token={jeton}");
    }

    // ── KURAL-09: hesabın varlığını SIZDIRMA — her durumda aynı yanıt ──
    return Ok(new { message = "Eğer bu e-posta kayıtlıysa, sıfırlama bağlantısı gönderildi." });
}

// POST /api/auth/reset-password
[HttpPost("reset-password")]
[AllowAnonymous]
[EnableRateLimiting(HizSinirlari.KimlikDogrulama)]
public async Task<IActionResult> SifreSifirla([FromBody] SifreSifirlaIstegi req)
{
    var kullanici = await _sifirlamaServisi.JetonuTuketAsync(req.Jeton);
    if (kullanici is null)
        return BadRequest(new { error = "Bağlantı geçersiz veya süresi dolmuş. Yeniden talep edin." });

    var sonuc = _sifrePolitikasi.Dogrula(req.YeniSifre, kullanici.Username, kullanici.Email);
    if (!sonuc.Gecerli) return BadRequest(new { error = sonuc.BirlesikMesaj });

    kullanici.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.YeniSifre);
    await _db.SaveChangesAsync();

    _iptalDeposu.KullaniciTumTokenlariniIptalEt(kullanici.Id);
    _logger.LogInformation("Şifre sıfırlandı. KullaniciId={Id}", kullanici.Id);

    return Ok(new { message = "Şifreniz sıfırlandı. Giriş yapabilirsiniz." });
}
```

### 6. `Register`'ı politikaya bağla ve enumerasyonu kapat

```csharp
var sonuc = _sifrePolitikasi.Dogrula(req.Password, req.Username, req.Email);
if (!sonuc.Gecerli) return BadRequest(new { error = sonuc.BirlesikMesaj });

var mevcut = await _db.Users.AnyAsync(u => u.Email == eposta || u.Username == kullaniciAdi);
if (mevcut)
{
    // KURAL-09: hangi alanın çakıştığını söyleme.
    _logger.LogInformation("Mevcut kimlikle kayıt denemesi. Eposta={Eposta}",
        GuvenliLog.Eposta(req.Email));
    return BadRequest(new { error = "Bu bilgilerle kayıt oluşturulamadı. Farklı bir e-posta veya kullanıcı adı deneyin." });
}
```

### 7. `Login` — hesap bazlı sınır + sabit süre

```csharp
[HttpPost("login")]
[AllowAnonymous]
[EnableRateLimiting(HizSinirlari.KimlikDogrulama)]      // IP bazlı — KURAL-07
public async Task<IActionResult> Login([FromBody] LoginRequest req)
{
    var eposta = (req.Email ?? "").Trim().ToLowerInvariant();

    // ── KURAL-09: hedef hesap bazlı sınır (dağıtık saldırıya karşı) ──
    var hedefAnahtar = $"giris_hedef:{eposta}";
    if (!_hesapSayaci.IzinVar(hedefAnahtar, izin: 10, pencere: TimeSpan.FromMinutes(15)))
    {
        _logger.LogWarning("Hesap bazlı giriş sınırı aşıldı. Eposta={Eposta}", GuvenliLog.Eposta(eposta));
        return StatusCode(429, new { error = "Bu hesap için çok fazla deneme yapıldı. 15 dakika sonra tekrar deneyin." });
    }

    var kullanici = await _db.Users.FirstOrDefaultAsync(u => u.Email == eposta);

    // ── KURAL-09: zamanlama sızıntısını kapat ──
    // Kullanıcı yoksa da BCrypt çalıştır; süre farkı hesabın varlığını sızdırmasın.
    var hash = kullanici?.PasswordHash ?? SahteHash;
    var sifreDogru = BCrypt.Net.BCrypt.Verify(req.Password ?? "", hash);

    if (kullanici is null || !sifreDogru)
        return Unauthorized(new { error = "Email veya şifre hatalı." });

    _hesapSayaci.Sifirla(hedefAnahtar);      // başarılı girişte sayacı sıfırla
    ... token üretimi ...
}

/// <summary>
/// Kullanıcı bulunamadığında BCrypt'i boşa çalıştırmak için sabit hash.
/// Gerçek bir şifreye ait DEĞİLDİR; yalnızca zamanlamayı eşitler.
/// </summary>
private const string SahteHash = "$2a$11$abcdefghijklmnopqrstuu1234567890ABCDEFGHIJKLMNOPQRSTUV";
```

> `HesapSayaci`'na `Sifirla(string anahtar)` metodu eklenir (KURAL-07'de yoktu):
> ilgili bölümü `PartitionedRateLimiter`'dan düşürmek yerine, basit bir
> `ConcurrentDictionary<string, DateTime> _basariliGirisler` ile "son başarılı giriş
> sonrası sayacı yok say" mantığı uygulanır. **Alternatif ve daha basit:** sıfırlamayı
> hiç yapmamak — 15 dakikada 10 deneme meşru kullanıcı için yeterlidir. Bu durumda
> `Sifirla` çağrısı kaldırılır ve gerekçe rapora yazılır.

---

## Otomatik kapı

### A) Politika birim testleri — `SifrePolitikasiTests.cs`

```csharp
using EnglishReadingPlatform.Security;
using FluentAssertions;
using Xunit;

namespace EnglishReadingPlatform.Tests;

public class SifrePolitikasiTests
{
    private readonly SifrePolitikasi _politika = new();

    [Theory]
    [Trait("Category", "KimlikSertlestirme")]
    [InlineData("123456",        "kısa ve yaygın")]
    [InlineData("password",      "yaygın")]
    [InlineData("sifre123",      "yaygın")]
    [InlineData("aaaaaaaaaaaa",  "çeşitlilik yok")]
    [InlineData("abcdefghij",    "karmaşıklık yok")]
    [InlineData("Kisa1!",        "10 karakterden kısa")]
    [InlineData("",              "boş")]
    public void Zayif_sifreler_reddedilir(string sifre, string gerekce)
    {
        _politika.Dogrula(sifre).Gecerli.Should().BeFalse($"'{sifre}' reddedilmeli: {gerekce}");
    }

    [Theory]
    [Trait("Category", "KimlikSertlestirme")]
    [InlineData("Kaplan!Deniz42")]
    [InlineData("uzun-ve-Guclu-2026")]
    [InlineData("Yagmur#Bulut7788")]
    public void Guclu_sifreler_kabul_edilir(string sifre)
    {
        var sonuc = _politika.Dogrula(sifre);
        sonuc.Gecerli.Should().BeTrue(sonuc.BirlesikMesaj);
    }

    [Fact]
    [Trait("Category", "KimlikSertlestirme")]
    public void Kullanici_adini_iceren_sifre_reddedilir()
    {
        _politika.Dogrula("Alihan!2026xyz", kullaniciAdi: "alihan")
                 .Gecerli.Should().BeFalse();
    }

    [Fact]
    [Trait("Category", "KimlikSertlestirme")]
    public void Eposta_yerel_kismini_iceren_sifre_reddedilir()
    {
        _politika.Dogrula("Ogrenci!2026ABC", eposta: "ogrenci@okul.com")
                 .Gecerli.Should().BeFalse();
    }

    [Fact]
    [Trait("Category", "KimlikSertlestirme")]
    public void Cok_uzun_sifre_reddedilir()
    {
        _politika.Dogrula(new string('A', 500) + "a1!").Gecerli.Should().BeFalse();
    }
}
```

### B) Uçtan uca testler — `KimlikSertlestirmeTests.cs`

```csharp
using System.Net;
using System.Net.Http.Json;
using EnglishReadingPlatform.Tests.Infrastructure;
using FluentAssertions;
using Xunit;

namespace EnglishReadingPlatform.Tests;

[Collection("api")]
public class KimlikSertlestirmeTests
{
    private readonly TestAppFactory _fabrika;
    public KimlikSertlestirmeTests(TestAppFactory fabrika) => _fabrika = fabrika;

    [Fact]
    [Trait("Category", "KimlikSertlestirme")]
    public async Task Zayif_sifreyle_kayit_reddedilir()
    {
        var client = _fabrika.CreateClient();
        var yanit = await client.PostAsJsonAsync("/api/auth/register", new
        {
            username = "zayif_" + Guid.NewGuid().ToString("N")[..6],
            email = $"zayif_{Guid.NewGuid():N}@test.local",
            password = "123456",
            role = "student"
        });

        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    [Trait("Category", "KimlikSertlestirme")]
    public async Task Kayit_hesabin_varligini_sizdirmaz()
    {
        var client = _fabrika.CreateClient();
        var eposta = $"tekrar_{Guid.NewGuid():N}@test.local";
        var kullaniciAdi = "tekrar_" + Guid.NewGuid().ToString("N")[..6];

        await client.PostAsJsonAsync("/api/auth/register",
            new { username = kullaniciAdi, email = eposta, password = "Guclu!Sifre2026", role = "student" });

        var ikinci = await client.PostAsJsonAsync("/api/auth/register",
            new { username = kullaniciAdi + "x", email = eposta, password = "Guclu!Sifre2026", role = "student" });

        var govde = await ikinci.Content.ReadAsStringAsync();
        ikinci.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        govde.Should().NotContain("zaten kullanımda",
            "hangi alanın çakıştığı söylenmemeli — enumerasyon");
    }

    [Fact]
    [Trait("Category", "KimlikSertlestirme")]
    public async Task Sifre_degistirilebilir_ve_eski_token_gecersiz_olur()
    {
        var client = _fabrika.CreateClient();
        var benzersiz = Guid.NewGuid().ToString("N")[..8];
        var eposta = $"deg_{benzersiz}@test.local";

        await client.PostAsJsonAsync("/api/auth/register", new
        {
            username = $"deg_{benzersiz}", email = eposta,
            password = "Ilk!Sifre2026x", role = "student"
        });
        var giris = await client.PostAsJsonAsync("/api/auth/login",
            new { email = eposta, password = "Ilk!Sifre2026x" });
        var token = (await giris.Content.ReadFromJsonAsync<GirisYaniti>())!.token;

        client.TokenIle(token);
        var degistir = await client.PostAsJsonAsync("/api/auth/change-password",
            new { mevcutSifre = "Ilk!Sifre2026x", yeniSifre = "Yeni!Sifre2026y" });
        degistir.StatusCode.Should().Be(HttpStatusCode.OK);

        // Eski token geçersiz
        (await client.GetAsync("/api/auth/me")).StatusCode
            .Should().Be(HttpStatusCode.Unauthorized, "şifre değişimi oturumları sonlandırmalı");

        // Yeni şifreyle giriş çalışıyor
        var yeniGiris = await _fabrika.CreateClient().PostAsJsonAsync("/api/auth/login",
            new { email = eposta, password = "Yeni!Sifre2026y" });
        yeniGiris.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    [Trait("Category", "KimlikSertlestirme")]
    public async Task Yanlis_mevcut_sifreyle_degistirilemez()
    {
        var client = _fabrika.CreateClient();
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(o.Token);

        var yanit = await client.PostAsJsonAsync("/api/auth/change-password",
            new { mevcutSifre = "TamamenYanlis!99", yeniSifre = "Yeni!Sifre2026z" });

        yanit.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    [Trait("Category", "KimlikSertlestirme")]
    public async Task Sifremi_unuttum_hesabin_varligini_sizdirmaz()
    {
        var client = _fabrika.CreateClient();

        var varOlmayan = await client.PostAsJsonAsync("/api/auth/forgot-password",
            new { eposta = $"yok_{Guid.NewGuid():N}@test.local" });
        var varOlan = await client.PostAsJsonAsync("/api/auth/forgot-password",
            new { eposta = "admin@platform.com" });

        varOlmayan.StatusCode.Should().Be(varOlan.StatusCode);
        (await varOlmayan.Content.ReadAsStringAsync())
            .Should().Be(await varOlan.Content.ReadAsStringAsync(),
                "iki yanıt birebir aynı olmalı");
    }

    [Fact]
    [Trait("Category", "KimlikSertlestirme")]
    public async Task Ayni_hesaba_yogun_deneme_engellenir()
    {
        var client = _fabrika.CreateClient();
        var eposta = "admin@platform.com";

        var durumlar = new List<HttpStatusCode>();
        for (var i = 0; i < 14; i++)
        {
            var yanit = await client.PostAsJsonAsync("/api/auth/login",
                new { email = eposta, password = $"Yanlis!Sifre{i}" });
            durumlar.Add(yanit.StatusCode);
        }

        durumlar.Should().Contain(HttpStatusCode.TooManyRequests,
            "hedef hesap bazlı sınır devreye girmeli");
    }

    private record GirisYaniti(string token, object user);
}
```

### C) Guard script — `scripts/guard/09-kimlik.sh`

```bash
#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
echo "[09] Kimlik doğrulama sertleştirmesi"

# 1. Elle yazılmış şifre uzunluk kontrolü kaldı mı?
cikti="$(kodda_ara 'Password\.Length < [0-9]+' 'EnglishReadingPlatform/Controllers/*.cs')"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "elle yazılmış şifre uzunluk kontrolü" "$n" "$cikti"

# 2. Şifre kabul eden her yol politikadan geçiyor mu?
eksik=""
for uc in Register SifreDegistir SifreSifirla; do
  grep -A30 "public async Task<IActionResult> $uc" EnglishReadingPlatform/Controllers/AuthController.cs \
    | grep -q "_sifrePolitikasi.Dogrula" || eksik="${eksik}${uc}"$'\n'
done
n=$(printf '%s' "$eksik" | grep -c . || true)
ihlal_bildir "politikadan geçmeyen şifre yolu" "$n" "$eksik"

# 3. Kayıt enumerasyonu
cikti="$(kodda_ara 'zaten kullanımda' 'EnglishReadingPlatform/Controllers/*.cs')"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "kayıt enumerasyon mesajı" "$n" "$cikti"

# 4. Yeni uçlar var mı?
eksik=""
for uc in "change-password" "forgot-password" "reset-password"; do
  grep -q "\"$uc\"" EnglishReadingPlatform/Controllers/AuthController.cs || eksik="${eksik}${uc}"$'\n'
done
n=$(printf '%s' "$eksik" | grep -c . || true)
ihlal_bildir "eksik kimlik ucu" "$n" "$eksik"

# 5. Şifre değişimi oturum sonlandırıyor mu?
n=0
grep -A30 "public async Task<IActionResult> SifreDegistir" EnglishReadingPlatform/Controllers/AuthController.cs \
  | grep -q "KullaniciTumTokenlariniIptalEt" || n=1
ihlal_bildir "şifre değişimi oturum sonlandırıyor" "$n" "eski token geçerli kalıyor"

# 6. Ham sıfırlama jetonu DB'ye yazılıyor mu?
cikti="$(kodda_ara 'JetonHash = hamJeton|Jeton = hamJeton' 'EnglishReadingPlatform/**/*.cs')"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "ham jeton saklanıyor" "$n" "$cikti"

guard_bitir
```

---

## Bitti kriteri

```bash
cd /Users/alihanfindikci/Desktop/ingilizceproje
docker compose up -d postgres

# 1) Testler — BEKLENEN: Başarısız: 0, Başarılı: 22 (Theory satırları dahil)
dotnet test Linguza.sln --filter "Category=KimlikSertlestirme" --logger "console;verbosity=normal"
echo "çıkış kodu: $?"

# 2) Guard kapısı — BEKLENEN: TOPLAM İHLAL: 0
bash scripts/guard/09-kimlik.sh; echo "çıkış kodu: $?"

# 3) Elle şifre kontrolü — BEKLENEN: 0
grep -rn "Password.Length < " EnglishReadingPlatform/Controllers/ | wc -l

# 4) Enumerasyon mesajı — BEKLENEN: 0
grep -rn "zaten kullanımda" EnglishReadingPlatform/Controllers/ | wc -l

# 5) Yeni uçlar — BEKLENEN: 3
grep -c "change-password\|forgot-password\|reset-password" EnglishReadingPlatform/Controllers/AuthController.cs

# 6) Migration uygulandı mı?
cd EnglishReadingPlatform && dotnet ef migrations list | tail -3 && cd ..

# 7) Tüm kapılar
bash scripts/guard/run-all.sh; echo "çıkış kodu: $?"

# 8) Regresyon
dotnet test Linguza.sln
```

---

## Mutasyon kontrolü (zorunlu)

```bash
# MUTASYON A — şifre politikasını gevşet
sed -i '' 's|public const int EnAzUzunluk = 10;|public const int EnAzUzunluk = 1;|' \
  EnglishReadingPlatform/Security/SifrePolitikasi.cs
python3 - <<'PY'
yol = "EnglishReadingPlatform/Security/SifrePolitikasi.cs"
k = open(yol, encoding="utf-8").read()
k = k.replace("if (siniflar < 3)", "if (false)   // MUTASYON")
open(yol, "w", encoding="utf-8").write(k)
PY

dotnet test Linguza.sln --filter "Category=KimlikSertlestirme"
# BEKLENEN: Başarısız: ≥4 (Zayif_sifreler_reddedilir Theory satırları KIRMIZI)

git checkout EnglishReadingPlatform/Security/SifrePolitikasi.cs
dotnet test Linguza.sln --filter "Category=KimlikSertlestirme"    # BEKLENEN: Başarısız: 0
```

```bash
# MUTASYON B — şifre değişiminde oturum sonlandırmayı kaldır
sed -i '' '/_iptalDeposu.KullaniciTumTokenlariniIptalEt(kullaniciId);/d' \
  EnglishReadingPlatform/Controllers/AuthController.cs

dotnet test Linguza.sln --filter "FullyQualifiedName~Sifre_degistirilebilir_ve_eski_token"
# BEKLENEN: Başarısız: 1 — eski token hâlâ 200 dönüyor
bash scripts/guard/09-kimlik.sh; echo "çıkış kodu: $?"            # BEKLENEN: 1

git checkout EnglishReadingPlatform/Controllers/AuthController.cs
```

```bash
# MUTASYON C — enumerasyon mesajını geri koy
sed -i '' 's|Bu bilgilerle kayıt oluşturulamadı.*"|Bu email veya kullanıcı adı zaten kullanımda." }"|' \
  EnglishReadingPlatform/Controllers/AuthController.cs

dotnet test Linguza.sln --filter "FullyQualifiedName~Kayit_hesabin_varligini_sizdirmaz"
# BEKLENEN: Başarısız: 1
git checkout EnglishReadingPlatform/Controllers/AuthController.cs
```

---

## Geçiş planı

| Adım | İş | Nokta | Doğrulama |
|---|---|---|---|
| 1 | `Security/SifrePolitikasi.cs` yaz | — | derlenir |
| 2 | `SifrePolitikasiTests.cs` yaz — **merkezî çözüm önce** | — | 16 test yeşil |
| 3 | `Register`'ı politikaya bağla, enumerasyonu kapat | 2 | guard kapı 1,3 → 0 |
| 4 | `Login`: `HesapSayaci` + sabit süre karşılaştırma | 2 | ilgili test yeşil |
| 5 | `SifreSifirlamaJetonu` modeli + migration | 1 | `ef migrations list` |
| 6 | `SifreSifirlamaServisi` + `IEpostaGondericisi` | — | derlenir |
| 7 | `change-password` ucu (+ oturum sonlandırma) | 1 | guard kapı 4,5 → 0 |
| 8 | `forgot-password` / `reset-password` uçları | 2 | guard kapı 4 → 0 |
| 9 | `KimlikSertlestirmeTests.cs` yaz | — | 6 test yeşil |
| 10 | `scripts/guard/09-kimlik.sh` + `chmod +x` | — | çıkış kodu 0 |
| 11 | **Mevcut kullanıcı etkisi** (aşağı bak) | — | karar |
| 12 | **Frontend ekranları** (aşağı bak) | — | ayrı iş |
| 13 | İlerleme tablosunu güncelle | — | — |

### Adım 11 — mevcut zayıf şifreli kullanıcılar 🔴

> ✅ **KARAR (2026-08-29): B uygulandı** — politika yalnızca YENİ şifrelerde geçerli.
> Mevcut 37 kullanıcının şifresi değiştirilmedi; zayıf olanlar zayıf kaldı.
> A'ya (girişte zorunlu değiştirme) geçmek `User` modeline `SifreDegistirmeGerekli`
> bayrağı + migration + giriş akışında dallanma gerektirir — ayrı bir iş olarak
> planlanmalıdır. Artık şifre değiştirme ve sıfırlama uçları VAR, yani kullanıcı
> isterse kendi şifresini güçlendirebilir.

Politika **yalnızca yeni şifrelerde** çalışır. Mevcut kullanıcıların `123456` şifresi
hâlâ geçerlidir.

```sql
-- Kaç kullanıcı var? (şifre gücü hash'ten anlaşılamaz, sayıyı bilmek için)
SELECT COUNT(*) FROM "Users";
```

Üç seçenek:

| Seçenek | Ne olur |
|---|---|
| **A** — Girişte politika kontrolü, uymuyorsa zorunlu değiştirme | En güvenli, kullanıcıyı bir kez rahatsız eder ⭐ |
| **B** — Yeni kullanıcılar için geçerli, mevcutlar dokunulmaz | Kolay ama zayıf şifreler kalır |
| **C** — Tüm şifreleri sıfırla, herkese sıfırlama e-postası | Sert; e-posta servisi şart |

**Varsayılan B** (kapsam korunur). A isteniyorsa ayrı bir kural/iş olarak yapılmalıdır —
`User` modeline `SifreDegistirmeGerekli` bayrağı eklemeyi gerektirir.

### Adım 12 — frontend ekranları 🟡 **BU KURALIN KAPSAMI DIŞI**

Backend uçları hazır olur ama arayüz yoktur:

| Ekran | Yol | Durum |
|---|---|---|
| Şifre değiştir | `/settings/password` | ❌ Yok — yapılmalı |
| Şifremi unuttum | `/forgot-password` | ❌ Yok |
| Şifre sıfırla | `/reset-password?token=...` | ❌ Yok |

Bu ekranlar olmadan uçlar yalnızca API üzerinden kullanılabilir. **Teknik borç olarak
raporlanmalıdır.** Ayrıca `frontend/app/api.ts`'e üç yeni metot eklenmelidir.

---

## Tuzaklar

| Tuzak | Neden olur | Nasıl kaçınılır |
|---|---|---|
| **Politikayı yalnızca kayıtta uygulamak** | Şifre değiştirme ve sıfırlama yollarından zayıf şifre girilebilir | Guard kapı 2 üç yolu birden kontrol ediyor |
| **Ham sıfırlama jetonunu DB'ye yazmak** | DB okuma yetkisi olan biri (veya yedek dosyası) tüm hesapları ele geçirir | Yalnızca SHA-256 hash saklanır; guard kapı 6 kontrol ediyor |
| **Jetonu `Guid.NewGuid()` ile üretmek** | GUID kriptografik rastgelelik garantisi vermez | `RandomNumberGenerator.GetBytes(32)` |
| **Jetonu tek kullanımlık yapmamak** | Bağlantı e-posta kutusunda kalır, ikinci kez kullanılabilir | `KullanildiAt` işaretleniyor |
| **Şifre değişiminde oturumları sonlandırmamak** | Şifreyi ele geçiren saldırgan, kurban şifresini değiştirse bile içeride kalır | KURAL-04 mekanizması çağrılıyor; guard kapı 5 |
| **`forgot-password` yanıtını hesabın varlığına göre değiştirmek** | "Bu e-posta kayıtlı değil" demek enumerasyondur | Her durumda **birebir aynı** yanıt; test bunu karşılaştırıyor |
| **Sahte hash'i geçersiz formatta yazmak** | `BCrypt.Verify` istisna fırlatır → 500 → zamanlama sızıntısından beter | Sahte hash geçerli BCrypt biçiminde olmalı; testle doğrula |
| **Türkçe karakterleri karmaşıklık regex'inde unutmak** | `Ç Ğ İ Ö Ş Ü` büyük harf sayılmaz, meşru şifreler reddedilir | Regex'lerde Türkçe harfler dahil |
| **Yaygın şifre listesini koda gömüp büyütmemek** | 30 kelimelik liste gerçek koruma sağlamaz | Üretimde dosyadan yükle; kod içindeki liste **asgari** savunma olarak işaretli |
| **E-posta servisi olmadan sıfırlamayı "bitti" saymak** | `LoglayanEpostaGondericisi` üretimde bağlantıyı **loga** yazar; log erişimi olan herkes hesapları ele geçirir | Üretimde gerçek gönderici **zorunlu**; aksi halde sıfırlama uçları kapatılmalı |

---

## Teslim şablonu

```markdown
## 1. Kanıtlanarak kapandı
<8 bitti-kriteri komutunun ham çıktısı>
<MUTASYON A, B, C çıktıları>

## 2. Kapanmadı
- Frontend ekranları yok (şifre değiştir / unuttum / sıfırla) — teknik borç
- Mevcut kullanıcıların zayıf şifreleri geçerli (varsayılan B seçildi)
- E-posta servisi yapılandırılmadı → sıfırlama akışı üretimde ETKİN DEĞİL

## 3. İnsan müdahalesi gerekiyor
- [ ] E-posta servisi kararı (A/B/C) — 00-BASLA-BURADAN.md madde 7
- [ ] Seçilen servise kaydol, API anahtarını .env'e ekle
- [ ] Mevcut zayıf şifreler için karar (adım 11: A/B/C)
- [ ] Admin şifresini değiştir (artık change-password ucu var)
- [ ] Frontend ekranlarının yapılmasını planla

## Değiştirilen dosyalar
<git diff --stat>

## Commit
<git log -1 --format='%H %s'>
```
