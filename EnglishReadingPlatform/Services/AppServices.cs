using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using EnglishReadingPlatform.Models;

namespace EnglishReadingPlatform.Services
{
    public class JwtService
    {
        private readonly IConfiguration _config;

        public JwtService(IConfiguration config)
        {
            _config = config;
        }

        public string GenerateToken(User user)
        {
            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_config["Jwt:Key"]!));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var claims = new[]
            {
                new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new Claim(ClaimTypes.Name, user.Username),
                new Claim(ClaimTypes.Email, user.Email),
                new Claim(ClaimTypes.Role, user.Role),
                // Admin paneli için ek güvenlik claim'i
                new Claim("account_type", user.Role == "admin" ? "admin" : "user")
            };

            // Güvenlik: admin oturumları 2 saat, normal kullanıcılar 7 gün
            var expiry = user.Role == "admin"
                ? DateTime.UtcNow.AddHours(2)
                : DateTime.UtcNow.AddDays(7);

            var token = new JwtSecurityToken(
                issuer: _config["Jwt:Issuer"],
                audience: _config["Jwt:Audience"],
                claims: claims,
                expires: expiry,
                signingCredentials: creds
            );

            return new JwtSecurityTokenHandler().WriteToken(token);
        }

        public ClaimsPrincipal? ValidateToken(string token)
        {
            try
            {
                var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_config["Jwt:Key"]!));
                var handler = new JwtSecurityTokenHandler();
                var principal = handler.ValidateToken(token, new TokenValidationParameters
                {
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = key,
                    ValidateIssuer = true,
                    ValidIssuer = _config["Jwt:Issuer"],
                    ValidateAudience = true,
                    ValidAudience = _config["Jwt:Audience"],
                    ValidateLifetime = true,
                    ClockSkew = TimeSpan.Zero
                }, out _);
                return principal;
            }
            catch
            {
                return null;
            }
        }
    }

    public class QuizGeneratorService
    {
        public List<QuizQuestion> GenerateQuestions(Chapter chapter, int quizId, int count = 5)
        {
            var words = chapter.Content
                .Split(' ', StringSplitOptions.RemoveEmptyEntries)
                .Where(w => w.Length > 5)
                .Distinct()
                .OrderBy(_ => Guid.NewGuid())
                .Take(count * 4)
                .ToList();

            var sentences = chapter.Content
                .Split(new[] { '.', '!', '?' }, StringSplitOptions.RemoveEmptyEntries)
                .Where(s => s.Trim().Length > 20)
                .Select(s => s.Trim())
                .ToList();

            var questions = new List<QuizQuestion>();

            // Kelime tabanlı sorular
            for (int i = 0; i < Math.Min(count, words.Count / 4); i++)
            {
                var correctWord = words[i * 4];
                var options = words.Skip(i * 4).Take(4).OrderBy(_ => Guid.NewGuid()).ToList();
                while (options.Count < 4) options.Add("unknown");

                var letters = new[] { "A", "B", "C", "D" };
                var correctIdx = options.IndexOf(correctWord);

                questions.Add(new QuizQuestion
                {
                    QuizId = quizId,
                    QuestionText = $"Which word appears in the text of '{chapter.Title}'?",
                    OptionA = options[0],
                    OptionB = options[1],
                    OptionC = options[2],
                    OptionD = options[3],
                    CorrectAnswer = letters[correctIdx]
                });
            }

            // Cümle tabanlı sorular
            if (sentences.Count >= 2)
            {
                var sent = sentences.First(s => s.Length > 30);
                var blank = sent.Split(' ').Skip(2).First();
                var blankSent = sent.Replace(blank, "______");

                var distractors = words.Where(w => w != blank).Take(3).ToList();
                while (distractors.Count < 3) distractors.Add("---");
                var opts = new List<string> { blank }.Concat(distractors).OrderBy(_ => Guid.NewGuid()).ToList();
                var correctIdx2 = opts.IndexOf(blank);
                var letters2 = new[] { "A", "B", "C", "D" };

                questions.Add(new QuizQuestion
                {
                    QuizId = quizId,
                    QuestionText = $"Fill in the blank: \"{blankSent}\"",
                    OptionA = opts[0],
                    OptionB = opts[1],
                    OptionC = opts[2],
                    OptionD = opts[3],
                    CorrectAnswer = letters2[correctIdx2]
                });
            }

            return questions;
        }
    }
}
