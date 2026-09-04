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
| `DogruSayisi` | int | Toplam kaç kez doğru bilindi |
| `YanlisSayisi` | int | Toplam kaç kez bilinemedi |
| `DogruSeri` | int | **Üst üste** kaç kez doğru bilindi — bir kez bilememek sıfırlar |
| `SonCalismaAt` | timestamptz? | En son ne zaman çalışıldı. `null` = hiç çalışılmadı |

**Tekillik:** `(UserId, Word)` — KURAL-12'de eklendi.

> ✅ **Çözüldü (KURAL-05):** `Context` 200 karakterlik kolona yazılmadan önce
> `KirpEnCok` ile kırpılıyor; girdi sınırı `BaglamGirdi` (400). Eskiden uzun bir
> cümle `22001 string data right truncation` → 500 üretiyordu.

### Çalışma ilerlemesi (`20260904082257_KelimeCalismaIlerlemesi`)

Son dört kolon **kelime çalışma seansı** içindir. Öncesinde "Biliyorum /
Bilmiyorum" yalnızca ekrandaki bir React sayacıydı — sayfa kapanınca kayboluyordu.
200 kelimelik bir listede kullanıcı hangi kelimeyi çalıştığını hiç bilemiyordu.

**"Öğrenildi" kararı `DogruSeri`'ye bakar, `DogruSayisi`'na değil.** 10 kez bilip
10 kez bilememiş bir kelime öğrenilmiş sayılmamalı. Eşik
`Contracts/KelimeCalismasi.OgrenildiEsigi` (3) — **tek kaynak**, istemci bu değeri
`GET /api/books/words/ozet` yanıtından okur; iki yerde ayrı yazılsaydı ekran
"35 öğrenildi", liste "34" derdi.

**Seans seçimi** (`GET /api/books/words/calisma`) üç bantlı önceliklidir:

```
1) SonCalismaAt IS NULL                   → hiç çalışılmamışlar
2) DogruSeri < eşik, en eskiden başlayarak → çalışılmış ama öğrenilmemişler
3) kalanlar                                → tekrar
```

Bant içinde sıra `random()`. Böylece 200 kelimelik listede her seans farklı
kartlar gelir **ama liste bitmeden hiçbiri iki kez çıkmaz** — saf rastgele seçim
bunu yapamaz, aynı kartlar dönüp durur.

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

> **KURAL-12:** Kullanıcı kendi kaydını silebilir — `DELETE /api/dashboard/ocr/{id}`.
> Sahiplik kontrolü **sorgunun içinde** (`r.Id == id && r.UserId == userId`); uç
> idempotenttir ve "kayıt yok" ile "kayıt başkasının" arasında AYRIM YAPMAZ,
> aksi hâlde başkasının kaç kaydı olduğunu sayan bir numaralandırma aracı olurdu.
> Otomatik saklama süresi **yok** — bu bir ürün kararı gerektiriyor.

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

> 🔴 İkisinin aynı tabloda olması, log temizliğini tehlikeli kılar: saklama süresi
> bir günün altına çekilirse kullanıcıların **Groq kotası sıfırlanır.**
> **KURAL-12'de saklama süresi 90 gün olarak eklendi** (`SaklamaTemizligiServisi`) —
> bu eşik bugünün kayıtlarını güvenle aşar. Bağ, adında kotayı yazan bir testle
> sabitlendi (`Saklama_temizligi_GROQ_KOTA_SAYACINI_asla_silmez`) ve guard kapısı
> süreyi ayrıca denetliyor. **Bu iki işi ayırmak hâlâ açık teknik borçtur.**
>
> `(UserId, ActivityType, Timestamp)` ve `(Timestamp)` indeksleri KURAL-12'de eklendi:
> indekssiz bir `ExecuteDelete`, büyük log tablosunda tam tablo taraması yapar ve
> temizliğin kendisi bir kesinti sebebine dönüşür.
>
> Ayrıca `Details` alanına `"Word: {kelime}"` yazılması kullanıcının hangi kelimeleri
> bilmediğini log'a düşürür (gizlilik).
> Migration `20260714055926_AddUserActivityLog`, `20260901141323_KURAL12_VeriButunluguKisitlari`.

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

**İndeksler:** `(QueryText, ContextText)` — **UNIQUE** (KURAL-12) · `(CreatedAt)`.

> ✅ **Çözüldü (KURAL-12):**
> 1. İndeks artık **unique**; eşzamanlı iki istek aynı çift için iki satır yazamaz.
>    Çakışma `BenzersizKaydetAsync()` ile yutulur — kaybeden isteğin yazacağı değer
>    zaten yazılmıştır, bu bir hata değildir.
> 2. **Saklama süresi 365 gün** (`SaklamaTemizligiServisi`). Önbellek artık sonsuza
>    kadar büyümüyor ve eski çeviriler zamanla yenileniyor.
>
> ⚠️ **Açık kalan iki nokta:**
> 1. `Translation` alanında `|||` ile ayrılmış yapılandırılmamış format kullanılıyor.
>    Çevirinin kendisinde `|||` geçerse ayrıştırma bozulur (`parts.Length == 3` kontrolü
>    var, bozulursa tümü `GeneralMeaning`'e düşer — sessiz bozulma).
> 2. `ContextText` sınırsız `text`, `QueryText` `varchar(255)`. PostgreSQL btree
>    indeks satırı **2704 baytı** aşamaz. Ölçüldü (PostgreSQL 15, geçici tabloda):
>    - 255 + 2000 sıkıştırılamaz **ASCII** karakter (2255 bayt) → ✅ yazılıyor
>    - 255 + 2000 sıkıştırılamaz **CJK** karakter (6272 bayt) → ❌
>      `index row size 6272 exceeds btree version 4 maximum 2704`
>
>    Bu KURAL-12 ile **GELMEDİ**: aynı veri non-unique indekste de aynı hatayla
>    reddediliyor (ölçüldü). Girdi sınırı `CeviriBaglami = 2000` karakter olduğu
>    için sınır çok baytlı metinde erişilebilir durumda.
>
>    Yazım `try/catch` içinde **uyarı loglayarak** düşer, sessizce yutulmaz —
>    ve KURAL-12'de ChangeTracker temizliği eklendi: yutulan hata artık aynı
>    kapsamdaki SONRAKİ kaydetmeyi (ör. `Read` → `SentencesJson`) patlatmıyor.
>    Test: `Yutulan_onbellek_hatasi_SONRAKI_kaydetmeyi_patlatmaz`.
>
>    Kalıcı çözüm bağlamı hash'lemektir (`md5(ContextText)` üzerinde indeks);
>    bu kural kapsamı dışında bırakıldı.
>
> Migration `20260715193529_AddTranslationCache`, `20260901141323_KURAL12_VeriButunluguKisitlari`.

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
| 7 | `20260823160731_SeedAdminOrtamaTasindi` | KURAL-02: gömülü yönetici tohumu geçersizleştirildi |
| 8 | `20260824082727_KURAL05_TohumTarihiSabitlendi` | KURAL-05: seed zaman damgası sabitlendi |
| 9 | `20260829183257_SifreSifirlamaJetonu` | KURAL-09: `SifreSifirlamaJetonlari` |
| 10 | `20260901141323_KURAL12_VeriButunluguKisitlari` | KURAL-12: 7 unique index, saklama indeksleri, `Groups.AdminUserId` → `RESTRICT` |
| 11 | `20260904082257_KelimeCalismaIlerlemesi` | `WordListItems`'a çalışma ilerlemesi: `DogruSayisi`, `YanlisSayisi`, `DogruSeri`, `SonCalismaAt` |

Yeni migration eklemek:

```bash
dotnet tool restore                      # .config/dotnet-tools.json'dan dotnet-ef 8.0.11
cd EnglishReadingPlatform && dotnet dotnet-ef migrations add MigrationAdi
```

> ⚠️ **KURAL-12:** `dotnet-ef` artık depoya commit'lenmiş bir ikili değildir.
> Eskiden `EnglishReadingPlatform/dotnet-ef` + `.store/**` altında 2,6 MB'lık
> gözden geçirilmemiş çalıştırılabilir (Windows `.exe`'leri dâhil) sürüm
> kontrolündeydi. Yerine sürümü **metin olarak** sabitleyen bir manifest geldi:
> `.config/dotnet-tools.json`.
>
> `dotnet dotnet-ef` tasarım zamanında `Program.cs`'i çalıştırır, dolayısıyla
> `Jwt__Key` ve `ConnectionStrings__Default` ortam değişkenlerini ister
> (`SirDogrulayici` fail-fast). `migrations add` veritabanına BAĞLANMAZ —
> yer tutucu değerler yeterlidir; `migrations remove` ise bağlanır.

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

> ✅ **Çözüldü (KURAL-05, `20260824082727`):** Seed'deki `Book.CreatedAt` eskiden
> `DateTime.UtcNow` idi ve her `migrations add` çalıştırmasında sahte bir "model
> değişti" farkı üretiyordu. Artık `AppDbContext.TohumTarihi` sabitidir. Bu yalnızca
> gürültü meselesi değildi: her migration'ın kirli çıkması, aralarına karışan GERÇEK
> bir şema değişikliğini görünmez kılıyordu.

---

## 5. Silme davranışı

**KURAL-12'den beri silme davranışı EF varsayılanına bırakılmıyor** —
`AppDbContext.OnModelCreating` içinde her ilişki için AÇIKÇA yazılıyor. Bunun
sebebi yalnızca okunabilirlik değil: varsayılana güvenmek, EF sürümü ya da
model bir gün değiştiğinde davranışın sessizce kaymasına izin verir.

| Silinen | Otomatik silinenler (`Cascade`) | Reddedilir (`Restrict`) |
|---|---|---|
| `Book` | `Chapters`, `BookPages`, `Quizzes` | — |
| `User` | `ReadingProgresses`, `WordListItems`, `GroupMembers`, `QuizResults`, `UserActivityLogs`, `Feedbacks`, `OcrRecords`, `SifreSifirlamaJetonlari` | **yönettiği `Groups`** |

> ✅ **Çözüldü (KURAL-12, `20260901141323`):** Bir kullanıcı bir grubun
> `AdminUserId`'siyse, onu silmek eskiden `Groups` üzerinde cascade tetikliyor ve
> **grubu, tüm üyeliklerini ve kitap atamalarını** sessizce siliyordu. Yöneticiye
> hiçbir uyarı çıkmıyordu.
>
> Artık `Groups.AdminUserId` FK'si `ON DELETE RESTRICT`. Veritabanı reddediyor;
> `AdminController.DeleteUser` bu reddi **400 + yol gösteren mesaja** çeviriyor:
>
> ```
> "Bu kullanıcı 2 grubun yöneticisi. Silmeden önce grupları başka bir
>  yöneticiye devredin veya grupları silin."
> ```
>
> Kısıt tek başına bırakılsaydı yönetici anlaşılmaz bir 500 görürdü — bu,
> mutasyon testiyle doğrulandı (`Grup_yoneticisi_silinemez_once_devredilmeli`).
>
> **Açık teknik borç:** grup devri için henüz bir arayüz/uç yok. Şu an tek yol,
> grubu silmek ya da veritabanından `AdminUserId`'yi değiştirmek.

---

## 5b. Tekillik kısıtları (KURAL-12)

Mantıksal olarak tekil olması gereken her kayıt **veritabanı seviyesinde**
korunuyor. Uygulama katmanındaki `AnyAsync` + `Add` deseni tek başına yeterli
değildir: iki eşzamanlı istek aynı anda `false` alır ve iki satır açar.

| Tablo | Tekil alanlar | İhlalde ne oluyordu |
|---|---|---|
| `Users` | `Email`, `Username` | (önceden vardı) |
| `Groups` | `InviteCode` | (önceden vardı) |
| `SifreSifirlamaJetonlari` | `JetonHash` | (KURAL-09) |
| `ReadingProgresses` | `(UserId, BookId)` | Kitap panoda iki kez görünür, yüzdeler birbirini ezer |
| `TranslationCaches` | `(QueryText, ContextText)` | Önbellek şişer, hangi satırın okunacağı belirsizleşir |
| `GroupMembers` | `(GroupId, UserId)` | Çift üyelik; üye sayısı yanlış |
| `GroupBookAssignments` | `(GroupId, BookId)` | Aynı kitap iki kez atanır |
| `WordListItems` | `(UserId, Word)` | Mükerrer kelime |
| `BookPages` | `(BookId, PageNumber)` | Bozuk yükleme mükerrer sayfa üretir |
| `Quizzes` | `ChapterId` | Aynı bölüm için iki quiz; kullanıcı ikinci denemede farklı soru görür |

> ⚠️ `TranslationCaches.ContextText` **nullable**'dır ve PostgreSQL'de
> `NULL ≠ NULL`. Yani `(kelime, NULL)` çifti birden fazla kez yazılabilir.
> Pratikte sorun değil: önbellek yalnızca bağlam DOLU olduğunda yazılıyor
> (`TranslationService.TranslateWordAsync`).

**API sözleşmesi korundu.** Unique index eklemek, "kontrol et sonra ekle"
kullanan uçları yarış durumunda 500'e çevirirdi. Merkezî yardımcı
`Data/VeritabaniHatalari.cs` → `BenzersizKaydetAsync()` çakışmayı (SQLSTATE
`23505`) yutar, çakışan girdiyi izlemeden çıkarır ve `false` döner; uçlar
idempotent kalır. Bağlı uçlar: `books/addword`, `books/{id}/read`,
`books/quiz/{chapterId}`, `groups/join`, `groups/assignbook`, çeviri önbelleği.

---

## 5c. Saklama süreleri (KURAL-12)

`Data/SaklamaTemizligiServisi.cs` — günde bir kez çalışan `BackgroundService`.
Süreler **tek kaynakta**:

| Tablo | Saklama | Not |
|---|---|---|
| `UserActivityLogs` | **90 gün** | 🔴 KISALTMAYIN — aşağıya bakın |
| `TranslationCaches` | 365 gün | |
| `SifreSifirlamaJetonlari` | 7 gün | Süresi dolmuş jeton artık sır değil, kalıntıdır |

> 🔴 **`UserActivityLogs` iki iş birden yapıyor.** `ActivityType =
> 'ai_word_translation'` satırları yalnızca analitik değil, **Groq günlük kota
> sayacıdır**. Saklama süresi bir günün altına çekilirse kullanıcıların kotası
> her temizlikte sıfırlanır ve maliyet koruması sessizce çöker.
> Bu bağ testle sabitlendi (`Saklama_temizligi_GROQ_KOTA_SAYACINI_asla_silmez`)
> ve `scripts/guard/12-butunluk.sh` süreyi ayrıca denetliyor.

`OcrRecords` için **otomatik** saklama süresi yok (ürün kararı gerektirir),
ama kullanıcı kendi kaydını silebiliyor: `DELETE /api/dashboard/ocr/{id}`.

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
