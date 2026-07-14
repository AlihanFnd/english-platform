using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using EnglishReadingPlatform.Data;
using EnglishReadingPlatform.Models;
using EnglishReadingPlatform.Services;

namespace EnglishReadingPlatform.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly AppDbContext _db;
        private readonly JwtService _jwt;
        private readonly TokenSecurityService _tokenSecurity;
        private readonly IWebHostEnvironment _env;

        public AuthController(AppDbContext db, JwtService jwt, TokenSecurityService tokenSecurity, IWebHostEnvironment env)
        {
            _db = db;
            _jwt = jwt;
            _tokenSecurity = tokenSecurity;
            _env = env;
        }

        public class LoginRequest
        {
            public string Email { get; set; } = "";
            public string Password { get; set; } = "";
        }

        public class RegisterRequest
        {
            public string Username { get; set; } = "";
            public string Email { get; set; } = "";
            public string Password { get; set; } = "";
            public string Role { get; set; } = "student";
        }

        // POST /api/auth/login
        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginRequest req)
        {
            var ip = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown_ip";
            if (_tokenSecurity.IsRateLimitExceeded($"login_{ip}", 10))
            {
                return StatusCode(429, new { error = "Çok fazla başarısız giriş denemesi. Lütfen 1 dakika bekleyip tekrar deneyin." });
            }

            if (req == null || string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
            {
                return BadRequest(new { error = "Email ve şifre zorunludur." });
            }

            var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == req.Email.Trim().ToLower());
            if (user == null || !BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
            {
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

            return Ok(new { 
                token, 
                user = new { 
                    id = user.Id, 
                    username = user.Username, 
                    email = user.Email, 
                    role = user.Role 
                } 
            });
        }

        // POST /api/auth/register
        [HttpPost("register")]
        public async Task<IActionResult> Register([FromBody] RegisterRequest req)
        {
            var ip = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown_ip";
            if (_tokenSecurity.IsRateLimitExceeded($"register_{ip}", 5))
            {
                return StatusCode(429, new { error = "Çok fazla kayıt isteği. Lütfen biraz bekleyin." });
            }

            if (req == null || string.IsNullOrWhiteSpace(req.Username) || string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
            {
                return BadRequest(new { error = "Tüm alanlar zorunludur." });
            }

            if (req.Password.Length < 6)
            {
                return BadRequest(new { error = "Şifre en az 6 karakter olmalıdır." });
            }

            var existingUser = await _db.Users.AnyAsync(u => u.Email == req.Email.Trim().ToLower() || u.Username == req.Username.Trim());
            if (existingUser)
            {
                return BadRequest(new { error = "Bu email veya kullanıcı adı zaten kullanımda." });
            }

            var newUser = new User
            {
                Username = req.Username.Trim(),
                Email = req.Email.Trim().ToLower(),
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

            return Ok(new { 
                token, 
                user = new { 
                    id = newUser.Id, 
                    username = newUser.Username, 
                    email = newUser.Email, 
                    role = newUser.Role 
                } 
            });
        }

        // POST /api/auth/logout
        [HttpPost("logout")]
        public IActionResult Logout()
        {
            var authHeader = Request.Headers["Authorization"].ToString();
            var tokenStr = Request.Cookies["jwt_token"];
            if (string.IsNullOrEmpty(tokenStr) && !string.IsNullOrEmpty(authHeader) && authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            {
                tokenStr = authHeader.Substring("Bearer ".Length).Trim();
            }

            if (!string.IsNullOrEmpty(tokenStr))
            {
                // Kalıcı olarak blacklist'e al (suistimali önlemek için 24 saat koru)
                _tokenSecurity.RevokeToken(tokenStr, DateTime.UtcNow.AddHours(24));
            }

            Response.Cookies.Delete("jwt_token", new CookieOptions { HttpOnly = true, Secure = !_env.IsDevelopment(), SameSite = SameSiteMode.Lax });
            return Ok(new { message = "Başarıyla çıkış yapıldı ve token iptal edildi." });
        }

        // GET /api/auth/me
        [HttpGet("me")]
        public async Task<IActionResult> Me()
        {
            // Simple validation to get current user from token
            var claimsPrincipal = User;
            var userIdClaim = claimsPrincipal.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier);
            if (userIdClaim == null)
            {
                return Unauthorized(new { error = "Oturum açık değil." });
            }

            var userId = int.Parse(userIdClaim.Value);
            var user = await _db.Users.FindAsync(userId);
            if (user == null)
            {
                return NotFound(new { error = "Kullanıcı bulunamadı." });
            }

            return Ok(new { 
                user = new { 
                    id = user.Id, 
                    username = user.Username, 
                    email = user.Email, 
                    role = user.Role 
                } 
            });
        }
    }
}
