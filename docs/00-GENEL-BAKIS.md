# 00 — Genel Bakış

## 1. Ürün nedir?

**Linguza** (kod içinde eski adıyla "English Reading Platform"), İngilizce seviyesini
okuyarak geliştirmek isteyen Türkçe konuşan kullanıcılar için yapılmış bir web platformudur.
Beelinguapp benzeri "çift dilli okuma" mantığını temel alır, üzerine yapay zekâ destekli
bağlamsal kelime çevirisi, OCR ve sınıf yönetimi ekler.

### Kullanıcının yaşadığı akış

```
Kayıt/Giriş → Kitaplık (seviye + kategori filtresi) → Kitabı aç
   → Sayfa/bölüm okunur
   → Cümleye tıkla  → altında Türkçe çevirisi açılır
   → Kelimeye tıkla → sağ altta kelime kartı (anlam, eş anlamlılar, tür, sesli okuma)
   → "Kelimelerime Ekle" → Kelime Listem sayfasında flashcard olarak çalışılır
   → Bölüm sonunda Quiz çözülür
```

Buna paralel iki yan modül:
- **OCR:** Telefonla çekilen bir İngilizce sayfanın fotoğrafı tarayıcıda (Tesseract.js)
  metne çevrilir, sonra aynı kelime/cümle çeviri deneyimiyle okunur.
- **Gruplar:** Bir öğretmen grup açar, davet kodu paylaşır, üyelerine kitap atar ve
  kimin hangi kitabı yüzde kaç okuduğunu / quiz notlarını görür.

Ayrı bir **yönetici paneli** ile PDF/DOCX yüklenerek kitap eklenir, kullanıcı rolleri
yönetilir, kullanıcı geri bildirimleri ve canlı aktivite akışı izlenir.

---

## 2. Sistem dört parçadan oluşur

| Parça | Klasör | Teknoloji | Port |
|---|---|---|---|
| **Backend API** | `EnglishReadingPlatform/` | ASP.NET Core 8 Web API + EF Core | 5001 (Docker) / 8080 (konteyner içi) |
| **Kullanıcı arayüzü** | `frontend/` | Next.js 16 (App Router) + React 19 + Tailwind v4 | 3000 |
| **Yönetici paneli** | `admin-panel/` | Next.js 14 (App Router) + React 18 + Tailwind v3 | 3001 |
| **Veritabanı** | — | PostgreSQL 15 | 5432 |

Ek olarak `pgadmin` (8080) geliştirme kolaylığı için `docker-compose.yml` içinde tanımlıdır.

> **Not:** İki Next.js uygulaması **kasıtlı olarak farklı sürümlerde**. `frontend`
> Next 16 / React 19, `admin-panel` Next 14 / React 18 kullanıyor. Ortak paket yok,
> monorepo aracı yok — her biri kendi `package.json` ve `node_modules`'una sahip.

### Aktif olmayan / ölü parçalar

| Yol | Durum |
|---|---|
| `EnglishReadingPlatform/Views/**/*.cshtml` | **Ölü kod.** `Program.cs` yalnızca `AddControllers()` çağırıyor; `AddControllersWithViews()` veya `MapDefaultControllerRoute()` yok. Razor View pipeline'ı hiç kurulmuyor, bu dosyalar hiçbir zaman render edilmez. Projenin API-first mimariye geçmeden önceki MVC döneminden kalmıştır. |
| `EnglishReadingPlatform/wwwroot/js/app.js`, `css/app.css`, `lib/jquery*` | Aynı sebeple ölü. `UseStaticFiles()` aktif olduğu için servis edilebilirler ama hiçbir sayfa onları çağırmıyor. |
| `mobile/` | Sadece boş bir `node_modules` içeriyor. React Native uygulaması **henüz başlamamış**. |
| `EnglishReadingPlatform/englishplatform.db` | SQLite kalıntısı. Proje PostgreSQL'e geçti (`UseNpgsql`), bu dosya kullanılmıyor ama git'te duruyor. |
| `dotnet_sdk/` | Yerel .NET SDK kopyası, `.gitignore` içinde. `start-dev.sh` bunu kullanıyor. |

---

## 3. Ana kavramlar

### Kitap iki farklı biçimde saklanabilir

Bu, kod tabanının en çok kafa karıştıran kısmıdır. Bir kitabın içeriği **ya `Chapter`
kayıtları ya da `BookPage` kayıtları** olarak durur:

| | `Chapter` (Bölüm) | `BookPage` (Sayfa) |
|---|---|---|
| Nasıl oluşur | `POST /api/admin/books/upload` — PDF baştan sona okunur, yapay zekâ/regex ile bölümlere ayrılır | `POST /api/admin/books/upload-pages` — yönetici PDF'in hangi sayfalarını istediğini görsel olarak seçer |
| Çeviri ne zaman yapılır | **Her okumada anlık** (`POST /api/translate/analyze`) — kalıcı değil | **Bir kez, ilk okumada** (JIT) → `BookPage.SentencesJson` alanına yazılır, sonrakiler bedava |
| Quiz | ✅ Var (`Quiz.ChapterId` zorunlu) | ❌ Yok |
| Frontend nasıl anlar | `GET /api/books/{id}/read` yanıtındaki `hasPages: false` | `hasPages: true` |

`BooksController.Read` önce `book.Pages.Any()` bakar; sayfa varsa sayfa modunda,
yoksa bölüm modunda çalışır. **Bir kitap ikisine birden sahip olamaz** (pratikte;
şemada engel yok).

Yeni yükleme akışı `upload-pages`'tir — yönetici panelindeki form bunu kullanır.
`upload` (bölüm modu) eski akıştır ve seed verisindeki 3 klasik kitap bu moddadır.

### Çeviri üç kademeli çalışır

1. **Önbellek (0 token):** `TranslationCaches` tablosunda `(kelime, cümle)` çifti aranır.
2. **Google Translate (ücretsiz, resmi olmayan uç):** cümle çevirileri ve bağlamsız
   kelime çevirileri için `translate.googleapis.com` kullanılır.
3. **Groq LLM (`llama-3.3-70b-versatile`):** yalnızca kullanıcı bağlamsal çeviri
   istediğinde (`useAI: true`) ve önbellekte yoksa. **Kullanıcı başına günde 30 istek**
   ile sınırlıdır; sayaç `UserActivityLogs` tablosunda `ai_word_translation` tipiyle tutulur.

Detay: [04-BACKEND.md § TranslationService](04-BACKEND.md).

### Roller

| Rol | Nasıl atanır | Yetkisi |
|---|---|---|
| `student` | Kayıtta varsayılan | Kendi verisi + tüm kitaplar |
| `teacher` | Kayıt formunda seçilebilir | `student` ile aynı (backend'de ayrıcalık **yok**) — grup admin'liği rolden değil, `Group.AdminUserId` alanından gelir |
| `admin` | Yalnızca seed veya `PUT /api/admin/users/{id}/role` | `/api/admin/*` ve `/api/feedback/list` |

> `teacher` rolü şu an **sembolik**. Grup yönetimi yetkisi `Group.AdminUserId == CurrentUserId`
> kontrolüyle yapılıyor, rolle değil. Yani her `student` da grup açıp yönetebilir.

---

## 4. Nasıl çalıştırılır

### Yerel geliştirme (macOS, önerilen)

```bash
./start-dev.sh
```

Bu betik sırasıyla: konteynerleri durdurur, sadece `postgres`'i ayağa kaldırır, sonra
üç ayrı Terminal penceresinde `dotnet watch run`, `admin-panel npm run dev` ve
`frontend npm run dev` başlatır. Hepsi hot-reload'ludur.

### Tam Docker

```bash
cp .env.example .env      # değerleri değiştir!
docker compose up --build
```

### Ortam değişkenleri

| Değişken | Nerede kullanılır | Zorunlu mu |
|---|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` | postgres + backend connection string | Evet |
| `JWT_KEY` | Token imzalama (min 32 karakter) | **Evet — üretimde mutlaka değiştir** |
| `GROQ_API_KEY` | Bağlamsal kelime çevirisi + metin analizi | Hayır (yoksa Google Translate'e düşer) |
| `GEMINI_API_KEY` | `docker-compose.yml`'de tanımlı ama **kod artık Groq kullanıyor** — kalıntı | Hayır |
| `CorsOrigins` | Virgülle ayrılmış izinli origin listesi | Hayır (varsayılan: localhost:3000, localhost:3001) |
| `NEXT_PUBLIC_API_URL` | Her iki Next.js uygulamasının backend adresi | Build-time arg, varsayılan `http://localhost:5001` |
| `PGADMIN_EMAIL` / `PGADMIN_PASSWORD` | pgAdmin girişi | Hayır |

### ⚠️ Port tutarsızlığı (doğrulanmalı)

Üç farklı yerde üç farklı port yazıyor:

| Kaynak | Port |
|---|---|
| `appsettings.json` → `Kestrel:Endpoints:Http:Url` | `http://0.0.0.0:8080` |
| `Properties/launchSettings.json` → `http` profili | `http://localhost:5066` |
| `start-dev.sh` çıktısı ve frontend varsayılanı | `http://localhost:5001` |

ASP.NET Core'da `Kestrel:Endpoints` yapılandırması `ASPNETCORE_URLS`/`launchSettings`'i
**ezer**. Buna göre yerel `dotnet run` backend'i **8080**'de dinliyor olmalı, ama
frontend `5001`'e istek atıyor. Docker'da sorun yok çünkü `5001:8080` eşlemesi var.

**Bu, yerel geliştirmede "backend'e bağlanılamıyor" hatasının en olası sebebidir.**
Çözüm önerisi: `appsettings.json`'daki `Kestrel` bloğunu kaldırıp portu yalnızca
`launchSettings.json` ve Dockerfile'daki `ASPNETCORE_URLS` ile yönetmek, ve
`launchSettings`'i `5001` yapmak. Bkz. [08-GELISTIRME-REHBERI.md](08-GELISTIRME-REHBERI.md).

---

## 5. Sürüm geçmişi (öne çıkan commit'ler)

| Commit | Ne getirdi |
|---|---|
| `300e294` | CEFR seviye + kategori filtreleri, yönetici kitap düzenleme, üst navigasyon |
| `fef53a9` | Dashboard mobil tasarımı, çeviri önbelleği, Groq entegrasyonu, OCR iyileştirmeleri |
| `2326acf` | JWT sertleştirme: revokasyon listesi, JTI/IAT claim'leri, HttpOnly cookie, rate limit |
| `08ec85d` | Kitap silmede tam kaskad temizlik (yetim veri önleme) |
| `ca02390` | Marka adı "Linguza" olarak değişti |
| `4eb6d19` | Geri bildirim sistemi, hoş geldin turu, kelimelerde TTS |
| `7c378cf` | Kullanıcı aktivite takibi ve heartbeat loglama |
