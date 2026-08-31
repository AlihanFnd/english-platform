# KURAL-08 — Veri minimizasyonu: yanıt yalnızca gerekeni taşır

> **Ön koşul:** KURAL-01 ve KURAL-03 tamamlanmış olmalı.
> KURAL-03 *"kim erişebilir"* sorusunu kapattı; bu kural *"eriştiğinde ne görür"* sorusunu kapatıyor.

---

## Kural metni

> **Hiçbir uç, isteyenin ihtiyacından fazlasını döndürmeyecek.**
> Entity nesneleri istemciye doğrudan serileştirilmeyecek; her yanıt açıkça tanımlanmış
> bir yanıt DTO'sundan üretilecek. Bir kullanıcının başkasına ait verisi, yalnızca
> paylaşılan bağlamın (grup, atanmış kitap) sınırları içinde görünecek. Yetki sınırı,
> `[Authorize]` özniteliğinde **ve** sorgu filtresinde birlikte bulunacak.

---

## Envanter

Ölçüm tarihi: **2026-08-20**, commit `d2cfc0f`.

### İhlal 1 — Grup detayı, üyelerin TÜM okuma geçmişini sızdırıyor 🔴

`Controllers/AppControllers.cs` → `GroupsController.GetGroupDetails`:

```csharp
var memberIds = group.Members.Select(m => m.UserId).ToList();

var progresses = await _db.ReadingProgresses
    .Where(p => memberIds.Contains(p.UserId))        // ← gruba atanmış kitap filtresi YOK
    .Include(p => p.Book).Include(p => p.User).ToListAsync();

var quizResults = await _db.QuizResults
    .Where(r => memberIds.Contains(r.UserId))        // ← aynı sorun
    .Include(r => r.User).Include(r => r.Quiz).ThenInclude(q => q.Book).ToListAsync();
```

Üyelik kontrolü doğru (`isMember` değilse `Forbid()`) ✅, ama dönen veri fazla:
**gruba katılan herkes, diğer üyelerin gruptan bağımsız kişisel okuma geçmişini görüyor.**
Davet kodu ele geçiren biri (KURAL-07 öncesinde sınırsız denenebiliyordu) gruba katılıp
tüm sınıfın verisini toplayabilir.

### İhlal 2 — Davet kodu her üyeye dönüyor 🟠

Aynı dosyada, hem `Index` hem `GetGroupDetails` yanıtında:

```csharp
MyGroups = myGroups.Select(g => new { g.Id, g.Name, g.Description, g.InviteCode, ... })
```

Sıradan bir üye de davet kodunu görüyor ve dağıtabiliyor. Grup sahibinin kontrolü yok.

### İhlal 3 — Entity doğrudan serileştiriliyor: 5 nokta

```
$ grep -rn "return Ok(group)\|return Ok(record)\|return Ok(words)\|return Ok(records)\|success = true, book" EnglishReadingPlatform/Controllers/
BooksController.cs:256:      return Ok(words);                          → WordListItem[] (User navigasyonu dahil)
AppControllers.cs:108:       return Ok(group);                          → Group (AdminUserId, InviteCode dahil)
AppControllers.cs:406:       return Ok(records);                        → OcrRecord[] (User dahil)
AppControllers.cs:433:       return Ok(record);                         → OcrRecord
AdminController.cs:365:      return Ok(new { success = true, book });   → Book entity
```

Bugün `User` navigasyonu `null` geldiği için (`Include` yok) `PasswordHash` sızmıyor.
Ancak biri ileride `Include(w => w.User)` eklerse **şifre hash'i sessizce yanıta girer.**
Bu, tasarımdan gelen bir risktir — DTO kullanılsa imkânsız olurdu.

### İhlal 4 — `Include` ile aşırı çekim: 27 nokta

```
$ grep -rn "\.Include(" EnglishReadingPlatform/Controllers/ | wc -l
      27
```

Her `Include` bir gereklilik değil; yalnızca birkaç alan lazımken tüm entity graf'ı
belleğe çekiliyor ve serileştirme riski oluşuyor.

### Sahiplik filtresi durumu — genel olarak DOĞRU ✅

```
$ grep -rn "UserId == \|== CurrentUserId" EnglishReadingPlatform/Controllers/ | wc -l
      18
```

Kelime listesi, okuma ilerlemesi, OCR kayıtları ve dashboard sorguları `CurrentUserId`
ile filtreleniyor. Bu kural onları **bozmadan** DTO'ya taşıyor.

### Özet

| # | İhlal | Nokta |
|---|---|---|
| 1 | Grup verisi kapsam dışı | 2 sorgu |
| 2 | Davet kodu her üyeye | 3 yanıt alanı |
| 3 | Entity doğrudan serileştirme | 5 |
| 4 | Aşırı `Include` | 27 (incelenecek) |
| | **Taşınacak yanıt noktası** | **~20** |

---

## Merkezî uygulama

### 1. Yanıt DTO'ları — `Contracts/Yanitlar.cs`

Tüm yanıt biçimleri **tek dosyada**, `record` olarak. Entity'ye asla doğrudan bağlı değil.

```csharp
namespace EnglishReadingPlatform.Contracts;

// ─── Kullanıcı ────────────────────────────────────────────────
/// <summary>Kullanıcının kendisi hakkındaki bilgi. PasswordHash BULUNMAZ.</summary>
public record KullaniciYaniti(int Id, string Username, string Email, string Role);

/// <summary>Başkasına gösterilen kullanıcı. E-posta BULUNMAZ.</summary>
public record UyeYaniti(int UserId, string Username, string Role);

// ─── Kelime ───────────────────────────────────────────────────
public record KelimeYaniti(int Id, string Word, string Translation, string Context, DateTime AddedAt);

// ─── OCR ──────────────────────────────────────────────────────
public record OcrYaniti(int Id, string ExtractedText, DateTime ScannedAt);
// ImagePath BULUNMAZ — her zaman boş, sunucu yolu sızdırma riski taşır

// ─── Grup ─────────────────────────────────────────────────────
/// <summary>Liste görünümü. InviteCode YALNIZCA grup sahibine doldurulur.</summary>
public record GrupOzetYaniti(
    int Id, string Name, string Description,
    string? InviteCode,               // null = bu kullanıcı görmeye yetkili değil
    int MembersCount,
    IReadOnlyList<AtananKitapYaniti> Assignments);

public record AtananKitapYaniti(int BookId, string Title);

public record GrupIlerlemeYaniti(
    int UserId, string Username, string BookTitle,
    float ProgressPercent, int CurrentChapter, DateTime LastRead);

public record GrupQuizYaniti(
    string Username, string BookTitle, string QuizTitle,
    int Score, int TotalQuestions, DateTime TakenAt);

public record GrupDetayYaniti(
    GrupOzetYaniti Group,
    IReadOnlyList<UyeYaniti> Members,
    IReadOnlyList<AtananKitapYaniti> AllBooks,
    IReadOnlyList<GrupIlerlemeYaniti> Progresses,
    IReadOnlyList<GrupQuizYaniti> QuizResults);

// ─── Kitap ────────────────────────────────────────────────────
public record KitapYaniti(
    int Id, string Title, string Author, string CoverColor, string Description,
    string Level, string Category, int ChaptersCount, int PagesCount,
    float Progress, int CurrentChapter);
```

> `KitapYaniti.PagesCount` **yeni bir alandır** — `docs/06-ADMIN-PANEL.md`'de belgelenen
> "sayfa modundaki kitaplar panelde boş görünüyor" sorununu çözer.

### 2. Kapsam filtresi — `Authorization/GrupKapsami.cs`

Grup verisinin **hangi sınırlar içinde** görüneceğini tek yerde tanımlar.

```csharp
using EnglishReadingPlatform.Models;

namespace EnglishReadingPlatform.Authorization;

/// <summary>
/// KURAL-08: Grup bağlamında hangi verinin görünür olduğunu belirleyen TEK kaynak.
///
/// KARAR (varsayılan): Yalnızca gruba ATANMIŞ kitaplara ait ilerleme ve quiz
/// sonuçları görünür. Üyenin kişisel okumaları gizli kalır.
/// Kullanıcı farklı bir seçenek belirtirse (00-BASLA-BURADAN.md madde 6) burası değişir.
/// </summary>
public static class GrupKapsami
{
    /// <summary>Bu kullanıcı grubun sahibi mi? (davet kodunu görme yetkisi)</summary>
    public static bool SahipMi(Group grup, int kullaniciId) => grup.AdminUserId == kullaniciId;

    /// <summary>Bu kullanıcı grubu görüntüleyebilir mi?</summary>
    public static bool GorebilirMi(Group grup, int kullaniciId)
        => grup.AdminUserId == kullaniciId || grup.Members.Any(m => m.UserId == kullaniciId);

    /// <summary>Grup bağlamında görünür kitap kimlikleri — atanmış kitaplarla sınırlı.</summary>
    public static IReadOnlyList<int> GorunurKitapIdleri(Group grup)
        => grup.BookAssignments.Select(a => a.BookId).Distinct().ToList();

    /// <summary>Davet kodu yalnızca sahibe döner; diğerlerine null.</summary>
    public static string? DavetKodu(Group grup, int kullaniciId)
        => SahipMi(grup, kullaniciId) ? grup.InviteCode : null;
}
```

### 3. `GetGroupDetails` yeniden yazımı

```csharp
[HttpGet("{id}")]
public async Task<IActionResult> GetGroupDetails(int id)
{
    var kullaniciId = this.KullaniciId();          // KURAL-03 yardımcısı

    var grup = await _db.Groups
        .Include(g => g.Members).ThenInclude(m => m.User)
        .Include(g => g.BookAssignments).ThenInclude(a => a.Book)
        .FirstOrDefaultAsync(g => g.Id == id);

    if (grup == null) return NotFound(new { error = "Grup bulunamadı." });
    if (!GrupKapsami.GorebilirMi(grup, kullaniciId)) return Forbid();

    // ── KURAL-08: kapsam filtresi ──────────────────────────────
    var gorunurKitaplar = GrupKapsami.GorunurKitapIdleri(grup);
    var uyeIdleri = grup.Members.Select(m => m.UserId).ToList();

    var ilerlemeler = await _db.ReadingProgresses
        .Where(p => uyeIdleri.Contains(p.UserId)
                 && gorunurKitaplar.Contains(p.BookId))        // ← KAPSAM
        .Select(p => new GrupIlerlemeYaniti(
            p.UserId, p.User.Username, p.Book.Title,
            p.ProgressPercent, p.CurrentChapter, p.LastRead))
        .ToListAsync();

    var quizSonuclari = await _db.QuizResults
        .Where(r => uyeIdleri.Contains(r.UserId)
                 && gorunurKitaplar.Contains(r.Quiz.BookId))   // ← KAPSAM
        .Select(r => new GrupQuizYaniti(
            r.User.Username, r.Quiz.Book.Title, r.Quiz.Title,
            r.Score, r.TotalQuestions, r.TakenAt))
        .ToListAsync();

    var tumKitaplar = await _db.Books
        .Select(b => new AtananKitapYaniti(b.Id, b.Title))
        .ToListAsync();

    var ozet = new GrupOzetYaniti(
        grup.Id, grup.Name, grup.Description,
        GrupKapsami.DavetKodu(grup, kullaniciId),              // ← yalnızca sahibe
        grup.Members.Count,
        grup.BookAssignments.Select(a => new AtananKitapYaniti(a.BookId, a.Book.Title)).ToList());

    return Ok(new GrupDetayYaniti(
        ozet,
        grup.Members.Select(m => new UyeYaniti(m.UserId, m.User.Username, m.Role)).ToList(),
        tumKitaplar, ilerlemeler, quizSonuclari));
}
```

> **`.Select()` sunucu tarafında projeksiyon yapar** — `Include` + bellek içi dönüşüm
> yerine yalnızca gereken kolonlar SQL'e girer. Hem güvenlik hem performans kazancı.

### 4. Entity döndüren 5 noktayı DTO'ya taşı

```csharp
// BooksController.Words
return Ok(await _db.WordListItems
    .Where(w => w.UserId == this.KullaniciId())
    .OrderByDescending(w => w.AddedAt)
    .Select(w => new KelimeYaniti(w.Id, w.Word, w.Translation, w.Context, w.AddedAt))
    .ToListAsync());

// GroupsController.Create
return Ok(new GrupOzetYaniti(grup.Id, grup.Name, grup.Description,
    grup.InviteCode,                    // kurucu = sahip, kod gösterilir ✅
    1, Array.Empty<AtananKitapYaniti>()));

// DashboardController.OCR
return Ok(await _db.OcrRecords
    .Where(r => r.UserId == kullaniciId)
    .OrderByDescending(r => r.ScannedAt)
    .Select(r => new OcrYaniti(r.Id, r.ExtractedText, r.ScannedAt))
    .ToListAsync());

// DashboardController.SaveOcr
return Ok(new OcrYaniti(kayit.Id, kayit.ExtractedText, kayit.ScannedAt));

// AdminController.UpdateBook
return Ok(new { success = true, book = new KitapYaniti(
    kitap.Id, kitap.Title, kitap.Author, kitap.CoverColor, kitap.Description,
    kitap.Level, kitap.Category, 0, 0, 0f, 1) });
```

---

## Otomatik kapı

### A) Serileştirme sözleşmesi testi — `YanitSozlesmesiTests.cs`

```csharp
using System.Reflection;
using FluentAssertions;
using Xunit;

namespace EnglishReadingPlatform.Tests;

public class YanitSozlesmesiTests
{
    /// <summary>Hiçbir yanıtta bulunmaması gereken alan adları.</summary>
    private static readonly string[] YasakliAlanlar =
    {
        "PasswordHash", "passwordHash",
        "ImagePath", "imagePath",
        "SentencesJson"   // ham analiz JSON'u yalnızca okuma ucunda, DTO ile verilir
    };

    [Fact]
    [Trait("Category", "VeriMinimizasyonu")]
    public void Yanit_DTOlari_hassas_alan_tasimamali()
    {
        var assembly = typeof(Program).Assembly;
        var dtolar = assembly.GetTypes()
            .Where(t => t.Namespace == "EnglishReadingPlatform.Contracts");

        dtolar.Should().NotBeEmpty("Contracts ad alanında yanıt DTO'ları olmalı");

        var ihlaller = new List<string>();
        foreach (var dto in dtolar)
            foreach (var ozellik in dto.GetProperties())
                if (YasakliAlanlar.Contains(ozellik.Name))
                    ihlaller.Add($"{dto.Name}.{ozellik.Name}");

        ihlaller.Should().BeEmpty("hassas alan taşıyan DTO'lar: " + string.Join(", ", ihlaller));
    }

    [Fact]
    [Trait("Category", "VeriMinimizasyonu")]
    public void KullaniciYaniti_PasswordHash_icermemeli()
    {
        typeof(Contracts.KullaniciYaniti).GetProperties()
            .Select(p => p.Name)
            .Should().NotContain("PasswordHash");
    }

    [Fact]
    [Trait("Category", "VeriMinimizasyonu")]
    public void UyeYaniti_eposta_icermemeli()
    {
        // Başkasına gösterilen kullanıcı bilgisinde e-posta olmamalı.
        typeof(Contracts.UyeYaniti).GetProperties()
            .Select(p => p.Name.ToLowerInvariant())
            .Should().NotContain("email");
    }
}
```

### B) Davranış testleri — `VeriMinimizasyonuTests.cs`

```csharp
using System.Net.Http.Json;
using EnglishReadingPlatform.Tests.Infrastructure;
using FluentAssertions;
using Xunit;

namespace EnglishReadingPlatform.Tests;

[Collection("api")]
public class VeriMinimizasyonuTests
{
    private readonly TestAppFactory _fabrika;
    public VeriMinimizasyonuTests(TestAppFactory fabrika) => _fabrika = fabrika;

    [Fact]
    [Trait("Category", "VeriMinimizasyonu")]
    public async Task Grup_detayi_atanmamis_kitap_ilerlemesini_GOSTERMEZ()
    {
        // ANA REGRESYON TESTİ.
        var sahipClient = _fabrika.CreateClient();
        var sahip = await AuthHelper.OgrenciOlarakGirisYapAsync(sahipClient);
        sahipClient.TokenIle(sahip.Token);

        // Grup kur
        var grupYanit = await sahipClient.PostAsJsonAsync("/api/groups",
            new { name = "Test Sınıfı", description = "" });
        var grup = await grupYanit.Content.ReadFromJsonAsync<GrupOzetDto>();

        // Üye katılsın
        var uyeClient = _fabrika.CreateClient();
        var uye = await AuthHelper.OgrenciOlarakGirisYapAsync(uyeClient);
        uyeClient.TokenIle(uye.Token);
        await uyeClient.PostAsJsonAsync("/api/groups/join", new { inviteCode = grup!.InviteCode });

        // Üye, gruba ATANMAMIŞ bir kitabı okusun (seed kitap 3)
        await uyeClient.GetAsync("/api/books/3/read?chapter=1");

        // Gruba yalnızca kitap 1 atansın
        await sahipClient.PostAsJsonAsync("/api/groups/assignbook",
            new { groupId = grup.Id, bookId = 1 });

        // Sahip grup detayını görüntülesin
        var detay = await sahipClient.GetStringAsync($"/api/groups/{grup.Id}");

        detay.Should().NotContain("The Old Man and the Sea",
            "gruba atanmamış kitabın okuma verisi görünmemeli");
    }

    [Fact]
    [Trait("Category", "VeriMinimizasyonu")]
    public async Task Davet_kodu_yalnizca_grup_sahibine_doner()
    {
        var sahipClient = _fabrika.CreateClient();
        var sahip = await AuthHelper.OgrenciOlarakGirisYapAsync(sahipClient);
        sahipClient.TokenIle(sahip.Token);

        var grupYanit = await sahipClient.PostAsJsonAsync("/api/groups",
            new { name = "Kod Testi", description = "" });
        var grup = await grupYanit.Content.ReadFromJsonAsync<GrupOzetDto>();
        grup!.InviteCode.Should().NotBeNullOrEmpty("sahip kodu görmeli");

        var uyeClient = _fabrika.CreateClient();
        var uye = await AuthHelper.OgrenciOlarakGirisYapAsync(uyeClient);
        uyeClient.TokenIle(uye.Token);
        await uyeClient.PostAsJsonAsync("/api/groups/join", new { inviteCode = grup.InviteCode });

        var uyeGorunum = await uyeClient.GetStringAsync($"/api/groups/{grup.Id}");

        uyeGorunum.Should().NotContain(grup.InviteCode!,
            "sıradan üye davet kodunu görmemeli");
    }

    [Fact]
    [Trait("Category", "VeriMinimizasyonu")]
    public async Task Hicbir_yanit_PasswordHash_icermez()
    {
        var client = _fabrika.CreateClient();
        var admin = await AuthHelper.AdminOlarakGirisYapAsync(client);
        client.TokenIle(admin.Token);

        string[] yollar =
        {
            "/api/auth/me", "/api/books", "/api/books/words", "/api/groups",
            "/api/dashboard/stats", "/api/dashboard/ocr",
            "/api/admin/users", "/api/admin/books", "/api/admin/groups",
            "/api/feedback/list", "/api/activity/stats"
        };

        foreach (var yol in yollar)
        {
            var yanit = await client.GetAsync(yol);
            if (!yanit.IsSuccessStatusCode) continue;
            var govde = await yanit.Content.ReadAsStringAsync();

            govde.Should().NotContain("asswordHash", $"{yol} şifre hash'i sızdırıyor");
            govde.Should().NotContain("$2a$", $"{yol} BCrypt hash'i sızdırıyor");
            govde.Should().NotContain("$2b$", $"{yol} BCrypt hash'i sızdırıyor");
        }
    }

    [Fact]
    [Trait("Category", "VeriMinimizasyonu")]
    public async Task Kelime_listesi_baskasinin_kelimesini_dondurmez()
    {
        var aClient = _fabrika.CreateClient();
        var a = await AuthHelper.OgrenciOlarakGirisYapAsync(aClient);
        aClient.TokenIle(a.Token);
        await aClient.PostAsJsonAsync("/api/books/addword",
            new { word = "gizlikelime", translation = "x", context = "" });

        var bClient = _fabrika.CreateClient();
        var b = await AuthHelper.OgrenciOlarakGirisYapAsync(bClient);
        bClient.TokenIle(b.Token);

        var bListesi = await bClient.GetStringAsync("/api/books/words");
        bListesi.Should().NotContain("gizlikelime");
    }

    private record GrupOzetDto(int Id, string Name, string Description,
                               string? InviteCode, int MembersCount, object[] Assignments);
}
```

### C) Guard script — `scripts/guard/08-veri-minimizasyonu.sh`

```bash
#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
echo "[08] Veri minimizasyonu"

# 1. Entity doğrudan döndürülüyor mu?
cikti="$(kodda_ara 'return Ok\((group|record|records|words|book|user|item)\);' 'EnglishReadingPlatform/Controllers/*.cs')"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "entity doğrudan döndürülüyor" "$n" "$cikti"

# 2. Contracts ad alanı var mı?
n=0; [ -f "EnglishReadingPlatform/Contracts/Yanitlar.cs" ] || n=1
ihlal_bildir "yanıt DTO dosyası mevcut" "$n" "Contracts/Yanitlar.cs yok"

# 3. GrupKapsami kullanılıyor mu?
n=0
grep -q "GrupKapsami.GorunurKitapIdleri" EnglishReadingPlatform/Controllers/AppControllers.cs || n=1
ihlal_bildir "grup kapsam filtresi uygulanıyor" "$n" "GetGroupDetails kapsam filtresi kullanmıyor"

# 4. Davet kodu koşulsuz dönüyor mu?
cikti="$(grep -n 'g\.InviteCode' EnglishReadingPlatform/Controllers/AppControllers.cs | grep -v 'GrupKapsami.DavetKodu' || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "davet kodu koşulsuz dönüyor" "$n" "$cikti"

# 5. Entity tipi yanıt imzasında geçiyor mu?
cikti="$(kodda_ara 'Task<ActionResult<(User|Book|Group|WordListItem|OcrRecord)>>' 'EnglishReadingPlatform/Controllers/*.cs')"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "entity tipi yanıt imzasında" "$n" "$cikti"

guard_bitir
```

---

## Bitti kriteri

```bash
cd /Users/alihanfindikci/Desktop/ingilizceproje
docker compose up -d postgres

# 1) Testler — BEKLENEN: Başarısız: 0, Başarılı: 7
dotnet test Linguza.sln --filter "Category=VeriMinimizasyonu" --logger "console;verbosity=normal"
echo "çıkış kodu: $?"

# 2) Guard kapısı — BEKLENEN: TOPLAM İHLAL: 0
bash scripts/guard/08-veri-minimizasyonu.sh; echo "çıkış kodu: $?"

# 3) Entity doğrudan döndürme — BEKLENEN: 0
grep -rn "return Ok(group);\|return Ok(record);\|return Ok(records);\|return Ok(words);" \
  EnglishReadingPlatform/Controllers/ | wc -l

# 4) Yanıt DTO sayısı — BEKLENEN: ≥ 10
grep -c "public record" EnglishReadingPlatform/Contracts/Yanitlar.cs

# 5) Tüm kapılar
bash scripts/guard/run-all.sh; echo "çıkış kodu: $?"

# 6) Regresyon
dotnet test Linguza.sln
```

---

## Mutasyon kontrolü (zorunlu)

```bash
# MUTASYON A — grup kapsam filtresini kaldır (orijinal sızıntı)
python3 - <<'PY'
yol = "EnglishReadingPlatform/Controllers/AppControllers.cs"
k = open(yol, encoding="utf-8").read()
k = k.replace("&& gorunurKitaplar.Contains(p.BookId))", ")   // MUTASYON")
k = k.replace("&& gorunurKitaplar.Contains(r.Quiz.BookId))", ")   // MUTASYON")
open(yol, "w", encoding="utf-8").write(k)
PY

dotnet test Linguza.sln --filter "FullyQualifiedName~Grup_detayi_atanmamis_kitap"
# BEKLENEN: Başarısız: 1 — "The Old Man and the Sea" bulundu (KIRMIZI)
bash scripts/guard/08-veri-minimizasyonu.sh; echo "çıkış kodu: $?"   # BEKLENEN: 1

git checkout EnglishReadingPlatform/Controllers/AppControllers.cs
dotnet test Linguza.sln --filter "Category=VeriMinimizasyonu"        # BEKLENEN: Başarısız: 0
```

```bash
# MUTASYON B — davet kodunu herkese aç
sed -i '' 's|GrupKapsami.DavetKodu(grup, kullaniciId)|grup.InviteCode  /* MUTASYON */|' \
  EnglishReadingPlatform/Controllers/AppControllers.cs

dotnet test Linguza.sln --filter "FullyQualifiedName~Davet_kodu_yalnizca_grup_sahibine_doner"
# BEKLENEN: Başarısız: 1

git checkout EnglishReadingPlatform/Controllers/AppControllers.cs
```

```bash
# MUTASYON C — DTO'ya PasswordHash ekle
python3 - <<'PY'
yol = "EnglishReadingPlatform/Contracts/Yanitlar.cs"
k = open(yol, encoding="utf-8").read()
k = k.replace("public record KullaniciYaniti(int Id, string Username, string Email, string Role);",
              "public record KullaniciYaniti(int Id, string Username, string Email, string Role, string PasswordHash = \"\");")
open(yol, "w", encoding="utf-8").write(k)
PY

dotnet test Linguza.sln --filter "Category=VeriMinimizasyonu"
# BEKLENEN: Başarısız: ≥2 (Yanit_DTOlari_hassas_alan_tasimamali + KullaniciYaniti_PasswordHash_icermemeli)

git checkout EnglishReadingPlatform/Contracts/Yanitlar.cs
```

---

## Geçiş planı

| Adım | İş | Nokta | Doğrulama |
|---|---|---|---|
| 1 | `Contracts/Yanitlar.cs` yaz | — | derlenir |
| 2 | `Authorization/GrupKapsami.cs` yaz | — | derlenir |
| 3 | `YanitSozlesmesiTests.cs` yaz — **merkezî çözüm önce** | — | 3 test yeşil |
| 4 | `GetGroupDetails`'i yeniden yaz (kapsam + DTO) | 2 sorgu | ana test yeşil |
| 5 | `GroupsController.Index` → `GrupOzetYaniti`, davet kodu koşullu | 2 | guard kapı 4 → 0 |
| 6 | 5 entity döndürme noktasını DTO'ya taşı | 5 | guard kapı 1 → 0 |
| 7 | `BooksController.Index` → `KitapYaniti` (+ `PagesCount`) | 1 | frontend uyumu |
| 8 | 27 `Include` çağrısını gözden geçir, `.Select()` projeksiyonuna çevirilebilenleri çevir | ≤27 | derlenir |
| 9 | `VeriMinimizasyonuTests.cs` yaz | — | 4 test yeşil |
| 10 | `scripts/guard/08-veri-minimizasyonu.sh` + `chmod +x` | — | çıkış kodu 0 |
| 11 | **Frontend uyum kontrolü** (aşağı bak) | — | elle |
| 12 | İlerleme tablosunu güncelle | — | — |

### Adım 11 — frontend uyum kontrolü 🔴 **BU KURALIN EN RİSKLİ ADIMI**

Yanıt biçimleri değişiyor. Etkilenen frontend noktaları:

| Frontend | Değişen alan | Yapılacak |
|---|---|---|
| `frontend/app/api.ts` → `Group` arayüzü | `inviteCode: string` → `string \| null` | Tipi `string \| null` yap |
| `frontend/app/groups/page.tsx` | Davet kodu gösterimi | `inviteCode` null ise "Yalnızca grup yöneticisi görebilir" göster |
| `frontend/app/api.ts` → `GroupDetails` | `group.members` → üst seviyeye taşındı | Arayüzü `GrupDetayYaniti` şekline uyarla |
| `frontend/app/api.ts` → `Book` | `pagesCount` eklendi | Arayüze ekle (isteğe bağlı alan) |
| `admin-panel/app/books/page.tsx` | `pageCount` artık geliyor | Listede göster (`docs/06-ADMIN-PANEL.md` iyileştirme #7) |

```bash
./start-dev.sh
```

| Akış | Beklenen |
|---|---|
| Grup oluştur → davet kodu görünüyor mu? | ✅ Sahip olduğun için görünmeli |
| Başka hesapla katıl → kodu görüyor musun? | ❌ Görünmemeli, açıklama metni olmalı |
| Grup detayında üye ilerlemeleri | Yalnızca atanmış kitaplar |
| Kelime listesi | Değişmemeli |
| OCR geçmişi | Değişmemeli |
| Yönetici panelinde kitap listesi | Sayfa sayısı görünmeli |

---

## Tuzaklar

| Tuzak | Neden olur | Nasıl kaçınılır |
|---|---|---|
| **DTO'yu entity'den türetmek** | `record KelimeYaniti : WordListItem` yazılırsa tüm alanlar miras alınır, minimizasyon anlamsızlaşır | DTO'lar bağımsız `record`'lardır |
| **`Include` + bellek içi `Select`** | Tüm entity graf'ı belleğe gelir; DTO'ya dönüşse bile bellek ve sorgu maliyeti kalır | `.Select()`'i **`ToListAsync()`'den önce** yaz — projeksiyon SQL'e iner |
| **`Assignments` üzerinden kapsamı hesaplarken `Include` unutmak** | `grup.BookAssignments` boş gelir → `gorunurKitaplar` boş → **hiçbir ilerleme görünmez**, "düzelttim" sanılır | `.Include(g => g.BookAssignments)` şart; test bunu yakalar |
| **Davet kodunu `null` yapıp frontend'i güncellememek** | Arayüzde `undefined` görünür veya kopyala düğmesi boş kod kopyalar | Adım 11 zorunlu |
| **`Forbid()` yerine `NotFound()` dönmek** | 403 ile 404 arasında bilgi sızıntısı farkı vardır; ama var olmayan grup ile yetkisiz grup ayırt edilirse grup **varlığı** sızar | Mevcut davranış (`NotFound` sonra `Forbid`) grup varlığını sızdırıyor — düşük risk, raporla |
| **Testte seed kitap kimliğine güvenmek** | `bookId = 3` seed'e bağlı; KURAL-02 seed'i değiştirdi | Test kitabı **testin kendisi** oluşturmalı, ya da seed sabitleri tek yerden okunmalı |
| **`AllBooks` listesini de kapsamla sınırlamak** | Grup sahibinin kitap **atayabilmesi** için tüm kitapları görmesi gerekir | `AllBooks` kasten sınırsız — kitap başlıkları zaten herkese açık |
| **PII'yi DTO'dan çıkarıp loga bırakmak** | Yanıttan e-posta çıkarılır ama `_logger.LogInformation("... {Eposta}", user.Email)` kalır | KURAL-06'nın `GuvenliLog.Eposta` maskesi kullanılmalı |

---

## Teslim şablonu

```markdown
## 1. Kanıtlanarak kapandı
<6 bitti-kriteri komutunun ham çıktısı>
<MUTASYON A çıktısı — "The Old Man and the Sea" sızıntısının YAKALANDIĞI kanıtı>
<MUTASYON B ve C çıktıları>

## 2. Kapanmadı
- 27 Include çağrısının tamamı projeksiyona çevrilemedi (N tanesi kaldı, gerekçe: ...)
- NotFound/Forbid ayrımı grup varlığını sızdırıyor (düşük risk, ayrı iş)

## 3. İnsan müdahalesi gerekiyor
- [ ] Grup gizliliği kararı doğrulandı mı? (A/B/C — 00-BASLA-BURADAN.md madde 6)
      Varsayılan A uygulandı: yalnızca atanmış kitaplar görünüyor
- [ ] Frontend uyum kontrolü (geçiş planı adım 11) — 6 akışı elle dene
- [ ] Kullanıcılara bildirilecek: "davet kodunu artık yalnızca grup yöneticisi görebilir"

## Değiştirilen dosyalar
<git diff --stat>

## Commit
<git log -1 --format='%H %s'>
```
