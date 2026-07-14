using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using EnglishReadingPlatform.Data;
using EnglishReadingPlatform.Services;

var builder = WebApplication.CreateBuilder(args);

// ─── Veritabanı ───────────────────────────────────────────────
builder.Services.AddDbContext<AppDbContext>(opt =>
    opt.UseNpgsql(builder.Configuration.GetConnectionString("Default")));

// ─── JWT Authentication ───────────────────────────────────────
var jwtKey = builder.Configuration["Jwt:Key"] ?? "SuperSecretKey_ChangeInProduction_32chars!";
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(opt =>
    {
        opt.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
            ValidateIssuer = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"] ?? "EnglishPlatform",
            ValidateAudience = true,
            ValidAudience = builder.Configuration["Jwt:Audience"] ?? "EnglishPlatformUsers",
            ValidateLifetime = true,
            ClockSkew = TimeSpan.Zero
        };

        // Cookie'den token okuma (Fallback)
        opt.Events = new JwtBearerEvents
        {
            OnMessageReceived = ctx =>
            {
                var token = ctx.Request.Cookies["jwt_token"];
                if (!string.IsNullOrEmpty(token))
                    ctx.Token = token;
                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization(options =>
{
    // Admin politikası — sadece "admin" rolüne sahip tokenlar geçer
    options.AddPolicy("AdminOnly", policy =>
        policy.RequireRole("admin"));
});

// ─── Web API Controllers ──────────────────────────────────────
builder.Services.AddControllers();

// ─── Servisler ────────────────────────────────────────────────
builder.Services.AddSingleton<JwtService>();
builder.Services.AddScoped<QuizGeneratorService>();
builder.Services.AddScoped<PdfService>();
builder.Services.AddScoped<TranslationService>();
builder.Services.AddHttpClient();

// ─── CORS Configuration for Next.js & Admin Panel ────────────
var allowedOrigins = builder.Configuration["CorsOrigins"]?.Split(',') 
                     ?? new[] { "http://localhost:3000", "http://localhost:3001" };

builder.Services.AddCors(opt =>
    opt.AddDefaultPolicy(policy =>
        policy
            .WithOrigins(allowedOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials()));

var app = builder.Build();

// ─── Veritabanı Migrate ───────────────────────────────────────
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();
}

// ─── Middleware ───────────────────────────────────────────────
app.UseStaticFiles();
app.UseRouting();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

// Map Web API Controllers
app.MapControllers();

app.Run();
