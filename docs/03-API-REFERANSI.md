# 03 — API Referansı

**Taban adres:** `http://localhost:5001/api` (Docker) — üretimde `NEXT_PUBLIC_API_URL` ile ayarlanır
**Kimlik doğrulama:** `Authorization: Bearer <jwt>` başlığı **veya** `jwt_token` HttpOnly cookie
**İçerik tipi:** Aksi belirtilmedikçe `application/json`

## Hızlı dizin

| Yol | Metot | Yetki |
|---|---|---|
| [`/auth/login`](#post-authlogin) | POST | Açık |
| [`/auth/register`](#post-authregister) | POST | Açık |
| [`/auth/logout`](#post-authlogout) | POST | Açık |
| [`/auth/me`](#get-authme) | GET | Token |
| [`/books`](#get-books) | GET | Token |
| [`/books/{id}`](#get-booksid) | GET | Token |
| [`/books/{id}/read`](#get-booksidread) | GET | Token |
| [`/books/addword`](#post-booksaddword) | POST | Token |
| [`/books/words`](#get-bookswords) | GET | Token |
| [`/books/words/{id}`](#put-bookswordsid) | PUT / DELETE | Token + sahiplik |
| [`/books/quiz/{chapterId}`](#get-booksquizchapterid) | GET | Token |
| [`/books/submitquiz`](#post-bookssubmitquiz) | POST | Token |
| [`/translate/word`](#post-translateword) | POST | Token |
| [`/translate/sentence`](#post-translatesentence) | POST | Token |
| [`/translate/analyze`](#post-translateanalyze) | POST | Token |
| [`/groups`](#get-groups) | GET / POST | Token |
| [`/groups/join`](#post-groupsjoin) | POST | Token |
| [`/groups/{id}`](#get-groupsid) | GET | Token + üyelik |
| [`/groups/assignbook`](#post-groupsassignbook) | POST | Token + grup sahipliği |
| [`/dashboard/stats`](#get-dashboardstats) | GET | Token |
| [`/dashboard/ocr`](#get-dashboardocr) | GET / POST | Token |
| [`/books/words/calisma`](#get-bookswordscalisma) | GET | Token |
| [`/books/words/ozet`](#get-bookswordsozet) | GET | Token |
| [`/books/words/calisma-sonucu`](#post-bookswordscalisma-sonucu) | POST | Token + kelime sahipliği |
| [`/dashboard/ocr/{id}`](#delete-dashboardocrid) | DELETE | Token + kayıt sahipliği |
| [`/activity/log`](#post-activitylog) | POST | Token |
| [`/activity/stats`](#get-activitystats) | GET | Token 🔴 **admin olmalıydı** |
| `/books/taxonomy` | GET | Token — seviye/kategori/dil whitelist'i |
| [`/feedback`](#post-feedback) | POST | Token |
| [`/feedback/list`](#get-feedbacklist) | GET | **Admin** |
| [`/admin/*`](#admin-uçları) | — | **Admin** |

---

## Ortak davranışlar

### Hata gövdesi

Tüm hatalar aynı biçimdedir:

```json
{ "error": "Türkçe hata mesajı" }
```

**Doğrulama hataları (KURAL-05).** `[ApiController]` otomatik 400'leri normalde RFC 7807
`ProblemDetails` biçiminde döner; `Program.cs` içindeki `InvalidModelStateResponseFactory`
bunu yukarıdaki sözleşmeye çevirir ve ek olarak alan alan dökümü verir:

```json
{
  "error": "Kelime en fazla 200 karakter olabilir.",
  "hatalar": { "Word": ["Kelime en fazla 200 karakter olabilir."] }
}
```

İstemciler `error` alanını okumaya devam eder (`frontend/app/api.ts`); `hatalar` isteğe bağlıdır.

**Beklenmeyen hatalar (KURAL-06).** Yakalanmamış her istisna
`Middleware/HataYakalamaMiddleware` tarafından tek noktada yakalanır ve şu biçimde döner:

```json
{
  "error": "Beklenmeyen bir hata oluştu. Sorun sürerse bu kodu iletin: A1B2C3D4",
  "olayKimligi": "A1B2C3D4"
}
```

`olayKimligi` sunucu logundaki kayıtla **aynıdır** — destek akışı bu kodla arar.
İstisna metni, yığın izi ve iç ayrıntı **hiçbir ortamda** (Development dahil) gövdeye
girmez; bu bilinçli bir tercihtir, ortam ayrımına güvenilmez.

| Kod | Anlamı |
|---|---|
| 400 | Doğrulama hatası veya iş kuralı ihlali |
| 401 | Token yok / geçersiz / süresi dolmuş / iptal edilmiş |
| 403 | Token geçerli ama yetki yetersiz (yanlış rol, grup üyesi değil) |
| 404 | Kayıt bulunamadı |
| 413 | İstek gövdesi 2 MB sınırını aştı |
| 429 | Hız sınırı aşıldı — gövde `{ error }`, ayrıca `Retry-After` başlığı döner |
| 500 | Beklenmeyen hata — genel mesaj + `olayKimligi`, iç detay **sızmaz** (KURAL-06) |
| 503 | Ağır iş kuyruğu dolu (LLM/PDF) — birkaç saniye sonra tekrar denenmeli (KURAL-07) |

### Hız sınırı tablosu (KURAL-07)

.NET yerleşik `Microsoft.AspNetCore.RateLimiting` middleware'i; sabit 60 saniyelik pencere,
süreç belleğinde. Politikalar ve sayılar **tek kaynakta**:
`EnglishReadingPlatform/RateLimiting/HizSinirlari.cs`.

Bölümleme anahtarı: kimliği doğrulanmış istekte **kullanıcı kimliği**, aksi hâlde **IP**.
(Kimlik doğrulama politikaları kasten IP bazlıdır — henüz token yoktur.)

| Politika | Limit/dk | Bölümleme | Uçlar |
|---|---|---|---|
| `kimlik-dogrulama` | 10 | IP | `POST /auth/login`, `POST /auth/register` |
| `davet-kodu` | 5 | kullanıcı | `POST /groups/join` |
| `okuma` | 60 | kullanıcı | `GET /books/{id}/read` |
| `ceviri` | 100 | kullanıcı | `POST /translate/word`, `/translate/sentence` (ortak kova) |
| `agir-analiz` | 20 | kullanıcı | `POST /translate/analyze` |
| `yazma` | 60 | kullanıcı | diğer tüm POST/PUT/DELETE uçları (ortak kova) |
| `dosya-yukleme` | 5 | kullanıcı | `POST /admin/books/upload`, `/upload-pages` |
| *(global taban)* | 300 | kullanıcı/IP | politikadan bağımsız **her** istek |
| Groq bağlamsal çeviri | **30/gün** | kullanıcı | `POST /translate/word` (`useAI: true`) |

Ek sayaçlar:

| Sayaç | Limit | Kapsam |
|---|---|---|
| Hesap bazlı giriş | 15 dakikada 10 **başarısız** deneme | hedef e-posta (`HesapSayaci`) |
| Eşzamanlı ağır iş | aynı anda 4 | LLM analizi + PDF ayrıştırma (`AgirIsKapisi`) |

> **Hesap bazlı sayaç neden ayrı:** e-posta istek *gövdesindedir*; middleware gövdeyi
> okursa akış tüketilir ve controller boş gövde görür. Bu yüzden `AuthController` içinde
> çalışır. Kontrol şifre doğrulamasından **önce** yapılır: bütçe dolduysa doğru şifre de
> kabul edilmez. Yalnızca **başarısız** denemeler sayılır.

> **Kuyruk yoktur** (`QueueLimit = 0`): sınırı aşan istek beklemeye alınmaz, anında 429
> alır. Kuyrukta biriken istekler tam da korunmak istenen belleği tüketir.

### Girdi sınırları ve izinli değerler (KURAL-05)

Tüm sınırlar tek kaynaktan gelir: `EnglishReadingPlatform/Validation/AlanSinirlari.cs`.
Sınırı aşan istek **400** alır — 500 değil.

| Uç | Alan | Sınır |
|---|---|---|
| `POST /books/addword`, `PUT /books/words/{id}` | `word` | 200 |
| | `translation` | 500 |
| | `context` | 400 **girdi** sınırı; kayıtta 200'e kırpılır |
| `POST /activity/log` | `activityType` | whitelist (aşağıda) |
| | `details` | 200 |
| | `durationSeconds` | 0–3600 |
| `POST /feedback` | `message` | 1–1000 |
| `POST /translate/word` | `text` | 200 · `context` 2000 |
| `POST /translate/sentence`, `/translate/analyze` | `text` | 20 000 |
| `POST /dashboard/ocr` | `text` | 50 000 |
| `POST /auth/register` | `username` 3–100 · `email` 200 · `password` **10–128** | |
| `POST /auth/login` | `email` 200 · `password` 1–128 | |
| `POST /groups` | `name` 1–200 · `description` 500 | |
| `POST /groups/join` | `inviteCode` 1–32 | |
| `POST /books/submitquiz` | `answers` en fazla 100 giriş **ve** her değer `A`\|`B`\|`C`\|`D` (boş = cevapsız) | |
| `/admin/books/*` | `title` 1–200 · `author` 200 · `description` 500 | |
| `GET /books/{id}/read` | `chapter`, `page` (sorgu) | ≥ 1 — bu değerler `ReadingProgress`'e yazılıyor |
| Tüm `{id}` rotaları | rota parametresi | ≥ 1 |
| Tüm JSON uçları | istek gövdesi | **2 MB** (Kestrel, doğrulamadan ÖNCE → 413) |
| `/admin/books/upload*` | istek gövdesi | 50 MB (`[RequestSizeLimit]` ile geçersiz kılar) |
| `/admin/books/upload*` | `pageSelection` / `selectedPages` | Aralık, genişletilmeden önce belgenin sayfa sayısına kırpılır |

**Whitelist'ler** (`IzinliDegerler`, blocklist değil):

| Küme | Değerler |
|---|---|
| `level` | `A1` `A1-A2` `A2` `A2-B1` `B1` `B1-B2` `B2` `B2-C1` `C1` `C1-C2` `C2` |
| `category` | `story` `article` `other` |
| `language` | `en` |
| `role` (yönetici ataması) | `student` `teacher` `admin` |
| `role` (kayıt) | `student` `teacher` — **`admin` yok** |
| `activityType` | `PageView` `ReadBook` `TakeQuiz` `AuthView` `ai_word_translation` |

> Bu listeler `frontend/app/books/page.tsx` (LEVELS) ve `admin-panel/app/books/page.tsx`
> (`<option>`) ile **birebir aynı** olmak zorundadır; `AlanSinirlariTests` her iki dosyayı
> okuyup karşılaştırır, ayrışırsa test kırmızı olur.

### Alan adlandırma

ASP.NET Core varsayılan olarak **camelCase** JSON üretir (`System.Text.Json`).
Ancak anonim nesnelerde PascalCase yazılan alanlar da (`TotalPages`, `HasPages`) camelCase'e
dönüşür. Tek istisna `BookPage.SentencesJson` — bu bir **string içindeki JSON**'dır ve
`JsonSerializer.Serialize` ile üretildiği için `JsonPropertyName` özniteliklerine uyar
(camelCase). Frontend yine de her iki biçimi de okuyacak şekilde savunmacı yazılmıştır.

---

## Auth

### `POST /auth/login`

Açık uç. Hız sınırı: `kimlik-dogrulama` politikası, IP başına 10/dk. Ayrıca hedef
e-posta başına 15 dakikada 10 **başarısız** deneme (bkz. hız sınırı tablosu).

**İstek**
```json
{ "email": "ogrenci@ornek.com", "password": "gizli123" }
```

**200**
```json
{
  "token": "eyJhbGciOi...",
  "user": { "id": 5, "username": "ogrenci", "email": "ogrenci@ornek.com", "role": "student" }
}
```
Ayrıca `Set-Cookie: jwt_token=...; HttpOnly; SameSite=Lax` gönderilir
(`Secure` yalnızca Development dışında).

**Token ömrü:** admin → 1 saat, diğer roller → 24 saat.

| Hata | Kod |
|---|---|
| Email/şifre boş | 400 |
| Hatalı kimlik | 401 `"Email veya şifre hatalı."` (kullanıcı enumerasyonu yapmaz ✅) |
| Rate limit | 429 |

---

### `POST /auth/register`

Açık uç. Hız sınırı: `kimlik-dogrulama` politikası, IP başına 10/dk.

**İstek**
```json
{ "username": "yeni", "email": "yeni@ornek.com", "password": "gizli123", "role": "student" }
```

**Kurallar**
- Tüm alanlar zorunlu
- Şifre **en az 6 karakter** (karmaşıklık kuralı yok)
- `role` yalnızca `"teacher"` gönderilirse teacher olur, aksi her değer `"student"`'a düşer
  → **`admin` rolü kayıtla alınamaz** ✅
- Email `.Trim().ToLower()`, username `.Trim()`

**200:** login ile aynı gövde + cookie (24 saat).

| Hata | Kod |
|---|---|
| Eksik alan | 400 |
| Şifre < 6 | 400 |
| Email/username kullanımda | 400 `"Bu email veya kullanıcı adı zaten kullanımda."` ⚠️ enumerasyon |

---

### `POST /auth/logout`

Token'ı `Authorization` başlığından veya cookie'den okur, iptal listesine ekler, cookie'yi siler.

**200** `{ "message": "Başarıyla çıkış yapıldı ve token iptal edildi." }`

> 🔴 **Bu uç şu an sessizce başarısız oluyor.** `RevokeToken` ham token stringini
> saklıyor ama doğrulama `jti` claim'iyle arıyor — anahtar eşleşmiyor, iptal edilen token
> 24 saat daha geçerli kalıyor. Detay ve düzeltme: [07-GUVENLIK.md](07-GUVENLIK.md) #5.

---

### `GET /auth/me`

Token'daki `NameIdentifier` claim'inden kullanıcıyı çeker.

**200** `{ "user": { "id", "username", "email", "role" } }`
**401** token yoksa · **404** kullanıcı silinmişse

> Not: Bu uçta `[Authorize]` özniteliği **yok**; kontrol elle yapılıyor
> (`User.FindFirst(...) == null → 401`). Sonuç aynı ama tutarsız.

---

## Books

Tüm uçlar `[Authorize]`. `CurrentUserId` = token'daki `NameIdentifier`.

### `GET /books`

Kitaplığı, oturum açan kullanıcının ilerlemesiyle birlikte döner.

**200**
```json
[
  {
    "id": 1, "title": "The Adventures of Tom Sawyer", "author": "Mark Twain",
    "coverColor": "#6366f1", "description": "...",
    "level": "A1-A2", "category": "story",
    "chaptersCount": 2, "progress": 50.0, "currentChapter": 1
  }
]
```

> `chaptersCount` yalnızca `Chapters` sayar — sayfa modundaki kitaplarda **0** gelir.

---

### `GET /books/{id}`

**200**
```json
{
  "id": 1, "title": "...", "author": "...", "coverColor": "#6366f1",
  "description": "...", "level": "B1", "category": "story",
  "hasPages": true,
  "chapters": [{ "id": 1, "chapterNumber": 1, "title": "..." }],
  "pages":    [{ "id": 10, "pageNumber": 1 }]
}
```
**404** kitap yok

---

### `GET /books/{id}/read`

Okuyucunun ana ucu. **Yan etkisi vardır:** `ReadingProgress` günceller ve gerekirse
sayfayı analiz edip veritabanına yazar.

**Sorgu parametreleri**

| Parametre | Varsayılan | Anlamı |
|---|---|---|
| `chapter` | **kaldığı yer** | Bölüm modunda hangi bölüm |
| `page` | **kaldığı yer** | Sayfa modunda hangi sayfa |
| `reanalyze` | false | `true` ise mevcut `SentencesJson` yok sayılıp yeniden analiz edilir |

> **Kaldığı yerden devam.** `page`/`chapter` **verilmezse** sunucu bu kullanıcının
> `ReadingProgress.CurrentChapter` kaydını okur ve oradan açar. Verilirse kullanıcı
> isteği kazanır.
>
> Öncesinde ikisi de `1` varsayılanıyla geliyordu: ilerleme KURAL-12'den beri
> **kaydediliyor ama hiç okunmuyordu.** 27 sayfalık bir kitabı 12. sayfada bırakan
> kullanıcı, kitabı her açtığında 1. sayfayı görüyordu.
>
> **Sınır dışı kayıtlı konum kırpılır.** Kitap yeniden yüklenip kısaldıysa,
> 9. sayfada kalan biri **son sayfaya** düşer — ilk sayfaya değil; ilk sayfaya
> atmak ilerlemeyi sessizce silmek olurdu (test: `Kitap_kisaldiysa_kayitli_konum_KIRPILIR`).
>
> Yanıttaki `pageNumber` / `chapterNumber` **çözülen** konumdur; istemci adres
> çubuğunu bununla eşitler. Kaldığı yer kullanıcıya özeldir
> (test: `Kaldigi_yer_KULLANICIYA_ozeldir`).

Hız sınırı: `okuma` politikası, kullanıcı başına 60/dk.

**200 — sayfa modu (`hasPages: true`)**
```json
{
  "bookId": 1, "bookTitle": "…", "hasPages": true,
  "currentPage": {
    "id": 10, "pageNumber": 3,
    "content": "The old man was thin...",
    "sentencesJson": "[{\"index\":0,\"original\":\"...\"}]"
  },
  "totalPages": 24, "pageNumber": 3
}
```

**200 — bölüm modu (`hasPages: false`)**
```json
{
  "bookId": 1, "bookTitle": "…", "hasPages": false,
  "currentChapter": { "id": 1, "chapterNumber": 1, "title": "…", "content": "…" },
  "totalChapters": 2, "chapterNumber": 1
}
```

Bölüm modunda çeviri **gelmez** — istemci ayrıca `POST /translate/analyze` çağırmalıdır.

**Davranış notları**
- İstenen sayfa/bölüm yoksa **ilkine düşer** (404 vermez)
- `ProgressPercent = (page / toplamSayfa) × 100` olarak her okumada yeniden hesaplanır —
  yani geri sayfaya dönmek ilerlemeyi **düşürür**
- `reanalyze=true` her çağrıda tam maliyetli LLM analizi tetikler; istemcide bu düğme
  commit `2d9cc0c` ile kaldırıldı ama uç hâlâ açık

---

### `POST /books/addword`

```json
{ "word": "gaunt", "translation": "bitkin, sıska", "context": "The old man was thin and gaunt." }
```

- `word` ve `translation` zorunlu (boşsa 400)
- Aynı kullanıcıda **aynı kelime zaten varsa sessizce hiçbir şey yapmaz** ve yine `200`
  `{ "success": true }` döner (üstüne yazmaz)
- ⚠️ `context` 200 karakteri aşarsa 500 (varchar taşması)

---

### `GET /books/words`

---

### `GET /books/words/calisma`

Seanslık kart dilimi. `?adet=20` (varsayılan **20**, sınır **1–100**).

```json
[{ "id": 12, "word": "gaunt", "translation": "zayıf", "context": "…",
   "dogruSeri": 1, "ogrenildi": false }]
```

**400** `adet` sınırların dışındaysa.

> Kartlar **rastgele değil, öncelikli** seçilir: önce hiç çalışılmamışlar,
> sonra çalışılmış ama öğrenilmemişler (en eskiden), sonra tekrar. Bant içinde
> sıra rastgeledir.
>
> **Neden:** 200 kelimelik bir liste tek oturumda bitmiyor. Saf rastgele seçim
> aynı kartları döndürür ve liste hiç kapanmaz; öncelikli seçim kapsama garantisi
> verir. Sözleşme testi: `Calisilmis_kelimeler_siranin_SONUNA_gider`.

### `GET /books/words/ozet`

```json
{ "toplam": 200, "ogrenildi": 35, "calisiliyor": 60,
  "hicCalisilmadi": 105, "ogrenildiEsigi": 3 }
```

Sayım SQL'de yapılır — 200 satırı belleğe çekip saymak, listesini büyüten
kullanıcıyı cezalandırırdı. `ogrenildiEsigi` yanıta **bilerek** konur: istemci
eşiği kopyalamaz, sunucudan okur.

### `POST /books/words/calisma-sonucu`

```json
{ "kelimeId": 12, "bildim": true }
```

**200** `{ "success": true }`. Hız sınırı: `Yazma`.

Sunucu `bildim` değerine göre `DogruSayisi`/`YanlisSayisi`'nı artırır ve
`DogruSeri`'yi günceller (bilememek seriyi **sıfırlar**).

> **Kütle atama yok:** istek yalnızca `kelimeId` ve `bildim` taşır. Sayaçlar
> sunucuda hesaplanır — istemci `dogruSeri` gönderemez, yoksa "öğrenildi" rozeti
> tek istekle satın alınabilirdi. Test: `Istemci_sayaclari_DOGRUDAN_yazamaz`.
>
> **Sahiplik sorgunun içinde** (`w.Id == kelimeId && w.UserId == userId`).
> Uç idempotenttir ve **ayrım yapmaz**: "kelime yok" ile "kelime başkasının"
> aynı 200'ü döner — farklı yanıtlar hangi kayıt numaralarının var olduğunu
> sayan bir araç olurdu. Ayrıca seans sürerken silinen bir kelime hata üretmez.
> Test: `Baskasinin_kelimesinin_ilerlemesi_BOZULAMAZ`.


Kullanıcının kelimelerini `AddedAt` azalan sırada döner.

```json
[{ "id": 3, "userId": 5, "word": "gaunt", "translation": "...", "context": "...", "addedAt": "2026-08-19T..." }]
```

---

### `PUT /books/words/{id}` · `DELETE /books/words/{id}`

Her ikisi de sorguyu `w.Id == id && w.UserId == CurrentUserId` ile kısıtlar ✅
(başkasının kelimesine erişilemez).

**PUT** gövdesi `addword` ile aynı. `word`/`translation` boşsa 400, kayıt yoksa 404.
**DELETE** kayıt yoksa da `200 { "success": true }` döner (idempotent).

---

### `GET /books/quiz/{chapterId}`

Bölüm için quiz döner; **yoksa o anda üretir** (`QuizGeneratorService`, 5 soru).

**200**
```json
{
  "id": 4, "title": "Alice in Wonderland — Down the Rabbit Hole Quiz",
  "bookId": 2, "chapterId": 3,
  "questions": [
    { "id": 11, "questionText": "Which word appears in the text of '...'?",
      "options": ["curiosity", "waistcoat", "daisy-chain", "remarkable"] }
  ]
}
```

`correctAnswer` **gönderilmez** ✅. Sorular basit sözcük/boşluk doldurma kalıplarıdır,
yapay zekâ kullanılmaz — bkz. [04-BACKEND.md § QuizGeneratorService](04-BACKEND.md).

---

### `POST /books/submitquiz`

```json
{ "quizId": 4, "answers": { "11": "A", "12": "C" } }
```
`answers` — soru id'si → şık harfi sözlüğü.

**200**
```json
{
  "score": 3, "total": 5,
  "evaluation": [
    { "questionId": 11, "questionText": "...", "userAnswer": "A", "correctAnswer": "B", "isCorrect": false }
  ]
}
```
Sonuç `QuizResults` tablosuna yazılır. **Aynı quiz defalarca çözülebilir**, her seferinde
yeni satır açılır.

---

## Translate

### `GET /books/taxonomy`

Seviye, kategori ve dil whitelist'lerini döner. **İstemciler bu listeleri kopyalamaz.**

```json
{
  "levels": ["A1","A1-A2","A2","A2-B1","B1","B1-B2","B2","B2-C1","C1","C1-C2","C2"],
  "categories": ["story","article","other"],
  "languages": ["en"]
}
```

**Her iki istemci de** bu uçtan besleniyor (`frontend/app/api.ts → getTaxonomy`,
`admin-panel/app/books/page.tsx`); uç erişilemezse kendi içlerindeki
`YEDEK_TAKSONOMI` sabitine düşerler. O yedekler de `AlanSinirlariTests`
tarafından backend whitelist'iyle karşılaştırılır — sessizce ayrışamazlar.

İstemcilerde yalnızca **görünüm** kalır (etiket, alt başlık, renk, ikon);
hangi değerlerin var olduğu tek kaynaktan gelir.

---

### `POST /translate/word`

```json
{ "text": "gaunt", "context": "The old man was thin and gaunt.", "useAI": false }
```

| Alan | Zorunlu | Not |
|---|---|---|
| `text` | ✅ | Boşsa `200 { "translation": "" }` |
| `context` | ✖ | Verilirse önbellek anahtarının parçası olur |
| `useAI` | ✖ | `true` → Groq'a git (kotalı). `false` → önbellek + Google |

**200**
```json
{
  "translation": "Anlamı: bitkin\nCümledeki Anlamı: sıska\n\nEş Anlamlılar: zayıf, cılız",
  "generalMeaning": "bitkin",
  "contextualMeaning": "sıska",
  "synonyms": "zayıf, cılız",
  "type": "sıfat"
}
```

`translation` alanı, üç parçanın **insan okunur birleşimidir**; yapılandırılmış veri için
diğer üç alanı kullanın.

| Hata | Kod |
|---|---|
| Dakikalık limit (100) | 429 |
| Günlük Groq kotası (30) | 400 `"Günlük 30 olan yapay zeka bağlamsal kelime çeviri limitinizi doldurdunuz."` |

**Kota mantığı:** kota yalnızca `useAI=true` **ve** `context` dolu **ve** önbellekte yoksa
harcanır. Önbellek isabetleri bedavadır.

---

### `POST /translate/sentence`

```json
{ "text": "The old man was thin and gaunt." }
```
**200** `{ "translation": "Yaşlı adam zayıf ve bitkindi.", "ceviriBasarili": true, "kaynak": "google" }`

Google Translate'in resmi olmayan `translate_a/single` ucunu kullanır; başarısız olursa
Groq'a düşer.

> **KURAL-06 (2026-08-25):** yanıta `ceviriBasarili` ve `kaynak` alanları eklendi.
> Her iki yol da başarısız olursa `translation` yine **özgün İngilizce metni** taşır
> ama `ceviriBasarili: false` olur. Eskiden bu ayrım hiç yapılmıyordu: istemci
> İngilizce metni Türkçe çeviri sanıyordu.
> `kaynak`: `google` | `groq` | `yok`.
>
> ✅ Frontend bu bayrağı **gösteriyor**: okuyucu (`books/[id]`) ve OCR sayfası
> çevrilemeyen satırı amber bir uyarıyla işaretler ve sayfa başında
> "N satır çevrilemedi" şeridi + **Yeniden dene** butonu çıkarır.

---

### `POST /translate/analyze`

Bir metni cümlelere ve kelimelere ayırıp çevirir. Bölüm modundaki okuyucunun ve OCR
sayfasının kullandığı uçtur.

```json
{ "text": "Alice was beginning to get very tired..." }
```

**200**
```json
{
  "sentences": [
    {
      "index": 0,
      "original": "Alice was beginning to get very tired.",
      "translation": "Alice çok yorulmaya başlamıştı.",
      "isHeading": false, "alignment": "left", "indentation": 0,
      "words": [{ "word": "Alice", "translation": "Alice", "type": "isim" }]
    }
  ]
}
```

Her cümle ayrıca `"ceviriBasarili": true|false` taşır (KURAL-06) — `false` ise
`translation` gerçek bir çeviri değil, özgün metnin kendisidir.

Hız sınırı: `agir-analiz` politikası, kullanıcı başına 20/dk. Ayrıca eşzamanlılık
kapısına tabidir: aynı anda 4 ağır iş; kapı doluysa **503** döner.
**400** metin boşsa veya cümle bulunamazsa · **500** genel mesaj + **olay kimliği**
(`{ "error": "Beklenmeyen bir hata oluştu. Sorun sürerse bu kodu iletin: A1B2C3D4",
"olayKimligi": "A1B2C3D4" }`). İstisna metni **hiçbir ortamda** gövdeye girmez —
ayrıntı yalnızca sunucu logunda, aynı olay kimliğiyle.
⚠️ iç istisna mesajı istemciye sızıyor.

---

## Groups

### `GET /groups`

```json
{
  "myGroups":    [{ "id", "name", "description", "inviteCode", "membersCount", "assignments": [{ "bookId", "title" }] }],
  "adminGroups": [ ... ]
}
```
`myGroups` = üye olunanlar, `adminGroups` = `AdminUserId` olunanlar. **Kesişebilirler**
(grup kurucusu kendi grubuna üye olarak da eklenir).

> ⚠️ `inviteCode` her iki listede de dönüyor; yani sıradan bir üye de kodu görebiliyor
> ve dağıtabiliyor. Tasarım gereği mi, bilinçsiz mi belirsiz.

---

### `POST /groups`

```json
{ "name": "9-A İngilizce", "description": "2026 güz dönemi" }
```
`name` zorunlu. Kurucu otomatik olarak `role: "admin"` ile üye eklenir.

**200** — `Group` entity'si **olduğu gibi** döner (`AdminUserId` dahil).

---

### `POST /groups/join`

```json
{ "inviteCode": "A3F91B2C" }
```
Kod `.Trim().ToUpper()` ile aranır. Zaten üyeyse sessizce başarı döner.

**200** `{ "success": true, "groupId": 7, "groupName": "9-A İngilizce" }`
**400** geçersiz kod

**429** hız sınırı — kullanıcı başına dakikada 5 deneme (`davet-kodu` politikası, KURAL-07)

> ⚠️ Davet kodunun **entropisi** hâlâ 8 hex karakter. Hız sınırı denemeyi pahalı hale
> getirir ama kodu güçlendirmez; kod üretimi KURAL-12'de ele alınacak.

---

### `GET /groups/{id}`

Üye veya grup sahibi değilse **403**.

```json
{
  "group": { "id", "name", "description", "inviteCode", "adminUserId",
             "members": [{ "userId", "username", "role" }] },
  "allBooks": [{ "id", "title" }],
  "progresses": [{ "userId", "username", "bookTitle", "progressPercent", "currentChapter", "lastRead" }],
  "quizResults": [{ "username", "bookTitle", "quizTitle", "score", "totalQuestions", "takenAt" }]
}
```

> ⚠️ `progresses` ve `quizResults`, üyelerin **tüm** okuma/quiz verisini içerir — sadece
> gruba atanmış kitapları değil. Yani gruba katılan herkes, diğer üyelerin özel okuma
> geçmişini görür. Bkz. [07-GUVENLIK.md](07-GUVENLIK.md) #6.

---

### `POST /groups/assignbook`

```json
{ "groupId": 7, "bookId": 3 }
```
Yalnızca `AdminUserId` eşleşirse çalışır, değilse **403**. Zaten atanmışsa sessizce başarı.

---

## Dashboard & OCR

### `GET /dashboard/stats`

```json
{
  "user": { "id", "username", "email", "role" },
  "recentProgress": [{ "bookId", "bookTitle", "progressPercent", "currentChapter", "lastRead" }],
  "wordCount": 42,
  "quizCount": 7
}
```
`recentProgress` — `LastRead` azalan, en fazla 3 kayıt.

### `GET /dashboard/ocr`

Kullanıcının OCR kayıtları, `ScannedAt` azalan.
**KURAL-08:** entity değil `OcrYaniti` DTO'su döner — `ImagePath` (sunucu dosya
yolu) ve `User` navigasyonu dönmez.

### `POST /dashboard/ocr`

```json
{ "text": "The quick brown fox..." }
```
**200** oluşturulan `OcrYaniti`. **400** metin boşsa. Hız sınırı: `Yazma`.

### `DELETE /dashboard/ocr/{id}`

Kullanıcının **kendi** OCR kaydını siler. **200** `{ "success": true }`.
Hız sınırı: `Yazma`.

> **KURAL-12:** Bu uç bir saklama gereğidir — OCR kayıtları kullanıcının taradığı
> HAM METİNDİR (ders notu, bir mektup, bir belge fotokopisi olabilir) ve önceden
> silmenin **hiçbir yolu yoktu**: ne kullanıcı için bir uç, ne otomatik saklama süresi.
>
> **Sahiplik sorgunun İÇİNDEDİR** (`r.Id == id && r.UserId == userId`) — yalnızca
> `Id` ile arayıp sonra kontrol etmek bir IDOR bırakırdı.
>
> Uç **idempotenttir ve kasıtlı olarak ayrım yapmaz**: "kayıt yok" ile "kayıt
> başkasının" aynı 200'ü döner. Farklı yanıtlar, başkasının kaç kaydı olduğunu
> sayan bir numaralandırma aracı olurdu.
>
> İstemci: `api.deleteOcrRecord(id)` (`frontend/app/api.ts`).

---

## Activity

### `POST /activity/log`

```json
{ "activityType": "ReadBook", "details": "Kitap ID: 5 - Kitap Okuyor", "durationSeconds": 30 }
```

Son 5 dakikada aynı `(userId, activityType, details)` üçlüsü varsa yeni satır açmaz,
`DurationSeconds` toplar ve `Timestamp`'i günceller.

> ⚠️ `activityType` (50) ve `details` (200) uzunluk kontrolü yok → uzun değer 500 üretir.
> Ayrıca `activityType` istemci kontrolünde; bir kullanıcı `"ai_word_translation"` tipinde
> log **atamaz mı?** Atabilir — ama bu kendi kotasını doldurmaktan başka işe yaramaz.
> Tersi tehlikeli değil çünkü kota sayacı sadece artıyor.

### `GET /activity/stats`

Son 100 aktivite kaydını **tüm kullanıcılar için** döner.

```json
[{ "id", "userId", "username", "activityType", "details", "durationSeconds", "timestamp" }]
```

> 🔴 **Yetki açığı.** Yalnızca `[Authorize]` var, rol kontrolü **yok**. Herhangi bir
> öğrenci tokenıyla tüm kullanıcıların adı, ne okuduğu ve ne kadar süre harcadığı
> çekilebiliyor. Kodda yorum bile duruyor: *"İleride admin kontrolü de eklenebilir"*.
> Tam analiz ve düzeltme: [07-GUVENLIK.md](07-GUVENLIK.md) #1.

---

## Feedback

### `POST /feedback`
```json
{ "message": "Kelime kartındaki ses düğmesi mobilde çalışmıyor." }
```
**400** boşsa. Uzunluk sınırı (1000) kodda kontrol edilmiyor → uzun mesaj 500 üretir.

### `GET /feedback/list` — **Admin**
```json
[{ "id", "message", "createdAt", "username", "email" }]
```

---

## Admin uçları

Hepsi `[Authorize(Roles = "admin")]`, ön ek `/api/admin`.

### `GET /admin/stats`
```json
{ "totalUsers": 42, "totalBooks": 12, "totalGroups": 5, "totalQuizResults": 130,
  "recentUsers": [{ "id", "username", "email", "role", "createdAt" }] }
```
`totalUsers` admin'leri saymaz. `recentUsers` en yeni 5 (admin hariç).

### `GET /admin/users`
```json
[{ "id", "username", "email", "role", "createdAt", "readingCount", "wordCount", "quizCount" }]
```
Bu listede admin'ler **de** yer alır. `passwordHash` dönmez ✅.

### `PUT /admin/users/{id}/role`
```json
{ "role": "teacher" }
```
Whitelist: `student` | `teacher` | `admin`. **Kendi rolünü değiştiremez** ✅ (400).
**200** `{ "success": true, "userId": 5, "newRole": "teacher" }`

> ✅ Rol değiştiğinde kullanıcının mevcut tokenları **anında iptal edilir**
> (`ITokenIptalDeposu.KullaniciTumTokenlariniIptalEt`, KURAL-04).
> Test: `TokenYasamDongusuTests.Rol_degisince_eski_token_gecersiz_olur`.

### `DELETE /admin/users/{id}`
Kendi hesabını silemez (**400**). Cascade ile kullanıcının kişisel verisi silinir
(ilerleme, kelime listesi, üyelikler, quiz sonuçları, aktivite logu, geri bildirim,
OCR kayıtları, şifre sıfırlama jetonları). **KURAL-04:** silinen kullanıcının
tüm token'ları anında iptal edilir.

**KURAL-12 — grup sahipliği kontrolü.** Kullanıcı bir veya daha fazla grubun
`AdminUserId`'siyse silme **reddedilir**:

```json
// 400
{
  "error": "Bu kullanıcı 2 grubun yöneticisi. Silmeden önce grupları başka bir yöneticiye devredin veya grupları silin.",
  "gruplar": [{ "id": 3, "name": "9-A İngilizce" }, { "id": 7, "name": "Hazırlık" }]
}
```

> Eskiden bu istek **200** dönüyor ve grubu, tüm üyeliklerini ve kitap atamalarını
> **sessizce siliyordu** (EF cascade varsayılanı). Şema artık `ON DELETE RESTRICT`;
> yani kontrol kaldırılsa bile veri kaybı olmaz — kullanıcı yalnızca anlaşılmaz bir
> 500 görür. Bkz. [02-VERITABANI.md § 5](02-VERITABANI.md).
>
> ⚠️ **Devir arayüzü henüz yok** — açık teknik borç.

### `GET /admin/books`
```json
[{ "id", "title", "author", "description", "language", "level", "category", "createdAt", "chapterCount" }]
```
⚠️ `pageCount` **yok** — sayfa modundaki kitaplar panelde `chapterCount: 0` görünür.

### `POST /admin/books/upload` — bölüm modu (eski akış)

`multipart/form-data`, maks. **50 MB**.

| Alan | Not |
|---|---|
| `file` | `.pdf` veya `.docx` |
| `Title` | Zorunlu |
| `Author`, `Description`, `Language`, `CoverColor`, `Level`, `Category` | İsteğe bağlı |
| `PageSelection` | İsteğe bağlı sayfa aralığı |

Metin çıkarılır → Groq/regex ile bölümlere ayrılır → `Chapters` yazılır.

**200** `{ "success": true, "bookId", "title", "chaptersCreated", "pageCount" }`
**400** dosya yok / başlık yok / desteklenmeyen uzantı / boyut aşımı / metin çıkarılamadı
**500** `"Dosya işlenirken hata oluştu: {ex.Message}"` ⚠️ iç detay sızıyor

### `POST /admin/books/upload-pages` — sayfa modu (güncel akış)

`upload` ile aynı alanlar, ek olarak:

| Alan | Format |
|---|---|
| `SelectedPages` | `"3,4,5,7"` — virgülle ayrılmış PDF sayfa numaraları |

Sayfalar sıralanır, tekilleştirilir, tek tek okunur. Boş sayfalar **atlanır**.
Hiç metin çıkmazsa oluşturulan `Book` **geri silinir** ve 400 döner ✅.

**200** `{ "success": true, "bookId", "title", "pagesCreated" }`

> `PageNumber` 1'den yeniden numaralandırılır (PDF'in 3,7,12 → DB'de 1,2,3).
> `SentencesJson` `"[]"` olarak bırakılır; ilk okuyan kullanıcı analiz maliyetini üstlenir.

### `PUT /admin/books/{id}`
```json
{ "title": "...", "author": "...", "description": "...", "language": "en", "level": "B2", "category": "article" }
```
Yalnızca metadata günceller, içeriğe dokunmaz. `title` boşsa 400.
**200** `{ "success": true, "book": { ...tüm entity... } }`

### `DELETE /admin/books/{id}`
Sırayla `QuizQuestions` → `Quizzes` → `GroupBookAssignments` → `ReadingProgresses`
temizlenir, sonra `Book` silinir (`Chapters` ve `BookPages` cascade ile gider).
Tek `SaveChangesAsync()` içinde, yani atomiktir ✅ (commit `08ec85d`).

**200** `{ "success": true, "deletedBookId": 5 }`

### `GET /admin/groups`
```json
[{ "id", "name", "description", "inviteCode", "createdAt", "memberCount" }]
```

---

## Var olmayan ama beklenebilecek uçlar

Bunlar **yoktur** — yeni özellik planlarken bilinmesi gerekir:

- Şifre sıfırlama / e-posta doğrulama
- Şifre değiştirme
- Kullanıcının kendi profilini güncellemesi
- Gruptan ayrılma / üye çıkarma / grup silme
- Kitap atamasını kaldırma
- OCR kaydı silme
- Kelime listesini toplu içe/dışa aktarma
- Sağlık kontrolü (`/health`) — Docker healthcheck backend için tanımlı değil
- Swagger / OpenAPI — `AddSwaggerGen` çağrılmıyor
