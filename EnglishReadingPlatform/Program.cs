using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using EnglishReadingPlatform.Configuration;
using EnglishReadingPlatform.Data;
using EnglishReadingPlatform.Files;
using EnglishReadingPlatform.Middleware;
using EnglishReadingPlatform.RateLimiting;
using EnglishReadingPlatform.Security;
using EnglishReadingPlatform.Services;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;

var builder = WebApplication.CreateBuilder(args);

// ─── KURAL-02: Sır doğrulaması — her şeyden önce ──────────────
// Eksik/zayıf/sızmış sır varsa uygulama burada durur. Varsayılana
// düşmek yerine hiç başlamamak bilinçli tercihtir.
SirDogrulayici.Dogrula(builder.Configuration, builder.Environment);

// ─── KURAL-05: istek gövdesi üst sınırı ───────────────────────
// [StringLength] gövde ÇÖZÜMLENDİKTEN SONRA çalışır: 20.000 karakterlik bir
// sınır, 30 MB'lık bir gövdenin önce belleğe alınıp JSON olarak ayrıştırılmasını
// engellemez. Doğrulamadan ÖNCE devreye giren tek sınır budur.
//
// En büyük meşru JSON gövdesi OCR metnidir (50.000 karakter ≈ 300 KB en kötü
// durumda). 2 MB rahat bir tavan bırakır. Dosya yükleme uçları kendi
// [RequestSizeLimit(50 MB)] özniteliğiyle bu sınırı zaten geçersiz kılar.
builder.WebHost.ConfigureKestrel(opt =>
{
    opt.Limits.MaxRequestBodySize = 2 * 1024 * 1024;

    // ─── KURAL-11: sunucu parmak izi ──────────────────────────
    // Kestrel varsayılan olarak "Server: Kestrel" yazar. Sürüm bilgisi
    // taşımasa da, hangi yığının çalıştığını söylemek saldırganın işini
    // kolaylaştırır. Başlığı SONRADAN silmek yetmez: Kestrel'in kendi
    // başlığı yanıt yazılırken ekleniyor, middleware'in görebileceği
    // koleksiyona hiç girmiyor. Tek doğru yer burası.
    opt.AddServerHeader = false;
});

// ─── Veritabanı ───────────────────────────────────────────────
builder.Services.AddDbContext<AppDbContext>(opt =>
    opt.UseNpgsql(builder.Configuration.GetConnectionString("Default")));

// ─── JWT Authentication ───────────────────────────────────────
var jwtKey      = builder.Configuration["Jwt:Key"]!;        // SirDogrulayici doğruladı, null olamaz
var jwtIssuer   = builder.Configuration["Jwt:Issuer"]!;
var jwtAudience = builder.Configuration["Jwt:Audience"]!;
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(opt =>
    {
        opt.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
            ValidateIssuer = true,
            ValidIssuer = jwtIssuer,
            ValidateAudience = true,
            ValidAudience = jwtAudience,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.Zero
        };

        // ── KURAL-04: kimlik taşıyıcısı seçimi ve iptal kontrolü ──
        opt.Events = new JwtBearerEvents
        {
            OnMessageReceived = ctx =>
            {
                // Authorization başlığı HER ZAMAN önceliklidir.
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

                // jti YOKSA token'a güvenilmez.
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
    });

builder.Services.AddAuthorization(options =>
{
    // ── KURAL-03: VARSAYILAN REDDET ────────────────────────────
    // Öznitelik taşımayan her uç otomatik olarak kimlik doğrulaması ister.
    // Bir ucun herkese açık olması İSTENİYORSA [AllowAnonymous] ile
    // açıkça işaretlenmeli ve YetkilendirmeSozlesmesiTests beyaz listesine
    // eklenmelidir. Unutulan bir öznitelik artık "sessizce açık" değil,
    // "kapalı" anlamına gelir.
    //
    // DİKKAT: FallbackPolicy ≠ DefaultPolicy. DefaultPolicy yalnızca
    // [Authorize] VARKEN hangi politikanın uygulanacağını söyler; özniteliksiz
    // uçlara hiç dokunmaz. Kapatılmak istenen boşluk tam olarak orasıdır.
    options.FallbackPolicy = new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build();

    // Admin politikası — sadece "admin" rolüne sahip tokenlar geçer
    options.AddPolicy("AdminOnly", policy =>
        policy.RequireRole("admin"));

    // Öğretmen VEYA admin gerektiren ileri kullanımlar için hazır politika.
    options.AddPolicy("EgitmenVeyaAdmin", policy =>
        policy.RequireRole("teacher", "admin"));
});

// ─── Web API Controllers ──────────────────────────────────────
builder.Services.AddControllers();

// ─── KURAL-05: doğrulama hatası biçimi ────────────────────────
// [ApiController] varsayılan olarak RFC 7807 ProblemDetails döner
// ({ type, title, status, errors }). Projenin TÜM hataları { error }
// biçiminde ve istemciler bunu okuyor (frontend/app/api.ts → errorData.error).
// Biçim korunmazsa kullanıcı "HTTP error! status: 400" görür ve neyin yanlış
// olduğunu öğrenemez — yani doğrulama eklemek kullanıcı deneyimini bozar.
builder.Services.Configure<ApiBehaviorOptions>(options =>
{
    options.InvalidModelStateResponseFactory = ctx =>
    {
        var ilkHata = ctx.ModelState
            .Where(kv => kv.Value?.Errors.Count > 0)
            .SelectMany(kv => kv.Value!.Errors)
            .Select(e => e.ErrorMessage)
            .FirstOrDefault(m => !string.IsNullOrWhiteSpace(m))
            ?? "Gönderilen veri geçersiz.";

        // Tüm hatalar da verilir (istemci isterse alan alan gösterebilir),
        // ama 'error' alanı her zaman durur.
        var tumHatalar = ctx.ModelState
            .Where(kv => kv.Value?.Errors.Count > 0)
            .ToDictionary(
                kv => kv.Key,
                kv => kv.Value!.Errors.Select(e => e.ErrorMessage).ToArray());

        return new BadRequestObjectResult(new { error = ilkHata, hatalar = tumHatalar });
    };
});

// ─── KURAL-04: token iptal deposu ─────────────────────────────
builder.Services.AddSingleton<ITokenIptalDeposu, BellekTokenIptalDeposu>();
builder.Services.AddHostedService<TokenTemizlikServisi>();

// ─── KURAL-12: saklama süresi temizliği ───────────────────────
// Kişisel veri süresiz saklanmaz. Süreler SaklamaTemizligiServisi içinde
// TEK kaynaktadır; burada yalnızca zamanlayıcı kaydedilir.
builder.Services.AddHostedService<SaklamaTemizligiServisi>();

// ─── KURAL-07: kaynak tüketimi sınırları ──────────────────────
// Hız sınırlama TEK merkezden kurulur. Elle yazılmış eski sayaç servisi emekliye
// ayrıldı: sözlüğü hiç temizlenmiyordu (login_{ip} anahtarları IPv6 ile sınırsız
// üretilebiliyordu) ve her çağrı yeri kendi sınır sayısını gövdesine gömüyordu.
// Sınıfın adı bilinçli olarak yazılmadı: 'bu ad kod tabanında hiç geçmiyor'
// tek satırlık bir grep ile doğrulanabilen bir bitti-kriteridir.
builder.Services.HizSinirlamaEkle();

// Hedef (e-posta) bazlı giriş sayacı — dağıtık credential-stuffing'e karşı.
builder.Services.AddSingleton<HesapSayaci>();

// Ağır iş (LLM analizi / PDF ayrıştırma) eşzamanlılık kapısı.
builder.Services.AddSingleton<AgirIsKapisi>();

// KURAL-10: yüklenen dosyanın türünü İÇERİKTEN belirleyen tek merkez.
// Durumsuz olduğu için singleton; tüm yükleme yolları buradan geçer.
builder.Services.AddSingleton<DosyaDogrulayici>();

// ─── Servisler ────────────────────────────────────────────────
builder.Services.AddSingleton<JwtService>();
builder.Services.AddScoped<QuizGeneratorService>();
builder.Services.AddScoped<PdfService>();
builder.Services.AddScoped<TranslationService>();
builder.Services.AddHttpClient();

// ─── KURAL-07 İhlal 3: dış API çağrılarına zaman aşımı VE boyut sınırı ──
// Adlandırılmamış CreateClient() 100 saniyelik varsayılan zaman aşımıyla gelir;
// üstelik kod bazı yerlerde bunu 5 DAKİKAYA çıkarıyordu. 20 eşzamanlı analiz,
// 5 dakika boyunca 20 bağlantı + 20 thread tutar. Tavan artık tek yerde.
//
// MaxResponseContentBufferSize: yanıt boyutu da bir kaynaktır. Sınırsız yanıt,
// ele geçirilmiş ya da arızalı bir dış servisin belleği doldurmasına izin verir.
builder.Services.AddHttpClient(HizSinirlari.GroqIstemcisi, c =>
{
    c.Timeout = HizSinirlari.GroqTavanZamanAsimi;
    c.MaxResponseContentBufferSize = HizSinirlari.GroqEnCokYanitBayti;
});

builder.Services.AddHttpClient(HizSinirlari.GoogleIstemcisi, c =>
{
    c.Timeout = HizSinirlari.GoogleZamanAsimi;
    c.MaxResponseContentBufferSize = HizSinirlari.GoogleEnCokYanitBayti;
});

// ─── KURAL-09: kimlik doğrulama sertleştirmesi ───────────────
builder.Services.AddSingleton<SifrePolitikasi>();
builder.Services.AddScoped<SifreSifirlamaServisi>();

// E-posta göndericisi. 00-BASLA-BURADAN madde 7 kararı: A (Resend).
// Anahtar yoksa loglayan uygulamaya düşer — böylece anahtar gelmeden de
// akış uçtan uca çalışır ve test edilebilir.
var resendAnahtari = builder.Configuration["Resend:ApiKey"];
if (!string.IsNullOrWhiteSpace(resendAnahtari))
{
    builder.Services.AddHttpClient(ResendEpostaGondericisi.IstemciAdi, c =>
    {
        c.BaseAddress = new Uri("https://api.resend.com/");
        c.Timeout = TimeSpan.FromSeconds(15);
        c.MaxResponseContentBufferSize = 64 * 1024;
    });
    builder.Services.AddScoped<IEpostaGondericisi, ResendEpostaGondericisi>();
}
else
{
    // Üretimde anahtarsız çalışmak, sıfırlama bağlantısını loga yazmak demektir.
    // Sessizce geçmek yerine açıkça uyar (KURAL-06: sessiz başarısızlık yasak).
    if (!builder.Environment.IsDevelopment())
        Console.Error.WriteLine(
            "UYARI: Resend:ApiKey tanımlı değil. Şifre sıfırlama e-postaları GÖNDERİLMEYECEK, " +
            "bağlantı yalnızca loga yazılacak. Üretimde Resend__ApiKey ortam değişkenini tanımlayın.");
    builder.Services.AddScoped<IEpostaGondericisi, LoglayanEpostaGondericisi>();
}

// ─── KURAL-11: HTTPS yönlendirmesi için hedef port ────────────
// UseHttpsRedirection hedef portu bulamazsa SESSİZCE hiçbir şey yapmaz:
// yalnızca "Failed to determine the https port for redirect" uyarısını loglar
// ve isteği düz HTTP olarak geçirir. Port; seçenekten, HTTPS_PORT ortam
// değişkeninden ya da sunucunun bağlandığı bir https adresinden okunur.
// Render/Vercel arkasında uygulama YALNIZCA HTTP dinlediği için üçünün de
// karşılığı yoktur — port burada açıkça verilmezse "HTTPS zorunlu" satırı
// koda girer ama üretimde hiç çalışmaz (KURAL-06 §6: sessiz başarısızlık).
builder.Services.AddHttpsRedirection(secenekler => secenekler.HttpsPort = 443);

// ─── KURAL-11: HSTS ───────────────────────────────────────────
// "Bu siteye bir daha HTTP ile gelme" der. 30 gün ile başlanır; sorunsuz
// çalıştığı doğrulanınca 1 yıla çıkarılır (docs/07-GUVENLIK.md takvim notu).
builder.Services.AddHsts(secenekler =>
{
    secenekler.MaxAge = TimeSpan.FromDays(30);
    secenekler.IncludeSubDomains = true;

    // Preload listesine girmek GERİ ALINAMAZ: HTTPS bir gün bozulursa alan adı
    // aylarca erişilemez kalır. Bilinçli olarak kapalı.
    secenekler.Preload = false;
});

// ─── CORS Configuration for Next.js & Admin Panel ────────────

builder.Services.AddCors(opt =>
    opt.AddDefaultPolicy(policy =>
        policy
            .SetIsOriginAllowed(origin => true)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials()));

var app = builder.Build();

// ─── Veritabanı Migrate ───────────────────────────────────────
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    db.Database.Migrate();
    // KURAL-02: yönetici hesabı koddan değil ortamdan tohumlanır.
    await YoneticiTohumlayici.TohumlaAsync(db, app.Configuration, logger);
}

// ─── Middleware ───────────────────────────────────────────────

// ─── KURAL-06: hata yakalama — ZİNCİRİN EN BAŞI ───────────────
// Buradan SONRA gelen her katmanın istisnası yakalanır. UseRouting'in
// ARKASINA konursa routing, model binding ve CORS istisnaları ASP.NET
// Core'un varsayılan işleyicisine düşer ve Development'ta yığın izi döner.
// scripts/guard/06-hata-log.sh bu sırayı denetliyor.
app.HataYakalamayiKullan();

// ─── KURAL-11: güvenlik başlıkları — hatadan HEMEN SONRA ──────
// HataYakalamaMiddleware yanıtı Response.Clear() ile temizliyor. Başlıklar
// ondan ÖNCE eklenseydi hata yanıtlarında silinirlerdi; sonra eklendikleri
// için 4xx/5xx yanıtlar da korumalı çıkar.
// GuvenlikBasliklariTests.Hata_yaniti_da_baslik_tasir bu sırayı koruyor.
app.GuvenlikBasliklariniKullan();

// ─── KURAL-11: ters proxy'den gelen şema/istemci bilgisi ──────
// Render (backend) ve Vercel (istemciler) TLS'i KENDİLERİ sonlandırıp uygulamaya
// düz HTTP gönderiyor. Bu başlıklar okunmazsa iki şey birden bozulur:
//   1) UseHttpsRedirection her isteği "HTTP" sanıp yeniden yönlendirir →
//      proxy tekrar iletir → SONSUZ DÖNGÜ, site tamamen erişilemez olur.
//   2) ctx.Connection.RemoteIpAddress herkes için proxy'nin IP'si olur →
//      KURAL-07'nin IP tabanlı hız sınırları tek kovaya düşer.
//
// ForwardLimit = 1 (varsayılan) BİLEREK korunuyor: ASP.NET Core
// X-Forwarded-For'u SAĞDAN sola okur, yani yalnızca proxy'nin kendi eklediği
// son değer kullanılır. İstemcinin gövdeye kendi yazdığı sahte IP'ler solda
// kalır ve yok sayılır — hız sınırını IP uydurarak aşmak bu sayede mümkün olmaz.
//
// KnownProxies/KnownNetworks temizleniyor: Render'da proxy'nin IP'si sabit
// değildir ve varsayılan liste yalnızca loopback'e güvenir (yani başlıklar
// sessizce yok sayılırdı — KURAL-06 §6: sessiz başarısızlık bir açıktır).
// Kalan risk ve doğrulama adımı docs/07-GUVENLIK.md § KURAL-11'de yazılı.
if (!app.Environment.IsDevelopment())
{
    var iletilenBasliklar = new ForwardedHeadersOptions
    {
        ForwardedHeaders = ForwardedHeaders.XForwardedProto | ForwardedHeaders.XForwardedFor
    };
    iletilenBasliklar.KnownNetworks.Clear();
    iletilenBasliklar.KnownProxies.Clear();
    app.UseForwardedHeaders(iletilenBasliklar);

    // HSTS ve HTTPS yönlendirmesi yalnızca üretimde: geliştirmede açılırsa
    // tarayıcı localhost'u kalıcı olarak HTTPS'e zorlar ve geliştirme durur.
    app.UseHsts();
    app.UseHttpsRedirection();
}

// KURAL-11: app.UseStaticFiles() KALDIRILDI (2026-09-01).
// Bu proje HTML sunmuyor — Razor pipeline'ı hiç kurulmuyor, hiçbir controller
// View döndürmüyor. UseStaticFiles yalnızca wwwroot/ altındaki ölü varlıkları
// (eski jQuery/bootstrap kalıntıları, kullanılmayan site.js) internete açıyordu.
// Views/ ve wwwroot/ klasörleri de silindi.
//
// Statik dosya sunmak GERÇEKTEN gerekirse: kök dizini açmak yerine
// UseStaticFiles(new StaticFileOptions { RequestPath = "/…", FileProvider = … })
// ile yalnızca o dizini yayınlayın ve scripts/guard/11-tarayici.sh'daki
// kontrolü buna göre güncelleyin.
app.UseRouting();
app.UseCors();

// ─── KURAL-07: SIRA KRİTİKTİR ─────────────────────────────────
// UseRateLimiter, UseAuthentication'dan SONRA gelmek ZORUNDA: bölümleme anahtarı
// ctx.User'daki kullanıcı kimliğine bakıyor. Önce konursa User boş olur, bütün
// sınırlar IP bazına düşer ve NAT arkasındaki bir okulun tüm öğrencileri
// birbirinin kotasını tüketir. scripts/guard/07-hiz-siniri.sh bu sırayı denetler.
//
// UseAuthorization'dan ÖNCE gelmesi de bilinçlidir: sınırı aşan istek, yetki
// kontrolünün ve controller'ın hiç çalıştırılmadan reddedilmesi gerekir.
app.UseAuthentication();
app.UseRateLimiter();
app.UseAuthorization();

// Map Web API Controllers
app.MapControllers();

app.Run();

// Test projesinin WebApplicationFactory<Program> kullanabilmesi için.
public partial class Program { }
