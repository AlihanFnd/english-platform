# 08 — Geliştirme Rehberi

## 1. Kurulum

### Gereksinimler
- Docker + Docker Compose
- **Node.js 22+** (KURAL-11: `pdfjs-dist` 6.x `engines: node >= 22.13` istiyor;
  Node 20'de npm yalnızca uyarı verir, yani sorun sessizce geçer. CI de 22 kullanıyor)
- .NET 8 SDK (veya repo içindeki `dotnet_sdk/`)

### İlk kurulum

```bash
git clone <repo> && cd ingilizceproje
cp .env.example .env
```

**`.env` içindeki her `<DOLDURUN>` doldurulmalı.** KURAL-02'den sonra sırların
hiçbirinin varsayılanı yok: eksik değer varsa `docker compose` de uygulama da
**kasten başlamaz** ve hangi değişkenin eksik olduğunu söyler.

```bash
# Değerleri üret
openssl rand -base64 48   # JWT_KEY
openssl rand -base64 24   # POSTGRES_PASSWORD
openssl rand -base64 18   # Seed__AdminPassword
openssl rand -base64 16   # PGADMIN_PASSWORD
```

`Seed__AdminEmail` + `Seed__AdminPassword`, ilk yönetici hesabını **bir kez**
oluşturur (`Data/YoneticiTohumlayici.cs`). İkisi de boşsa yönetici oluşturulmaz.
İsteğe bağlı olarak `GROQ_API_KEY` ekle; yoksa çeviri Google Translate'e düşer.

```bash
docker compose up -d postgres     # sadece veritabanı
cd frontend && npm install && cd ..
cd admin-panel && npm install && cd ..
```

**Testleri çalıştırmak için** ayrı bir veritabanı rolü gerekir (canlı `appuser`
kimliği testlerde kullanılmaz):

```bash
bash scripts/dev/test-rolu-kur.sh    # .env.test.local üretir (.gitignore'da)
dotnet test Linguza.sln
```

### Günlük geliştirme

```bash
./start-dev.sh
```

Üç ayrı Terminal penceresinde hot-reload'lu servisler açılır.

**Tek tek çalıştırmak istersen:**

```bash
set -a && source .env && set +a   # KURAL-02: sırlar ortamdan gelir
cd EnglishReadingPlatform && dotnet watch run
```

```bash
cd frontend && npm run dev
```

```bash
cd admin-panel && npm run dev
```

### ⚠️ İlk kurulumda karşılaşacağın sorun: port

`appsettings.json` backend'i **8080**'e sabitliyor ama `start-dev.sh` ve frontend
**5001** bekliyor (detay: [00-GENEL-BAKIS.md § 4](00-GENEL-BAKIS.md)).

Hızlı çözüm — `appsettings.Development.json`'a ekle:

```json
{
  "Kestrel": { "Endpoints": { "Http": { "Url": "http://0.0.0.0:5001" } } }
}
```

Kalıcı çözüm için bkz. § 6 Teknik borç #1.

---

## 2. Sık yapılan işler

### Yeni bir API ucu eklemek

1. **Backend:** İlgili controller'a metot ekle
   ```csharp
   [HttpGet("ornek")]
   public async Task<IActionResult> Ornek() { … }
   ```
   - `[Authorize]` gerekiyor mu? Rol/sahiplik kontrolü var mı?
   - Girdi DTO'suna `[StringLength]` koy
   - Pahalı bir işse `_tokenSecurity.IsRateLimitExceeded(...)` ekle

2. **Frontend:** `frontend/app/api.ts` — hem tip hem çağrı
   ```ts
   export interface Ornek { … }
   // api nesnesine:
   getOrnek: () => apiRequest<Ornek>('/books/ornek'),
   ```

3. **Doküman:** [03-API-REFERANSI.md](03-API-REFERANSI.md)'ye ekle

### Yeni bir model/tablo eklemek

```bash
# 1. Models/AppModels.cs'e entity ekle
# 2. Data/AppDbContext.cs'e DbSet ekle
# 3. Migration üret:
cd EnglishReadingPlatform && ../dotnet_sdk/dotnet ef migrations add YeniTabloAdi
# 4. Uygulamayı başlat — Database.Migrate() otomatik uygular
```

Sonra [02-VERITABANI.md](02-VERITABANI.md)'yi güncelle.

### Yeni bir frontend sayfası

```
frontend/app/yeni-sayfa/page.tsx    →   /yeni-sayfa
```

- `'use client'` ekle (tüm sayfalar client component)
- Kabuğa (sidebar) eklemek için `layout-wrapper.tsx` → `navItems` dizisine ekle
- `useActivityTracker`'ın yolu tanıması için `hooks/useActivityTracker.ts` →
  `getActivityDetails()` fonksiyonuna bir dal ekle

### Kitap eklemek

Yönetici panelinden: `http://localhost:3001` → giriş → Kitap Yönetimi →
PDF seç → sayfa küçük resimlerinden istediklerini tıkla → başlık/seviye/kategori doldur → yükle.

### Groq modelini değiştirmek

`appsettings.json` → `Groq:Model` (varsayılan `llama-3.3-70b-versatile`) veya
`Groq__Model` ortam değişkeni.

### Bir sayfanın çevirisini yeniden ürettirmek

```sql
UPDATE "BookPages" SET "SentencesJson" = '[]' WHERE "BookId" = 5;
```

Sonraki okumada JIT analiz yeniden çalışır. (`?reanalyze=true` ucu da var ama arayüzde
düğmesi yok.)

---

## 3. Hata ayıklama

### Backend logları

Tüm loglama `Console.WriteLine` ile yapılıyor — `dotnet watch run` terminalinde görünür.
Arayabileceğin etiketler:

```
[Translation Cache HIT] Word: …
[Translation Cache Read Error]: …
[Translation Cache Write Error]: …
[Groq Token Usage (AnalyzeText)] Prompt: … Completion: … Total: …
[Groq Token Usage (TranslateWord)] …
[Groq API Error, falling back to Google Translate]: …
[Groq API Key missing] …
[Groq Chapter Split Error, falling back to regex]: …
[PDF UPLOAD ERROR] Sayfa N okunurken hata: …
[PDF UPLOAD WARNING] Sayfa N bos veya metin cikarilamadi.
```

### Veritabanına bakmak

pgAdmin: http://localhost:8080 (`.env`'deki `PGADMIN_EMAIL`/`PGADMIN_PASSWORD`)

veya:

```bash
docker exec -it english_postgres psql -U appuser -d englishreadingdb
```

Faydalı sorgular: [02-VERITABANI.md § 6](02-VERITABANI.md)

### Sık karşılaşılan sorunlar

| Belirti | Muhtemel sebep |
|---|---|
| Frontend "Failed to fetch" | Backend 8080'de, frontend 5001'e istek atıyor (§ 1 uyarısı) |
| Sayfa açılıyor ama çeviri yok | `GROQ_API_KEY` tanımsız → Google fallback; Google da engellemiş olabilir |
| Çeviri İngilizce dönüyor | `TranslateSentenceAsync` hata yutup özgün metni döndürüyor — sessiz başarısızlık |
| Kelime kaydederken 500 | `Context` 200 karakteri aşmış ([07-GUVENLIK.md](07-GUVENLIK.md) #8) |
| Quiz açılırken 500 | `QuizGeneratorService.First(s => s.Length > 30)` istisnası — bölüm çok kısa |
| Yönetici panelinde PDF önizleme boş | `public/pdfjs/` kopyalanmamış. `npm run build`/`npm run dev` bunu otomatik yapar (`prebuild`/`predev`); elle: `node scripts/pdfjs-worker-kopyala.mjs` |
| OCR "işlem başarısız" veriyor | `public/tesseract/` eksik ya da eski. `node scripts/tesseract-varliklari-kopyala.mjs` çalıştır. **Sunucu çalışırken kopyalarsan `next start`'ı yeniden başlat** — Next public/ listesini açılışta okuyor, yeni dosyalar 404 döner |
| Sayfa açılıyor ama boş/etkileşimsiz, konsolda CSP hatası | `app/layout.tsx` içindeki `await headers()` silinmiş olabilir. O çağrı sayfayı dinamik yapıyor; statik ön-render nonce taşıyamaz ve hidrasyon script'i engellenir |
| Çıkış yaptım ama token hâlâ çalışıyor | Bilinen hata — [07-GUVENLIK.md](07-GUVENLIK.md) #3 |
| Koyu temada açılışta beyaz flaş | `ThemeContext` temayı `useEffect`'te uyguluyor |
| Kelimeler renkli değil | Backend her kelimeye `type: "default"` yazıyor — [04-BACKEND.md § 5.6](04-BACKEND.md) |

---

## 4. Kod stili ve yerleşik kurallar

| Konu | Uygulanan tercih |
|---|---|
| Dil | Kod İngilizce, **yorumlar ve kullanıcıya dönen mesajlar Türkçe** |
| Backend dosya düzeni | Az sayıda büyük dosya (`AppModels.cs`, `AppControllers.cs`, `AppServices.cs`) |
| API yanıtları | Anonim nesneler; ayrı DTO/ViewModel katmanı yok |
| Hata gövdesi | Her zaman `{ error: "türkçe mesaj" }` |
| Frontend HTTP | **Yalnızca `api.ts` üzerinden** — sayfalarda doğrudan `fetch` yok |
| Bölüm ayırıcıları | `// ─── Başlık ─────────` biçiminde |
| Commit mesajları | `feat:`, `fix:`, `style:`, `design:`, `chore:`, `docs:`, `security:` |

---

## 5. Bilinen hatalar (güvenlik dışı)

| # | Hata | Yer |
|---|---|---|
| 1 | Backend portu üç yerde üç farklı | `appsettings.json`, `launchSettings.json`, `start-dev.sh` |
| 2 | Sözcük türü renkleri hiç görünmüyor (backend hep `"default"` gönderiyor) | `TranslationService` + `globals.css` |
| 3 | `AnalyzeTextAsync` fallback'te bloklayan `.Result` → thread-pool açlığı riski | `TranslationService.cs` |
| 4 | `ReadingProgresses` üzerinde `(UserId, BookId)` unique index yok → mükerrer kayıt | `AppDbContext` |
| 5 | `TranslationCaches` unique index yok → mükerrer önbellek satırı | `AppDbContext` |
| 6 | Geri sayfaya dönmek `ProgressPercent`'i **düşürüyor** | `BooksController.Read` |
| 7 | ~~DOCX'te sayfa numarası yok sayılıyor → tüm sayfalar aynı~~ ✅ KURAL-10'da kapandı: DOCX artık tek sayfa olarak kaydediliyor. Panelde sayfa seçici DOCX için hâlâ görünüyor (bkz. #16) | `PdfService` |
| 8 | `QuizGeneratorService` kısa bölümlerde istisna fırlatıyor | `AppServices.cs` |
| 9 | Her sayfa geçişinde `api.me()` çağrılıyor | `AuthContext` |
| 10 | Metin seçimi iki dinleyiciyle yakalanıyor → mükerrer çeviri isteği | `books/[id]/page.tsx` |
| 11 | `GET /api/admin/books` `pageCount` döndürmüyor → panelde kitaplar boş görünüyor | `AdminController` |
| 12 | Admin panel menüsü `<a href>` kullanıyor → tam sayfa yenilemesi | `AdminLayout.tsx` |
| 13 | Seviye/kategori listeleri frontend ve admin panelde ayrı ayrı yazılmış | 2 dosya |
| 14 | `handleReanalyze`, `loadingAI`, `JwtService.ValidateToken`, `account_type` claim'i ölü kod | çeşitli |
| 15 | `PdfSharpCore` paketi hiç kullanılmıyor | `.csproj` |
| 18 | **Taranmış (görsel tabanlı) PDF'lerden metin çıkmıyor** — kullanıcı "metin çıkarılamadı" uyarısı alıyor. Çözümü OCR eklemek; ayrı ve büyük bir iş. Kullanıcı kararı (2026-09-01): **sonra yapılacak** | `PdfService` |
| 16 | ~~DOCX'te sayfa seçici anlamsız çalışıyor~~ ✅ 2026-09-01 kapandı: DOCX artık 400 kelimelik sayfalara bölünüyor, panel seçici yerine açıklama gösteriyor | `PdfService`, `admin-panel/app/books/page.tsx` |
| 17 | ~~**Yazar veya açıklama boş bırakılırsa kitap yüklenemiyor.**~~ ✅ 2026-09-01 kapandı (kullanıcı kararı: boş bırakılabilsin) — `Author`/`Description` üç DTO'da da `string?` yapıldı. Eski açıklama: `Author`/`Description` non-nullable `string` olduğu için örtük `[Required]` alıyor; boş metin `null`'a çevrilince doğrulama düşüyor. Yanıt üstelik **İngilizce**: `{"error":"The Author field is required."}`. Alanlar `string?` yapılırsa çözülür — ama "yazar zorunlu olsun mu?" bir ürün kararıdır, o yüzden değiştirilmedi | `AdminController.BookUploadRequest` / `BookUploadPagesRequest` |

---

## 6. Teknik borç — öncelikli

### 1. Port yapılandırmasını tek kaynağa indir 🔴
`appsettings.json`'daki `Kestrel` bloğunu kaldır. Portu yalnızca `ASPNETCORE_URLS`
(Dockerfile) ve `launchSettings.json` (yerel) belirlesin, ikisi de **5001** olsun.
Yeni geliştirici için en büyük engel bu.

### 2. Token iptali ve hız sınırını Redis'e taşı 🔴
Şu an bellekte: yeniden başlatmada iptal listesi ve hız sınırı sayaçları sıfırlanıyor.
Çoklu replikada her instance kendi sayacını tutar — kullanıcı N× limit alır, bir
replikada çıkış yapan kişi diğerinde giriş yapmış görünür.
KURAL-04 iptali `ITokenIptalDeposu` **arayüzü** ardına aldı, yani Redis'e geçiş tek bir
kayıt satırı. KURAL-07'nin hız sınırı ise .NET yerleşik middleware'ini kullanıyor;
dağıtık sürüm için `PartitionedRateLimiter` yerine Redis tabanlı bir limiter gerekir.

### 3. Yapılandırılmış loglama 🟠
`Console.WriteLine` → `ILogger<T>`. Şu an log seviyesi yok, filtrelenemiyor, üretimde
izlenemiyor, PII ayıklanamıyor.

### 4. Otomatik test yok 🔴
Projede **tek bir test yok**. `07-GUVENLIK.md`'deki hiçbir düzeltme kanıtlanamaz durumda.
Minimum: `EnglishReadingPlatform.Tests` projesi + `WebApplicationFactory` ile entegrasyon
testleri. İlk yazılacaklar:
- Yetkilendirme testleri (her uç için student/teacher/admin matrisi)
- Logout → token geçersiz testi (#3 bulgusu)
- Uzunluk sınırı testleri (#8 bulgusu)

### 5. `Level`/`Category` taksonomisini merkezileştir 🟠
Backend'de enum/sabit tanımla, `GET /api/books/taxonomy` ile sun, iki frontend de oradan çeksin.

### 6. Sunucu taraflı filtreleme ve sayfalama 🟠
`GET /api/books` tüm kitapları döndürüyor, filtreleme istemcide. Kitap sayısı arttığında
çökecek. `?level=&category=&search=&page=&pageSize=` parametreleri eklenmeli.

### 7. Başlık ayrıştırma regex'i üç yerde tekrarlanıyor 🟡
`TranslationService.SplitSentences`, `TranslationService.NormalizeAndSeparateHeadings`,
`frontend/books/[id]/page.tsx → normalizeSentences`. Tek bir yerde (tercihen backend'de)
kalmalı; frontend ham veriye güvenmek zorunda kalmamalı.

### 8. ~~`admin-panel`'de tip kontrolünü aç~~ ✅ KAPANDI (KURAL-11, 2026-09-01)
Kapılar açıldı; ortaya çıkan iki tip hatası (pdf.js `RenderParameters.canvas` eksik,
`destroy()` belge yerine yükleme görevinde) düzeltildi. `npx tsc --noEmit` → 0 hata.

### 9. Otomatik migration'ı üretimde kapat 🟡
`Database.Migrate()` yalnızca Development'ta çalışsın; üretimde ayrı bir deploy adımı olsun.

### 10. Ölü kodu temizle 🟢 büyük kısmı bitti (2026-09-01)

✅ Silindi: `EnglishReadingPlatform/Views/` (20 dosya), `EnglishReadingPlatform/wwwroot/`
(7,9 MB) ve `Program.cs`'teki `app.UseStaticFiles()`. Proje HTML sunmuyor; Razor
pipeline'ı hiç kurulmamıştı. Silmeden önce `/js/site.js` gibi yollar **kimlik
doğrulaması olmadan 200** dönüyordu, şimdi 401.

> ⚠️ **Bayat derleme çıktısı tuzağı.** Silme sonrası `dotnet test` / `dotnet run` şunu
> verebilir: `DirectoryNotFoundException: .../EnglishReadingPlatform/wwwroot/`
> Sebep kodda değil, `bin/` ve `obj/` içindeki eski `staticwebassets` manifestidir —
> hâlâ silinmiş klasörü gösterir. **Debug'ı temizlemek yetmez**, `ci-yerel.sh` Release
> ile koştuğu için Release de temizlenmeli:
>
> ```bash
> dotnet clean Linguza.sln && dotnet clean Linguza.sln -c Release
> find EnglishReadingPlatform/{bin,obj} -name "*staticwebassets*" -exec rm -rf {} +
> dotnet build Linguza.sln
> ```
>
> Temiz checkout'ta (CI, yeni klon) bu sorun oluşmaz; yalnızca eski çıktının durduğu
> makinelerde görülür.

Kalanlar: `englishplatform.db` (git'ten çıkarıldı ama **diskte duruyor** — içinde gerçek
şifre hash'leri var, kararı sen vereceksin: `00-BASLA-BURADAN.md` madde 5),
`JwtService.ValidateToken`. `PdfSharpCore` ve `mobile/node_modules` zaten yok.
`.gitignore`'a `.DS_Store` zaten var ama dosyalar hâlâ takipte — `git rm --cached` gerekiyor.

---

## 7. Yol haritası — gerçekçi sıralama

### Faz A — Sağlamlaştırma (önce bu)
1. [07-GUVENLIK.md](07-GUVENLIK.md) #1–#5 kapatılması (+ test)
2. Port yapılandırması düzeltilmesi
3. Test altyapısı kurulması
4. Yapılandırılmış loglama

### Faz B — Var olanı tamamlama
5. Şifre sıfırlama + değiştirme uçları
6. Sözcük türü renklerinin devreye alınması (küçük iş, görünür kazanım)
7. Gruptan ayrılma / üye çıkarma / grup silme
8. OCR kaydı silme
9. Yönetici panelinde `pageCount` gösterimi ve kullanıcı silme düğmesi
10. Sunucu taraflı filtreleme/sayfalama

### Faz C — Ürün derinleştirme
11. **Quiz'i yapay zekâya taşı** — mevcut üretici anlamı ölçmüyor
    ([04-BACKEND.md § 7](04-BACKEND.md)). `TranslationService` zaten Groq bağlantılı
12. **Aralıklı tekrar (spaced repetition)** — kelime listesi altyapısı hazır, çalışma modu
    sonuçları kaydedilmiyor
13. **Gamification'ı gerçek yap** — seri, rütbe, hedef göstergeleri arayüzde var ama
    backend'de karşılığı yok
14. Kitap kapak görseli yükleme (şu an sadece `CoverColor`)
15. Kelime listesi içe/dışa aktarma (Anki uyumlu CSV)

### Faz D — Genişleme
16. React Native mobil uygulaması (`mobile/` klasörü boş bekliyor)
17. Sesli okuma iyileştirmesi (şu an tarayıcı TTS'i; kaliteli TTS servisi)
18. Çoklu hedef dil (şema `Language` alanını taşıyor ama her yer `tr` sabit)

---

## 8. Dokümantasyonu güncel tutmak

Kod değişikliği yaptığında ilgili dosyayı da güncelle:

| Değişiklik | Güncellenecek doküman |
|---|---|
| Yeni/değişen API ucu | [03-API-REFERANSI.md](03-API-REFERANSI.md) |
| Yeni tablo veya kolon | [02-VERITABANI.md](02-VERITABANI.md) |
| Servis mantığı değişti | [04-BACKEND.md](04-BACKEND.md) |
| Yeni sayfa/bileşen | [05-FRONTEND.md](05-FRONTEND.md) veya [06-ADMIN-PANEL.md](06-ADMIN-PANEL.md) |
| Güvenlik açığı kapatıldı | [07-GUVENLIK.md](07-GUVENLIK.md) — **ham test çıktısıyla birlikte** |
| Bilinen hata giderildi | Bu dosya, § 5 |
| Mimari değişikliği | [01-MIMARI.md](01-MIMARI.md) |
