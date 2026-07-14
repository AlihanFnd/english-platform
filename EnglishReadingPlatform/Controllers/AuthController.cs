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

        public AuthController(AppDbContext db, JwtService jwt)
        {
            _db = db;
            _jwt = jwt;
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
            
            // Set cookie for convenience, but also return in body
            Response.Cookies.Append("jwt_token", token, new CookieOptions
            {
                HttpOnly = true,
                Secure = false,
                SameSite = SameSiteMode.Lax,
                Expires = DateTimeOffset.UtcNow.AddDays(7)
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
                Secure = false,
                SameSite = SameSiteMode.Lax,
                Expires = DateTimeOffset.UtcNow.AddDays(7)
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
            Response.Cookies.Delete("jwt_token");
            return Ok(new { message = "Başarıyla çıkış yapıldı." });
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
