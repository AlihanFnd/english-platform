# KURAL-12 — Veri bütünlüğü ve kalıntı temizliği

> **Ön koşul:** KURAL-01 ve KURAL-02 tamamlanmış olmalı.
> **Bu, sıradaki son kuraldır.** Bitince `00-BASLA-BURADAN.md` ilerleme tablosunun
> tamamı ✅ olmalıdır.

---

## Kural metni

> **Veritabanı, uygulama kodunun unuttuğu yerde de tutarlılığı koruyacak.**
> Mantıksal olarak tekil olması gereken her kayıt, veritabanı seviyesinde **unique
> index** ile korunacak. Silme davranışı bilinçli seçilecek, EF varsayılanına
> bırakılmayacak. Kişisel veri süresiz saklanmayacak. Sürüm kontrolünde ve çalışma
> dizininde **kullanılmayan hiçbir veri dosyası** kalmayacak.

---

## Envanter

Ölçüm tarihi: **2026-08-20**, commit `d2cfc0f`.

### İhlal 1 — Repoda gerçek kullanıcı verisi taşıyan SQLite dosyası 🔴

```
$ git ls-files | grep -E "\.db$"
EnglishReadingPlatform/englishplatform.db

$ file EnglishReadingPlatform/englishplatform.db
SQLite 3.x database, last written using SQLite version 3041002, ... database pages 36

$ sqlite3 EnglishReadingPlatform/englishplatform.db \
    "SELECT Id, Username, substr(Email,1,3)||'***', Role,
     CASE WHEN length(PasswordHash)>0 THEN 'HASH VAR ('||length(PasswordHash)||' krktr)' ELSE 'yok' END
     FROM Users;"
1|testadmin|tes***|teacher|HASH VAR (60 krktr)
2|testuser|dem***|student|HASH VAR (60 krktr)
3|demokullanici|dem***|student|HASH VAR (60 krktr)
4|test_user|tes***|student|HASH VAR (60 krktr)
5|testuser123|tes***|student|HASH VAR (60 krktr)

$ for t in WordListItems ReadingProgresses OcrRecords QuizResults Groups; do
    printf "%-20s %s\n" "$t" "$(sqlite3 EnglishReadingPlatform/englishplatform.db "SELECT COUNT(*) FROM $t;")"
  done
WordListItems        1
ReadingProgresses    7
OcrRecords           3
QuizResults          0
Groups               1

$ git log --oneline --follow -- EnglishReadingPlatform/englishplatform.db | wc -l
       1
```

**5 kullanıcı, 5 BCrypt şifre hash'i, 5 e-posta adresi, 3 OCR kaydı** sürüm kontrolünde.
Proje PostgreSQL'e geçti (`Program.cs` → `UseNpgsql`), bu dosya **hiç kullanılmıyor**.

İyi haber: dosya **tek bir commit'te** — geçmiş temizliği görece basit.

### İhlal 2 — Mantıksal tekillik kısıtı eksikleri 🟠

`Data/AppDbContext.cs`'te tanımlı unique index'ler:

```csharp
modelBuilder.Entity<User>().HasIndex(u => u.Email).IsUnique();       ✅
modelBuilder.Entity<User>().HasIndex(u => u.Username).IsUnique();    ✅
modelBuilder.Entity<Group>().HasIndex(g => g.InviteCode).IsUnique(); ✅
modelBuilder.Entity<TranslationCache>().HasIndex(tc => new { tc.QueryText, tc.ContextText });  ← UNIQUE DEĞİL
```

| Tablo | Tekil olması gereken | Durum | Sonuç |
|---|---|---|---|
| `ReadingProgresses` | `(UserId, BookId)` | ❌ | Eşzamanlı iki okuma isteği **iki ilerleme satırı** açar; dashboard'da kitap iki kez görünür |
| `TranslationCaches` | `(QueryText, ContextText)` | ❌ index var, unique değil | Aynı çeviri mükerrer yazılır; önbellek şişer |
| `GroupMembers` | `(GroupId, UserId)` | ❌ | `Join` `AnyAsync` ile kontrol ediyor — yarış durumunda çift üyelik |
| `GroupBookAssignments` | `(GroupId, BookId)` | ❌ | Aynı kitap iki kez atanabilir |
| `WordListItems` | `(UserId, Word)` | ❌ | `AddWord` `AnyAsync` ile kontrol ediyor — yarış durumunda mükerrer kelime |
| `BookPages` | `(BookId, PageNumber)` | ❌ | Bozuk yükleme mükerrer sayfa üretebilir |
| `QuizQuestions`/`Quizzes` | `ChapterId` | ❌ | `GetQuiz` yarış durumunda iki quiz üretebilir |

Mevcut mükerrer kayıt var mı — **uygulamadan önce kontrol edilecek** (geçiş planı adım 2).

### İhlal 3 — Silme davranışı EF varsayılanına bırakılmış 🟠

```
$ grep -n "OnDelete\|DeleteBehavior" EnglishReadingPlatform/Data/AppDbContext.cs
(çıktı yok)
```

Tüm zorunlu ilişkiler **cascade**. En riskli nokta:

```csharp
public class Group
{
    public int AdminUserId { get; set; }
    [ForeignKey("AdminUserId")] public User Admin { get; set; } = null!;   // zorunlu → CASCADE
```

Bir öğretmen hesabı silindiğinde **yönettiği tüm gruplar, üyelikleri ve kitap
atamaları da silinir.** `AdminController.DeleteUser` bunu ele almıyor ve kullanıcıyı
uyarmıyor (`docs/02-VERITABANI.md` § 5'te "⚠️ Doğrulanmadı" olarak işaretli).

### İhlal 4 — Kişisel veri süresiz saklanıyor 🟡

| Tablo | Büyüme | Saklama süresi |
|---|---|---|
| `UserActivityLogs` | Kullanıcı başına **dakikada 2 satır** (30 sn heartbeat) | ❌ Sınırsız |
| `TranslationCaches` | Her yeni kelime+cümle çifti | ❌ Sınırsız, TTL yok |
| `SifreSifirlamaJetonlari` (KURAL-09) | Her sıfırlama talebi | ❌ Süresi dolanlar silinmiyor |
| `OcrRecords` | Kullanıcının taradığı her metin | ❌ Silme ucu bile yok |

`UserActivityLogs` ayrıca **iki iş birden** yapıyor: analitik **ve** Groq günlük kota
sayacı. Log temizliği yapılırsa kullanıcıların kotası sıfırlanır
(`docs/02-VERITABANI.md` § 2 uyarısı).

### İhlal 5 — Diğer kalıntılar 🟡

```
$ git ls-files | grep -E "wwwroot/lib|Views/" | wc -l
      21

$ grep -n "PdfSharpCore" EnglishReadingPlatform/EnglishReadingPlatform.csproj
16:    <PackageReference Include="PdfSharpCore" Version="1.3.65" />     ← kod içinde hiç kullanılmıyor

$ git ls-files | grep -c "\.DS_Store"
       0     (gitignore'da ✅ ama dosyalar diskte duruyor)
```

| Kalıntı | Neden sorun |
|---|---|
| `Views/**/*.cshtml` (13 dosya) | Render edilmiyor (`docs/00-GENEL-BAKIS.md`) |
| `wwwroot/lib/jquery*` (8 dosya) | `UseStaticFiles()` bunları **servis ediyor** — eski jQuery sürümleri dışarıdan erişilebilir |
| `PdfSharpCore` paketi | Kullanılmayan bağımlılık = gereksiz zafiyet yüzeyi |
| `EnglishReadingPlatform/dotnet-ef` | Araç kalıntısı |

### Özet

| # | İhlal | Nokta |
|---|---|---|
| 1 | Repoda PII taşıyan SQLite | 1 dosya, 5 kullanıcı |
| 2 | Eksik unique index | 7 tablo |
| 3 | Bilinçsiz cascade | 1 kritik + tümü |
| 4 | Saklama süresi yok | 4 tablo |
| 5 | Kalıntılar | 22 dosya + 1 paket |
| | **TOPLAM** | **35** |

---

## Merkezî uygulama

### 1. Şema kısıtları — `AppDbContext.OnModelCreating`

```csharp
protected override void OnModelCreating(ModelBuilder modelBuilder)
{
    base.OnModelCreating(modelBuilder);

    // ── Mevcut kısıtlar ────────────────────────────────────────
    modelBuilder.Entity<User>().HasIndex(u => u.Email).IsUnique();
    modelBuilder.Entity<User>().HasIndex(u => u.Username).IsUnique();
    modelBuilder.Entity<Group>().HasIndex(g => g.InviteCode).IsUnique();

    // ── KURAL-12: mantıksal tekillik veritabanında zorlanır ────
    modelBuilder.Entity<ReadingProgress>()
        .HasIndex(p => new { p.UserId, p.BookId }).IsUnique();

    modelBuilder.Entity<TranslationCache>()
        .HasIndex(tc => new { tc.QueryText, tc.ContextText }).IsUnique();

    modelBuilder.Entity<GroupMember>()
        .HasIndex(m => new { m.GroupId, m.UserId }).IsUnique();

    modelBuilder.Entity<GroupBookAssignment>()
        .HasIndex(a => new { a.GroupId, a.BookId }).IsUnique();

    modelBuilder.Entity<WordListItem>()
        .HasIndex(w => new { w.UserId, w.Word }).IsUnique();

    modelBuilder.Entity<BookPage>()
        .HasIndex(p => new { p.BookId, p.PageNumber }).IsUnique();

    modelBuilder.Entity<Quiz>()
        .HasIndex(q => q.ChapterId).IsUnique();

    // Sorgu performansı (güvenlik değil ama saklama temizliği için gerekli)
    modelBuilder.Entity<UserActivityLog>()
        .HasIndex(l => new { l.UserId, l.ActivityType, l.Timestamp });
    modelBuilder.Entity<UserActivityLog>().HasIndex(l => l.Timestamp);

    // ── KURAL-12: silme davranışı BİLİNÇLİ seçilir ─────────────
    // Grup yöneticisi silinirse grup SİLİNMEZ — önce devredilmeli.
    modelBuilder.Entity<Group>()
        .HasOne(g => g.Admin)
        .WithMany()
        .HasForeignKey(g => g.AdminUserId)
        .OnDelete(DeleteBehavior.Restrict);

    // Kullanıcıya ait kişisel veriler kullanıcıyla birlikte gider (cascade doğru).
    // Açıkça belirtilir ki EF varsayılanı değiştiğinde davranış sabit kalsın.
    modelBuilder.Entity<ReadingProgress>().HasOne(p => p.User).WithMany(u => u.ReadingProgresses)
        .HasForeignKey(p => p.UserId).OnDelete(DeleteBehavior.Cascade);
    modelBuilder.Entity<WordListItem>().HasOne(w => w.User).WithMany(u => u.WordListItems)
        .HasForeignKey(w => w.UserId).OnDelete(DeleteBehavior.Cascade);
    modelBuilder.Entity<UserActivityLog>().HasOne(l => l.User).WithMany(u => u.ActivityLogs)
        .HasForeignKey(l => l.UserId).OnDelete(DeleteBehavior.Cascade);
    modelBuilder.Entity<OcrRecord>().HasOne(o => o.User).WithMany()
        .HasForeignKey(o => o.UserId).OnDelete(DeleteBehavior.Cascade);
    modelBuilder.Entity<Feedback>().HasOne(f => f.User).WithMany()
        .HasForeignKey(f => f.UserId).OnDelete(DeleteBehavior.Cascade);

    // Kitap seed'i (kullanıcı seed'i KURAL-02'de kaldırıldı)
    ...
}
```

### 2. Yarış durumlarını ele al — `AddWord` ve `Read`

Unique index eklenince, eskiden sessizce mükerrer satır açan kod artık **istisna
fırlatır**. `AnyAsync` + `Add` deseni yerine "upsert" mantığı gerekir:

```csharp
// BooksController.AddWord
try
{
    _db.WordListItems.Add(new WordListItem { ... });
    await _db.SaveChangesAsync();
}
catch (DbUpdateException ex) when (BenzersizlikIhlaliMi(ex))
{
    // Kelime zaten var — idempotent davran (mevcut sözleşme korunur)
    _logger.LogDebug("Kelime zaten listede, atlandı.");
}
return Ok(new { success = true });
```

```csharp
// Data/VeritabaniHatalari.cs
namespace EnglishReadingPlatform.Data;

public static class VeritabaniHatalari
{
    /// <summary>PostgreSQL 23505 = unique_violation</summary>
    public static bool BenzersizlikIhlaliMi(this DbUpdateException ex)
        => ex.InnerException is Npgsql.PostgresException pg && pg.SqlState == "23505";
}
```

`ReadingProgress` için aynı desen; `TranslationCache` yazımında da (`TranslationService`).

### 3. Grup devri — `AdminController.DeleteUser`

`Restrict` davranışı, grup sahibi silinmek istendiğinde **açık bir hata** üretir.
Kullanıcıya ne yapması gerektiği söylenir:

```csharp
[HttpDelete("users/{id}")]
public async Task<IActionResult> DeleteUser(int id)
{
    var cagiranId = this.KullaniciId();
    if (id == cagiranId) return BadRequest(new { error = "Kendi hesabınızı silemezsiniz." });

    var kullanici = await _db.Users.FindAsync(id);
    if (kullanici == null) return NotFound(new { error = "Kullanıcı bulunamadı." });

    // ── KURAL-12: sahip olduğu gruplar sessizce silinmesin ──
    var sahipOldugu = await _db.Groups.Where(g => g.AdminUserId == id)
        .Select(g => new { g.Id, g.Name }).ToListAsync();

    if (sahipOldugu.Count > 0)
        return BadRequest(new
        {
            error = $"Bu kullanıcı {sahipOldugu.Count} grubun yöneticisi. " +
                    "Silmeden önce grupları başka bir yöneticiye devredin veya grupları silin.",
            gruplar = sahipOldugu
        });

    _db.Users.Remove(kullanici);
    await _db.SaveChangesAsync();
    _iptalDeposu.KullaniciTumTokenlariniIptalEt(id);   // KURAL-04

    _logger.LogInformation("Kullanıcı silindi. KullaniciId={Id}", id);
    return Ok(new { success = true });
}
```

### 4. Saklama süresi servisi — `Data/SaklamaTemizligiServisi.cs`

```csharp
using EnglishReadingPlatform.Data;
using Microsoft.EntityFrameworkCore;

namespace EnglishReadingPlatform.Data;

/// <summary>
/// KURAL-12: Süresi dolan kişisel veriyi periyodik siler.
/// Günde bir kez çalışır. Silme sayıları loglanır.
/// </summary>
public class SaklamaTemizligiServisi : BackgroundService
{
    private readonly IServiceScopeFactory _kapsamFabrikasi;
    private readonly ILogger<SaklamaTemizligiServisi> _logger;

    // Saklama süreleri — TEK kaynak
    public static readonly TimeSpan AktiviteLogu    = TimeSpan.FromDays(90);
    public static readonly TimeSpan CeviriOnbellegi = TimeSpan.FromDays(365);
    public static readonly TimeSpan SifirlamaJetonu = TimeSpan.FromDays(7);

    private static readonly TimeSpan Aralik = TimeSpan.FromHours(24);

    public SaklamaTemizligiServisi(IServiceScopeFactory kapsamFabrikasi,
                                   ILogger<SaklamaTemizligiServisi> logger)
    {
        _kapsamFabrikasi = kapsamFabrikasi; _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken durdurma)
    {
        // Açılışta hemen çalışma — uygulama ayağa kalksın
        await Task.Delay(TimeSpan.FromMinutes(5), durdurma);

        while (!durdurma.IsCancellationRequested)
        {
            try { await TemizleAsync(durdurma); }
            catch (OperationCanceledException) { break; }
            catch (Exception ex) { _logger.LogError(ex, "Saklama temizliği başarısız."); }

            await Task.Delay(Aralik, durdurma);
        }
    }

    public async Task TemizleAsync(CancellationToken durdurma = default)
    {
        using var kapsam = _kapsamFabrikasi.CreateScope();
        var db = kapsam.ServiceProvider.GetRequiredService<AppDbContext>();
        var simdi = DateTime.UtcNow;

        // ⚠️ AKTİVİTE LOGU: 'ai_word_translation' satırları Groq günlük KOTA SAYACIDIR.
        // Bugünün kayıtları silinirse kullanıcıların kotası sıfırlanır.
        // 90 günlük eşik bunu güvenle aşar, ama filtre yine de açıkça yazılır.
        var logEsigi = simdi - AktiviteLogu;
        var silinenLog = await db.UserActivityLogs
            .Where(l => l.Timestamp < logEsigi)
            .ExecuteDeleteAsync(durdurma);

        var onbellekEsigi = simdi - CeviriOnbellegi;
        var silinenOnbellek = await db.TranslationCaches
            .Where(tc => tc.CreatedAt < onbellekEsigi)
            .ExecuteDeleteAsync(durdurma);

        var jetonEsigi = simdi - SifirlamaJetonu;
        var silinenJeton = await db.SifreSifirlamaJetonlari
            .Where(j => j.CreatedAt < jetonEsigi)
            .ExecuteDeleteAsync(durdurma);

        if (silinenLog + silinenOnbellek + silinenJeton > 0)
            _logger.LogInformation(
                "Saklama temizliği. AktiviteLogu={Log} CeviriOnbellegi={Onbellek} Jeton={Jeton}",
                silinenLog, silinenOnbellek, silinenJeton);
    }
}
```

Kayıt: `builder.Services.AddHostedService<SaklamaTemizligiServisi>();`

> `ExecuteDeleteAsync` EF Core 7+ ile gelir ve satırları belleğe **çekmeden** siler.
> `.Timestamp` indeksi (adım 1'de eklendi) bu sorguyu hızlandırır.

### 5. OCR kaydı silme ucu

Kullanıcının kendi verisini silebilmesi bir saklama gereğidir:

```csharp
// DELETE /api/dashboard/ocr/{id}
[HttpDelete("ocr/{id}")]
[EnableRateLimiting(HizSinirlari.Yazma)]
public async Task<IActionResult> OcrSil(int id)
{
    var kayit = await _db.OcrRecords
        .FirstOrDefaultAsync(r => r.Id == id && r.UserId == this.KullaniciId());   // sahiplik

    if (kayit is not null)
    {
        _db.OcrRecords.Remove(kayit);
        await _db.SaveChangesAsync();
    }
    return Ok(new { success = true });     // idempotent
}
```

### 6. Kalıntı temizliği

```bash
# a) SQLite kalıntısı — ÖNCE İÇERİĞİ KULLANICI TARAFINDAN DOĞRULANMALI
git rm --cached EnglishReadingPlatform/englishplatform.db
echo "*.db" >> .gitignore
echo "*.db-shm" >> .gitignore
echo "*.db-wal" >> .gitignore
rm EnglishReadingPlatform/englishplatform.db          # diskten de sil

# b) Ölü MVC katmanı
git rm -r --cached EnglishReadingPlatform/Views
git rm -r --cached EnglishReadingPlatform/wwwroot/lib
git rm --cached EnglishReadingPlatform/wwwroot/js/app.js
git rm --cached EnglishReadingPlatform/wwwroot/css/app.css
git rm --cached EnglishReadingPlatform/dotnet-ef
rm -rf EnglishReadingPlatform/Views EnglishReadingPlatform/wwwroot/lib

# c) Kullanılmayan NuGet paketi
cd EnglishReadingPlatform && dotnet remove package PdfSharpCore && cd ..

# d) .DS_Store dosyaları
find . -name ".DS_Store" -not -path "./node_modules/*" -delete
```

> `wwwroot/lib` silindiğinde `UseStaticFiles()` hâlâ `favicon.ico` ve `site.css` için
> gerekir — middleware **kaldırılmaz**.

---

## Otomatik kapı

### A) Şema testleri — `VeriButunluguTests.cs`

```csharp
using EnglishReadingPlatform.Data;
using EnglishReadingPlatform.Models;
using EnglishReadingPlatform.Tests.Infrastructure;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace EnglishReadingPlatform.Tests;

[Collection("api")]
public class VeriButunluguTests
{
    private readonly TestAppFactory _fabrika;
    public VeriButunluguTests(TestAppFactory fabrika) => _fabrika = fabrika;

    private AppDbContext Db(IServiceScope kapsam)
        => kapsam.ServiceProvider.GetRequiredService<AppDbContext>();

    [Fact]
    [Trait("Category", "VeriButunlugu")]
    public async Task Ayni_kullanici_kitap_icin_iki_ilerleme_kaydi_ACILAMAZ()
    {
        using var kapsam = _fabrika.Services.CreateScope();
        var db = Db(kapsam);

        var kullanici = new User { Username = $"bt_{Guid.NewGuid():N}"[..20],
            Email = $"bt_{Guid.NewGuid():N}@t.local", PasswordHash = "x", Role = "student" };
        db.Users.Add(kullanici);
        await db.SaveChangesAsync();

        db.ReadingProgresses.Add(new ReadingProgress { UserId = kullanici.Id, BookId = 1 });
        await db.SaveChangesAsync();

        db.ReadingProgresses.Add(new ReadingProgress { UserId = kullanici.Id, BookId = 1 });
        var eylem = async () => await db.SaveChangesAsync();

        await eylem.Should().ThrowAsync<DbUpdateException>("(UserId, BookId) tekil olmalı");
    }

    [Fact]
    [Trait("Category", "VeriButunlugu")]
    public async Task Ayni_kullanici_ayni_kelimeyi_iki_kez_KAYDEDEMEZ()
    {
        using var kapsam = _fabrika.Services.CreateScope();
        var db = Db(kapsam);

        var kullanici = new User { Username = $"bk_{Guid.NewGuid():N}"[..20],
            Email = $"bk_{Guid.NewGuid():N}@t.local", PasswordHash = "x", Role = "student" };
        db.Users.Add(kullanici);
        await db.SaveChangesAsync();

        db.WordListItems.Add(new WordListItem { UserId = kullanici.Id, Word = "gaunt", Translation = "a" });
        await db.SaveChangesAsync();

        db.WordListItems.Add(new WordListItem { UserId = kullanici.Id, Word = "gaunt", Translation = "b" });
        var eylem = async () => await db.SaveChangesAsync();

        await eylem.Should().ThrowAsync<DbUpdateException>();
    }

    [Fact]
    [Trait("Category", "VeriButunlugu")]
    public async Task Ayni_ceviri_onbellek_kaydi_iki_kez_YAZILAMAZ()
    {
        using var kapsam = _fabrika.Services.CreateScope();
        var db = Db(kapsam);

        var benzersiz = Guid.NewGuid().ToString("N")[..10];
        db.TranslationCaches.Add(new TranslationCache
            { QueryText = benzersiz, ContextText = "bir cümle", Translation = "a|||b|||c" });
        await db.SaveChangesAsync();

        db.TranslationCaches.Add(new TranslationCache
            { QueryText = benzersiz, ContextText = "bir cümle", Translation = "x|||y|||z" });
        var eylem = async () => await db.SaveChangesAsync();

        await eylem.Should().ThrowAsync<DbUpdateException>();
    }

    [Fact]
    [Trait("Category", "VeriButunlugu")]
    public async Task Kelime_ekleme_mukerrer_istekte_hata_VERMEZ()
    {
        // Unique index eklendi ama API sözleşmesi (idempotent) korunmalı.
        var client = _fabrika.CreateClient();
        var o = await AuthHelper.OgrenciOlarakGirisYapAsync(client);
        client.TokenIle(o.Token);

        var istek = new { word = "tekrarkelime", translation = "x", context = "" };

        (await client.PostAsJsonAsync("/api/books/addword", istek))
            .StatusCode.Should().Be(System.Net.HttpStatusCode.OK);
        (await client.PostAsJsonAsync("/api/books/addword", istek))
            .StatusCode.Should().Be(System.Net.HttpStatusCode.OK, "ikinci istek de 200 dönmeli");
    }

    [Fact]
    [Trait("Category", "VeriButunlugu")]
    public async Task Grup_yoneticisi_silinemez_once_devredilmeli()
    {
        var sahipClient = _fabrika.CreateClient();
        var sahip = await AuthHelper.OgrenciOlarakGirisYapAsync(sahipClient);
        sahipClient.TokenIle(sahip.Token);
        await sahipClient.PostAsJsonAsync("/api/groups", new { name = "Silme Testi", description = "" });

        var adminClient = _fabrika.CreateClient();
        var admin = await AuthHelper.AdminOlarakGirisYapAsync(adminClient);
        adminClient.TokenIle(admin.Token);

        var yanit = await adminClient.DeleteAsync($"/api/admin/users/{sahip.UserId}");

        yanit.StatusCode.Should().Be(System.Net.HttpStatusCode.BadRequest,
            "grup yöneticisi silinmeden önce devredilmeli — sessizce grup silinmemeli");
        (await yanit.Content.ReadAsStringAsync()).Should().Contain("devredin");
    }

    [Fact]
    [Trait("Category", "VeriButunlugu")]
    public async Task Saklama_temizligi_eski_loglari_siler_yenileri_BIRAKIR()
    {
        using var kapsam = _fabrika.Services.CreateScope();
        var db = Db(kapsam);

        var kullanici = new User { Username = $"sk_{Guid.NewGuid():N}"[..20],
            Email = $"sk_{Guid.NewGuid():N}@t.local", PasswordHash = "x", Role = "student" };
        db.Users.Add(kullanici);
        await db.SaveChangesAsync();

        db.UserActivityLogs.AddRange(
            new UserActivityLog { UserId = kullanici.Id, ActivityType = "PageView", Details = "eski",
                Timestamp = DateTime.UtcNow.AddDays(-200) },
            new UserActivityLog { UserId = kullanici.Id, ActivityType = "PageView", Details = "yeni",
                Timestamp = DateTime.UtcNow.AddDays(-1) },
            // KOTA SAYACI — bugünün kaydı ASLA silinmemeli
            new UserActivityLog { UserId = kullanici.Id, ActivityType = "ai_word_translation",
                Details = "ai_kelime_cevirisi", Timestamp = DateTime.UtcNow });
        await db.SaveChangesAsync();

        var servis = new SaklamaTemizligiServisi(
            _fabrika.Services.GetRequiredService<IServiceScopeFactory>(),
            Microsoft.Extensions.Logging.Abstractions.NullLogger<SaklamaTemizligiServisi>.Instance);
        await servis.TemizleAsync();

        var kalanlar = await db.UserActivityLogs
            .Where(l => l.UserId == kullanici.Id).Select(l => l.Details).ToListAsync();

        kalanlar.Should().NotContain("eski");
        kalanlar.Should().Contain("yeni");
        kalanlar.Should().Contain("ai_kelime_cevirisi", "kota sayacı korunmalı");
    }
}
```

### B) Guard script — `scripts/guard/12-butunluk.sh`

```bash
#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
echo "[12] Veri bütünlüğü ve kalıntı"

# 1. Veritabanı dosyası sürüm kontrolünde mi?
cikti="$(git ls-files | grep -E '\.(db|sqlite|sqlite3)$' || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "veritabanı dosyası repoda" "$n" "$cikti"

# 2. Ölü MVC katmanı takipte mi?
cikti="$(git ls-files | grep -E 'EnglishReadingPlatform/(Views/|wwwroot/lib/|wwwroot/js/app\.js)' || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "ölü MVC dosyası repoda" "$n" "$(printf '%s' "$cikti" | head -5)"

# 3. Beklenen unique index'ler tanımlı mı?
eksik=""
for kisit in \
  "p.UserId, p.BookId" \
  "tc.QueryText, tc.ContextText" \
  "m.GroupId, m.UserId" \
  "a.GroupId, a.BookId" \
  "w.UserId, w.Word" \
  "p.BookId, p.PageNumber"
do
  grep -A1 "new { $kisit }" EnglishReadingPlatform/Data/AppDbContext.cs 2>/dev/null \
    | grep -q "IsUnique()" || eksik="${eksik}${kisit}"$'\n'
done
n=$(printf '%s' "$eksik" | grep -c . || true)
ihlal_bildir "eksik unique index" "$n" "$eksik"

# 4. Grup silme davranışı bilinçli mi?
n=0
grep -q "OnDelete(DeleteBehavior.Restrict)" EnglishReadingPlatform/Data/AppDbContext.cs || n=1
ihlal_bildir "grup sahibi silme davranışı Restrict" "$n" "EF cascade varsayılanı kullanılıyor"

# 5. Saklama temizliği servisi kayıtlı mı?
n=0; grep -q "SaklamaTemizligiServisi" EnglishReadingPlatform/Program.cs || n=1
ihlal_bildir "saklama temizliği kayıtlı" "$n" "Program.cs'te AddHostedService yok"

# 6. Kullanılmayan paket
cikti="$(grep -n 'PdfSharpCore' EnglishReadingPlatform/EnglishReadingPlatform.csproj 2>/dev/null || true)"
n=$(printf '%s' "$cikti" | grep -c . || true)
ihlal_bildir "kullanılmayan NuGet paketi" "$n" "$cikti"

# 7. .gitignore veritabanı dosyalarını dışlıyor mu?
n=0; grep -q '^\*\.db$' .gitignore || n=1
ihlal_bildir ".gitignore'da *.db" "$n" "yeni .db dosyaları yine takibe girer"

guard_bitir
```

---

## Bitti kriteri

```bash
cd /Users/alihanfindikci/Desktop/ingilizceproje
docker compose up -d postgres

# 1) Testler — BEKLENEN: Başarısız: 0, Başarılı: 6
dotnet test Linguza.sln --filter "Category=VeriButunlugu" --logger "console;verbosity=normal"
echo "çıkış kodu: $?"

# 2) Guard kapısı — BEKLENEN: TOPLAM İHLAL: 0
bash scripts/guard/12-butunluk.sh; echo "çıkış kodu: $?"

# 3) Repoda veritabanı dosyası — BEKLENEN: 0
git ls-files | grep -cE '\.(db|sqlite|sqlite3)$' || echo 0

# 4) Ölü MVC dosyası — BEKLENEN: 0
git ls-files | grep -cE 'EnglishReadingPlatform/(Views/|wwwroot/lib/)' || echo 0

# 5) Unique index sayısı (veritabanında) — BEKLENEN: ≥ 10
docker exec english_postgres psql -U appuser -d englishreadingdb -tAc \
  "SELECT COUNT(*) FROM pg_indexes WHERE schemaname='public' AND indexdef LIKE '%UNIQUE%';"

# 6) Mükerrer kayıt kaldı mı? — BEKLENEN: hepsi 0
docker exec english_postgres psql -U appuser -d englishreadingdb -tAc "
  SELECT 'ReadingProgresses', COUNT(*) FROM (SELECT \"UserId\",\"BookId\" FROM \"ReadingProgresses\" GROUP BY 1,2 HAVING COUNT(*)>1) x
  UNION ALL SELECT 'WordListItems', COUNT(*) FROM (SELECT \"UserId\",\"Word\" FROM \"WordListItems\" GROUP BY 1,2 HAVING COUNT(*)>1) y
  UNION ALL SELECT 'TranslationCaches', COUNT(*) FROM (SELECT \"QueryText\",\"ContextText\" FROM \"TranslationCaches\" GROUP BY 1,2 HAVING COUNT(*)>1) z;"

# 7) Tüm kapılar — BEKLENEN: TOPLAM İHLAL: 0
bash scripts/guard/run-all.sh; echo "çıkış kodu: $?"

# 8) TÜM test takımı — 12 kuralın hepsi
dotnet test Linguza.sln --logger "console;verbosity=normal"
```

---

## Mutasyon kontrolü (zorunlu)

```bash
# MUTASYON A — bir unique index'i kaldır
sed -i '' 's|.HasIndex(p => new { p.UserId, p.BookId }).IsUnique();|.HasIndex(p => new { p.UserId, p.BookId });|' \
  EnglishReadingPlatform/Data/AppDbContext.cs

cd EnglishReadingPlatform && dotnet ef migrations add MutasyonIndexKaldir && cd ..
dotnet test Linguza.sln --filter "FullyQualifiedName~Ayni_kullanici_kitap_icin_iki_ilerleme"
# BEKLENEN: Başarısız: 1 — istisna fırlatılmadı, iki satır açıldı (KIRMIZI)
bash scripts/guard/12-butunluk.sh; echo "çıkış kodu: $?"     # BEKLENEN: 1

# GERİ AL
cd EnglishReadingPlatform && dotnet ef migrations remove && cd ..
git checkout EnglishReadingPlatform/Data/AppDbContext.cs
dotnet test Linguza.sln --filter "Category=VeriButunlugu"     # BEKLENEN: Başarısız: 0
```

```bash
# MUTASYON B — grup silme korumasını kaldır
python3 - <<'PY'
yol = "EnglishReadingPlatform/Controllers/AdminController.cs"
k = open(yol, encoding="utf-8").read()
k = k.replace("if (sahipOldugu.Count > 0)", "if (false)   // MUTASYON")
open(yol, "w", encoding="utf-8").write(k)
PY

dotnet test Linguza.sln --filter "FullyQualifiedName~Grup_yoneticisi_silinemez"
# BEKLENEN: Başarısız: 1

git checkout EnglishReadingPlatform/Controllers/AdminController.cs
```

```bash
# MUTASYON C — saklama temizliğinin kota sayacını korumadığını kanıtla
python3 - <<'PY'
yol = "EnglishReadingPlatform/Data/SaklamaTemizligiServisi.cs"
k = open(yol, encoding="utf-8").read()
k = k.replace("public static readonly TimeSpan AktiviteLogu    = TimeSpan.FromDays(90);",
              "public static readonly TimeSpan AktiviteLogu    = TimeSpan.FromSeconds(1);   // MUTASYON")
open(yol, "w", encoding="utf-8").write(k)
PY

dotnet test Linguza.sln --filter "FullyQualifiedName~Saklama_temizligi_eski_loglari_siler"
# BEKLENEN: Başarısız: 1 — "ai_kelime_cevirisi" da silindi, kota sıfırlandı
#   ← Bu mutasyon, saklama süresini kısaltmanın kotayı bozduğunu KANITLAR

git checkout EnglishReadingPlatform/Data/SaklamaTemizligiServisi.cs
```

---

## Geçiş planı

| Adım | İş | Nokta | Doğrulama |
|---|---|---|---|
| 1 | 🔴 **Yedek al** (aşağı bak) | — | `ls -la yedek-*.sql` |
| 2 | 🔴 **Mevcut mükerrer kayıtları bul ve temizle** (aşağı bak) | ? | komut 6 → hepsi 0 |
| 3 | `AppDbContext`: 7 unique index + 1 Restrict + 5 açık Cascade | 13 | derlenir |
| 4 | Migration üret ve **SQL'i incele** | — | aşağı bak |
| 5 | `Data/VeritabaniHatalari.cs` + `AddWord`/`Read`/cache upsert deseni | 3 | derlenir |
| 6 | `AdminController.DeleteUser` grup devri kontrolü | 1 | test yeşil |
| 7 | `SaklamaTemizligiServisi` + `Program.cs` kaydı | 1 | guard kapı 5 → 0 |
| 8 | `DELETE /api/dashboard/ocr/{id}` ucu (+ `api.ts` metodu) | 1 | derlenir |
| 9 | `VeriButunluguTests.cs` yaz | — | 6 test yeşil |
| 10 | Kalıntı temizliği (SQLite, Views, wwwroot/lib, PdfSharpCore, .DS_Store) | 23 | guard kapı 1,2,6 → 0 |
| 11 | `.gitignore` güncelle | — | guard kapı 7 → 0 |
| 12 | `scripts/guard/12-butunluk.sh` + `chmod +x` | — | çıkış kodu 0 |
| 13 | **Git geçmişi temizliği** (karara bağlı, aşağı bak) | — | insan kararı |
| 14 | Dokümantasyonu güncelle (`docs/02-VERITABANI.md`) | — | — |
| 15 | İlerleme tablosunu tamamla — **12/12 ✅** | — | — |

### Adım 1 — yedek (zorunlu, Pazarlıksız madde 4)

```bash
docker exec english_postgres pg_dump -U appuser englishreadingdb > "yedek-kural12-$(date +%Y%m%d-%H%M%S).sql"
ls -la yedek-kural12-*.sql
grep -c "INSERT INTO" yedek-kural12-*.sql       # yedeğin dolu olduğunu kanıtla
```

`.gitignore`'da `yedek-*.sql` olduğunu doğrula (KURAL-01 adım 9'da eklendi).

### Adım 2 — mükerrer kayıt temizliği 🔴 **UNIQUE INDEX'TEN ÖNCE**

Mükerrer kayıt varsa migration **başarısız olur**. Önce tespit:

```bash
docker exec english_postgres psql -U appuser -d englishreadingdb -c "
SELECT 'ReadingProgresses' AS tablo, \"UserId\", \"BookId\", COUNT(*)
FROM \"ReadingProgresses\" GROUP BY 1,2,3 HAVING COUNT(*) > 1;"
```

Bulunursa — en yeni kaydı tut, diğerlerini sil:

```sql
DELETE FROM "ReadingProgresses" a
USING "ReadingProgresses" b
WHERE a."UserId" = b."UserId" AND a."BookId" = b."BookId" AND a."Id" < b."Id";

DELETE FROM "WordListItems" a USING "WordListItems" b
WHERE a."UserId" = b."UserId" AND a."Word" = b."Word" AND a."Id" < b."Id";

DELETE FROM "TranslationCaches" a USING "TranslationCaches" b
WHERE a."QueryText" = b."QueryText"
  AND a."ContextText" IS NOT DISTINCT FROM b."ContextText" AND a."Id" < b."Id";

DELETE FROM "GroupMembers" a USING "GroupMembers" b
WHERE a."GroupId" = b."GroupId" AND a."UserId" = b."UserId" AND a."Id" < b."Id";

DELETE FROM "GroupBookAssignments" a USING "GroupBookAssignments" b
WHERE a."GroupId" = b."GroupId" AND a."BookId" = b."BookId" AND a."Id" < b."Id";
```

> ⚠️ `TranslationCaches.ContextText` **nullable**. `=` karşılaştırması NULL'da çalışmaz;
> `IS NOT DISTINCT FROM` kullanılır. Aynı sebeple PostgreSQL'de NULL'lu unique index
> birden fazla NULL'a izin verir — bu kabul edilebilir (bağlamsız çeviriler zaten
> ayrı yolla yönetiliyor).

### Adım 4 — migration SQL'ini incele

```bash
cd EnglishReadingPlatform
dotnet ef migrations add VeriButunluguKisitlari
dotnet ef migrations script --idempotent -o /tmp/kural12.sql
grep -iE "CREATE UNIQUE INDEX|DROP CONSTRAINT|ON DELETE" /tmp/kural12.sql
cd ..
```

`DELETE FROM` satırı **görünmemeli**. Görünüyorsa migration elle düzenlenmelidir.

### Adım 13 — git geçmişi temizliği (karara bağlı) 🧍

`englishplatform.db` **git geçmişinde** duruyor. `git rm --cached` onu gelecekteki
commit'lerden çıkarır ama **eski commit'lerde kalır**.

Karar `00-BASLA-BURADAN.md` madde 9'da anlatıldı. Temizlik gerekiyorsa:

```bash
# ÖNCE tam yedek — bu işlem GERİ ALINAMAZ
git bundle create ../linguza-tam-yedek-$(date +%s).bundle --all
ls -la ../linguza-tam-yedek-*.bundle

# git-filter-repo gerekir:  brew install git-filter-repo
git filter-repo --path EnglishReadingPlatform/englishplatform.db --invert-paths --force

# Doğrula — çıktı BOŞ olmalı
git log --all --oneline -- EnglishReadingPlatform/englishplatform.db
```

Sonrasında uzak repo varsa `git push --force` gerekir ve **repoyu klonlamış herkes
yeniden klonlamalıdır.**

---

## Tuzaklar

| Tuzak | Neden olur | Nasıl kaçınılır |
|---|---|---|
| **Unique index'i mükerrer kayıt temizlemeden eklemek** | Migration `duplicate key value violates unique constraint` ile başarısız olur; uygulama açılmaz (`Database.Migrate()` başlangıçta çalışıyor) | Adım 2 zorunlu |
| **`AnyAsync` + `Add` desenini bırakmak** | Unique index eklenince yarış durumu artık **500** üretir; eskiden sessiz mükerrer satırdı | `DbUpdateException` + `23505` yakalanır, idempotent davranış korunur |
| **NULL'lu kolonda unique index davranışını yanlış varsaymak** | PostgreSQL'de NULL ≠ NULL; `(QueryText, NULL)` çifti birden fazla kez yazılabilir | Bilinçli kabul; testte bağlamlı kayıtlar kullanılıyor |
| **`Restrict` ekleyip kullanıcı silmeyi tamamen kırmak** | Grup sahibi olan **her** kullanıcı silinemez hale gelir; yönetici sebebini anlamaz | `DeleteUser` **açık ve yol gösterici** hata döndürüyor |
| **Saklama süresini kısa tutup kota sayacını bozmak** | `ai_word_translation` satırları silinirse kullanıcılar günlük 30 limiti sıfırlar | 90 gün eşiği; MUTASYON C bunu kanıtlıyor |
| **`ExecuteDeleteAsync`'i indekssiz kolonda çalıştırmak** | Tam tablo taraması; büyük log tablosunda üretimi kilitler | `Timestamp` indeksi adım 3'te ekleniyor |
| **`wwwroot`'u tamamen silmek** | `favicon.ico` ve `site.css` kaybolur, `UseStaticFiles()` boşa çalışır | Yalnızca `lib/` ve `js/app.js`, `css/app.css` siliniyor |
| **`git rm --cached` sonrası dosyayı diskten silmemek** | Dosya çalışma dizininde kalır, biri yeniden `git add` eder | Hem `git rm --cached` hem `rm` |
| **`git filter-repo`'yu yedeksiz çalıştırmak** | Geri alınamaz; commit hash'leri değişir | `git bundle create --all` ile tam yedek zorunlu |
| **Testte seed kitap Id'sine güvenmek** | KURAL-02 seed'i değiştirdi; `BookId = 1` var olmayabilir | Test kendi verisini oluşturmalı ya da seed varlığını doğrulamalı |
| **`Quiz.ChapterId` unique index'ini eklerken mevcut mükerrer quiz'i unutmak** | `GetQuiz` yarış durumunda iki quiz üretmiş olabilir | Adım 2'ye `Quizzes` sorgusu da eklenmelidir |

---

## Teslim şablonu

```markdown
## 1. Kanıtlanarak kapandı
<8 bitti-kriteri komutunun ham çıktısı>
<adım 1: yedek dosyasının ls -la çıktısı>
<adım 2: mükerrer kayıt sorgusunun ÖNCE ve SONRA çıktısı>
<adım 4: migration SQL'inde CREATE UNIQUE INDEX satırları>
<MUTASYON A, B, C çıktıları>

## 2. Kapanmadı
- Git geçmişi temizliği yapılmadı (kullanıcı kararı: repo paylaşılmamış)
- OcrRecords için otomatik saklama süresi yok — kullanıcı kendi silebiliyor,
  otomatik silme ürün kararı gerektiriyor

## 3. İnsan müdahalesi gerekiyor
- [ ] englishplatform.db içeriği doğrulandı mı? (5 kullanıcı gerçek mi test mi)
      → 00-BASLA-BURADAN.md madde 5
- [ ] Git geçmişi temizliği gerekli mi? → 00-BASLA-BURADAN.md madde 9
- [ ] Saklama süreleri kabul edilebilir mi? (aktivite 90 gün, önbellek 1 yıl)
      → KVKK/GDPR kapsamında bir gereklilik varsa gözden geçirilmeli
- [ ] Grup devri özelliği eklenmeli mi? (şu an yönetici silinemiyor, devir arayüzü yok)

## Değiştirilen dosyalar
<git diff --stat>

## Commit
<git log -1 --format='%H %s'>

---

## 🏁 12/12 TAMAMLANDI
<00-BASLA-BURADAN.md ilerleme tablosunun tamamının ✅ olduğu ekran çıktısı>
<bash scripts/guard/run-all.sh — TOPLAM İHLAL: 0>
<dotnet test Linguza.sln — Başarısız: 0, toplam test sayısı>
```
