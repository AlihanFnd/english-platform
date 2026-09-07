# 01 — Mimari Raporu

> **Ölçüm tarihi:** 2026-09-06 · **Commit:** `7d6e232`
> Bu rapor ölçülerek yazıldı. Her sayının altında onu üreten komut var;
> yeniden çalıştırınca aynı sonucu vermeli. Vermiyorsa rapor eskimiştir.

---

## İçindekiler

1. [Tek bakışta sistem](#1-tek-bakışta-sistem)
2. [Depo yapısı](#2-depo-yapısı)
3. [Backend katmanları](#3-backend-katmanları)
4. [İstek hattı (pipeline) — sıra kritiktir](#4-istek-hattı-pipeline--sıra-kritiktir)
5. [Veri modeli](#5-veri-modeli)
6. [API yüzeyi — 53 uç](#6-api-yüzeyi--53-uç)
7. [Kimlik, yetki ve oturum](#7-kimlik-yetki-ve-oturum)
8. [Kaynak ve maliyet kontrolü](#8-kaynak-ve-maliyet-kontrolü)
9. [Ana veri akışları](#9-ana-veri-akışları)
10. [İstemciler](#10-i̇stemciler)
11. [Arka plan işleri ve veri ömrü](#11-arka-plan-i̇şleri-ve-veri-ömrü)
12. [Yapılandırma sözleşmeleri](#12-yapılandırma-sözleşmeleri)
13. [Güvenlik katmanları ve kapılar](#13-güvenlik-katmanları-ve-kapılar)
14. [Test mimarisi](#14-test-mimarisi)
15. [Derleme, CI ve dağıtım](#15-derleme-ci-ve-dağıtım)
16. [Bilinmesi gereken tuhaflıklar](#16-bilinmesi-gereken-tuhaflıklar)
17. [Bilinen açıklar ve teknik borç](#17-bilinen-açıklar-ve-teknik-borç)
18. [Yeni özellik eklerken](#18-yeni-özellik-eklerken)

---

## 1. Tek bakışta sistem

Linguza, İngilizce metin okurken **anlık çeviri ve cümle analizi** sunan bir
platform. Kullanıcı bir kitap açar, cümleleri Türkçe karşılığıyla yan yana
görür, bilmediği kelimeleri kişisel listesine ekler, bölüm sonunda quiz çözer.
Öğretmenler grup kurup kitap atar; yöneticiler kitap yükler.

```
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│  frontend   │   │ admin-panel │   │   mobile    │
│  Next 16    │   │   Next 16   │   │  Expo / RN  │
│   :3000     │   │    :3001    │   │ Metro :8081 │
└──────┬──────┘   └──────┬──────┘   └──────┬──────┘
       │                 │                 │
       │      HTTPS + JWT (Bearer / çerez) │
       └────────────────┬┴─────────────────┘
                        ▼
              ┌───────────────────┐        ┌──────────────┐
              │  ASP.NET Core 8   │───────▶│  Groq (LLM)  │
              │   Web API :5001   │        │  llama-3.3   │
              │                   │───────▶│ Google Trans │
              └─────────┬─────────┘        └──────────────┘
                        │ EF Core 8 / Npgsql
                        ▼
              ┌───────────────────┐
              │  PostgreSQL 15    │  17 tablo
              │      :5432        │
              └───────────────────┘
```

**Ölçüler**

| | Değer | Komut |
|---|---|---|
| Backend C# dosyası | 72 (migration hariç **47**) | `find EnglishReadingPlatform -name '*.cs' -not -path '*/obj/*' -not -path '*/bin/*' \| wc -l` |
| Backend satır | 8.026 (migration hariç) | `find … -not -path '*/Migrations/*' -exec wc -l {} +` |
| HTTP ucu | 53 | `grep -rc '\[Http' EnglishReadingPlatform/Controllers/*.cs` |
| Veritabanı tablosu | 17 (+ migration geçmişi) | `\dt` |
| Migration | 12 | `ls EnglishReadingPlatform/Migrations/*.cs \| grep -vE 'Designer\|Snapshot'` |
| Test | 315 | `dotnet test Linguza.sln` |
| Güvenlik kapısı | **18** (16 yok — o kural açık) | `ls scripts/guard/[0-9][0-9]-*.sh` |

---

## 2. Depo yapısı

```
ingilizceproje/
├── EnglishReadingPlatform/        ASP.NET Core 8 Web API  ← tek backend
│   ├── Program.cs                 kompozisyon kökü (458 satır)
│   ├── Controllers/               7 dosya, 53 uç
│   ├── Services/                  TranslationService, PdfService, AppServices
│   ├── Data/                      DbContext, envanter, temizlik, tohum
│   ├── Security/                  hash, token iptali, e-posta, sıfırlama
│   ├── RateLimiting/              kotalar, ağır iş kapısı, uç nitelikleri
│   ├── Configuration/             4 sözleşme sınıfı (aşağıda §12)
│   ├── Validation/                alan sınırları, whitelist öznitelikleri
│   ├── Middleware/                hata yakalama, güvenlik başlıkları
│   ├── Authorization/             grup kapsamı, claim yardımcıları
│   ├── Contracts/                 dışa dönen DTO'lar
│   ├── Files/                     DosyaDogrulayici (içerikten tür tespiti)
│   └── Migrations/                12 migration
├── EnglishReadingPlatform.Tests/  33 test dosyası, 315 test
├── frontend/                      Next.js 16 — öğrenci arayüzü
├── admin-panel/                   Next.js 16 — yönetici arayüzü
├── mobile/                        Expo / React Native — mobil istemci
├── docs/                          kullanım ve geliştirme kılavuzu (4.669 satır)
├── raporlar/                      ← burası: as-built mimari kaydı
├── guvenlik-kurallari/            faz 1 (KURAL-01…12, kapandı)
├── guvenlik-kurallari-faz2/       faz 2 (KURAL-13…19)
├── guvenlik/                      zafiyet istisna kaydı
└── scripts/
    ├── guard/                     18 güvenlik kapısı + run-all.sh
    ├── dagitim/                   on-kontrol.sh, canli-dogrula.sh
    ├── dev/                       test rolü kurulumu, runtime kurulumu
    └── ci-yerel.sh                CI'nin tamamını yerelde koşturur
```

> `dotnet_sdk/` depoya çekilmiş bir SDK kopyasıdır; guard taramaları onu
> kapsam dışında tutar (`scripts/guard/_lib.sh`).

---

## 3. Backend katmanları

Klasik katmanlı mimari **değil** — kasten yatay: controller → service → EF.
Repository katmanı yok, `DbContext` doğrudan controller'a enjekte ediliyor.
Bu bilinçli bir sadelik; ama şu iki sonucu var:

- **Yetki kontrolü controller'ın sorumluluğudur.** Araya bir katman girmediği
  için "her sorgu kullanıcıya filtreli mi?" sorusunu kimse otomatik sormuyor.
  Bunu testler ve kapılar üstleniyor (§13).
- **Sorgu şekli controller'da görünür.** `Include` mi projeksiyon mu — kararı
  orada veriyorsun. KURAL-08 kapısı `Include` sayısına bir tavan koyuyor (13).

### Servisler

| Servis | Ömür | İşi |
|---|---|---|
| `TranslationService` | Scoped | Çeviri + cümle analizi zinciri (907 satır — **en büyük dosya**) |
| `PdfService` | Scoped | PDF/DOCX'ten sayfa ve bölüm çıkarma (580 satır) |
| `QuizGeneratorService` | Scoped | Bölüm metninden 5 soruluk quiz üretir |
| `JwtService` | Singleton | Token üretimi |
| `HesapSayaci` | Singleton | Hedef bazlı başarısız giriş sayacı |
| `AgirIsKapisi` | Singleton | Eşzamanlı LLM analizi tavanı (4) |
| `DosyaDogrulayici` | Singleton | Yüklenen dosyanın türünü **içerikten** belirler |
| `BellekTokenIptalDeposu` | Singleton | jti ve kullanıcı-kesim tabanlı iptal |
| `SifrePolitikasi` | Singleton | Şifre kuralları tek kaynak |
| `SifreSifirlamaServisi` | Scoped | Jeton üretimi/tüketimi (yalnızca hash saklanır) |

### Arka plan servisleri (`IHostedService`)

| Servis | Sıklık | İşi |
|---|---|---|
| `TokenTemizlikServisi` | periyodik | Süresi dolmuş iptal kayıtlarını temizler |
| `SaklamaTemizligiServisi` | 24 saat | Süresi dolan kişisel veriyi siler (§11) |

---

## 4. İstek hattı (pipeline) — sıra kritiktir

`Program.cs` sırası. **Bu sıra rastgele değil**; her adımın neden orada
olduğu aşağıda.

```
1.  SirDogrulayici.Dogrula()          ← Build()'DEN ÖNCE. Sır eksik/zayıfsa uygulama HİÇ AÇILMAZ
2.  OrtamSozlesmesi.UretimdeDogrula() ← Üretimde eksik zorunlu değişken varsa AÇILMAZ
3.  Kestrel: gövde tavanı 2 MB, Server başlığı kapalı
4.  DbContext (Npgsql) · HealthChecks (+ AddDbContextCheck)
5.  JWT kimlik doğrulama · Yetki politikaları (FallbackPolicy = giriş zorunlu)
6.  Controllers · hız sınırlayıcı · servisler · HttpClient'lar
7.  CORS beyaz listesi (GuvenilirKokenler.Oku)
8.  [üretim] HostFilteringOptions
    ── builder.Build() ──
9.  db.Database.Migrate() + YoneticiTohumlayici
──────────────── middleware sırası ────────────────
10. HataYakalamayiKullan()        ← EN BAŞTA: routing/model binding/CORS istisnaları da yakalansın
11. GuvenlikBasliklariniKullan()
12. [üretim] UseForwardedHeaders → UseHsts → UseHttpsRedirection
13. UseRouting()
14. UseCors()
15. UseAuthentication()
16. UseRateLimiter()              ← Authentication'DAN SONRA: kota kullanıcı kimliğine göre bölünür
17. UseAuthorization()            ← RateLimiter'DAN SONRA: sınırı aşan istek yetkiye hiç gelmesin
18. MapHealthChecks("/health")    ← AllowAnonymous
19. MapControllers()
20. KURAL-14 açılış raporu: kapalı özellikler LogWarning ile yazılır
21. app.Run()
```

### Sıranın kırılgan olduğu üç yer

**`HataYakalamaMiddleware` en başta.** `UseRouting`'den sonra konursa routing
ve model binding sırasında oluşan istisnalar ASP.NET Core'un varsayılan
işleyicisine gider ve geliştirmede yığın izi döner.

**`UseRateLimiter`, `UseAuthentication`'dan sonra.** Bölümleme anahtarı
`ctx.User`'daki kullanıcı kimliğine bakıyor. Önce konursa `User` boş olur,
bütün sınırlar IP bazına düşer ve NAT arkasındaki bir okulun tüm öğrencileri
birbirinin kotasını tüketir. `scripts/guard/07-hiz-siniri.sh` bu sırayı denetler.

**`UseRateLimiter`, `UseAuthorization`'dan önce.** Sınırı aşan istek, yetki
kontrolü ve controller hiç çalıştırılmadan reddedilmeli.

### Fail-fast: uygulama ne zaman hiç açılmaz?

| Koşul | Nerede |
|---|---|
| `Jwt:Key` eksik / 32 karakterden kısa / sızmış listede | `SirDogrulayici` |
| `ConnectionStrings:Default` eksik | `SirDogrulayici` |
| Üretimde `CorsOrigins` tanımsız ya da joker (`*`) içeriyor | `GuvenilirKokenler` |
| Üretimde `PublicHost`, `Seed:AdminEmail`, `Seed:AdminPassword` eksik | `OrtamSozlesmesi` |
| Üretimde mükerrer kayıt (tekillik kısıtı) | `Database.Migrate()` düşer |

> Son satır bir dağıtım tuzağı: migration açılışta uygulanıyor, üretimde tek bir
> mükerrer satır varsa **uygulama hiç ayağa kalkmaz.** `scripts/dagitim/on-kontrol.sh`
> bunu dağıtımdan önce 11 tekillik kısıtı üzerinde tarıyor.

---

## 5. Veri modeli

17 tablo. Sahiplik açısından **üç gruba** ayrılıyor — bu ayrım yetki
kararlarının temeli.

### A. Kullanıcıya ait (UserId taşır)

| Tablo | İçerik | Ömür |
|---|---|---|
| `Users` | e-posta, kullanıcı adı, BCrypt hash, rol | hesap silinene kadar |
| `ReadingProgresses` | hangi kitapta nerede kaldı | hesap silinene kadar |
| `WordListItems` | kişisel kelime listesi + çalışma sayaçları | hesap silinene kadar |
| `QuizResults` | quiz puanları | hesap silinene kadar |
| `OcrRecords` | **taranan ham metin** | **365 gün** |
| `UserActivityLogs` | davranış kaydı + Groq kota sayacı | **90 gün** |
| `Feedbacks` | serbest metin geri bildirim | hesap silinene kadar |
| `SifreSifirlamaJetonlari` | jeton **hash'i** (ham jeton hiç saklanmaz) | **7 gün** |

### B. Paylaşılan / global (UserId YOK)

| Tablo | Neden dikkat |
|---|---|
| `Books`, `Chapters` | yönetici yükler, herkes okur |
| **`BookPages`** | 🔴 **Analiz (`SentencesJson`) BÜTÜN kullanıcılar tarafından paylaşılır.** Üzerine yazan uç öğretmen/yönetici yetkisi ister (KURAL-17) |
| `Quizzes`, `QuizQuestions` | bölüm başına tekil |
| `TranslationCaches` | sorgu + bağlam anahtarlı global önbellek · **365 gün** |

### C. Grup (çok kullanıcılı)

| Tablo | Not |
|---|---|
| `Groups` | `AdminUserId` → **RESTRICT**: grup sahibi silinemez |
| `GroupMembers` | `(GroupId, UserId)` tekil |
| `GroupBookAssignments` | `(GroupId, BookId)` tekil |

### Tekillik kısıtları (KURAL-12, 11 adet)

```
Users.Email · Users.Username · Groups.InviteCode · SifreSifirlamaJetonlari.JetonHash
(ReadingProgresses.UserId, BookId)      (WordListItems.UserId, Word)
(TranslationCaches.QueryText, ContextText)
(GroupMembers.GroupId, UserId)          (GroupBookAssignments.GroupId, BookId)
(BookPages.BookId, PageNumber)          Quizzes.ChapterId
```

Bunlar yalnızca veri hijyeni değil — **eşzamanlılık savunması**. Örneğin iki
sekmede aynı kitabı açmak eskiden iki ilerleme satırı üretiyordu.

### İndeksler (silme performansı için)

`UserActivityLogs.Timestamp` · `TranslationCaches.CreatedAt` ·
`SifreSifirlamaJetonlari.CreatedAt` · `OcrRecords.ScannedAt`

> Hepsi saklama temizliğinin `ExecuteDelete` yaptığı kolonlar. İndekssiz
> `ExecuteDelete` tam tablo taraması yapar ve temizliğin kendisi bir kesinti
> sebebine dönüşür.

---

## 6. API yüzeyi — 53 uç

7 controller. Sınıf düzeyinde `[Authorize]` **varsayılan**; anonim olanlar tek
tek işaretli.

### `AuthController` — `/api/auth` (7 uç)

| Uç | Yetki | Kota | Not |
|---|---|---|---|
| `POST /login` | anonim | `kimlik-dogrulama` | Sabit-zamanlı: kullanıcı yoksa da BCrypt çalışır |
| `POST /register` | anonim | `kimlik-dogrulama` | **Rol KABUL ETMEZ** — her hesap `student` doğar |
| `POST /change-password` | token | — | Tüm oturumları düşürür |
| `POST /forgot-password` | anonim | `kimlik-dogrulama` | Yapılandırma eksikse **503**, jeton üretmez |
| `POST /reset-password` | anonim | `kimlik-dogrulama` | Jeton tek kullanımlık, 30 dk |
| `POST /logout` | token | — | jti'yi iptal listesine alır |
| `GET /me` | token | — | |

### `BooksController` — `/api/books` (17 uç)

| Uç | Yetki | Kota | Not |
|---|---|---|---|
| `GET /` · `GET /taxonomy` · `GET /{id}` | token | — | katalog |
| `GET /{id}/read` | token | `okuma` (60/dk) | 🔵 **SALT OKUNUR** — yazmaz, LLM çağırmaz |
| `POST /{id}/progress` | token | `yazma` | yüzde sunucuda hesaplanır |
| `POST /{id}/analyze-page` | token | `agir-analiz` (20/dk) | 💰 yalnızca **boş** analizi doldurur |
| `POST /{id}/reanalyze` | **öğretmen/admin** | `agir-analiz` | 💰🔴 paylaşılan analizin **üzerine yazar** |
| `POST /addword` · `GET /words` · `PUT|DELETE /words/{id}` | token + sahiplik | `yazma` | |
| `GET /words/calisma` · `GET /words/ozet` · `POST /words/calisma-sonucu` | token | | aralıklı tekrar |
| `GET /quiz/{chapterId}` | token | — | salt okunur, yoksa 404 |
| `POST /quiz/{chapterId}` | token | `yazma` | üretir (idempotent) |
| `POST /submitquiz` | token | `yazma` | |

### `AppControllers.cs` — üç controller tek dosyada

**`GroupsController`** `/api/groups` (5): liste, oluştur, `POST /join`
(`davet-kodu` kotası), detay, `POST /assignbook`
**`TranslateController`** `/api/translate` (3): `POST /word` 💰, `POST /sentence` 💰,
`POST /analyze` 💰 — üçü de `ceviri`/`agir-analiz` kotasında
**`DashboardController`** `/api/dashboard` (4): `GET /stats`, OCR listele/kaydet/sil

### `AdminController` — `/api/admin` (10 uç, `[Authorize(Roles = "admin")]`)

istatistik · kullanıcı listesi · **rol değiştirme** · kullanıcı silme ·
kitap listesi/güncelleme/silme · `POST /books/upload` ve `/books/upload-pages`
(`dosya-yukleme` kotası, 50 MB)

### `ActivityController` · `FeedbackController` · `VerimController`

`POST /activity/log` (token) · `GET /activity/stats` (**admin**)
`POST /feedback` (token) · `GET /feedback/list` (**admin**)
`GET /verim/envanter` · `GET /verim/disa-aktar` · `POST /verim/hesabimi-sil` (**şifre ister**)

### Sağlık

`GET /health` — **anonim**, gövde yalnızca `OK` / `BOZUK`, veritabanını da yoklar.

> 💰 = ücretli dış API çağırır (`[ParaHarcar]` ile bildirilmiş)
> 🔴 = paylaşılan veriyi değiştirir (`[PaylasilanVeriYazar]`)

---

## 7. Kimlik, yetki ve oturum

### Token

HS256 imzalı JWT. Claim'ler:

```
NameIdentifier (userId) · Name · Email · Role
account_type ("admin" | "user")
jti  ← iptal anahtarı
iat  ← kesim zamanı karşılaştırması için (SANİYE çözünürlüğünde)
```

Ömür: **admin 1 saat**, diğerleri 24 saat.

Token hem `Authorization: Bearer` başlığında hem `jwt_token` çerezinde
taşınıyor. Çerez `HttpOnly` + `SameSite=Lax` + üretimde `Secure`.

> ⚠️ İstemciler token'ı ayrıca `localStorage`'da tutuyor — XSS ile çalınabilir.
> Bu **kabul edilmiş risk** (faz 2 kararı A): CSP nonce zinciri yüzeyi
> daraltıyor ama kapatmıyor.

### İptal (`BellekTokenIptalDeposu`)

İki mekanizma:
1. **jti listesi** — `logout` tek bir token'ı iptal eder.
2. **Kullanıcı kesim zamanı** — şifre değişimi, rol değişimi ve hesap silme
   kullanıcının **tüm** tokenlarını keser.

> 🔴 **2 saniyelik pay + `iat` saniyeye yuvarlanır.** Rol değişiminden sonra
> kullanıcı **~3 saniye** giriş yapamaz. Zararsız ama bilinmezse "giriş
> bozuldu" sanılır — testlerde tam olarak bu yaşandı.

Depo **bellek içi**: uygulama yeniden başlarsa iptal listesi sıfırlanır ve
iptal edilmiş tokenlar süreleri dolana kadar tekrar geçerli olur. Tek örnekli
dağıtımda kabul edilebilir; **yatay ölçeklemede çalışmaz** (§17).

### Yetki

```
FallbackPolicy = RequireAuthenticatedUser   ← öznitelik taşımayan her uç KAPALI
AddPolicy("AdminOnly")        → RequireRole("admin")
AddPolicy("EgitmenVeyaAdmin") → RequireRole("teacher", "admin")
```

`FallbackPolicy` sayesinde bir uca `[Authorize]` koymayı unutmak onu **açmaz**,
kapatır. Yan etki: eşleşmeyen bir yol 404 değil **401** döner (yol varlığını
sızdırmaz).

**Rol nasıl verilir:** kayıt rol kabul etmiyor. Öğretmenliği yalnızca yönetici
verir (`PUT /api/admin/users/{id}/role`). Bu, `EgitmenVeyaAdmin` politikasının
göstermelik olmamasının şartı.

### Grup yetkisi

`Authorization/GrupKapsami.cs`: `SahipMi`, `GorebilirMi`, `GorunurKitapIdleri`,
`DavetKodu`. Davet kodu **yalnızca sahibe** dönüyor — üyeye dönmek, kodun
gruptan ayrılan biri tarafından yeniden kullanılmasına izin verirdi.

---

## 8. Kaynak ve maliyet kontrolü

Tek kaynak: `RateLimiting/HizSinirlari.cs`. Sayı hiçbir yerde tekrar yazılmaz.

| Politika | Dakikada | Bölüm anahtarı | Kullanan |
|---|---|---|---|
| `kimlik-dogrulama` | 10 | IP | login, register, forgot/reset, hesap silme |
| `davet-kodu` | 5 | IP | `groups/join` (kaba kuvvet) |
| `okuma` | 60 | kullanıcı/IP | `books/{id}/read` |
| `ceviri` | 100 | kullanıcı/IP | `translate/word`, `translate/sentence` 💰 |
| `agir-analiz` | **20** | kullanıcı/IP | `translate/analyze`, `analyze-page`, `reanalyze` 💰 |
| `yazma` | 60 | kullanıcı/IP | genel yazma uçları |
| `dosya-yukleme` | 5 | kullanıcı | admin yükleme (50 MB × N) |
| genel taban | 300 | | her şeyin üstünde |

### Kotanın ötesindeki üç savunma

**`HesapSayaci`** — hedef bazlı: aynı **hesaba** 15 dakikada 10 başarısız giriş
→ kilit. IP kotası dağıtık saldırıyı durduramaz; bu onu durdurur. Yalnızca
başarısız denemeler sayılır (üç cihazdan giren meşru kullanıcı kilitlenmesin).

**`AgirIsKapisi`** — aynı anda en fazla **4** LLM analizi. Dakikalık kota
"aynı anda kaç tanesi bellekte" sorusunu yanıtlamaz. Kapı doluysa 2 sn beklenir,
sonra 503.

**HttpClient tavanları** — Groq 60 sn / 8 MB, Google 10 sn / 1 MB. Sınırsız
yanıt, arızalı bir dış servisin belleği doldurmasına izin verirdi.

### Maliyet bildirimi (KURAL-17)

Ücretli bir dış API çağıran her uç `[ParaHarcar]`, paylaşılan veri yazan her uç
`[PaylasilanVeriYazar]` taşımak zorunda. Sözleşme testi **iki yönlü** denetler:

- bildirilmiş uçlar dar kotada mı?
- LLM çağırıp da **bildirmeyen** uç var mı? ← asıl risk buydu

---

## 9. Ana veri akışları

### 9.1 Okuma akışı (KURAL-17 sonrası — üç uç)

```
İstemci                          Backend
   │  GET /books/{id}/read?page=7
   ├────────────────────────────▶  SALT OKUNUR: sayfa + sentencesJson + analizBekliyor
   │◀────────────────────────────
   │
   │  POST /books/{id}/progress          (beklenmez — fire & forget)
   ├────────────────────────────▶  ilerleme yazılır, yüzde SUNUCUDA hesaplanır
   │
   │  analizBekliyor === true ise:
   │  POST /books/{id}/analyze-page?page=7
   ├────────────────────────────▶  Groq → SentencesJson'a YAZILIR (yalnızca boşsa)
   │◀────────────────────────────  sentencesJson
```

> Bu üçlü, `api.ts` katmanında **soğuruldu**: ekran kodu hâlâ tek `readPage()`
> çağırıyor, ikinci ve üçüncü istekleri sarmalayıcı yapıyor.

**Neden bölündü:** eskiden hepsi tek bir `GET`'in içindeydi. Çerez
`SameSite=Lax` olduğu için üst düzey bir gezinme, kurbanın hesabından Groq
maliyeti yaratabiliyordu.

### 9.2 Çeviri zinciri (`TranslationService`)

```
TranslateSentenceAsync:
  1. TranslationCaches'e bak (global, 365 gün)   ← ücretsiz
  2. Google Translate (10 sn / 1 MB)             ← ucuz
  3. Google patlarsa → Groq (10 sn)              ← pahalı, yedek
  4. hepsi başarısız → CeviriBasarili = false    ← SESSİZ BAŞARI YOK
```

Adım 4 önemli: eskiden çevrilemeyen satır, İngilizcesi Türkçesiymiş gibi
200 ile dönüyordu. Artık istemci `ceviriBasarili === false` görüp uyarı gösteriyor.

`AnalyzeTextAsync` (cümle cümle analiz): Groq anahtarı varsa `AgirIsKapisi`
üzerinden Groq; yoksa **cümle bölme + Google** yedeği. Yedek doğru davranış —
Groq sözleşmede `IslevBozulur` sınıfında.

### 9.3 Kitap yükleme (yönetici)

```
PDF/DOCX → DosyaDogrulayici (tür İÇERİKTEN, uzantıdan DEĞİL)
         → PdfService.SayfalariCikarAsync (PdfPig / OpenXml)
         → iki mod:
            • POST /admin/books/upload        → Chapter'lara böler (eski mod)
            • POST /admin/books/upload-pages  → BookPage'lere böler (güncel mod)
```

**Yükleme sırasında analiz YAPILMIYOR.** Analiz ilk okumada üretiliyor
(§9.1). Ölçüm: geliştirme veritabanında **819 sayfanın 756'sı analizsiz**.

### 9.4 OCR

**Web:** Tesseract.js tarayıcıda çalışır; WASM ve dil verisi `public/tesseract`
altından servis edilir (**CDN'den değil** — `prebuild` betiği kopyalar).
Sunucuya yalnızca **çıkarılan metin** gönderilir.
**Mobil:** görüntü işleme yok; kullanıcı metni yapıştırır/yazar.

Sunucu tarafında görüntü **hiç saklanmıyor** — `OcrRecords.ImagePath` ölü bir
kolon (envanterde öyle işaretli).

### 9.5 Şifre sıfırlama

```
POST /forgot-password
  ├─ Resend:ApiKey VEYA App:FrontendUrl eksik → 503, JETON ÜRETİLMEZ
  │     (kontrol kullanıcı aramasından ÖNCE — yoksa durum kodu enumerasyon sızdırır)
  └─ ikisi de varsa:
       jeton üret (32 bayt CSPRNG) → DB'ye SHA-256 HASH'i yaz
       → e-posta gönder (30 dk, tek kullanımlık)
Yanıt her koşulda AYNI: "Eğer bu e-posta kayıtlıysa…"
```

---

## 10. İstemciler

Üçü de **aynı API'yi** kullanır ve HTTP çağrıları **yalnızca kendi `api.ts`
katmanından** geçer. Bu kural, KURAL-17'nin sözleşme değişikliğini ekran
kodlarına hiç dokunmadan soğurmayı mümkün kıldı.

### `frontend/` — öğrenci arayüzü (Next.js 16, :3000)

| Sayfa | İş |
|---|---|
| `/` | pano — ilerleme, istatistik |
| `/books` · `/books/[id]` | katalog · **okuma ekranı** (en karmaşık ekran) |
| `/books/[id]/quiz` | quiz |
| `/words` | kelime listesi + aralıklı tekrar |
| `/ocr` | tarayıcıda OCR (Tesseract.js) |
| `/groups` | gruplar |
| `/login`, `/register` | kimlik (`/register` → `/login`'i sarmalıyor) |
| `/gizlilik` | **veri envanteri + dışa aktarma + hesap silme** |

Bağımlılıklar (sürümler **sabit**, aralık yok): `next 16.3.2`, `react 19.2.4`,
`tesseract.js 7.0.0`, `lucide-react 1.23.0`, `tailwindcss 4.3.2`.

### `admin-panel/` — yönetici arayüzü (Next.js 16, :3001)

`/dashboard` · `/books` (yükleme) · `/users` (rol/silme) · `/feedbacks`
`pdfjs-dist 6.3.289` ile tarayıcıda PDF önizleme.

### `mobile/` — Expo / React Native

Expo Router, sekmeli: pano · kitaplar · kelimeler · gruplar · OCR;
ayrıca `books/[id]` okuma ve quiz, `login`.
Token `expo-secure-store`'da (web'deki `localStorage`'dan **daha iyi**).

### CSP nonce zinciri (her iki Next istemcisinde)

```
proxy.ts  ── istek başına nonce üretir ──▶ x-nonce + CSP başlığı
                                              │
app/layout.tsx ── await headers() ────────────┘  ← sayfayı DİNAMİK yapar
```

> 🔴 **Kırılgan.** `layout.tsx`'teki `await headers()` satırı silinirse sayfa
> statik ön-render'a döner, nonce tutmaz ve tarayıcı **hidrasyon script'ini
> engeller** — sayfa hatasız görünür ama **etkileşimsiz** kalır.
> `scripts/guard/11-tarayici.sh` bunu denetliyor.

CSP: `default-src 'self'` · `script-src 'self' 'nonce-…' 'strict-dynamic'
'wasm-unsafe-eval'` · `worker-src 'self' blob:` (Tesseract) · `object-src 'none'`.

**Üçüncü taraf JS/WASM/yazı tipi CDN'den çekilmez** — paketten gelir,
`prebuild` betikleriyle `public/` altına kopyalanır.

---

## 11. Arka plan işleri ve veri ömrü

`SaklamaTemizligiServisi` — açılıştan 5 dk sonra başlar, 24 saatte bir çalışır.

```csharp
AktiviteLogu    = 90 gün    // ⚠️ KISALTILAMAZ (aşağıda)
CeviriOnbellegi = 365 gün
SifirlamaJetonu = 7 gün
OcrKaydi        = 365 gün   // KURAL-19 · varsayılan, ürün kararı beklemede
```

> ⚠️ **`AktiviteLogu` kısaltılamaz.** `ai_word_translation` satırları aynı
> zamanda **Groq günlük kota sayacıdır**: bugünün kayıtları silinirse kullanıcı
> günlük limitini sıfırlar ve kota koruması çöker. 90 gün bunu güvenle aşar;
> bağ `VeriButunluguTests` ile sabitlenmiş.

Silme `ExecuteDelete` ile — satırlar belleğe çekilmez.
Silinen sayılar loglanır: **kayıt olmadan bir temizlik işinin çalışmadığını
fark etmek imkânsızdır.**

### Kişisel veri envanteri

`Data/KisiselVeriEnvanteri.cs` — her kalemin sınıfı (`Kimlik` / `Sir` /
`Davranis` / `BelirsizIcerik`), **sebebi**, ömrü ve dışa aktarılıp
aktarılmadığı. `GET /api/verim/envanter` bu listeden üretiliyor.

Envantere yazılmamış yeni bir kişisel veri alanı `KisiselVeriTests` tarafından
yakalanır — yani envanter dokümandaki gibi sessizce eskiyemez.

---

## 12. Yapılandırma sözleşmeleri

Dört sınıf, dört farklı soru. **Aralarındaki fark bilinçli.**

| Sınıf | Sorduğu soru | Eksikse |
|---|---|---|
| `SirDogrulayici` | "Bu sır geçerli mi?" | uygulama açılmaz |
| `OrtamSozlesmesi` | "Bu **dağıtım** eksiksiz mi?" | üretimde açılmaz |
| `DisServisSozlesmesi` | "Bu dış servis var mı, yoksa ne olur?" | sınıfa göre |
| `GuvenilirKokenler` | "Tarayıcıdan kim bağlanabilir?" | üretimde açılmaz |

### `DisServisSozlesmesi` — üç sınıf

| Sınıf | Anlamı | Örnek |
|---|---|---|
| `UygulamaAcilmaz` | eksikse hiç başlamaz | `Jwt:Key`, bağlantı dizesi |
| `OzellikKapanir` | açılır, **bağlı özellik 503 döner** | `Resend:ApiKey`, `App:FrontendUrl` |
| `IslevBozulur` | yedeğe düşer, güvenlik etkisi yok | `Groq:ApiKey` |

> Orta sınıf bu projenin en pahalı dersiydi. Eskiden Resend anahtarı yokken kod
> **sıfırlama bağlantısını uygulama loguna yazan** bir yedeğe düşüyordu — yani
> anahtar yokluğu bir kullanılabilirlik sorunundan **hesap ele geçirme yoluna**
> dönüşüyordu. "Sessizce zayıf yedeğe düşmek" artık yasak.

`OrtamSozlesmesi`, bu üç sınıfı **yeniden yazmaz — türetir**. Aynı anahtarı iki
sözleşmede ayrı ayrı sınıflandırmak, birini güncelleyip diğerini unutma
hatasının kaynağıydı.

### Üretimde zorunlu değişkenler

```
Jwt__Key · Jwt__Issuer · Jwt__Audience · ConnectionStrings__Default
Seed__AdminPassword · Seed__AdminEmail · CorsOrigins · PublicHost
ASPNETCORE_ENVIRONMENT=Production   ← sözleşmede DEĞİL (döngüsel), dolaylı ölçülür
```

Zorunlu **olmayan**: `Resend__ApiKey`, `App__FrontendUrl` (özellik kapanır),
`Groq__ApiKey` (yedeğe düşer).

---

## 13. Güvenlik katmanları ve kapılar

Güvenlik bu projede **ayrı bir katman değil**, mimarinin içine gömülü. 19 kural
iki fazda tanımlandı; 18'i kapandı ve her birinin bir **çalıştırılabilir kapısı**
var. (16 açık olduğu için `16-*.sh` yok — kapı numaraları 15'ten 17'ye atlar.)

```bash
bash scripts/guard/run-all.sh    # 18 kapı · çıkış kodu 0 = ihlal yok
```

| # | Kural | Kapının denetlediği |
|---|---|---|
| 01 | Kanıt altyapısı | test/kapı altyapısı yerinde mi |
| 02 | Sırlar koda girmez | sızmış değerler, gömülü şifre |
| 03 | Varsayılan reddet | `FallbackPolicy`, elle yetki kontrolü |
| 04 | Token yaşam döngüsü | jti sözleşmesi, iptal yolları |
| 05 | Girdi doğrulama | alan sınırları, whitelist |
| 06 | Hata ve log hijyeni | iç detay sızıntısı, PII log |
| 07 | Hız sınırı | yazma ucunda `[EnableRateLimiting]` **zorunlu** |
| 08 | Veri minimizasyonu | entity yanıtta yok, `Include` ≤ 13 |
| 09 | Kimlik sertleştirmesi | enumerasyon, zamanlama, şifre politikası |
| 10 | Dosya yükleme | tür **içerikten**, boyut, yol |
| 11 | Tarayıcı savunması | CSP nonce zinciri, başlıklar, CDN yasağı |
| 12 | Veri bütünlüğü | tekillik kısıtları, saklama süreleri |
| 13 | Köken denetimi | CORS beyaz listesi, Host filtresi |
| 14 | Eksik yapılandırmada kapalı kal | sızdıran yedek yok, dış servis sınıflandırılmış |
| 15 | Dağıtım kapısı | sağlık ucu, ortam sözleşmesi, üretim log ayarı |
| 17 | Maliyet ve paylaşılan yazma | GET yazmaz, ücretli uç dar kotada, bildirim |
| 18 | Tedarik zinciri ve kripto | BCrypt merkezi, npm/NuGet zafiyeti, sürüm sabit |
| 19 | Kişisel veri | envanter, saklama süresi, veri sahibi hakları |

> **16 (hesap yaşam döngüsü) açık** — çalışan bir e-posta servisi (Resend
> anahtarı) bekliyor.

### Kapı yazmanın üç kuralı (pahalıya öğrenildi)

1. **Kapı, metin araması değil davranış araması olmalı.** Bir kontrolü
   `if (false)` ile ölü hâle getirip kapıyı yeşil bırakabiliyorsan kapı bozuktur.
   Mümkünse **üretilmiş çıktıdan** oku (model anlık görüntüsü, `git check-ignore`,
   üretilen hash), elle yazılan kaynaktan değil.
2. **Sabit satır penceresi (`grep -A20`) kırılgandır.** Uç gövdesini yapısal kes
   (bir sonraki `[Http…]` özniteliğine kadar). Yanlış alarm, gerçek alarmdan
   daha hızlı güven kaybettirir.
3. **Test, ölçtüğünü adıyla söylemeli.** Kritik her davranışın kendi testi
   olsun: `..._GROQ_KOTA_SAYACINI_asla_silmez` gibi.

### Kapıların kendisinde bulunan hatalar

Mutasyon testleri kapıların üçünü yanlış çıkardı — hepsi düzeltildi:

| Kapı | Hata | Nasıl yakalandı |
|---|---|---|
| 14 | Dizi ataması glob'u kabukta genişletiyordu → yalnızca kök dizin taranıyordu | MUTASYON A yeşil verdi |
| 15 | `git check-ignore`, **takip edilen** dosyada sessiz kalıyor | MUTASYON D yeşil verdi |
| 17 | Yetki politikası **yorum satırında** da sayılıyordu | MUTASYON B yeşil verdi |

### Kriptografi

`Security/SifreHashleme.cs` — BCrypt iş faktörü **12**, tek yerde.
Doğrudan `BCrypt.Net.BCrypt.*` çağırmak yasak (kapı denetliyor) — **sahte hash
dâhil**: zamanlama eşitleyici daha düşük faktörde olsaydı "kullanıcı yok" dalı
ölçülebilir biçimde hızlanır ve enumerasyon zamanlama üzerinden geri gelirdi.

Eski hash'ler toplu güçlendirilemez (bcrypt tek yönlü); her başarılı girişte
**kademeli** yenilenir. Ölçüm için:

```sql
SELECT split_part("PasswordHash",'$',3) AS faktor, COUNT(*)
FROM "Users" GROUP BY 1 ORDER BY 1;
```

---

## 14. Test mimarisi

**315 test, 33 dosya.** Gerçek PostgreSQL'e karşı (`englishreadingdb_test`),
InMemory sağlayıcı **değil** — `varchar(n)` taşması gibi PostgreSQL'e özgü
davranışlar test edilebilsin diye.

### Fabrikalar

| Fabrika | Ne için |
|---|---|
| `TestAppFactory` | Development; sırları **süreç ortamına** yazar (fail-fast doğrulayıcı `Build()`'den önce okuyor) |
| `UretimTestFabrikasi` | Production dalı — HSTS, Host filtresi, HTTPS yönlendirmesi |
| `EpostaTestFabrikasi` | e-posta yapılandırmasını isteğe göre açar/kapatır |

### Yardımcılar

`AuthHelper` — öğrenci/yönetici/**öğretmen** hesabı üretir. Öğretmen üretimi
üretimdeki tek meşru yolu izler: kaydol → yönetici yükseltsin → yeniden giriş
(+ 3,3 sn bekleme, token kesim payı yüzünden).
`OkumaYardimcisi` — okuma akışının iki adımını (GET + POST progress) taklit eder.

### Test IP'si tuzağı

Kimlik kotası (10/dk) IP başına ve TestServer altında her istek aynı adresten
gelir. Başlık vermeyen iki ayrı test dosyası **aynı kovayı paylaşır**; biri
kotayı doldurunca diğeri 429 alır. Çözüm: `AuthHelper.TazeIpIlePostAsync`.

> Hız sınırının **kendisini** sınayan testler bunu kullanmaz — başlığı kasten
> sabit tutup aynı kovayı paylaşırlar.

### Kategoriler

`GirdiDogrulama` 45 · `DosyaYukleme` 27 · `TokenYasamDongusu` 18 ·
`VeriButunlugu` 17 · `HizSiniri` 16 · `KimlikSertlestirme` 15 ·
`HataHijyeni` 15 · `Yetkilendirme` 13 · `VeriMinimizasyonu` 13 · `Sirlar` 13 ·
`KelimeCalismasi` 11 · `TarayiciSavunmasi` 10 · `Koken` 10 · `Maliyet` 9 ·
`Dagitim` 9 · `Yapilandirma` 8 · `KisiselVeri` 8 · `Tedarik` 7 ·
`OkumaDevam` 7 · `Altyapi` 4

```bash
dotnet test Linguza.sln --filter "Category=Maliyet"
```

---

## 15. Derleme, CI ve dağıtım

### Yerel geliştirme

```bash
docker compose up -d postgres && ./start-dev.sh
# Frontend :3000 · Admin :3001 · API :5001 · pgAdmin :8080 · Metro :8081
cd mobile && npx expo start
```

Test veritabanı ayrı bir rolle kurulur (`linguza_test`):
```bash
bash scripts/dev/test-rolu-kur.sh
```

### CI — `.github/workflows/guvenlik.yml`

```
backend işi:            frontend işi (matrix: frontend, admin-panel):
  dotnet build            npm ci
  dotnet test             npm audit --audit-level=high
  guard/run-all.sh        npm run build
  .NET zafiyet taraması
```

Tamamını yerelde koşturmak için: `bash scripts/ci-yerel.sh`

### Dağıtım

```bash
DB_URL="postgres://…" bash scripts/dagitim/on-kontrol.sh   # ÖNCE
# … dağıt …
bash scripts/dagitim/canli-dogrula.sh https://api-adresin  # SONRA
```

**Ön kontrol:** test takımı · 18 kapı · üretim log ayarının depoya girdiği ·
üretim veritabanında **mükerrer kayıt** (11 tekillik kısıtı).
`DB_URL` verilmezse kontrol *atlandığını* söyler ve yine **1** döner —
atlanan kontrol geçmiş sayılmaz.

**Canlı doğrulama:** sağlık ucu · HTTP→HTTPS · 4 güvenlik başlığı ·
`Server` sızıntısı · yabancı köken CORS · şifre sıfırlama durumu.
Ölçemediği ikisini ekrana yazar: `X-Forwarded-For` en sağdaki girdi ve
CSP nonce zincirinin çalıştığı.

### Üretim log seviyeleri

`appsettings.Production.json` **bilerek sürüm kontrolünde** (sır içermez).
`.gitignore`'a alınırsa üretime hiç gitmez ve her SQL sorgusu loglanmaya devam
eder. Üretime özel *sır* gerekirse `appsettings.Production.Local.json` (yok sayılı).

`EnglishReadingPlatform` ad alanı bilerek `Information`'da: `GuvenliLog`
kayıtları ve "ÖZELLİK KAPALI" açılış raporu görünür kalmalı.

### Bağımlılık disiplini

`package.json` sürümleri **sabit** (aralık yok) — `npm ci` kilide uyar ama
`npm install` aralığı yeniden çözer ve sürüm sessizce kayar.
Bir zafiyeti kabul etmek zorundaysan `--audit-level`'i gevşetme:
`guvenlik/zafiyet-istisnalari.json`'a **son kullanma tarihiyle** yaz.

---

## 16. Bilinmesi gereken tuhaflıklar

**1. Kitaplar iki farklı biçimde saklanıyor.** `Chapter` (eski — her okumada
yeniden çevrilir) ya da `BookPage` (güncel — çeviri `SentencesJson`'a bir kez
yazılır). `hasPages` bayrağı hangisinin geçerli olduğunu söyler.
**`BookPage` GLOBALDİR** — `UserId` taşımaz, içeriği bütün kullanıcılar paylaşır.

**2. Backend hiç statik dosya sunmaz.** `Views/` ve `wwwroot/` ölü koddu,
2026-09-01'de silindi; `app.UseStaticFiles()` de kaldırıldı. Statik dosya
sunmak gerekirse kökü açma — `RequestPath` ile tek dizin yayınla.

**3. Backend portu üç yerde farklı.** `appsettings.json` → 8080,
`appsettings.Development.json` → 5001, docker-compose → dışarı 5001.
İlk kurulumda "Failed to fetch" alırsan buraya bak.

**4. Ara katman dosyası `middleware.ts` değil `proxy.ts`.** Next 16'da
`middleware` kullanımdan kalktı; dışa aktarılan işlev de `proxy` olmalı,
yoksa derleme E394 ile durur.

**5. `dotnet-ef` depoda değil.** `.config/dotnet-tools.json`'dan gelir:
`dotnet tool restore`. `migrations add` veritabanına **bağlanmaz** (yer tutucu
ortam değişkenleri yeter), ama `migrations remove` **bağlanır**.

**6. Rol değişiminden sonra ~3 saniye giriş yapılamaz.** Token kesim payı
(2 sn) + `iat`'in saniyeye yuvarlanması. Zararsız, ama bilinmezse
"giriş bozuldu" sanılır.

**7. Testlerin yarısı birden düşerse önce Docker'a bak.** `Npgsql… Connection
refused` → `docker compose up -d postgres`. Bu bir regresyon değildir.

**8. macOS bash 3.2 tuzağı.** Komut ikamesi içindeki heredoc'ta **tek sayıda
kesme işareti** tırnak eşleme hatası verir; kapı `syntax error` ile çıkış kodu
2 döndürür — yani sessizce çalışmaz. Guard betiklerindeki Türkçe yorumlarda
kesme işaretine dikkat.

---

## 17. Bilinen açıklar ve teknik borç

### Güvenlik — açık

| Konu | Durum |
|---|---|
| **KURAL-16 (hesap yaşam döngüsü)** | Açık — Resend anahtarı bekliyor. E-posta doğrulama akışı yok |
| `Resend__ApiKey` / `App__FrontendUrl` | Tanımsız → şifre sıfırlama **503** (güvenli ama kapalı) |
| Token `localStorage`'da (web) | **Kabul edilmiş risk** — CSP yüzeyi daraltıyor, kapatmıyor |
| Aydınlatma metni / gizlilik politikası | Yok — **hukuki**, kod yazamaz. `/gizlilik` ekranında bağlanacağı yer hazır |
| `OcrRecords` 365 gün | **Varsayılan** uygulandı, ürün kararı beklemede |

### Mimari borç

**`BellekTokenIptalDeposu` yatay ölçeklenmez.** İptal listesi süreç belleğinde;
ikinci bir örnek açıldığında iptal edilen token diğer örnekte hâlâ geçerli olur.
Ölçeklemeden önce Redis benzeri paylaşılan bir depoya taşınmalı.

**`TranslationService` 907 satır** — çeviri, analiz, önbellek, kota sayacı ve
üç ayrı dış servis yolu tek sınıfta. Bölünmeye aday.

**`AppControllers.cs` üç controller taşıyor** (Groups, Translate, Dashboard).
Ayrı dosyalara bölünmeli.

**Sayfa analizi yükleme sırasında yapılmıyor.** 819 sayfanın 756'sı analizsiz;
analiz ilk okumada üretiliyor. Yükleme sırasında toplu analiz, okuma
gecikmesini ve kota baskısını ortadan kaldırırdı.

**`Chapter` / `BookPage` ikiliği** iki ayrı okuma yolu, iki ayrı test yolu ve
iki ayrı hata yüzeyi demek. Eski mod bir gün kaldırılmalı.

### Belge borcu

`docs/03-API-REFERANSI.md`'de `POST /auth/logout` için "🔴 sessizce başarısız
oluyor" ve `POST /auth/register` için "⚠️ enumerasyon" notları **eskimiş** —
ikisi de kapatıldı (KURAL-04 ve KURAL-09). Kapalı bir açığı açık gösteren
belge, açık bir açığı gizleyen belge kadar yanıltıcıdır.

### Depo hijyeni

Kök dizinde **~25 MB, 15 dosya** kişisel veri kopyası (`*.dump`, `yedek-*.sql`,
`englishplatform.db`). Depoda **değiller** ama iCloud ile eşitlenen bir
klasördeler. `englishplatform.db` içeriği tamamen test verisi — yani git
geçmişi temizliği (`filter-repo`) **gerekmiyor.**

---

## 18. Yeni özellik eklerken

Bu bölüm, sıradaki eklemelerin kontrol listesi. Her madde bir kapı tarafından
denetleniyor — atlanırsa build ya da `run-all.sh` kırılır.

### Yeni bir API ucu

| Soru | Nerede halledilir | Kapı |
|---|---|---|
| Kim erişebilir? Giriş yeterli mi, sahiplik/rol gerekli mi? | `[Authorize(Policy=…)]` | 03 |
| Yazma ucu mu? | `[EnableRateLimiting(HizSinirlari.…)]` **zorunlu** | 07 |
| Girdi sınırları var mı? | `AlanSinirlari` + `[IzinliDeger]` | 05 |
| Hata mesajı iç detay sızdırıyor mu? | `KullaniciHatasi` | 06 |
| Yanıt entity mi dönüyor? | `Contracts/` DTO | 08 |
| Ücretli dış API çağırıyor mu? | `[ParaHarcar]` + dar kota | 17 |
| Paylaşılan veri mi yazıyor? | `[PaylasilanVeriYazar]` + yetki | 17 |
| **Durum değiştiriyor mu?** | `GET` **olmaz** — POST/PUT/DELETE | 17 |

### Yeni bir veritabanı alanı

1. Modele ekle → `AppDbContext`'te gerekiyorsa indeks/kısıt
2. **Kişisel veri mi?** → `Data/KisiselVeriEnvanteri.cs`'e yaz
   (sınıfı, sebebi, ömrü, dışa aktarılıp aktarılmadığı) — yazmazsan
   `KisiselVeriTests` kırılır (kapı 19)
3. Ömrü varsa → `SaklamaTemizligiServisi`'ne süre **ve silme** ekle
4. Migration üret (§16 madde 5'teki ortam değişkeni tuzağına dikkat)
5. Dışa aktarma kapsıyor mu? → `VerimController.DisaAktar`

### Yeni bir dış servis

1. `Configuration/DisServisSozlesmesi.cs`'e sınıfını yaz
   (`UygulamaAcilmaz` / `OzellikKapanir` / `IslevBozulur`)
2. **Yapılandırma eksikken zayıf bir yedeğe düşme** — özellik kapanır
3. `HttpClient`'a zaman aşımı **ve** yanıt boyutu tavanı ver
4. Sınıflandırılmamış bir `X:ApiKey` okuması kapı 14'ü kırar

### Yeni bir istemci ekranı

1. HTTP çağrısı **yalnızca `api.ts` üzerinden**
2. Yetkiye bağlı bir eylem varsa butonu gizle — **ama asıl kontrol backend'de**
   (buton gizlemek `curl`'ü durdurmaz)
3. Üçüncü taraf JS/WASM/yazı tipi **CDN'den çekilmez** — paketten gelir,
   `prebuild` ile `public/` altına kopyalanır (kapı 11)
4. Yeni bir sayfa `layout.tsx`'in nonce zincirine dokunuyorsa dikkat (§10)

### Sözleşme değiştiğinde (kırıcı değişiklik)

Üç istemci var. Sözleşmeyi `api.ts` katmanında soğurabiliyorsan ekran koduna
dokunma — KURAL-17'de okuma akışı üç uca bölündüğü hâlde ekranlar değişmedi.
Soğuramıyorsan: **önce istemcileri, sonra backend'i** dağıt.

### Her değişiklikten sonra

```bash
dotnet test Linguza.sln          # 315 test
bash scripts/guard/run-all.sh    # 18 kapı
cd frontend && npx tsc --noEmit  # + admin-panel + mobile
```

Güvenlik açısından kritik bir davranış eklediysen **testini de yaz** ve
**mutasyonla kanıtla**: düzeltmeyi geri al, testin kırmızıya döndüğünü gör,
geri koy. Kırmızıya dönmeyen test, test değildir.

---

## Bu raporu yeniden üretmek

```bash
# Uç sayısı
grep -rc '\[Http' EnglishReadingPlatform/Controllers/*.cs

# Satır sayıları
find EnglishReadingPlatform -name '*.cs' -not -path '*/obj/*' \
  -not -path '*/bin/*' -not -path '*/Migrations/*' -exec wc -l {} + | sort -rn

# Tablolar
docker exec english_postgres psql -U appuser -d englishreadingdb -c '\dt'

# Test ve kapı sayısı
dotnet test Linguza.sln
bash scripts/guard/run-all.sh

# Analizsiz sayfa oranı
docker exec english_postgres psql -U appuser -d englishreadingdb -tAc \
  "SELECT count(*) FILTER (WHERE \"SentencesJson\" IN ('','[]')) ||'/'|| count(*) FROM \"BookPages\";"
```
