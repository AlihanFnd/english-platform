using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using EnglishReadingPlatform.Contracts;
using EnglishReadingPlatform.Authorization;
using EnglishReadingPlatform.Data;
using EnglishReadingPlatform.Logging;
using EnglishReadingPlatform.Models;
using EnglishReadingPlatform.RateLimiting;
using EnglishReadingPlatform.Security;
using System.IdentityModel.Tokens.Jwt;
using EnglishReadingPlatform.Services;
using EnglishReadingPlatform.Validation;
using System.ComponentModel.DataAnnotations;

namespace EnglishReadingPlatform.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly AppDbContext _db;
        private readonly JwtService _jwt;
        private readonly HesapSayaci _hesapSayaci;              // KURAL-07: hedef bazlı giriş sınırı
        private readonly ITokenIptalDeposu _iptalDeposu;        // KURAL-04
        private readonly IWebHostEnvironment _env;
        private readonly ILogger<AuthController> _logger;       // KURAL-06
        private readonly SifrePolitikasi _sifrePolitikasi;      // KURAL-09
        private readonly SifreSifirlamaServisi _sifirlamaServisi;
        private readonly IEpostaGondericisi _epostaGondericisi;
        private readonly IConfiguration _configuration;

        public AuthController(AppDbContext db, JwtService jwt, HesapSayaci hesapSayaci,
                              ITokenIptalDeposu iptalDeposu, IWebHostEnvironment env,
                              ILogger<AuthController> logger,
                              SifrePolitikasi sifrePolitikasi,
                              SifreSifirlamaServisi sifirlamaServisi,
                              IEpostaGondericisi epostaGondericisi,
                              IConfiguration configuration)
        {
            _db = db;
            _jwt = jwt;
            _hesapSayaci = hesapSayaci;
            _iptalDeposu = iptalDeposu;
            _env = env;
            _logger = logger;
            _sifrePolitikasi = sifrePolitikasi;
            _sifirlamaServisi = sifirlamaServisi;
            _epostaGondericisi = epostaGondericisi;
            _configuration = configuration;
        }

        /// <summary>
        /// KURAL-09: kullanıcı bulunamadığında BCrypt'i boşa çalıştırmak için sabit hash.
        /// Gerçek bir şifreye ait DEĞİLDİR; yalnızca yanıt süresini eşitler.
        ///
        /// Elle yazılmış bir sabit yerine üretilmesinin sebebi: geçersiz biçimli bir
        /// BCrypt dizesi Verify() içinde istisna fırlatır ve 500 üretir — bu, kapatmaya
        /// çalıştığımız zamanlama sızıntısından beterdir.
        /// </summary>
        /// Değer rastgeledir: koda gömülü bir dize kullanmak, sır tarayıcısının
        /// (KURAL-02 kapısı) haklı olarak "gömülü şifre" diye işaretlemesine yol açar.
        private static readonly string SahteHash =
            BCrypt.Net.BCrypt.HashPassword(Guid.NewGuid().ToString("N"));

        public class LoginRequest
        {
            [Required(ErrorMessage = "Email zorunludur.")]
            [StringLength(AlanSinirlari.Eposta, MinimumLength = 1,
                ErrorMessage = "Email en fazla {1} karakter olabilir.")]
            public string Email { get; set; } = "";

            // GİRİŞTE alt sınır YOK — mevcut kullanıcıların şifresi kısa olabilir;
            // burada uzunluk zorlamak onları kilitler. Üst sınır BCrypt'i uzun
            // girdilerle meşgul etmemek içindir (DoS).
            [Required(ErrorMessage = "Şifre zorunludur.")]
            [StringLength(AlanSinirlari.SifreEnCok, MinimumLength = 1,
                ErrorMessage = "Şifre en fazla {1} karakter olabilir.")]
            public string Password { get; set; } = "";
        }

        public class RegisterRequest
        {
            [Required(ErrorMessage = "Kullanıcı adı zorunludur.")]
            [StringLength(AlanSinirlari.KullaniciAdi, MinimumLength = 3,
                ErrorMessage = "Kullanıcı adı 3-{1} karakter olmalıdır.")]
            public string Username { get; set; } = "";

            [Required(ErrorMessage = "Email zorunludur.")]
            [EmailAddress(ErrorMessage = "Geçerli bir e-posta adresi girin.")]
            [StringLength(AlanSinirlari.Eposta,
                ErrorMessage = "Email en fazla {1} karakter olabilir.")]
            public string Email { get; set; } = "";

            [Required(ErrorMessage = "Şifre zorunludur.")]
            [StringLength(AlanSinirlari.SifreEnCok, MinimumLength = AlanSinirlari.SifreEnAz,
                ErrorMessage = "Şifre {2}-{1} karakter olmalıdır.")]
            public string Password { get; set; } = "";

            // KayitRolleri whitelist'inde "admin" YOK: kendine admin rolü
            // yazdırma denemesi sessizce "student"a düşmek yerine 400 alır.
            [IzinliDeger(nameof(IzinliDegerler.KayitRolleri))]
            public string Role { get; set; } = "student";
        }

        // POST /api/auth/login
        [HttpPost("login")]
        [AllowAnonymous]   // KURAL-03: token alınmadan ÖNCE çağrılır, anonim kalmalı
        [EnableRateLimiting(HizSinirlari.KimlikDogrulama)]   // KURAL-07: IP bazlı sınır
        public async Task<IActionResult> Login([FromBody] LoginRequest req)
        {
            if (req == null || string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
            {
                return BadRequest(new { error = "Email ve şifre zorunludur." });
            }

            // ── KURAL-07: HEDEF bazlı ikinci savunma hattı ──
            // [EnableRateLimiting] IP başına sayar; her IP'den 10 deneme yapan bir
            // botnet o sınırı hiç görmez. Bu sayaç HEDEFİ (e-postayı) sayar ve
            // middleware'de yapılamaz — e-posta istek GÖVDESİNDEDİR.
            // Kontrol şifre doğrulamasından ÖNCE: bütçe dolduysa doğru şifre bile geçmez.
            var hedefAnahtar = HesapSayaci.GirisAnahtari(req.Email);
            if (!_hesapSayaci.IzinVar(hedefAnahtar))
            {
                _logger.LogWarning("Hesap bazlı giriş sınırı aşıldı. Eposta={Eposta}",
                    GuvenliLog.Eposta(req.Email));
                Response.Headers.RetryAfter =
                    ((int)HizSinirlari.GirisHedefPenceresi.TotalSeconds).ToString();
                return StatusCode(429, new { error = "Bu hesap için çok fazla başarısız deneme yapıldı. Lütfen bir süre sonra tekrar deneyin." });
            }

            var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == req.Email.Trim().ToLower());

            // ── KURAL-09: zamanlama sızıntısını kapat ──
            // Kullanıcı yoksa BCrypt hiç çalışmıyordu; yanıt belirgin biçimde daha
            // hızlı dönüyor ve mesaj aynı olsa bile hesabın varlığını sızdırıyordu.
            // Şimdi her iki dalda da bir doğrulama yapılıyor.
            var sifreDogru = BCrypt.Net.BCrypt.Verify(req.Password, user?.PasswordHash ?? SahteHash);

            if (user == null || !sifreDogru)
            {
                // YALNIZCA başarısız deneme sayılır. Başarılı girişleri de saymak,
                // üç cihazdan giren meşru kullanıcıyı kilitler ve saldırgana hiçbir
                // maliyet getirmez — brute-force zaten yanlış şifrelerden oluşur.
                _hesapSayaci.BasarisizDenemeKaydet(hedefAnahtar);
                return Unauthorized(new { error = "Email veya şifre hatalı." });
            }

            var token = _jwt.GenerateToken(user);
            
            // Set secure cookie
            Response.Cookies.Append("jwt_token", token, new CookieOptions
            {
                HttpOnly = true,
                Secure = !_env.IsDevelopment(),
                SameSite = SameSiteMode.Lax,
                Expires = user.Role == "admin" ? DateTimeOffset.UtcNow.AddHours(1) : DateTimeOffset.UtcNow.AddHours(24)
            });

            // KURAL-08: elle yazılan anonim nesne yerine tek kaynaklı DTO.
            return Ok(new { token, user = new KullaniciYaniti(user.Id, user.Username, user.Email, user.Role) });
        }

        // POST /api/auth/register
        [HttpPost("register")]
        [AllowAnonymous]   // KURAL-03: token alınmadan ÖNCE çağrılır, anonim kalmalı
        [EnableRateLimiting(HizSinirlari.KimlikDogrulama)]   // KURAL-07
        public async Task<IActionResult> Register([FromBody] RegisterRequest req)
        {
            if (req == null || string.IsNullOrWhiteSpace(req.Username) || string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
            {
                return BadRequest(new { error = "Tüm alanlar zorunludur." });
            }

            // ── KURAL-09: şifre politikası TEK kaynaktan ──
            var politikaSonucu = _sifrePolitikasi.Dogrula(req.Password, req.Username, req.Email);
            if (!politikaSonucu.Gecerli)
            {
                return BadRequest(new { error = politikaSonucu.BirlesikMesaj });
            }

            var existingUser = await _db.Users.AnyAsync(u => u.Email == req.Email.Trim().ToLower() || u.Username == req.Username.Trim());
            if (existingUser)
            {
                // ── KURAL-09: hangi alanın çakıştığını SÖYLEME ──
                // Çakışan alanı ismen bildirmek, bir adresin sistemde kayıtlı
                // olduğunu doğrular (enumerasyon). Ayrıntı yalnızca loga gider.
                _logger.LogInformation("Mevcut kimlikle kayıt denemesi. Eposta={Eposta}",
                    GuvenliLog.Eposta(req.Email));
                return BadRequest(new { error = "Bu bilgilerle kayıt oluşturulamadı. Farklı bir e-posta veya kullanıcı adı deneyin." });
            }

            var newUser = new User
            {
                Username = req.Username.KirpEnCok(AlanSinirlari.KullaniciAdi),
                Email = req.Email.KirpEnCok(AlanSinirlari.Eposta).ToLower(),
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
                Role = req.Role == "teacher" ? "teacher" : "student",
                CreatedAt = DateTime.UtcNow
            };

            _db.Users.Add(newUser);
            await _db.SaveChangesAsync();

            var token = _jwt.GenerateToken(newUser);
            Response.Cookies.Append("jwt_token", token, new CookieOptions
            {
                HttpOnly = true,
                Secure = !_env.IsDevelopment(),
                SameSite = SameSiteMode.Lax,
                Expires = DateTimeOffset.UtcNow.AddHours(24)
            });

            return Ok(new { token, user = new KullaniciYaniti(newUser.Id, newUser.Username, newUser.Email, newUser.Role) });
        }

        // ─── KURAL-09: şifre değiştirme / sıfırlama ──────────────────

        public class SifreDegistirIstegi
        {
            [Required(ErrorMessage = "Mevcut şifre zorunludur.")]
            [StringLength(AlanSinirlari.SifreEnCok, MinimumLength = 1,
                ErrorMessage = "Şifre en fazla {1} karakter olabilir.")]
            public string MevcutSifre { get; set; } = "";

            [Required(ErrorMessage = "Yeni şifre zorunludur.")]
            [StringLength(AlanSinirlari.SifreEnCok, MinimumLength = AlanSinirlari.SifreEnAz,
                ErrorMessage = "Şifre {2}-{1} karakter olmalıdır.")]
            public string YeniSifre { get; set; } = "";
        }

        public class SifremiUnuttumIstegi
        {
            [Required(ErrorMessage = "E-posta zorunludur.")]
            [StringLength(AlanSinirlari.Eposta, MinimumLength = 1,
                ErrorMessage = "E-posta en fazla {1} karakter olabilir.")]
            public string Eposta { get; set; } = "";
        }

        public class SifreSifirlaIstegi
        {
            [Required(ErrorMessage = "Jeton zorunludur.")]
            [StringLength(AlanSinirlari.SifirlamaJetonu, MinimumLength = 1, ErrorMessage = "Jeton geçersiz.")]
            public string Jeton { get; set; } = "";

            [Required(ErrorMessage = "Yeni şifre zorunludur.")]
            [StringLength(AlanSinirlari.SifreEnCok, MinimumLength = AlanSinirlari.SifreEnAz,
                ErrorMessage = "Şifre {2}-{1} karakter olmalıdır.")]
            public string YeniSifre { get; set; } = "";
        }

        // POST /api/auth/change-password
        [HttpPost("change-password")]
        [Authorize]
        [EnableRateLimiting(HizSinirlari.KimlikDogrulama)]
        public async Task<IActionResult> SifreDegistir([FromBody] SifreDegistirIstegi req)
        {
            if (!this.KullaniciIdAl(out var kullaniciId))
            {
                return Unauthorized(new { error = "Oturum bilgisi geçersiz." });
            }

            var kullanici = await _db.Users.FindAsync(kullaniciId);
            if (kullanici == null)
            {
                return Unauthorized(new { error = "Oturum geçersiz." });
            }

            if (!BCrypt.Net.BCrypt.Verify(req.MevcutSifre, kullanici.PasswordHash))
            {
                _logger.LogWarning("Yanlış mevcut şifreyle değiştirme denemesi. KullaniciId={Id}", kullaniciId);
                return BadRequest(new { error = "Mevcut şifreniz hatalı." });
            }

            var sonuc = _sifrePolitikasi.Dogrula(req.YeniSifre, kullanici.Username, kullanici.Email);
            if (!sonuc.Gecerli)
            {
                return BadRequest(new { error = sonuc.BirlesikMesaj });
            }

            if (BCrypt.Net.BCrypt.Verify(req.YeniSifre, kullanici.PasswordHash))
            {
                return BadRequest(new { error = "Yeni şifre eskisiyle aynı olamaz." });
            }

            kullanici.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.YeniSifre);
            await _db.SaveChangesAsync();

            // ── KURAL-04 + KURAL-09: şifre değişimi TÜM oturumları sonlandırır ──
            // Şifreyi ele geçiren saldırgan, kurban şifresini değiştirse bile
            // elindeki token ile içeride kalmamalı.
            _iptalDeposu.KullaniciTumTokenlariniIptalEt(kullaniciId);
            Response.Cookies.Delete("jwt_token", new CookieOptions
            {
                HttpOnly = true,
                Secure = !_env.IsDevelopment(),
                SameSite = SameSiteMode.Lax
            });

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

            if (kullanici != null)
            {
                var jeton = await _sifirlamaServisi.JetonUretAsync(kullanici.Id);
                var taban = _configuration["App:FrontendUrl"] ?? "http://localhost:3000";
                await _epostaGondericisi.SifreSifirlamaGonderAsync(
                    kullanici.Email, $"{taban}/reset-password?token={jeton}");
            }

            // ── KURAL-09: hesabın varlığını SIZDIRMA ──
            // Yanıt her durumda birebir aynı. Gönderim başarısız olsa bile burada
            // hata dönülmez; aksi halde "hata = kayıtlı, 200 = kayıtsız" ayrımı doğardı.
            return Ok(new { message = "Eğer bu e-posta kayıtlıysa, sıfırlama bağlantısı gönderildi." });
        }

        // POST /api/auth/reset-password
        [HttpPost("reset-password")]
        [AllowAnonymous]
        [EnableRateLimiting(HizSinirlari.KimlikDogrulama)]
        public async Task<IActionResult> SifreSifirla([FromBody] SifreSifirlaIstegi req)
        {
            var kullanici = await _sifirlamaServisi.JetonuTuketAsync(req.Jeton);
            if (kullanici == null)
            {
                return BadRequest(new { error = "Bağlantı geçersiz veya süresi dolmuş. Yeniden talep edin." });
            }

            var sonuc = _sifrePolitikasi.Dogrula(req.YeniSifre, kullanici.Username, kullanici.Email);
            if (!sonuc.Gecerli)
            {
                return BadRequest(new { error = sonuc.BirlesikMesaj });
            }

            kullanici.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.YeniSifre);
            await _db.SaveChangesAsync();

            // Sıfırlama da bir şifre değişimidir: eski oturumlar düşmeli.
            _iptalDeposu.KullaniciTumTokenlariniIptalEt(kullanici.Id);
            _logger.LogInformation("Şifre sıfırlandı. KullaniciId={Id}", kullanici.Id);

            return Ok(new { message = "Şifreniz sıfırlandı. Giriş yapabilirsiniz." });
        }

        // POST /api/auth/logout
        [HttpPost("logout")]
        [Authorize]        // KURAL-03: geçerli token gerektirir (KURAL-04 jti claim'ini okuyacak)
        public IActionResult Logout()
        {
            // ── KURAL-04: iptal anahtarı SÖZLEŞMESİ jti'dir. ──
            // Eskiden ham JWT stringi yazılıyor, okuma tarafı jti arıyordu:
            // hiçbir dalda eşleşme olmuyordu, uç 200 dönüp hiçbir şey yapmıyordu.
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
            else if (this.KullaniciIdAl(out var kullaniciId))
            {
                // Savunma katmanı: Program.cs jti taşımayan tokenı zaten reddediyor,
                // yani bu dala normalde ULAŞILMAZ. Ama o kontrol ileride gevşetilirse
                // burada sessizce hiçbir şey yapmamak yerine kullanıcının tüm
                // tokenlarını kesiyoruz — "iptal ettim" deyip etmemek yasak.
                _iptalDeposu.KullaniciTumTokenlariniIptalEt(kullaniciId);
            }

            Response.Cookies.Delete("jwt_token", new CookieOptions { HttpOnly = true, Secure = !_env.IsDevelopment(), SameSite = SameSiteMode.Lax });
            return Ok(new { message = "Oturum sonlandırıldı." });
        }

        // GET /api/auth/me
        [HttpGet("me")]
        [Authorize]        // KURAL-03: yetkilendirme gövdede elle değil, öznitelikle yapılır
        public async Task<IActionResult> Me()
        {
            // [Authorize] sayesinde claim'in varlığı garanti; yine de savunmacı TryParse.
            // int.Parse + "!" kullanılsaydı bozuk claim 500 üretirdi.
            if (!this.KullaniciIdAl(out var userId))
            {
                return Unauthorized(new { error = "Oturum bilgisi geçersiz." });
            }

            var user = await _db.Users.FindAsync(userId);
            if (user == null)
            {
                return NotFound(new { error = "Kullanıcı bulunamadı." });
            }

            return Ok(new { user = new KullaniciYaniti(user.Id, user.Username, user.Email, user.Role) });
        }
    }
}
