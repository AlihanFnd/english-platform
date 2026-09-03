# KURAL-19 — Kişisel veri yaşam döngüsü

> **Ön koşul:** KURAL-16 kapalı olmalı — silme ve dışa aktarma talebi
> doğrulanmış bir hesaba bağlıdır.
> **Bu, faz 2'nin son kuralıdır.** Bitince ilerleme tablosunun tamamı ✅ olmalı.

---

## Kural metni

> **Sistemde tutulan her kişisel veri kaleminin sahibi, sebebi ve ömrü yazılı
> olacak; sahibi onu görebilecek, dışa aktarabilecek ve sildirebilecek.**
> Hangi tablonun hangi kişisel veriyi taşıdığı tek bir envanterde tutulacak;
> yeni bir kişisel veri alanı envantere yazılmadan eklenemeyecek; ve
> kullanılmayan hiçbir kişisel veri kopyası (yedek, döküm, eski veritabanı)
> çalışma dizininde ya da sürüm kontrolünde kalmayacak.

---

## Envanter

Ölçüm tarihi: **2026-09-02**, commit `03b8adc`.

### İhlal 1 — Kişisel veri envanteri yok 🟠

Hangi tablonun ne tuttuğu yalnızca `docs/02-VERITABANI.md`'de **düz yazı**
olarak var. Kod tarafında bir kayıt yok, dolayısıyla bir kapı da yok.
Ölçülen kişisel veri alanları:

| Tablo · Alan | Ne | Hassasiyet |
|---|---|---|
| `Users.Email` | İletişim adresi | Doğrudan kimlik |
| `Users.Username` | Görünen ad | Doğrudan kimlik |
| `Users.PasswordHash` | BCrypt hash | Kimlik doğrulama sırrı |
| `OcrRecords.ExtractedText` | **Kullanıcının taradığı ham metin** | 🔴 Belirsiz — ders notu, mektup, kimlik fotokopisi olabilir |
| `UserActivityLogs.Details` | `"Kitap ID: 5"`, **`"Word: ephemeral"`** | Davranış + öğrenme profili |
| `ReadingProgresses.*` | Ne okuduğu, ne kadarı | Davranış |
| `WordListItems.Word/Context` | **Hangi kelimeleri bilmediği** | Öğrenme profili |
| `QuizResults.Score` | Başarı notu | Eğitim verisi |
| `Feedbacks.Message` | Serbest metin | Belirsiz |
| `TranslationCaches.*` | Sorgu + bağlam (global) | Dolaylı |
| `SifreSifirlamaJetonlari.JetonHash` | Kurtarma sırrı | Kimlik doğrulama sırrı |

**En riskli olan `OcrRecords.ExtractedText`**: içeriği kullanıcının kameraya
tuttuğu şeye bağlı ve sistem ne olduğunu bilmiyor.

### İhlal 2 — `OcrRecords` için saklama süresi yok 🟠

KURAL-12 üç tabloya süre koydu:

```
$ grep -n "public static readonly TimeSpan" EnglishReadingPlatform/Data/SaklamaTemizligiServisi.cs
AktiviteLogu    = TimeSpan.FromDays(90);
CeviriOnbellegi = TimeSpan.FromDays(365);
SifirlamaJetonu = TimeSpan.FromDays(7);
```

`OcrRecords` listede **yok**. KURAL-12 kullanıcıya silme ucu ekledi
(`DELETE /api/dashboard/ocr/{id}`) ama otomatik süre bilinçli olarak
ürün kararına bırakıldı — **karar hâlâ verilmedi.**

### İhlal 3 — Veri sahibinin hakları uygulanmamış 🟠

```
$ grep -rn "hesabimi-sil\|delete-account\|veri-disa-aktar\|export" \
       EnglishReadingPlatform/Controllers/ --include="*.cs"
(çıktı yok)
```

Kullanıcı kendi verisinin **tamamını göremiyor, dışa aktaramıyor ve
hesabını silemiyor.** Yalnızca yönetici bir kullanıcıyı silebiliyor
(`DELETE /api/admin/users/{id}`).

### İhlal 4 — Kişisel veri kopyaları çalışma dizininde 🟡

```
$ ls -la *.dump *.sql 2>/dev/null | awk '{print $5, $9}'
561942 englishreadingdb_backup.dump
561942 local_db_safe_backup.dump
596076 neon_backup_live.dump
1791243 neon_dump.sql
2425527 yedek-kural12-20260901-170537.sql

$ git check-ignore -v englishreadingdb_backup.dump neon_dump.sql
.gitignore:42:*.dump    englishreadingdb_backup.dump
.gitignore:43:neon_dump.sql  neon_dump.sql          ← depoda DEĞİL ✓

$ ls EnglishReadingPlatform/englishplatform.db
EnglishReadingPlatform/englishplatform.db            ← diskte DURUYOR
```

Depoda değiller (KURAL-12 `.gitignore`'u uzantı bazlı yaptı) ama **diskte
~5,9 MB kişisel veri kopyası** duruyor ve proje iCloud ile eşitlenen bir
klasörde. Ayrıca `englishplatform.db` **git geçmişinde** hâlâ var.

### İhlal 5 — Yasal metinler yok 🟠

Aydınlatma metni, gizlilik politikası, açık rıza akışı, veri saklama
politikası — hiçbiri yok. Bu **teknik değil hukuki** bir eksiktir; kod
yazamaz, ama kodun ona bağlanacağı yer (kayıt formunda onay, ayarlar
sayfasında bağlantı) bu kuralın kapsamındadır.

### Özet

| # | İhlal | Nokta |
|---|---|---|
| 1 | Envanter yok | 11 alan kayıtsız |
| 2 | `OcrRecords` süresiz | 1 tablo |
| 3 | Veri sahibi hakları yok | 3 eksik uç |
| 4 | Diskte veri kopyaları | 5 dosya (~5,9 MB) + git geçmişi |
| 5 | Yasal metinler yok | 2 metin, 1 onay akışı |
| | **TOPLAM** | **22 nokta** |

---

## Merkezî uygulama

### 1. Kişisel veri envanteri — `Data/KisiselVeriEnvanteri.cs`

```csharp
namespace EnglishReadingPlatform.Data;

public enum VeriSinifi
{
    /// <summary>Doğrudan kimlik — e-posta, kullanıcı adı.</summary>
    Kimlik,
    /// <summary>Kimlik doğrulama sırrı — hash, jeton. Dışa AKTARILMAZ.</summary>
    Sir,
    /// <summary>Davranış — ne okudu, ne zaman, hangi kelime.</summary>
    Davranis,
    /// <summary>İçeriği bilinmeyen kullanıcı girdisi — OCR metni, geri bildirim.</summary>
    BelirsizIcerik,
}

public record KisiselVeriKalemi(
    string Tablo,
    string Alan,
    VeriSinifi Sinif,
    string Sebep,
    int? SaklamaGunu,          // null = hesap silinene kadar
    bool DisaAktarilir);

/// <summary>
/// KURAL-19: Sistemde tutulan her kişisel veri kalemi — TEK kaynak.
///
/// Neden kodda, dokümanda değil: dokümanda tutulan envanter,
/// ilk şema değişikliğinde eskir ve kimse fark etmez. Burada tutulunca
/// bir KAPI, envantere yazılmamış yeni bir alanı yakalayabilir.
/// </summary>
public static class KisiselVeriEnvanteri
{
    public static readonly KisiselVeriKalemi[] Kalemler =
    {
        new("Users", "Email", VeriSinifi.Kimlik,
            "Giriş kimliği ve hesap kurtarma.", null, true),
        new("Users", "Username", VeriSinifi.Kimlik,
            "Grup içinde görünen ad.", null, true),
        new("Users", "PasswordHash", VeriSinifi.Sir,
            "Kimlik doğrulama.", null, DisaAktarilir: false),

        new("OcrRecords", "ExtractedText", VeriSinifi.BelirsizIcerik,
            "Kullanıcının taradığı metni tekrar okuyabilmesi.",
            SaklamaGunu: 365, DisaAktarilir: true),

        new("UserActivityLogs", "Details", VeriSinifi.Davranis,
            "Analitik VE Groq günlük kota sayacı (KURAL-12 uyarısı).", 90, true),

        new("ReadingProgresses", "*", VeriSinifi.Davranis,
            "Kaldığı yerden devam.", null, true),
        new("WordListItems", "Word/Context", VeriSinifi.Davranis,
            "Kişisel kelime listesi.", null, true),
        new("QuizResults", "*", VeriSinifi.Davranis,
            "İlerleme takibi ve grup raporu.", null, true),
        new("Feedbacks", "Message", VeriSinifi.BelirsizIcerik,
            "Ürün geri bildirimi.", null, true),

        new("SifreSifirlamaJetonlari", "JetonHash", VeriSinifi.Sir,
            "Hesap kurtarma.", 7, DisaAktarilir: false),
    };

    /// <summary>Dışa aktarmaya giren kalemler — sırlar HARİÇ.</summary>
    public static IEnumerable<KisiselVeriKalemi> DisaAktarilanlar()
        => Kalemler.Where(k => k.DisaAktarilir && k.Sinif != VeriSinifi.Sir);
}
```

### 2. `OcrRecords` saklama süresi — `SaklamaTemizligiServisi`'ne ekle

```csharp
/// <summary>
/// KURAL-19: OCR metinleri kullanıcının taradığı HAM İÇERİKTİR ve ne
/// olduğunu sistem bilmez. KURAL-12 kullanıcıya silme ucu verdi ama
/// otomatik süre koymadı — "belirsiz içeriği süresiz sakla" savunulamaz.
/// </summary>
public static readonly TimeSpan OcrKaydi = TimeSpan.FromDays(365);
```

```csharp
// TemizleAsync içine:
var ocrEsigi = simdi - OcrKaydi;
var silinenOcr = await db.OcrRecords
    .Where(r => r.ScannedAt < ocrEsigi)
    .ExecuteDeleteAsync(durdurma);
```

> `OcrRecords.ScannedAt` üzerine indeks gerekir — KURAL-12'nin dersi:
> indekssiz `ExecuteDelete`, temizliğin kendisini bir kesinti sebebine çevirir.

### 3. Veri sahibi hakları — `Controllers/VerimController.cs` (YENİ)

```csharp
[Authorize]
[ApiController]
[Route("api/verim")]
public class VerimController : ControllerBase
{
    // GET /api/verim/disa-aktar
    //
    // KURAL-19: kullanıcı kendi verisinin TAMAMINI alabilmeli.
    // Envanterden üretilir — yeni bir alan eklenip envantere yazılınca
    // dışa aktarma da kendiliğinden kapsar.
    [HttpGet("disa-aktar")]
    [EnableRateLimiting(HizSinirlari.Yazma)]   // pahalı sorgu, dar kota
    public async Task<IActionResult> DisaAktar() { … }

    // POST /api/verim/hesabimi-sil
    //
    // 🔴 GERİ ALINAMAZ. Şifre yeniden istenir: token çalınmışsa bile
    // saldırgan hesabı silememeli.
    [HttpPost("hesabimi-sil")]
    [EnableRateLimiting(HizSinirlari.KimlikDogrulama)]
    public async Task<IActionResult> HesabimiSil([FromBody] HesapSilmeIstegi req)
    {
        var kullanici = await _db.Users.FindAsync(this.KullaniciId());
        if (kullanici is null) return NotFound();

        if (!SifreHashleme.Dogrula(req.Sifre, kullanici.PasswordHash))
            return Unauthorized(new { error = "Şifre hatalı." });

        // KURAL-12: grup sahibi silinemez — aynı kısıt burada da geçerli.
        var sahipOldugu = await _db.Groups
            .Where(g => g.AdminUserId == kullanici.Id)
            .Select(g => new { g.Id, g.Name }).ToListAsync();

        if (sahipOldugu.Count > 0)
            return BadRequest(new
            {
                error = $"{sahipOldugu.Count} grubun yöneticisisiniz. " +
                        "Hesabınızı silmeden önce grupları devredin veya silin.",
                gruplar = sahipOldugu
            });

        _db.Users.Remove(kullanici);          // cascade: KURAL-12'de açıkça tanımlı
        await _db.SaveChangesAsync();
        _iptalDeposu.KullaniciTumTokenlariniIptalEt(kullanici.Id);

        _logger.LogInformation("Hesap kullanıcı talebiyle silindi. KullaniciId={Id}", kullanici.Id);
        return Ok(new { success = true });
    }
}
```

---

## Otomatik kapı

### A) Testler — `KisiselVeriTests.cs`

```csharp
/// <summary>
/// SÖZLEŞME: kişisel veri taşıyan HER kolon envanterde kayıtlı olmalı.
/// Yeni bir alan eklenip envantere yazılmazsa bu test kırılır — yani
/// envanter, dokümandaki gibi sessizce eskiyemez.
/// </summary>
[Fact] [Trait("Category", "KisiselVeri")]
public void Kisisel_veri_tasiyan_her_kolon_ENVANTERDE()
{
    // Model taraması: User/OcrRecord/UserActivityLog/… tiplerindeki
    // string ve DateTime alanları envanterle karşılaştırılır.
    // Envanterde olmayan bir alan → ihlal (adıyla raporlanır).
}

/// <summary>Sırlar dışa aktarmaya GİRMEZ.</summary>
[Fact] [Trait("Category", "KisiselVeri")]
public void Sirlar_disa_aktarmaya_GIRMEZ()
{
    KisiselVeriEnvanteri.DisaAktarilanlar()
        .Should().NotContain(k => k.Sinif == VeriSinifi.Sir);
}

[Fact] [Trait("Category", "KisiselVeri")]
public async Task Disa_aktarma_sifre_hashini_ICERMEZ()
{
    var client = _fabrika.CreateClient();
    var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
    client.TokenIle(o.Token);

    var govde = await client.GetStringAsync("/api/verim/disa-aktar");

    govde.Should().NotContain("PasswordHash");
    govde.Should().NotContain("$2a$", "BCrypt hash'i dışa aktarmada görünemez");
    govde.Should().NotContain("JetonHash");
}

[Fact] [Trait("Category", "KisiselVeri")]
public async Task Disa_aktarma_BASKASININ_verisini_icermez()
{
    // İki kullanıcı, ikisi de kelime ekler; A'nın dışa aktarması
    // B'nin kelimesini İÇERMEMELİ (IDOR).
}

/// <summary>Şifre olmadan hesap silinemez — çalınan token yetmemeli.</summary>
[Fact] [Trait("Category", "KisiselVeri")]
public async Task Hesap_silme_SIFRE_ister()
{
    var client = _fabrika.CreateClient();
    var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
    client.TokenIle(o.Token);

    var yanit = await client.PostAsJsonAsync("/api/verim/hesabimi-sil",
        new { sifre = "YanlisSifre123!" });

    yanit.StatusCode.Should().Be(HttpStatusCode.Unauthorized);

    using var kapsam = _fabrika.Services.CreateScope();
    (await kapsam.ServiceProvider.GetRequiredService<AppDbContext>()
        .Users.AnyAsync(u => u.Id == o.UserId)).Should().BeTrue("hesap silinmemeli");
}

[Fact] [Trait("Category", "KisiselVeri")]
public async Task Hesap_silinince_tum_kisisel_veri_GIDER()
{
    // kelime + ilerleme + OCR ekle → hesabı sil → hiçbiri kalmamalı
}

/// <summary>OCR kayıtları süresiz saklanamaz.</summary>
[Fact] [Trait("Category", "KisiselVeri")]
public async Task Saklama_temizligi_eski_OCR_kaydini_siler()
{
    // 400 günlük ve 1 günlük iki kayıt → temizlik → eski gider, yeni kalır
}
```

### B) Guard script — `scripts/guard/19-kisisel-veri.sh`

```bash
#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
echo "[19] Kişisel veri yaşam döngüsü"

# 1. Envanter dosyası duruyor mu?
n=0; [ -f EnglishReadingPlatform/Data/KisiselVeriEnvanteri.cs ] || n=1
ihlal_bildir "kişisel veri envanteri mevcut" "$n" "KisiselVeriEnvanteri.cs yok"

# 2. OcrRecords saklama süresi tanımlı mı?
n=0
grep -q 'OcrKaydi' EnglishReadingPlatform/Data/SaklamaTemizligiServisi.cs || n=1
ihlal_bildir "OCR saklama süresi tanımlı" "$n" \
  "belirsiz içerikli kullanıcı metni süresiz saklanıyor"

# 3. Temizlik OCR'ı GERÇEKTEN siliyor mu? (sabit tanımlayıp kullanmamak tipik hata)
n=0
grep -q 'OcrRecords' EnglishReadingPlatform/Data/SaklamaTemizligiServisi.cs || n=1
ihlal_bildir "OCR temizliği uygulanıyor" "$n" "sabit var ama ExecuteDelete yok"

# 4. Veri sahibi hakları uçları var mı?
eksik=""
for uc in "disa-aktar" "hesabimi-sil"; do
  grep -rq "\"$uc\"" EnglishReadingPlatform/Controllers/ || eksik="${eksik}${uc}"$'\n'
done
n=$(printf '%s' "$eksik" | grep -c . || true)
ihlal_bildir "veri sahibi hakları uçları" "$n" "$eksik"

# 5. Hesap silme şifre istiyor mu?
n=0
grep -v '^[[:space:]]*//' EnglishReadingPlatform/Controllers/VerimController.cs 2>/dev/null \
  | grep -q 'SifreHashleme.Dogrula' || n=1
ihlal_bildir "hesap silme şifre istiyor" "$n" \
  "çalınmış token tek başına hesabı silebilir"

# 6. Kişisel veri dosyası depoda mı? (KURAL-12'nin kardeş kontrolü)
cikti="$(git ls-files | grep -E '\.(db|sqlite|sqlite3|dump|bak)$' || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "kişisel veri dosyası repoda" "$n" "$cikti"

# 7. Yasal metinlere bağlantı var mı? (istemci tarafı)
n=0
grep -rq "gizlilik\|aydinlatma\|privacy" frontend/app --include="*.tsx" 2>/dev/null || n=1
ihlal_bildir "gizlilik metnine bağlantı" "$n" \
  "kayıt/ayarlar ekranında aydınlatma metni bağlantısı yok"

guard_bitir
```

---

## Bitti kriteri

```bash
# 1) Testler — BEKLENEN: Başarısız: 0, Başarılı: 7
dotnet test Linguza.sln --filter "Category=KisiselVeri" --logger "console;verbosity=normal"

# 2) Guard — BEKLENEN: TOPLAM İHLAL: 0
bash scripts/guard/19-kisisel-veri.sh; echo "çıkış kodu: $?"

# 3) Dışa aktarma sır içermiyor (canlı kontrol)
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:5001/api/verim/disa-aktar \
  | grep -c '\$2a\$\|PasswordHash\|JetonHash' || echo 0      # BEKLENEN: 0

# 4) Depoda kişisel veri dosyası — BEKLENEN: 0
git ls-files | grep -cE '\.(db|sqlite|sqlite3|dump|bak)$' || echo 0

# 5) Diskteki kopyalar (bilgi amaçlı — karar insanın)
ls -la *.dump *.sql EnglishReadingPlatform/*.db 2>/dev/null || echo "temiz"

# 6) Saklama süreleri tek kaynakta
grep -n "public static readonly TimeSpan" EnglishReadingPlatform/Data/SaklamaTemizligiServisi.cs

# 7) TÜM kapılar — BEKLENEN: TOPLAM İHLAL: 0  (19 kapı)
bash scripts/guard/run-all.sh; echo "çıkış kodu: $?"

# 8) TÜM testler
dotnet test Linguza.sln --logger "console;verbosity=normal"
```

---

## Mutasyon kontrolü (zorunlu)

```bash
# MUTASYON A — sırrı dışa aktarmaya sok
#   PasswordHash kaleminde DisaAktarilir: false → true
#   BEKLENEN: Sirlar_disa_aktarmaya_GIRMEZ + Disa_aktarma_sifre_hashini_ICERMEZ KIRMIZI

# MUTASYON B — hesap silmeden şifre kontrolünü kaldır
#   if (!SifreHashleme.Dogrula(...)) → if (false)
#   BEKLENEN: Hesap_silme_SIFRE_ister KIRMIZI + guard 5 KIRMIZI

# MUTASYON C — OCR sabitini tanımla ama KULLANMA (tipik yarım iş)
python3 - <<'PY'
yol = "EnglishReadingPlatform/Data/SaklamaTemizligiServisi.cs"
k = open(yol, encoding="utf-8").read()
import re
k = re.sub(r'var silinenOcr = await db\.OcrRecords[\s\S]*?ExecuteDeleteAsync\(durdurma\);',
           'var silinenOcr = 0;   // MUTASYON C', k)
open(yol, "w", encoding="utf-8").write(k)
PY
grep -c "MUTASYON C" EnglishReadingPlatform/Data/SaklamaTemizligiServisi.cs   # BEKLENEN: 1
dotnet test Linguza.sln --filter "FullyQualifiedName~eski_OCR_kaydini_siler"
# BEKLENEN: Başarısız: 1
bash scripts/guard/19-kisisel-veri.sh; echo "çıkış: $?"      # BEKLENEN: 1
#   ← "Sabiti tanımladım, iş bitti" yanılgısını yakalar
git checkout EnglishReadingPlatform/Data/SaklamaTemizligiServisi.cs

# MUTASYON D — dışa aktarmayı kullanıcı filtresi olmadan yaz
#   Where(x => x.UserId == kullaniciId) kaldır
#   BEKLENEN: Disa_aktarma_BASKASININ_verisini_icermez KIRMIZI
#   ← Dışa aktarmanın en tehlikeli hatası: TOPLU veri sızıntısı
```

---

## Geçiş planı

| Adım | İş | Nokta | Doğrulama |
|---|---|---|---|
| 1 | 🔴 **Yedek al** | — | `ls -la yedek-*.sql` |
| 2 | `Data/KisiselVeriEnvanteri.cs` | 1 | derlenir |
| 3 | `OcrRecords.ScannedAt` indeksi + migration | 1 | SQL incele |
| 4 | `SaklamaTemizligiServisi`'ne OCR süresi **ve silme** | 2 | guard 2,3 → 0 |
| 5 | `VerimController` — dışa aktarma | 1 | test yeşil |
| 6 | `VerimController` — hesap silme (şifre + grup kısıtı) | 1 | test yeşil |
| 7 | `api.ts` + ayarlar ekranı (indir / hesabı sil) | 2 | tsc 0 hata |
| 8 | Kayıt ekranına aydınlatma metni onayı | 1 | guard 7 → 0 |
| 9 | `KisiselVeriTests.cs` | — | 7 test yeşil |
| 10 | `scripts/guard/19-kisisel-veri.sh` + `chmod +x` | — | çıkış kodu 0 |
| 11 | 🧍 Diskteki 5 veri kopyasına karar ver | — | insan |
| 12 | 🧍 Git geçmişi temizliği kararı | — | insan |
| 13 | `docs/02-VERITABANI.md` envanter bölümü | — | — |
| 14 | **İlerleme tablosunu tamamla — 7/7 ✅** | — | — |

### Adım 11 — diskteki kopyalar 🧍

```bash
ls -la englishreadingdb_backup.dump local_db_safe_backup.dump \
       neon_backup_live.dump neon_dump.sql \
       EnglishReadingPlatform/englishplatform.db
```

~5,9 MB kişisel veri. Depoda değiller ama **iCloud ile eşitlenen bir klasördeler**.
Gerekmiyorlarsa sil. Gerekiyorsa depo dışına, şifreli bir yere taşı.

```bash
sqlite3 EnglishReadingPlatform/englishplatform.db "SELECT Id, Username, Email, Role FROM Users;"
```

Hepsi test verisiyse dosyayı sil. **Gerçek bir e-posta varsa adım 12 zorunlu hâle gelir.**

### Adım 12 — git geçmişi 🧍

```bash
git bundle create ../linguza-tam-yedek-$(date +%s).bundle --all    # ÖNCE tam yedek
git filter-repo --path EnglishReadingPlatform/englishplatform.db --invert-paths --force
git log --all --oneline -- EnglishReadingPlatform/englishplatform.db   # BOŞ olmalı
```

> Bu işlem **geri alınamaz** ve bütün commit hash'lerini değiştirir.
> Repoyu klonlamış herkes yeniden klonlamalıdır.

---

## Tuzaklar

| Tuzak | Neden olur | Nasıl kaçınılır |
|---|---|---|
| **Dışa aktarmayı `Include` ile yazmak** | Navigasyon özellikleri `User`'a döner, `PasswordHash` sızar (KURAL-08'in kapattığı hata) | Envanterden üretilen projeksiyon; test `$2a$` arıyor |
| **Kullanıcı filtresini unutmak** | Dışa aktarma bütün veritabanını döker — mümkün olan en büyük sızıntı | MUTASYON D ölçüyor |
| **Hesap silmeyi yalnızca token'la yapmak** | Çalınmış token kalıcı veri kaybına yol açar | Şifre zorunlu; MUTASYON B ölçüyor |
| **Sabiti tanımlayıp silmeyi yazmamak** | Kural "yapıldı" görünür, hiçbir satır silinmez | MUTASYON C tam olarak bunu ölçüyor |
| **`ScannedAt` indeksi olmadan `ExecuteDelete`** | Tam tablo taraması; temizlik kesinti sebebi olur (KURAL-12 dersi) | Adım 3 |
| **Grup sahibi kontrolünü atlamak** | `Groups.AdminUserId` → `RESTRICT` (KURAL-12); silme 500 verir | Aynı kontrol burada da var |
| **Yedek almadan geçmiş temizliği** | Geri alınamaz | `git bundle create --all` |
| **Aydınlatma metnini kod sanmak** | Metin hukuki; kod yalnızca ona bağlanır | Adım 8 yalnızca bağlantı + onay kutusu |
| **`OcrRecords` süresini kısa tutmak** | Kullanıcı taradığı ders notunu kaybeder | 365 gün varsayılan; kullanıcı kararı 00 madde 5 |

---

## Teslim şablonu

```markdown
## 1. Kanıtlanarak kapandı
<8 bitti-kriteri çıktısı> · <MUTASYON A, B, C, D>
<dışa aktarma örneği: sır içermediğinin kanıtı>
<hesap silme: veri gerçekten gitti — tablo tablo sayım>

## 2. Kapanmadı
- Aydınlatma metni ve gizlilik politikası METNİ yazılmadı (hukuki)
- <git geçmişi temizliği yapıldı mı?>
- <diskteki 5 kopya ne oldu?>

## 3. İnsan müdahalesi gerekiyor
- [ ] Aydınlatma metni / gizlilik politikası hazır mı?
- [ ] `OcrRecords` saklama süresi 365 gün kabul mü?
- [ ] Diskteki veri kopyaları silindi/taşındı mı?
- [ ] `englishplatform.db` içeriği doğrulandı mı, geçmiş temizlensin mi?
- [ ] Veri sorumlusu / irtibat kişisi kim? (KVKK başvurusu buraya gelir)

---

## 🏁 FAZ 2 — 7/7 TAMAMLANDI
<00-BASLA-BURADAN.md ilerleme tablosunun tamamının ✅ olduğu çıktı>
<bash scripts/guard/run-all.sh — 19 kapı, TOPLAM İHLAL: 0>
<dotnet test Linguza.sln — Başarısız: 0, toplam test sayısı>
```
