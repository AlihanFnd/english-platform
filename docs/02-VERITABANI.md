# 02 — Veritabanı

**Motor:** PostgreSQL 15 · **ORM:** Entity Framework Core 8 (Npgsql) · **Veritabanı adı:** `englishreadingdb`

Tüm entity tanımları tek dosyada: `EnglishReadingPlatform/Models/AppModels.cs`
DbSet ve yapılandırma: `EnglishReadingPlatform/Data/AppDbContext.cs`

---

## 1. İlişki şeması

```
                        ┌──────────┐
                        │   User   │
                        └────┬─────┘
      ┌──────────────┬───────┼────────┬──────────────┬─────────────┐
      │              │       │        │              │             │
      ▼              ▼       ▼        ▼              ▼             ▼
ReadingProgress WordListItem QuizResult GroupMember UserActivityLog Feedback
      │                         │        │
      │                         │        └──► Group ◄── AdminUserId (User)
      │                         │                │
      │                         │                └──► GroupBookAssignment ──► Book
      ▼                         ▼
   ┌──────┐                  ┌──────┐
   │ Book │◄─────────────────│ Quiz │
   └──┬───┘                  └──┬───┘
      │                         │
      ├──► Chapter ◄────────────┘ (Quiz.ChapterId)
      │        ▲
      │        └── QuizQuestion (Quiz.Id)
      │
      └──► BookPage

Bağımsız tablolar:
   OcrRecord  ──► User
   TranslationCache  (hiçbir ilişkisi yok, global önbellek)
```

---

## 2. Tablolar

### `Users`

| Kolon | Tip | Kısıt | Açıklama |
|---|---|---|---|
| `Id` | int | PK, identity | |
| `Username` | varchar(100) | **UNIQUE**, NOT NULL | |
| `Email` | varchar(200) | **UNIQUE**, NOT NULL | Kayıtta `.Trim().ToLower()` uygulanır |
| `PasswordHash` | text | NOT NULL | BCrypt (BCrypt.Net-Next 4.0.3, varsayılan work factor) |
| `Role` | text | varsayılan `"student"` | `student` \| `teacher` \| `admin` — **DB seviyesinde kısıt yok**, sadece kodda |
| `CreatedAt` | timestamptz | varsayılan `UtcNow` | |

Navigasyonlar: `ReadingProgresses`, `WordListItems`, `GroupMemberships`, `QuizResults`, `ActivityLogs`

> ⚠️ `Role` için CHECK constraint veya enum yok. Doğrudan SQL ile geçersiz bir rol yazılabilir.
> `AdminController.UpdateRole` uygulama katmanında whitelist uyguluyor.

---

### `Books`

| Kolon | Tip | Varsayılan | Açıklama |
|---|---|---|---|
| `Id` | int | PK | |
| `Title` | varchar(200) | — | Zorunlu |
| `Author` | varchar(200) | `""` | |
| `Description` | varchar(500) | `""` | |
| `CoverColor` | text | `"#6366f1"` | Kapak görseli yoksa kullanılan hex renk |
| `Language` | text | `"en"` | Şu an yalnızca `en` anlamlı |
| `Level` | varchar(50) | `"A1"` | CEFR: `A1`, `A2`, `B1`, `B2`, `C1`, `C2` ve `A1-A2`, `B1-B2` gibi aralıklar |
| `Category` | varchar(50) | `"story"` | `story`, `article`, … — **enum değil, serbest metin** |
| `CreatedAt` | timestamptz | `UtcNow` | |

Navigasyonlar: `Chapters`, `Pages`

> `Level` ve `Category` `20260716171141_AddLevelAndCategoryToBook` ile eklendi.
> Frontend'deki filtre listesi `frontend/app/books/page.tsx` içindeki `LEVELS` ve
> `CATEGORIES` sabitlerinden gelir — backend'le senkron tutulması **elle** yapılır.

---

### `Chapters` — bölüm modundaki içerik

| Kolon | Tip | Açıklama |
|---|---|---|
| `Id` | int | PK |
| `BookId` | int | FK → Books, **cascade delete** |
| `Title` | varchar(200) | |
| `ChapterNumber` | int | 1'den başlar, sıralama için |
| `Content` | text | Bölümün tam metni |

---

### `BookPages` — sayfa modundaki içerik

| Kolon | Tip | Açıklama |
|---|---|---|
| `Id` | int | PK |
| `BookId` | int | FK → Books, cascade |
| `PageNumber` | int | **Yeniden numaralandırılmış** görüntüleme numarası (1..N) |
| `Content` | text | Sayfanın ham metni |
| `SentencesJson` | text | Varsayılan `"[]"`. Analiz edilmiş cümle+kelime yapısı — aşağıdaki şema |

`SentencesJson` şeması (`AnalyzedSentence[]`):

```json
[
  {
    "index": 0,
    "original": "The old man was thin and gaunt.",
    "translation": "Yaşlı adam zayıf ve bitkindi.",
    "isHeading": false,
    "alignment": "left",          // left | center | right
    "indentation": 0,             // × 12px sol boşluk
    "words": [
      { "word": "The",  "translation": "",       "type": "edat" },
      { "word": "old",  "translation": "yaşlı",  "type": "sıfat" }
    ]
  }
]
```

`type` değerleri ve frontend renk sınıfları:
`isim` → `.word-isim`, `fiil` → `.word-fiil`, `sıfat` → `.word-sifat`, `zarf` → `.word-zarf`,
`edat` → `.word-edat`, `bağlaç` → `.word-baglac`, `zamir` → `.word-zamir`,
tanınmayan → `.word-default`. Ayrıca çok kelimeli seçimler için `kalıp` tipi kullanılır.

> ⚠️ Bu JSON hem PascalCase (C# serileştirmesi) hem camelCase (`JsonPropertyName`) ile
> karşılaşabildiği için frontend `normalizeSentences()` içinde **her iki biçimi de** okur.
> Migration `20260709161305_AddBookPages` ile geldi.

---

### `ReadingProgresses`

| Kolon | Tip | Açıklama |
|---|---|---|
| `Id` | int | PK |
| `UserId` | int | FK → Users |
| `BookId` | int | FK → Books |
| `CurrentChapter` | int | **Sayfa modunda burada sayfa numarası tutulur** (isim yanıltıcı) |
| `ProgressPercent` | float | `(sayfa / toplamSayfa) × 100` |
| `LastRead` | timestamptz | |

> ⚠️ `(UserId, BookId)` üzerinde **unique index yok**. `BooksController.Read` her seferinde
> `FirstOrDefaultAsync` ile arayıp yoksa ekliyor; eşzamanlı iki istekte aynı kullanıcı+kitap
> için iki satır oluşabilir (race condition). Bkz. [08-GELISTIRME-REHBERI.md](08-GELISTIRME-REHBERI.md).

---

### `WordListItems` — kullanıcının kelime listesi

| Kolon | Tip | Açıklama |
|---|---|---|
| `Id` | int | PK |
| `UserId` | int | FK → Users |
| `Word` | varchar(200) | Kelime veya kalıp |
| `Translation` | varchar(500) | Anlam. Bağlamsal çeviride `"anlam\n\nEş Anlamlılar:\n..."` biçiminde çok satırlı |
| `Context` | varchar(200) | İçinde geçtiği cümle |
| `AddedAt` | timestamptz | |

> ⚠️ `Context` yalnızca **200 karakter**. Uzun cümleler kaydedilirken PostgreSQL
> `22001 string data right truncation` hatası verir → 500. `BooksController.AddWord`
> uzunluk kontrolü yapmıyor. Bkz. [07-GUVENLIK.md](07-GUVENLIK.md) #8.

---

### `Quizzes` / `QuizQuestions` / `QuizResults`

**Quizzes**

| Kolon | Tip | Açıklama |
|---|---|---|
| `Id` | int | PK |
| `BookId` | int | FK → Books |
| `ChapterId` | int | FK → Chapters — **zorunlu**, bu yüzden sayfa modundaki kitaplarda quiz yok |
| `Title` | text | `"{Kitap} — {Bölüm} Quiz"` |
| `CreatedAt` | timestamptz | |

**QuizQuestions**

| Kolon | Tip | Açıklama |
|---|---|---|
| `Id` | int | PK |
| `QuizId` | int | FK → Quizzes |
| `QuestionText` | text | |
| `OptionA` … `OptionD` | text | Dört şık |
| `CorrectAnswer` | text | `"A"` \| `"B"` \| `"C"` \| `"D"` |

**QuizResults**

| Kolon | Tip | Açıklama |
|---|---|---|
| `Id` | int | PK |
| `UserId` / `QuizId` | int | FK |
| `Score` | int | Doğru sayısı |
| `TotalQuestions` | int | |
| `TakenAt` | timestamptz | |

> `CorrectAnswer` istemciye **hiçbir zaman gönderilmez** — `GetQuiz` yanıtı yalnızca
> `Options` dizisini içerir, değerlendirme `SubmitQuiz`'de sunucuda yapılır. ✅ Doğru tasarım.

---

### `Groups` / `GroupMembers` / `GroupBookAssignments`

**Groups**

| Kolon | Tip | Açıklama |
|---|---|---|
| `Id` | int | PK |
| `Name` | varchar(200) | |
| `Description` | varchar(500) | |
| `AdminUserId` | int | FK → Users. **Yetki kaynağı budur, `User.Role` değil** |
| `InviteCode` | text | **UNIQUE**. `Guid.NewGuid().ToString("N")[..8].ToUpper()` — 8 hex karakter |
| `CreatedAt` | timestamptz | |

**GroupMembers**: `Id`, `GroupId`, `UserId`, `Role` (`admin`\|`member`), `JoinedAt`
**GroupBookAssignments**: `Id`, `GroupId`, `BookId`, `AssignedAt`

> ⚠️ `InviteCode` 8 hex karakter = 4.3 milyar olasılık. Brute-force için `/api/groups/join`
> ucunda **rate limit yok**. Ayrıca `Guid.NewGuid()` kriptografik olarak güvenli rastgelelik
> garantisi vermez (v4 GUID pratikte yeterlidir ama `RandomNumberGenerator` daha doğrudur).

---

### `OcrRecords`

| Kolon | Tip | Açıklama |
|---|---|---|
| `Id` | int | PK |
| `UserId` | int | FK → Users |
| `ExtractedText` | text | Tesseract.js çıktısı |
| `ImagePath` | text | **Her zaman boş** — görsel sunucuya yüklenmiyor |
| `ScannedAt` | timestamptz | |

---

### `UserActivityLogs`

| Kolon | Tip | Açıklama |
|---|---|---|
| `Id` | int | PK |
| `UserId` | int | FK → Users |
| `ActivityType` | varchar(50) | `PageView`, `ReadBook`, `TakeQuiz`, `AuthView`, `ai_word_translation` |
| `Details` | varchar(200) | `"Ana Sayfa"`, `"Kitap ID: 5 - Kitap Okuyor"`, `"Word: ephemeral"` |
| `DurationSeconds` | int | 5 dk içindeki aynı aktivitelerde **toplanır** |
| `Timestamp` | timestamptz | Son güncelleme anı |

Bu tablo **iki ayrı iş** yapıyor:
1. Analitik/izleme (yönetici dashboard'undaki canlı akış)
2. **Kota sayacı** — `ai_word_translation` satırları günlük 30 Groq limitini hesaplamak için sayılıyor

> ⚠️ İkisinin aynı tabloda olması, ileride log temizliği (retention) yapıldığında
> kullanıcıların kotasını sıfırlar. Ayrıca `Details` alanına `"Word: {kelime}"` yazılması
> kullanıcının hangi kelimeleri bilmediğini log'a düşürür (gizlilik).
> Migration `20260714055926_AddUserActivityLog`.

---

### `Feedbacks`

| Kolon | Tip | Açıklama |
|---|---|---|
| `Id` | int | PK |
| `UserId` | int | FK → Users |
| `Message` | varchar(1000) | |
| `CreatedAt` | timestamptz | |

Migration `20260714062208_AddFeedbackModel`. Yalnızca admin okuyabilir (`AdminOnly` policy).

---

### `TranslationCaches` — global çeviri önbelleği

| Kolon | Tip | Açıklama |
|---|---|---|
| `Id` | int | PK |
| `QueryText` | varchar(255) | Kelime/kalıp — `Regex.Replace(w, @"[^a-zA-Z0-9'\ -]", "").Trim().ToLower()` |
| `ContextText` | text? | İçinde geçtiği cümle, `.Trim().ToLower()`. NULL olabilir |
| `Translation` | text | `"genelAnlam\|\|\|bağlamsalAnlam\|\|\|eşAnlamlılar"` — üç parça `\|\|\|` ile ayrılır |
| `WordType` | varchar(50) | `isim`, `fiil`, … varsayılan `default` |
| `CreatedAt` | timestamptz | |

**İndeks:** `(QueryText, ContextText)` — non-unique.

> ⚠️ Üç noktaya dikkat:
> 1. İndeks **unique değil**; eşzamanlı iki istek aynı çift için iki satır yazabilir.
> 2. `Translation` alanında `|||` ile ayrılmış yapılandırılmamış format kullanılıyor.
>    Çevirinin kendisinde `|||` geçerse ayrıştırma bozulur (`parts.Length == 3` kontrolü
>    var, bozulursa tümü `GeneralMeaning`'e düşer — sessiz bozulma).
> 3. **Süre sonu (TTL) yok.** Önbellek sonsuza kadar büyür ve model iyileşse bile eski
>    çeviriler asla yenilenmez.
>
> Migration `20260715193529_AddTranslationCache`.

---

## 3. Migration geçmişi

| Sıra | Dosya | Ne yaptı |
|---|---|---|
| 1 | `20260707141127_InitialPostgresCreate` | Tüm çekirdek tablolar + seed |
| 2 | `20260709161305_AddBookPages` | `BookPages` tablosu (sayfa modu) |
| 3 | `20260714055926_AddUserActivityLog` | `UserActivityLogs` |
| 4 | `20260714062208_AddFeedbackModel` | `Feedbacks` |
| 5 | `20260715193529_AddTranslationCache` | `TranslationCaches` + kompozit indeks |
| 6 | `20260716171141_AddLevelAndCategoryToBook` | `Books.Level`, `Books.Category` |

Yeni migration eklemek:

```bash
cd EnglishReadingPlatform && ../dotnet_sdk/dotnet ef migrations add MigrationAdi
```

Uygulama açılışta `Database.Migrate()` çağırdığı için ayrıca `database update` gerekmez.

---

## 4. Seed verisi (`AppDbContext.OnModelCreating`)

**Kullanıcı** — ✅ KURAL-02 ile seed'den kaldırıldı

`AppDbContext.OnModelCreating` artık kullanıcı tohumlamıyor. Yönetici hesabı
`Data/YoneticiTohumlayici.cs` tarafından, uygulama açılışında,
`Seed:AdminEmail` / `Seed:AdminPassword` ortam değişkenlerinden oluşturulur.
İşlem idempotenttir: aynı e-posta varsa hiçbir şey yapmaz.

`20260823160731_SeedAdminOrtamaTasindi` migration'ı eski `admin@platform.com`
tohum hesabını geçersiz kılar — bağlı verisi yoksa siler, varsa yalnızca
şifresini kimsenin bilmediği bir değere kilitler (veri kaybı yok).

**Kitaplar**

| Id | Başlık | Yazar | Seviye |
|---|---|---|---|
| 1 | The Adventures of Tom Sawyer | Mark Twain | A1-A2 |
| 2 | Alice in Wonderland | Lewis Carroll | A2 |
| 3 | The Old Man and the Sea | Ernest Hemingway | B1 |

**Bölümler:** 4 adet (Id 1–2 → Kitap 1, Id 3 → Kitap 2, Id 4 → Kitap 3).
Hepsi bölüm modundadır, dolayısıyla açıldıklarında **her seferinde yeniden analiz edilirler**.

> ⚠️ Seed'deki `Book.CreatedAt = DateTime.UtcNow` **dinamik bir değerdir**. EF Core seed
> verisi derleme zamanında sabit olmalıdır; bu kullanım her `dotnet ef migrations add`
> çalıştırıldığında sahte bir "model değişti" farkı üretir. Sabit bir tarihe çevrilmelidir
> (kullanıcı seed'inde doğru yapılmış: `new DateTime(2026, 7, 7, …, DateTimeKind.Utc)`).

---

## 5. Silme davranışı

EF Core varsayılanı: zorunlu (`required`) ilişkilerde **cascade delete**.

| Silinen | Otomatik silinenler | Elle temizlenenler |
|---|---|---|
| `Book` | `Chapters`, `BookPages` | `AdminController.DeleteBook` ayrıca `Quizzes`, `QuizQuestions`, `GroupBookAssignments`, `ReadingProgresses` siler (commit `08ec85d`) |
| `User` | `ReadingProgresses`, `WordListItems`, `GroupMembers`, `QuizResults`, `UserActivityLogs`, `Feedbacks`, `OcrRecords` | — |

> ⚠️ **Doğrulanmadı:** Bir kullanıcı bir grubun `AdminUserId`'si ise, o kullanıcıyı silmek
> `Groups` üzerinde cascade tetikleyip **grubu ve tüm üyeliklerini** silecektir (EF varsayılanı).
> `AdminController.DeleteUser` bunu ele almıyor. Öğretmen hesabı silindiğinde sınıfların
> yok olması istenmiyorsa bu ilişki `Restrict`'e çevrilmeli veya devir mekanizması eklenmelidir.

---

## 6. Faydalı SQL sorguları

```sql
-- En çok okunan kitaplar
SELECT b."Title", COUNT(*) AS okuyucu, ROUND(AVG(rp."ProgressPercent")::numeric, 1) AS ort_ilerleme
FROM "ReadingProgresses" rp JOIN "Books" b ON b."Id" = rp."BookId"
GROUP BY b."Title" ORDER BY okuyucu DESC;

-- Çeviri önbelleği isabet potansiyeli (aynı kelime kaç farklı bağlamda var?)
SELECT "QueryText", COUNT(*) FROM "TranslationCaches"
GROUP BY "QueryText" HAVING COUNT(*) > 1 ORDER BY 2 DESC LIMIT 20;

-- Bugün Groq kotasını doldurmuş kullanıcılar
SELECT u."Username", COUNT(*) AS ai_cagri
FROM "UserActivityLogs" l JOIN "Users" u ON u."Id" = l."UserId"
WHERE l."ActivityType" = 'ai_word_translation' AND l."Timestamp" >= CURRENT_DATE
GROUP BY u."Username" HAVING COUNT(*) >= 30;

-- Henüz analiz edilmemiş sayfalar (ilk açılışta maliyet üretecekler)
SELECT b."Title", COUNT(*) AS analiz_bekleyen
FROM "BookPages" p JOIN "Books" b ON b."Id" = p."BookId"
WHERE p."SentencesJson" IN ('', '[]') GROUP BY b."Title";

-- Aynı kullanıcı+kitap için mükerrer ilerleme kaydı var mı? (race condition kontrolü)
SELECT "UserId", "BookId", COUNT(*) FROM "ReadingProgresses"
GROUP BY 1, 2 HAVING COUNT(*) > 1;
```
