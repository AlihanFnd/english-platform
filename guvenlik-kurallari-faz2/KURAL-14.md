# KURAL-14 — Eksik yapılandırmada KAPALI kal

> **Ön koşul:** Faz 1 kapalı. KURAL-13 ile aynı anda yürütülebilir.
> **Bu kural şu anda AÇIK olan bir sızıntıyı kapatır.**

---

## Kural metni

> **Güvenlik açısından kritik bir dış servis yapılandırılmamışsa, ona bağlı özellik
> ÇALIŞMAZ — daha zayıf bir yedeğe düşmez.** Her dış bağımlılık üç sınıftan birinde
> açıkça sınıflandırılacak (uygulama açılmasın / özellik kapansın / işlev bozulsun),
> sınıflandırma tek bir yerde tutulacak ve bir kapı, sınıflandırılmamış yeni bir
> bağımlılığın eklenmesini engelleyecek.

---

## Envanter

Ölçüm tarihi: **2026-09-02**, commit `03b8adc`.

### İhlal 1 — Şifre sıfırlama bağlantısı loga yazılıyor 🔴 **AÇIK SIZINTI**

```
$ grep -n "SifreSifirlamaGonderAsync" -A6 EnglishReadingPlatform/Security/IEpostaGondericisi.cs
    public Task SifreSifirlamaGonderAsync(string eposta, string baglanti, CancellationToken iptal = default)
    {
        _logger.LogWarning(
            "E-POSTA SERVİSİ YAPILANDIRILMAMIŞ. Şifre sıfırlama bağlantısı gönderilemedi. "
          + "Alici={Alici} Baglanti={Baglanti}",          ← HAM BAĞLANTI LOGA
            GuvenliLog.Eposta(eposta), baglanti);
        return Task.CompletedTask;
    }

$ grep -c "Resend" .env
0                                                        ← anahtar tanımlı değil
```

**Zincir:**
1. `POST /api/auth/forgot-password` **anonim ve herkese açık** (`[AllowAnonymous]`)
2. Saldırgan kurbanın e-postasını yazar
3. `SifreSifirlamaServisi` gerçek bir jeton üretir ve veritabanına hash'ini yazar
4. `Resend:ApiKey` yok → `LoglayanEpostaGondericisi` devreye girer
5. **Ham sıfırlama bağlantısı uygulama loguna düşer**
6. Logu görebilen herkes bağlantıyı kullanır → **hesap ele geçirilir**

Kodun kendisi tehlikeyi biliyor — sınıfın XML yorumunda yazıyor
(*"ÜRETİMDE KULLANILMAMALIDIR"*) ve `Program.cs` üretimde `stderr`'e uyarı basıyor.
Yani **sessiz değil.** Ama uyarı bir kontrol değildir: kimse okumazsa sızıntı sürer.

### İhlal 2 — Sıfırlama bağlantısı `localhost`'a üretilebiliyor 🟠

```
$ grep -rn '?? "http://localhost' EnglishReadingPlatform --include="*.cs"
Controllers/AuthController.cs:317:  var taban = _configuration["App:FrontendUrl"] ?? "http://localhost:3000";

$ grep -n "FrontendUrl" .env .env.example
.env.example:38:App__FrontendUrl=http://localhost:3000     ← yalnızca örnekte
$ grep -n "FrontendUrl" .env
(çıktı yok)                                                 ← gerçek .env'de YOK
```

`App__FrontendUrl` üretimde tanımlanmazsa, gönderilen e-postadaki bağlantı
`http://localhost:3000/reset-password?token=…` olur. Kullanıcı için **işe yaramaz**;
üstelik hata değil, sessiz bir bozukluk — kullanıcı "bağlantı çalışmıyor" der,
kimse sebebini bulamaz. Jeton yine de üretilip veritabanına yazılmıştır.

### İhlal 3 — Groq anahtarı yokken sessizce boş sonuç 🟡

```
$ grep -rn "IsNullOrWhiteSpace(apiKey)" EnglishReadingPlatform --include="*.cs"
Services/TranslationService.cs:182:  if (!string.IsNullOrWhiteSpace(apiKey))
Services/TranslationService.cs:300:  if (!string.IsNullOrWhiteSpace(apiKey) && forceAI)
Services/TranslationService.cs:488:  if (!string.IsNullOrWhiteSpace(apiKey))
Services/TranslationService.cs:676:  if (!string.IsNullOrWhiteSpace(apiKey))
Services/PdfService.cs:318:          if (string.IsNullOrWhiteSpace(apiKey))
```

Anahtar yoksa **beş noktada** koşul sessizce atlanıyor ve boş/ham sonuç dönüyor.
Güvenlik açığı değil ama aynı sınıf: *yapılandırma eksikse sessizce bozul.*
Yönetici, çevirinin neden çalışmadığını anlamak için koda bakmak zorunda kalır.

### İhlal 4 — Sınıflandırma yok, kapı yok 🔴

```
$ grep -rln "Resend\|Groq\|FrontendUrl" scripts/guard/
(çıktı yok)
```

Hiçbir kapı dış bağımlılıkların yapılandırma durumuna bakmıyor. `SirDogrulayici`
(KURAL-02) yalnızca **beş** değeri zorunlu tutuyor:

```
Jwt:Key · Jwt:Issuer · Jwt:Audience · ConnectionStrings:Default · Seed:AdminPassword
```

`Resend:ApiKey`, `App:FrontendUrl` ve `Groq:ApiKey` listede **yok** — çünkü
"eksikse uygulama hiç açılmasın" onlar için doğru cevap değil. Ama "eksikse
sessizce zayıf yedeğe düş" de doğru cevap değildi. **Üçüncü bir sınıf gerekiyor.**

### Özet

| # | İhlal | Sınıf | Nokta |
|---|---|---|---|
| 1 | Sıfırlama bağlantısı loga | Kritik özellik | 1 sınıf + 1 kayıt |
| 2 | Bağlantı `localhost`'a üretiliyor | Kritik özellik | 1 |
| 3 | Groq sessizce boş dönüyor | İşlev bozulur | 5 |
| 4 | Sınıflandırma ve kapı yok | — | 0 |
| | **TOPLAM** | | **7 nokta** |

---

## Merkezî uygulama

### 1. Üç sınıflı sözleşme — `Configuration/DisServisSozlesmesi.cs`

```csharp
namespace EnglishReadingPlatform.Configuration;

/// <summary>
/// KURAL-14: Her dış bağımlılık ÜÇ sınIFTAN birine girer ve bu tek yerde yazılır.
///
/// Neden üç sınıf: faz 1'in KURAL-02'si yalnızca "eksikse başlama" (fail-fast)
/// sınıfını tanıyordu. Şifre sıfırlama servisi o sınıfa girmiyor — anahtarı
/// olmayan bir geliştirme ortamı yine de açılabilmeli. Bu boşluk, "sessizce
/// loga yaz" gibi bir yedeğin doğmasına izin verdi.
///
/// Eksik olan sınıf şuydu: "uygulama açılsın, AMA o özellik KAPALI olsun."
/// </summary>
public enum ServisSinifi
{
    /// <summary>Eksikse uygulama HİÇ AÇILMAZ. (Jwt:Key, bağlantı dizesi…)</summary>
    UygulamaAcilmaz,

    /// <summary>
    /// Eksikse uygulama açılır ama BAĞLI ÖZELLİK 503 döner.
    /// Zayıf bir yedeğe DÜŞMEZ. (Resend, sıfırlama bağlantısı tabanı…)
    /// </summary>
    OzellikKapanir,

    /// <summary>
    /// Eksikse özellik bozulur ama güvenlik etkisi yoktur; açıkça loglanır.
    /// (Groq — çeviri kalitesi düşer, kimse tehlikeye girmez.)
    /// </summary>
    IslevBozulur,
}

public record DisServis(
    string Ad,
    string YapilandirmaAnahtari,
    ServisSinifi Sinif,
    string EksikseNeOlur);

public static class DisServisSozlesmesi
{
    /// <summary>
    /// TEK KAYNAK. Yeni bir dış bağımlılık eklenirse buraya da eklenir;
    /// scripts/guard/14-yapilandirma.sh bunu denetler.
    /// </summary>
    public static readonly DisServis[] Servisler =
    {
        new("JWT imzalama anahtarı", "Jwt:Key", ServisSinifi.UygulamaAcilmaz,
            "Kimlik doğrulama tamamen çalışmaz."),

        new("Veritabanı", "ConnectionStrings:Default", ServisSinifi.UygulamaAcilmaz,
            "Hiçbir uç çalışmaz."),

        new("Resend e-posta", "Resend:ApiKey", ServisSinifi.OzellikKapanir,
            "Şifre sıfırlama ve e-posta doğrulama uçları 503 döner. " +
            "Bağlantı ASLA loga yazılmaz."),

        new("Ön yüz adresi", "App:FrontendUrl", ServisSinifi.OzellikKapanir,
            "Şifre sıfırlama bağlantısı üretilemez; uç 503 döner. " +
            "localhost'a düşen kullanılamaz bağlantı gönderilmez."),

        new("Groq LLM", "Groq:ApiKey", ServisSinifi.IslevBozulur,
            "Yapay zekâ çevirisi ve metin analizi yapılmaz; sözlük yedeği kullanılır."),
    };

    /// <summary>
    /// Üretimde eksik olan "özellik kapanır" sınıfı servisleri döner.
    /// Program.cs bunları BAŞLANGIÇTA loglar — operatör hangi özelliğin
    /// kapalı olduğunu ilk saniyede bilir, ilk şikâyette değil.
    /// </summary>
    public static IReadOnlyList<DisServis> KapaliOzellikler(
        IConfiguration yapilandirma, IHostEnvironment ortam)
        => Servisler
            .Where(s => s.Sinif == ServisSinifi.OzellikKapanir)
            .Where(s => string.IsNullOrWhiteSpace(yapilandirma[s.YapilandirmaAnahtari]))
            .ToList();

    /// <summary>Bu servis kullanılabilir mi?</summary>
    public static bool Kullanilabilir(IConfiguration yapilandirma, string anahtar)
        => !string.IsNullOrWhiteSpace(yapilandirma[anahtar]);
}
```

### 2. Sızdıran yedeği SİL — `LoglayanEpostaGondericisi` gider

```csharp
/// <summary>
/// KURAL-14: E-posta servisi yapılandırılmamışken kullanılan uygulama.
///
/// ESKİ HÂLİ SİLİNDİ. Eski uygulama (LoglayanEpostaGondericisi) sıfırlama
/// bağlantısını LOGA yazıyordu — yani anahtar yokluğu, bir kullanılabilirlik
/// sorunundan bir HESAP ELE GEÇİRME yoluna dönüşüyordu.
///
/// Yeni davranış: gönderemiyorsak bunu SÖYLERİZ. Çağıran (AuthController)
/// bunu 503'e çevirir. Jeton hiç üretilmez.
/// </summary>
public class KapaliEpostaGondericisi : IEpostaGondericisi
{
    private readonly ILogger<KapaliEpostaGondericisi> _logger;
    public KapaliEpostaGondericisi(ILogger<KapaliEpostaGondericisi> logger) => _logger = logger;

    public Task SifreSifirlamaGonderAsync(string eposta, string baglanti, CancellationToken iptal = default)
    {
        // DİKKAT: 'baglanti' parametresi BİLEREK loglanmıyor.
        _logger.LogError(
            "E-posta servisi yapılandırılmamış; gönderim reddedildi. Alici={Alici}",
            GuvenliLog.Eposta(eposta));

        throw new EpostaServisiKapaliException();
    }
}

/// <summary>KURAL-14: e-posta servisi yapılandırılmamış.</summary>
public class EpostaServisiKapaliException : Exception
{
    public EpostaServisiKapaliException()
        : base("E-posta servisi yapılandırılmamış.") { }
}
```

### 3. `Program.cs` — kayıt ve açılış raporu

```csharp
// ─── KURAL-14: e-posta göndericisi ────────────────────────────
// Anahtar yoksa SIZDIRAN yedeğe değil, KAPALI uygulamaya düşülür.
if (DisServisSozlesmesi.Kullanilabilir(builder.Configuration, "Resend:ApiKey"))
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
    builder.Services.AddScoped<IEpostaGondericisi, KapaliEpostaGondericisi>();
}
```

Ve `app.Run()`'dan önce, açılış raporu:

```csharp
// ─── KURAL-14: hangi özellikler KAPALI? ───────────────────────
// Operatör bunu ilk saniyede bilmeli, ilk kullanıcı şikâyetinde değil.
foreach (var servis in DisServisSozlesmesi.KapaliOzellikler(app.Configuration, app.Environment))
{
    app.Logger.LogWarning(
        "ÖZELLİK KAPALI: {Servis} yapılandırılmamış ({Anahtar}). {Sonuc}",
        servis.Ad, servis.YapilandirmaAnahtari, servis.EksikseNeOlur);
}
```

### 4. `AuthController` — 503 döndür, jeton ÜRETME

```csharp
[HttpPost("forgot-password")]
[AllowAnonymous]
[EnableRateLimiting(HizSinirlari.KimlikDogrulama)]
public async Task<IActionResult> SifremiUnuttum([FromBody] SifremiUnuttumIstegi req)
{
    // ── KURAL-14: gönderemeyeceksek HİÇ BAŞLAMA ──
    // Jetonu üretip gönderememek en kötü sonuçtur: veritabanında geçerli bir
    // sıfırlama jetonu durur, kullanıcının haberi olmaz. Kontrol EN BAŞTA.
    var taban = _configuration["App:FrontendUrl"];
    if (_epostaGondericisi is KapaliEpostaGondericisi || string.IsNullOrWhiteSpace(taban))
    {
        _logger.LogError("Şifre sıfırlama istendi ama e-posta servisi kapalı.");
        return StatusCode(503, new
        {
            error = "Şifre sıfırlama şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin."
        });
    }

    var eposta = (req.Eposta ?? "").Trim().ToLowerInvariant();
    var kullanici = await _db.Users.FirstOrDefaultAsync(u => u.Email == eposta);

    if (kullanici != null)
    {
        var jeton = await _sifirlamaServisi.JetonUretAsync(kullanici.Id);
        try
        {
            await _epostaGondericisi.SifreSifirlamaGonderAsync(
                kullanici.Email, $"{taban.TrimEnd('/')}/reset-password?token={jeton}");
        }
        catch (EpostaServisiKapaliException)
        {
            // Yarış: servis istek sırasında kapandıysa. Yine de enumerasyon
            // sızdırmamak için aşağıdaki tek tip yanıt döner.
            _logger.LogError("E-posta gönderimi kapalı servis yüzünden başarısız.");
        }
    }

    // ── KURAL-09: hesabın varlığını SIZDIRMA — yanıt her durumda aynı ──
    return Ok(new { message = "Eğer bu e-posta kayıtlıysa, sıfırlama bağlantısı gönderildi." });
}
```

> ⚠️ **503 kontrolü, kullanıcı aramasından ÖNCE.** Aksi hâlde "servis kapalı"
> yanıtı yalnızca kayıtlı e-postalarda dönerdi ve KURAL-09'un kapattığı
> enumerasyon sızıntısı geri gelirdi.

### 5. Groq — sessiz atlamayı görünür kıl

Beş `IsNullOrWhiteSpace(apiKey)` noktasının davranışı **değişmez** (sözlük
yedeği doğru davranıştır), ama sınıflandırma açılışta loglanır ve
`GroqYapilandirildi` bayrağı tek yerden okunur:

```csharp
// TranslationService içinde, her noktada tekrar okumak yerine:
private bool GroqVar => DisServisSozlesmesi.Kullanilabilir(_configuration, "Groq:ApiKey");
```

---

## Otomatik kapı

### A) Sözleşme testi — `YapilandirmaSozlesmesiTests.cs`

```csharp
using System.Net;
using System.Net.Http.Json;
using EnglishReadingPlatform.Configuration;
using EnglishReadingPlatform.Security;
using EnglishReadingPlatform.Tests.Infrastructure;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace EnglishReadingPlatform.Tests;

[Collection("api")]
public class YapilandirmaSozlesmesiTests
{
    private readonly TestAppFactory _fabrika;
    public YapilandirmaSozlesmesiTests(TestAppFactory fabrika) => _fabrika = fabrika;

    /// <summary>
    /// ANA REGRESYON. Testlerde Resend anahtarı YOKTUR — yani bu ortam,
    /// üretimin anahtarsız hâlini birebir taklit eder.
    /// Bağlantının loga yazıldığı eski davranışta bu test 200 alırdı.
    /// </summary>
    [Fact]
    [Trait("Category", "Yapilandirma")]
    public async Task Eposta_servisi_kapaliyken_sifirlama_ucu_503_DONER()
    {
        var client = _fabrika.CreateClient();

        var yanit = await client.PostAsJsonAsync("/api/auth/forgot-password",
            new { eposta = "kimse@test.local" });

        yanit.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable,
            "gönderemiyorsak sessizce loga yazmak yerine açıkça kapalı demeliyiz");
    }

    /// <summary>
    /// ASIL İDDİA: 503 dönmek yetmez — JETON DA ÜRETİLMEMELİ.
    /// Aksi hâlde veritabanında sahibinin haberi olmadığı geçerli bir
    /// sıfırlama jetonu birikir.
    /// </summary>
    [Fact]
    [Trait("Category", "Yapilandirma")]
    public async Task Servis_kapaliyken_sifirlama_jetonu_URETILMEZ()
    {
        var client = _fabrika.CreateClient();
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);

        int oncekiJetonSayisi;
        using (var kapsam = _fabrika.Services.CreateScope())
        {
            var db = kapsam.ServiceProvider.GetRequiredService<Data.AppDbContext>();
            oncekiJetonSayisi = await db.SifreSifirlamaJetonlari.CountAsync(j => j.UserId == o.UserId);
        }

        await client.PostAsJsonAsync("/api/auth/forgot-password",
            new { eposta = $"ogr_{o.UserId}@test.local" });

        using (var kapsam = _fabrika.Services.CreateScope())
        {
            var db = kapsam.ServiceProvider.GetRequiredService<Data.AppDbContext>();
            (await db.SifreSifirlamaJetonlari.CountAsync(j => j.UserId == o.UserId))
                .Should().Be(oncekiJetonSayisi,
                    "gönderilemeyecek bir bağlantı için jeton üretmek, veritabanında " +
                    "sahibinin bilmediği geçerli bir anahtar bırakır");
        }
    }

    /// <summary>
    /// Kapalı gönderici, bağlantıyı ASLA dışarı vermemeli — ne loga, ne yanıta.
    /// Bu, sınıfın sözleşmesidir; imza değişirse test kırılır.
    /// </summary>
    [Fact]
    [Trait("Category", "Yapilandirma")]
    public void Kapali_gonderici_baglantiyi_ISTISNAYA_koymaz()
    {
        var gonderici = new KapaliEpostaGondericisi(
            Microsoft.Extensions.Logging.Abstractions.NullLogger<KapaliEpostaGondericisi>.Instance);

        const string gizliBaglanti = "https://x.app/reset-password?token=COKGIZLIJETON";

        var eylem = async () =>
            await gonderici.SifreSifirlamaGonderAsync("a@b.local", gizliBaglanti);

        eylem.Should().ThrowAsync<EpostaServisiKapaliException>()
            .Result.And.Message.Should().NotContain("COKGIZLIJETON",
                "istisna mesajı da bir sızıntı yüzeyidir");
    }

    [Fact]
    [Trait("Category", "Yapilandirma")]
    public void Her_dis_servis_SINIFLANDIRILMIS_olmali()
    {
        DisServisSozlesmesi.Servisler.Should().NotBeEmpty();
        DisServisSozlesmesi.Servisler.Should().OnlyContain(
            s => !string.IsNullOrWhiteSpace(s.YapilandirmaAnahtari)
              && !string.IsNullOrWhiteSpace(s.EksikseNeOlur),
            "sınıflandırma, 'eksikse ne olur' cevabını da içermeli — " +
            "yoksa operatör kararı veremez");
    }

    [Fact]
    [Trait("Category", "Yapilandirma")]
    public void Sifirlama_baglantisi_localhost_a_URETILEMEZ_uretimde()
    {
        // App:FrontendUrl boşken uç 503 dönmeli; varsayılan localhost YOK.
        var kaynak = File.ReadAllText("../../../../EnglishReadingPlatform/Controllers/AuthController.cs");
        kaynak.Should().NotContain("?? \"http://localhost:3000\"",
            "sıfırlama bağlantısının tabanı sessiz bir varsayılana düşmemeli");
    }
}
```

### B) Guard script — `scripts/guard/14-yapilandirma.sh`

```bash
#!/usr/bin/env bash
# KURAL-14 — eksik yapılandırmada kapalı kal.
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
echo "[14] Eksik yapılandırmada kapalı kal"

# 1. Sızdıran yedek gerçekten silindi mi?
cikti="$(git ls-files -z | xargs -0 grep -ln "LoglayanEpostaGondericisi" 2>/dev/null || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "sızdıran e-posta yedeği" "$n" "$cikti"

# 2. Sıfırlama bağlantısı bir log çağrısının parametresi olabiliyor mu?
#    'baglanti' ya da 'Baglanti' bir Log*(...) çağrısında geçmemeli.
cikti="$(depoda_ara 'Log(Warning|Information|Debug|Error)\([^)]*[Bb]aglanti' \
         'EnglishReadingPlatform/**/*.cs' || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "sıfırlama bağlantısı loga yazılıyor" "$n" "$cikti"

# 3. localhost'a düşen sessiz varsayılan kaldı mı?
cikti="$(depoda_ara '\?\? "http://localhost' 'EnglishReadingPlatform/**/*.cs' || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "localhost sessiz varsayılanı" "$n" "$cikti"

# 4. Sözleşme dosyası duruyor mu?
n=0; [ -f EnglishReadingPlatform/Configuration/DisServisSozlesmesi.cs ] || n=1
ihlal_bildir "dış servis sözleşmesi mevcut" "$n" "DisServisSozlesmesi.cs yok"

# 5. Yapılandırmadan okunan HER anahtar sözleşmede kayıtlı mı?
#    (Yeni bir dış bağımlılık sınıflandırılmadan eklenemesin.)
sozlesme="EnglishReadingPlatform/Configuration/DisServisSozlesmesi.cs"
eksik=""
for anahtar in $(depoda_ara '_configuration\["[A-Za-z]+:ApiKey"\]|Configuration\["[A-Za-z]+:ApiKey"\]' \
                  'EnglishReadingPlatform/**/*.cs' 2>/dev/null \
                | grep -oE '"[A-Za-z]+:ApiKey"' | tr -d '"' | sort -u); do
  grep -q "\"$anahtar\"" "$sozlesme" 2>/dev/null || eksik="${eksik}${anahtar}"$'\n'
done
n=$(printf '%s' "$eksik" | grep -c . || true)
ihlal_bildir "sınıflandırılmamış dış bağımlılık" "$n" "$eksik"

# 6. Açılış raporu bağlı mı?
n=0
grep -v '^[[:space:]]*//' EnglishReadingPlatform/Program.cs \
  | grep -q "KapaliOzellikler" || n=1
ihlal_bildir "açılışta kapalı özellik raporu" "$n" \
  "Program.cs KapaliOzellikler'i loglamıyor — operatör hangi özelliğin kapalı olduğunu bilmez"

# 7. Sözleşme testi duruyor mu?
n=0; [ -f EnglishReadingPlatform.Tests/YapilandirmaSozlesmesiTests.cs ] || n=1
ihlal_bildir "yapılandırma sözleşme testi mevcut" "$n" "test dosyası silinmiş"

guard_bitir
```

---

## Bitti kriteri

```bash
cd /Users/alihanfindikci/Desktop/ingilizceproje
docker compose up -d postgres

# 1) Testler — BEKLENEN: Başarısız: 0, Başarılı: 5
dotnet test Linguza.sln --filter "Category=Yapilandirma" --logger "console;verbosity=normal"
echo "çıkış kodu: $?"

# 2) Guard kapısı — BEKLENEN: TOPLAM İHLAL: 0
bash scripts/guard/14-yapilandirma.sh; echo "çıkış kodu: $?"

# 3) Sızdıran yedek depodan gitti — BEKLENEN: 0
git grep -c "LoglayanEpostaGondericisi" || echo 0

# 4) Bağlantı loga yazan satır kalmadı — BEKLENEN: 0
git grep -cE 'Log(Warning|Error|Information|Debug)\([^)]*[Bb]aglanti' || echo 0

# 5) localhost sessiz varsayılanı kalmadı — BEKLENEN: 0
git grep -c '?? "http://localhost' || echo 0

# 6) Uç gerçekten 503 dönüyor (anahtarsız çalışan uygulamaya karşı)
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:5001/api/auth/forgot-password \
  -H "Content-Type: application/json" -d '{"eposta":"a@b.local"}'
# BEKLENEN: 503

# 7) TÜM kapılar (faz 1 dâhil) — BEKLENEN: TOPLAM İHLAL: 0
bash scripts/guard/run-all.sh; echo "çıkış kodu: $?"

# 8) TÜM test takımı
dotnet test Linguza.sln --logger "console;verbosity=normal"
```

---

## Mutasyon kontrolü (zorunlu)

```bash
# MUTASYON A — sızdıran yedeği geri getir
python3 - <<'PY'
yol = "EnglishReadingPlatform/Security/IEpostaGondericisi.cs"
k = open(yol, encoding="utf-8").read()
k = k.replace("throw new EpostaServisiKapaliException();",
              '_logger.LogWarning("Baglanti={Baglanti}", baglanti); return Task.CompletedTask;   // MUTASYON A')
open(yol, "w", encoding="utf-8").write(k)
PY
grep -c "MUTASYON A" EnglishReadingPlatform/Security/IEpostaGondericisi.cs   # BEKLENEN: 1

dotnet test Linguza.sln --filter "FullyQualifiedName~Kapali_gonderici_baglantiyi"
# BEKLENEN: Başarısız: 1
bash scripts/guard/14-yapilandirma.sh; echo "çıkış kodu: $?"    # BEKLENEN: 1

git checkout EnglishReadingPlatform/Security/IEpostaGondericisi.cs
```

```bash
# MUTASYON B — 503'ü kaldır, jeton yine üretilsin
python3 - <<'PY'
yol = "EnglishReadingPlatform/Controllers/AuthController.cs"
k = open(yol, encoding="utf-8").read()
k = k.replace("if (_epostaGondericisi is KapaliEpostaGondericisi || string.IsNullOrWhiteSpace(taban))",
              "if (false)   // MUTASYON B")
open(yol, "w", encoding="utf-8").write(k)
PY
grep -c "MUTASYON B" EnglishReadingPlatform/Controllers/AuthController.cs   # BEKLENEN: 1

dotnet test Linguza.sln --filter "Category=Yapilandirma"
# BEKLENEN: Başarısız: 2 — hem 503 testi hem JETON ÜRETİLMEZ testi kırmızı
#   ← İkinci testin ayrı olması burada işe yarıyor: 503 yokluğu ile
#     "jeton sızdı" iki AYRI hatadır ve raporda ikisi de görünmeli

git checkout EnglishReadingPlatform/Controllers/AuthController.cs
```

```bash
# MUTASYON C — localhost varsayılanını geri koy
python3 - <<'PY'
yol = "EnglishReadingPlatform/Controllers/AuthController.cs"
k = open(yol, encoding="utf-8").read()
k = k.replace('var taban = _configuration["App:FrontendUrl"];',
              'var taban = _configuration["App:FrontendUrl"] ?? "http://localhost:3000";   // MUTASYON C')
open(yol, "w", encoding="utf-8").write(k)
PY
grep -c "MUTASYON C" EnglishReadingPlatform/Controllers/AuthController.cs   # BEKLENEN: 1

bash scripts/guard/14-yapilandirma.sh; echo "çıkış kodu: $?"   # BEKLENEN: 1
dotnet test Linguza.sln --filter "FullyQualifiedName~localhost_a_URETILEMEZ"
# BEKLENEN: Başarısız: 1

git checkout EnglishReadingPlatform/Controllers/AuthController.cs
dotnet test Linguza.sln --filter "Category=Yapilandirma"      # BEKLENEN: Başarısız: 0
```

---

## Geçiş planı

| Adım | İş | Nokta | Doğrulama |
|---|---|---|---|
| 1 | `Configuration/DisServisSozlesmesi.cs` yaz | 1 | derlenir |
| 2 | `LoglayanEpostaGondericisi` → `KapaliEpostaGondericisi` (SİL, yeniden yaz) | 1 | guard 1 → 0 |
| 3 | `EpostaServisiKapaliException` ekle | 1 | derlenir |
| 4 | `Program.cs` kaydı ve açılış raporu | 2 | guard 6 → 0 |
| 5 | `AuthController.SifremiUnuttum` 503 kontrolü — **kullanıcı aramasından ÖNCE** | 1 | test yeşil |
| 6 | `App:FrontendUrl` sessiz varsayılanını kaldır | 1 | guard 3 → 0 |
| 7 | `.env` ve `.env.example`'a `App__FrontendUrl` yaz | 2 | uygulama açılır |
| 8 | `TranslationService` `GroqVar` bayrağı (davranış aynı) | 5 | test yeşil |
| 9 | `YapilandirmaSozlesmesiTests.cs` yaz | — | 5 test yeşil |
| 10 | `scripts/guard/14-yapilandirma.sh` + `chmod +x` | — | çıkış kodu 0 |
| 11 | Resend anahtarı VARKEN de dene (yerelde geçici anahtarla) | — | gerçek e-posta gelir |
| 12 | `docs/03-API-REFERANSI.md` 503 yanıtını belgele | — | — |
| 13 | İlerleme tablosunu işaretle | — | — |

### Adım 11 — anahtarla da doğrula

Kapıyı yalnızca "kapalıyken doğru davranıyor" diye test etmek yarım kalmadır.
Anahtar tanımlıyken **gerçekten e-posta gittiğini** de görmek gerekir; aksi hâlde
"her zaman 503 dönen" bir uç yazmış olabilir ve kimse fark etmez.

```bash
Resend__ApiKey='re_xxx' App__FrontendUrl='http://localhost:3000' dotnet run --project EnglishReadingPlatform
# başka bir terminalde:
curl -X POST http://localhost:5001/api/auth/forgot-password \
  -H "Content-Type: application/json" -d '{"eposta":"KENDI_ADRESIN"}'
# BEKLENEN: 200 + gerçek e-posta kutuna bağlantı düşer
```

---

## Tuzaklar

| Tuzak | Neden olur | Nasıl kaçınılır |
|---|---|---|
| **503 kontrolünü kullanıcı aramasından SONRA koymak** | "Servis kapalı" yanıtı yalnızca kayıtlı e-postalarda döner → KURAL-09'un kapattığı enumerasyon geri gelir | Kontrol metodun İLK satırında |
| **Jetonu üretip göndermeyi denemek** | Veritabanında sahibinin bilmediği geçerli bir sıfırlama jetonu kalır | Ayrı test: `..._jetonu_URETILMEZ` |
| **İstisna mesajına bağlantıyı koymak** | Merkezî hata middleware'i mesajı loglar → sızıntı geri gelir, üstelik başka bir dosyadan | İstisna mesajı sabit; testte `NotContain` iddiası var |
| **Groq'u da "özellik kapanır" yapmak** | Anahtar yokken çeviri ucu 503 döner ve geliştirme ortamı kullanılamaz hâle gelir | Groq `IslevBozulur` sınıfında — sözlük yedeği doğru davranış |
| **Yalnızca "kapalıyken" test etmek** | Her zaman 503 dönen bir uç da testi geçer | Adım 11 zorunlu |
| **Açılış raporunu `Information` seviyesinde basmak** | KURAL-15'te üretim log seviyesi `Warning`'e çekilecek; rapor görünmez olur | `LogWarning` kullan |
| **`.env.example`'ı güncelleyip `.env`'i unutmak** | Yerelde uç sürekli 503 döner, geliştirici kuralın bozuk olduğunu sanır | Adım 7 ikisini birden yazıyor |

---

## Teslim şablonu

```markdown
## 1. Kanıtlanarak kapandı
<8 bitti-kriteri komutunun ham çıktısı>
<MUTASYON A, B, C çıktıları>
<adım 11: gerçek anahtarla e-posta gönderildiğinin kanıtı>

## 2. Kapanmadı
- E-posta doğrulama akışı yok (KURAL-16'nın konusu)
- Groq eksikken çeviri kalitesi sessizce düşüyor (bilinçli: IslevBozulur sınıfı)

## 3. İnsan müdahalesi gerekiyor
- [ ] Render'da `Resend__ApiKey` tanımlandı mı?
- [ ] Render'da `App__FrontendUrl` gerçek ön yüz adresine ayarlandı mı?
- [ ] Resend'de gönderen alan adı doğrulandı mı? (onboarding@resend.dev
      yalnızca test içindir; gerçek kullanıcıya giden e-posta spam'e düşer)

## Değiştirilen dosyalar
<git diff --stat>

## Commit
<git log -1 --format='%H %s'>
```
