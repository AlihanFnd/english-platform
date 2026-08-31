# 01 — Mimari

## 1. Yüksek seviye görünüm

```
┌──────────────────┐        ┌──────────────────┐
│  frontend        │        │  admin-panel     │
│  Next.js 16      │        │  Next.js 14      │
│  React 19        │        │  React 18        │
│  :3000           │        │  :3001           │
│                  │        │                  │
│ localStorage:    │        │ localStorage:    │
│   "token"        │        │   "admin_token"  │
└────────┬─────────┘        └────────┬─────────┘
         │  Authorization: Bearer …  │
         └───────────┬───────────────┘
                     ▼
         ┌───────────────────────────┐
         │  ASP.NET Core 8 Web API   │
         │  :5001 → konteynerde 8080 │
         │                           │
         │  Controllers              │
         │  ├ AuthController         │
         │  ├ BooksController        │
         │  ├ GroupsController       │
         │  ├ TranslateController    │
         │  ├ DashboardController    │
         │  ├ ActivityController     │
         │  ├ FeedbackController     │
         │  └ AdminController        │
         │                           │
         │  Services                 │
         │  ├ JwtService             │
         │  ├ ITokenIptalDeposu ★    │  ★ = Singleton, bellekte
         │  ├ HesapSayaci ★          │
         │  ├ AgirIsKapisi ★         │
         │  ├ TranslationService     │
         │  ├ PdfService             │
         │  └ QuizGeneratorService   │
         └────┬──────────────┬───────┘
              │              │
        EF Core             HttpClient
              │              │
              ▼              ▼
    ┌──────────────┐   ┌─────────────────────────┐
    │ PostgreSQL15 │   │ translate.googleapis.com│
    │ :5432        │   │ api.groq.com            │
    └──────────────┘   └─────────────────────────┘

Tarayıcıda çalışan (backend'e uğramayan) dış bağımlılıklar:
  • tesseract.js  — OCR, frontend'de npm paketi
  • pdf.js        — admin panelde CDN'den <script> ile
  • Web Speech API — sesli okuma (TTS)
```

---

## 2. Katmanlar ve sorumlulukları

### Backend — `EnglishReadingPlatform/`

```
Program.cs              → DI, JWT ayarı, CORS, middleware sırası, otomatik migrate
Data/AppDbContext.cs    → DbSet'ler, unique index'ler, seed verisi
Models/AppModels.cs     → 16 entity, tek dosyada
Controllers/            → HTTP uçları (aşağıya bak)
Services/               → İş mantığı
Migrations/             → 6 EF Core migration
Views/, wwwroot/        → ÖLÜ KOD (bkz. 00-GENEL-BAKIS.md)
```

Kod organizasyonu bilinçli olarak "az dosya" tarzında: `AppModels.cs` 16 entity'yi,
`AppControllers.cs` üç ayrı controller'ı (`Groups`, `Translate`, `Dashboard`),
`AppServices.cs` iki servisi (`JwtService`, `QuizGeneratorService`) barındırır.

**Repository/Service katmanı ayrımı yoktur.** Controller'lar doğrudan `AppDbContext`
enjekte eder ve LINQ sorgularını içeride yazar. Servis sınıfları yalnızca dış dünyayla
konuşan işler (JWT, HTTP, PDF ayrıştırma) için kullanılır.

### Frontend — `frontend/`

```
app/layout.tsx          → RootLayout: ThemeProvider > AuthProvider > LayoutWrapper
app/layout-wrapper.tsx  → Sidebar (desktop) + alt tab bar (mobil) + hoş geldin turu
app/api.ts              → TEK API istemcisi — tüm tipler ve çağrılar burada
app/context/            → AuthContext, ThemeContext
app/hooks/              → useActivityTracker (30 sn heartbeat)
app/components/         → FeedbackWidget
app/globals.css         → 921 satır: Material 3 renk token'ları + .bk-* okuyucu stilleri
app/{page,books,words,ocr,groups,login,register}/ → sayfalar
```

`app/api.ts` **tek giriş noktasıdır**; hiçbir sayfa doğrudan `fetch` çağırmaz.
Bir uç eklerken hem tipini hem çağrısını buraya eklemek gerekir.

### Admin panel — `admin-panel/`

```
app/page.tsx            → Giriş ekranı (role !== "admin" ise reddeder)
app/components/AdminLayout.tsx → Sidebar + mobil hamburger
app/{dashboard,books,users,feedbacks}/page.tsx
```

Ortak API istemcisi **yoktur**; her sayfa `const API = process.env.NEXT_PUBLIC_API_URL`
tanımlayıp elle `fetch` çağırır ve `localStorage.getItem("admin_token")` okur.

---

## 3. Kimlik doğrulama akışı

```
1. POST /api/auth/login { email, password }
       │
       ├─ RateLimiter "kimlik-dogrulama" politikası (IP başına 10/dk)   → 429
       ├─ HesapSayaci.IzinVar("giris_hedef:{eposta}")                  → 429
       │     (15 dk'da 10 BAŞARISIZ deneme — şifre doğrulamasından ÖNCE)
       ├─ BCrypt.Verify(password, user.PasswordHash)                   → 401
       │     başarısızsa → HesapSayaci.BasarisizDenemeKaydet(...)
       │
       └─ JwtService.GenerateToken(user)
             claims: NameIdentifier, Name, Email, Role, account_type, jti, iat
             expiry: admin → 1 saat, diğer → 24 saat
             │
             ├─→ Set-Cookie: jwt_token (HttpOnly, SameSite=Lax, Secure=!Dev)
             └─→ yanıt gövdesinde { token, user }

2. Frontend token'ı localStorage'a yazar ve her istekte
   Authorization: Bearer <token> gönderir.

3. Her istekte JwtBearer middleware:
       OnMessageReceived → Authorization başlığı ÖNCELİKLİ; cookie yalnızca başlık yoksa
       standart doğrulama → imza, issuer, audience, ömür (ClockSkew = 0)
       OnTokenValidated  → ITokenIptalDeposu.IptalEdilmisMi(jti, userId, uretilme)

   Ardından (KURAL-07): UseRateLimiter — kimlik ÇÖZÜLDÜKTEN sonra çalışır ki
   sınırlar kullanıcı bazına bölümlensin, IP bazına düşmesin.

4. POST /api/auth/logout
       → ITokenIptalDeposu.JtiIptalEt(jti, tokenın kendi son geçerlilik anı)
       → Cookie silinir
```

İki paralel taşıma yolu vardır (header + cookie) ve bu bilinçli bir tasarım değil,
katman katman eklenmiş bir sonuçtur. Cookie'nin header'ı ezmesi bir hatadır —
[07-GUVENLIK.md](07-GUVENLIK.md) #3.

### Yetkilendirme

| Mekanizma | Nerede | Ne yapar |
|---|---|---|
| `[Authorize]` | Books, Groups, Translate, Dashboard, Activity, Feedback | Geçerli token şart |
| `[Authorize(Roles = "admin")]` | `AdminController` (tümü) | Sadece admin |
| `[Authorize(Policy = "AdminOnly")]` | `FeedbackController.GetFeedbackList` | Sadece admin |
| Nesne sahipliği | `WordListItem`, `ReadingProgress` sorgularında `w.UserId == CurrentUserId` | Başkasının verisine erişimi keser |
| Grup üyeliği | `GroupsController.GetGroupDetails` | Üye değilse `Forbid()` |
| Grup sahipliği | `GroupsController.AssignBook` | `g.AdminUserId == userId` değilse `Forbid()` |

**Eksik:** `ActivityController.GetStats` hiçbir rol kontrolü yapmıyor — bkz.
[07-GUVENLIK.md](07-GUVENLIK.md) #1.

---

## 4. Kritik veri akışları

### A) Sayfa okuma + JIT çeviri (kalıcı önbellek)

```
Frontend: api.readPage(bookId, page)
   → GET /api/books/{id}/read?page=N
        │
        ├─ rate limit: user_{id}_read, 60/dk
        ├─ ReadingProgress oluştur/güncelle (CurrentChapter = page)
        │
        ├─ SentencesJson boş mu VEYA ?reanalyze=true ?
        │     EVET → TranslationService.AnalyzeTextAsync(page.Content)
        │              ├─ Groq API key var mı?
        │              │    VAR  → tek LLM çağrısıyla cümle+kelime analizi
        │              │    YOK  → SplitSentences() + Google Translate fallback
        │              └─ NormalizeAndSeparateHeadings() ile başlık/paragraf ayrıştırma
        │              → JSON serialize → BookPage.SentencesJson'a YAZ (kalıcı)
        │     HAYIR → mevcut JSON kullanılır (0 maliyet)
        │
        └─ yanıt: { currentPage: { content, sentencesJson }, totalPages }

Frontend: normalizeSentences() ile PascalCase/camelCase karışıklığını düzeltir,
          "CHAPTER I THE BEGINNING It was..." gibi birleşmiş satırları regex'le böler,
          kelimeleri türüne göre renklendirerek (word-isim, word-fiil, …) basar.
```

**Önemli sonuç:** Bir sayfa bir kez analiz edildikten sonra o sayfayı okuyan **tüm
kullanıcılar** aynı JSON'ı görür. Yani analiz maliyeti kitap başına bir kezdir, kullanıcı
başına değil.

### B) Bölüm okuma (kalıcı olmayan analiz)

```
Frontend: api.readChapter → GET /api/books/{id}/read?chapter=N   (sadece ham metin)
Frontend: api.analyzeText  → POST /api/translate/analyze          (her seferinde yeniden!)
                              rate limit: user_{id}_analyze, 20/dk
```

Bölüm modunda analiz **hiçbir yere kaydedilmez**. Aynı bölüm 10 kez açılırsa 10 kez
LLM/Google çağrısı yapılır. Bu, sayfa moduna göre ciddi bir maliyet farkıdır ve
bölüm modunun neden terk edildiğini açıklar.

### C) Bağlamsal kelime çevirisi (kullanıcı tetikli, kotalı)

```
Kelimeye tıkla → POST /api/translate/word { text, context, useAI: false }
   → TranslationCaches'de (kelime, cümle) ara → HIT ise 0 maliyetle dön
   → MISS + useAI=false → Google Translate ile bağlamsız çeviri

"Yapay zekâ ile çevir" → useAI: true
   → önbellekte yoksa:
        UserActivityLogs'ta bugünkü "ai_word_translation" sayısı >= 30 → 400 hata
        değilse log ekle ve Groq'a git
   → Groq JSON şeması: { general_meaning, contextual_meaning, synonyms, type }
   → sonuç "genel|||bağlamsal|||eşanlamlılar" formatında TranslationCaches'e YAZILIR
```

Önbellek **kullanıcılar arası paylaşılır** — bir kullanıcının harcadığı kotayla
üretilen çeviri, aynı kelime+cümle çiftini gören herkese bedava gelir.

### D) PDF yükleme (yönetici)

```
Tarayıcı (admin-panel):
   pdf.js CDN'den yüklenir → PDF client-side parse edilir
   → her sayfa <canvas>'a küçük resim olarak render edilir
   → yönetici istediği sayfaları tıklayarak seçer
   → FormData: { meta..., selectedPages: "3,4,5,7", file }

Backend: POST /api/admin/books/upload-pages
   → Book kaydı oluştur
   → her seçili sayfa için PdfService.ExtractSinglePageText(file, n)
        PdfPig ile page.Text; boşluk yoksa GetWords() ile koordinat tabanlı birleştirme
   → BookPage { PageNumber: 1..N (yeniden numaralandırılır), Content, SentencesJson: "[]" }
   → hiç metin çıkmazsa Book geri silinir ve 400 döner
```

Dikkat: `PageNumber` **yeniden numaralandırılır**. PDF'in 3, 7, 12. sayfalarını seçerseniz
veritabanında 1, 2, 3 olurlar.

### E) OCR (tamamen tarayıcıda)

```
Dosya seç → Tesseract.recognize(file, 'eng', { logger })   ← backend'e hiç gitmez
   → çıkan metin POST /api/dashboard/ocr ile kaydedilir (OcrRecords)
   → POST /api/translate/analyze ile aynı okuyucu deneyimi kurulur
```

Görsel **hiçbir zaman sunucuya yüklenmez**; sadece çıkarılan metin saklanır.
`OcrRecord.ImagePath` alanı şemada var ama hep boş kalır.

### F) Aktivite takibi

```
useActivityTracker() — LayoutWrapper içinde her oturum açık sayfada çalışır
   → sayfa yüklenince 1 kez log (5 sn)
   → sonra her 30 saniyede bir POST /api/activity/log

Backend: son 5 dakikada aynı (userId, activityType, details) varsa
         yeni satır AÇMAZ, mevcut satırın DurationSeconds'ını artırır
```

Bu sayede "kullanıcı bu kitapta toplam 14 dakika geçirdi" bilgisi tek satırda birikir.

---

## 5. Middleware sırası (`Program.cs`)

```csharp
app.UseStaticFiles();
app.UseRouting();
app.UseCors();          // ← Authentication'dan ÖNCE, doğru sıra
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
```

`app.UseHttpsRedirection()` **yoktur** — TLS sonlandırma ters proxy'ye bırakılmıştır.
Üretimde önünde HTTPS zorunlu kılan bir katman (nginx/Caddy/Cloudflare) olmalıdır,
aksi halde `Secure` cookie hiç gönderilmez.

## 6. Otomatik migration

```csharp
using (var scope = app.Services.CreateScope())
    scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.Migrate();
```

Uygulama her açılışta bekleyen migration'ları uygular. Geliştirmede pratik; **üretimde
riskli** (birden fazla replika aynı anda migrate etmeye çalışabilir, geri alma yoktur).
Bkz. [08-GELISTIRME-REHBERI.md § Teknik borç](08-GELISTIRME-REHBERI.md).

## 7. Durum (state) nerede tutuluyor?

| Veri | Yer | Kalıcı mı |
|---|---|---|
| Kullanıcı, kitap, ilerleme, kelime, quiz, grup | PostgreSQL | ✅ |
| Çeviri önbelleği | PostgreSQL (`TranslationCaches`) | ✅ |
| İptal edilmiş token listesi | `ITokenIptalDeposu` (KURAL-04) — **bellekte** | ❌ Yeniden başlatmada silinir |
| Hız sınırı pencereleri | `PartitionedRateLimiter` (KURAL-07) — **bellekte** | ❌ Boşta kalan bölümler otomatik temizlenir |
| Hesap bazlı giriş sayacı | `HesapSayaci` (KURAL-07) — **bellekte** | ❌ |
| Ağır iş semaforu | `AgirIsKapisi` (KURAL-07) — **bellekte** | ❌ Replika başına ayrı sayılır |
| Oturum token'ı | Tarayıcı `localStorage` + HttpOnly cookie | ✅ |
| Tema tercihi | `localStorage["linguist_theme"]` | ✅ |
| Hoş geldin turu görüldü mü | `localStorage["welcome_tour_seen"]` | ✅ |

**Sonuç:** Backend'i yatayda ölçeklemek (birden fazla replika) şu an **güvenli değildir**;
token iptali ve rate limit yalnızca isteği alan instance'ta geçerlidir. Redis'e taşınması
gerekir.
