# 03 — Web İstemcileri Raporu

> **Ölçüm tarihi:** 2026-09-07 · **Commit:** `6c8f22a`
> `frontend/` **5.107 satır · 18 dosya** — öğrenci arayüzü
> `admin-panel/` **1.400 satır · 8 dosya** — yönetici arayüzü
> İkisi de **Next.js 16**, aynı güvenlik iskeletini paylaşır.

---

## İçindekiler

1. [İki istemci, tek iskelet](#1-i̇ki-istemci-tek-iskelet)
2. [Güvenlik iskeleti — CSP nonce zinciri](#2-güvenlik-iskeleti--csp-nonce-zinciri)
3. [frontend — dosya envanteri](#3-frontend--dosya-envanteri)
4. [frontend — `api.ts`](#4-frontend--apits)
5. [frontend — bağlam ve kancalar](#5-frontend--bağlam-ve-kancalar)
6. [frontend — ekran ekran](#6-frontend--ekran-ekran)
7. [admin-panel](#7-admin-panel)
8. [Varlık yönetimi — CDN yasağı](#8-varlık-yönetimi--cdn-yasağı)
9. [Güvenlik durumu](#9-güvenlik-durumu)
10. [Bilinen eksikler](#10-bilinen-eksikler)

---

## 1. İki istemci, tek iskelet

| | `frontend` :3000 | `admin-panel` :3001 |
|---|---|---|
| Kullanıcı | öğrenci / öğretmen | yönetici |
| Sayfa | 9 | 5 |
| Satır | 5.107 | 1.400 |
| Jeton anahtarı | `token` | **`admin_token`** (ayrı) |
| Özel bağımlılık | `tesseract.js` 7.0.0 | `pdfjs-dist` 6.3.289 |
| Ortak | Next 16.3.2 · React 19.2.4 · Tailwind 4.3.2 · TS 5.9.3 | |

**Paylaşılan üç dosya deseni** (ikisinde de birer kopya var):

```
proxy.ts                  istek başına CSP nonce
guvenlik-basliklari.mjs   statik başlıklar + cspUret()
next.config.*             poweredByHeader: false + statik başlıklar
```

> Kopya olmaları bilinçli değil, **teknik borç**: biri güncellenip diğeri
> unutulabilir. Şimdilik `scripts/guard/11-tarayici.sh` ikisini birden denetliyor.

---

## 2. Güvenlik iskeleti — CSP nonce zinciri

### Zincir

```
proxy.ts                                   next.config.ts
  ├─ crypto.randomUUID() → nonce             └─ statikGuvenlikBasliklari
  ├─ İSTEK başlığına:  x-nonce + CSP              X-Content-Type-Options: nosniff
  └─ YANIT başlığına:  CSP                        X-Frame-Options: DENY
        │                                         Referrer-Policy: strict-origin-when-cross-origin
        ▼                                         Permissions-Policy: camera=() microphone=() …
   app/layout.tsx
     await headers()   ← 🔴 sayfayı DİNAMİK yapar
```

### Neden bu kadar kırılgan

Next.js, **istek başlıklarında** bir CSP görürse içindeki nonce'u kendi
ürettiği script etiketlerine de yazar — hidrasyon script'i böylece nonce'lu
olur ve `'unsafe-inline'` gerekmez.

`layout.tsx`'teki `await headers()` satırı silinirse sayfa **statik
ön-render'a** döner, nonce tutmaz ve tarayıcı hidrasyon script'ini engeller.
Sonuç: **sayfa hatasız görünür ama etkileşimsiz kalır.** Konsolda CSP ihlali
görünür, ama "buton çalışmıyor" şikâyetiyle bunun bağını kurmak zor.
`scripts/guard/11-tarayici.sh` bu satırı denetliyor.

### CSP (üretilen)

```
default-src 'self'
script-src  'self' 'nonce-…' 'strict-dynamic' 'wasm-unsafe-eval'
style-src   'self' 'unsafe-inline'
img-src     'self' data: blob:
font-src    'self' data:
worker-src  'self' blob:
connect-src 'self' ${NEXT_PUBLIC_API_URL}
frame-ancestors 'none' · base-uri 'self' · form-action 'self' · object-src 'none'
```

- `'wasm-unsafe-eval'` → Tesseract (frontend) ve pdf.js (admin) WASM çekirdeği
- `worker-src blob:` → Tesseract worker'ı blob URL'den başlıyor
- `style-src 'unsafe-inline'` → **Tailwind kaynaklı kalan gevşeklik** (§10)

### Neden CSP `next.config`'te değil

Aynı başlığı iki yerden göndermek ikisinin de uygulanmasına (**kesişim**) yol
açar ve sayfayı sessizce kırar. CSP istek başına nonce gerektirdiği için
`proxy.ts`'te; **istekten bağımsız** başlıklar `next.config`'te.

### `proxy.ts` matcher

```
/((?!_next/static|_next/image|favicon.ico|tesseract|images).*)
```

Yalnızca **belge** istekleri. Statik varlıkların nonce'a ihtiyacı yok; onları
da kapsamak her varlık için ara katman çalıştırmak demekti.

> Dosya adı **`proxy.ts`**, işlev adı **`proxy`**. Next 16'da `middleware`
> kullanımdan kalktı; `middleware` adıyla dışa aktarılırsa derleme **E394** ile durur.

---

## 3. frontend — dosya envanteri

```
frontend/
├── proxy.ts                 43   CSP nonce üretimi
├── guvenlik-basliklari.mjs  45   statik başlıklar + cspUret()
├── next.config.ts           17   poweredByHeader: false
├── scripts/tesseract-varliklari-kopyala.mjs   prebuild: WASM+dil verisi → public/
└── app/
    ├── layout.tsx           63   await headers() ← nonce zinciri
    ├── layout-wrapper.tsx  366   kenar çubuğu, üst çubuk, mobil menü
    ├── api.ts              424   TEK HTTP kapısı
    ├── page.tsx            299   panel
    ├── books/page.tsx      364   kitaplık
    ├── books/[id]/page.tsx 560   okuma ekranı
    ├── books/[id]/quiz     (quiz)
    ├── words/page.tsx      927   ← EN BÜYÜK: kelime listesi + çalışma
    ├── groups/page.tsx     511   gruplar
    ├── ocr/page.tsx        448   Tesseract.js ile tarayıcıda OCR
    ├── login/page.tsx      180   giriş + kayıt
    ├── register/page.tsx     3   → login'i sarmalar
    ├── gizlilik/page.tsx   200   KURAL-19: envanter + indir + hesap sil
    ├── components/FeedbackWidget.tsx  170
    ├── context/AuthContext.tsx        100
    ├── context/ThemeContext.tsx        56
    ├── hooks/useTelaffuz.ts           108   Web Speech API
    └── hooks/useActivityTracker.ts     68   30 sn nabız
```

---

## 4. frontend — `api.ts`

**424 satır, tek HTTP kapısı.** Proje kuralı: *"Frontend'de HTTP çağrıları
yalnızca `frontend/app/api.ts` üzerinden yapılır."*

```ts
const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001') + '/api';
```

> `NEXT_PUBLIC_API_URL` tanımsızsa `localhost:5001`'e düşer — **üretimde
> tanımlanmazsa tüm API çağrıları CSP'ye takılır** (`connect-src` o değerden
> üretiliyor) ve sayfa sessizce çalışmaz. Dağıtım kontrol listesindeki
> sessiz hatalardan biri.

### Hata sözleşmesi

Sunucu **tüm** hatalarını `{ error: "…" }` biçiminde döndürür
(`Program.cs → InvalidModelStateResponseFactory`). `apiRequest` bu alanı okur.
Mobil istemci de aynı alanı okuyor — **biçim üçünde de aynı kalmalı**.

### KURAL-17 sonrası soğurma

Sözleşme değişikliği burada emildi; ekran kodu tek çağrı yapmaya devam ediyor:

| Sarmalayıcı | Altında ne oluyor |
|---|---|
| `readPage(id, page)` | `GET read` → `POST progress` (beklenmez) → boşsa `POST analyze-page` |
| `readChapter(id, ch)` | `GET read` → `POST progress` |
| `getQuiz(chapterId)` | `GET quiz` → 404 ise `POST quiz` |
| `reanalyzePage(id, page)` | `POST reanalyze` (öğretmen/admin) |
| `register(u, e, p)` | **rol göndermez** (KURAL-17) |
| `veriEnvanteri` / `verimiDisaAktar` / `hesabimiSil` | KURAL-19 |

---

## 5. frontend — bağlam ve kancalar

### `AuthContext` (100)

```
user · loading · login() · register() · logout()
useAuth()   ← tüketici kanca
```

Açılışta `GET /auth/me` ile oturum tazeleniyor. `register(username, email,
password)` — **rol parametresi yok** (KURAL-17).

Jeton `localStorage`'da. **Kabul edilmiş risk**: CSP nonce zinciri XSS
yüzeyini daraltıyor ama kapatmıyor. Mobil bu konuda daha iyi (SecureStore).

### `ThemeContext` (56)

Açık/koyu tema, tercih `localStorage`'da.

### `useActivityTracker` (68)

**30 saniyelik nabız** — yönetici panelindeki canlı akışı besler.
Yol → etkinlik eşlemesi mobildekiyle **birebir aynı** (`PageView`, `ReadBook`,
`TakeQuiz`, `AuthView`) — iki istemcinin verisi aynı grafikte anlamlı dursun diye.

> Mobilden farkı: web sekmesi arka plana atılınca nabız **durmuyor**.
> Mobil `AppState` ile durduruyor (bkz. 02 raporu §9). Bu, aynı kullanıcının
> web ve mobil sürelerinin farklı ölçülmesi demek.

### `useTelaffuz` (108)

**Web Speech API** sarmalayıcısı. Mobilde aynı adlı kanca `expo-speech`
kullanıyor — arayüz aynı, altyapı farklı.

### `components/FeedbackWidget` (170)

Her sayfada duran geri bildirim düğmesi → `POST /api/feedback`.
Yönetici `GET /api/feedback/list` ile okuyor.

### `layout-wrapper.tsx` (366)

Kenar çubuğu (masaüstü) + üst çubuk + mobil menü. Gezinti öğeleri, çıkış
düğmesi ve **KURAL-19 ile eklenen "Verilerim ve gizlilik" bağlantısı** burada.

---

## 6. frontend — ekran ekran

### `/` — Panel (299)
`GET /dashboard/stats`: okunan kitap, kelime sayısı, quiz ortalaması,
son okunanlar.

### `/books` — Kitaplık (364)
`GET /books` + `GET /books/taxonomy` (seviye/kategori filtresi).

### `/books/[id]` — Okuma (560)
En karmaşık ekran. `readPage`/`readChapter` (§4), cümle görünümü, kelime
seçimi, `POST /books/addword`, çeviri paneli.
**KURAL-17:** "Yeniden dene" butonu sayfa modunda **yalnızca öğretmen/admin**:
```tsx
{(!hasPages || yenidenAnalizEdebilir) && <button onClick={handleReanalyze}>…}
```
Çeviri başarısız satırlar için uyarı bandı (`ceviriBasarili === false`).

### `/books/[id]/quiz`
`getQuiz` sarmalayıcısı (gerekirse üretir) → cevaplar → `POST /books/submitquiz`.

### `/words` — Kelimelerim (927) ← **en büyük dosya**
Liste + arama + düzenleme/silme, ayrıca **aralıklı tekrar çalışma modu**
(`/books/words/calisma`, `/calisma-sonucu`, `/ozet`).

### `/ocr` — Metin Tara (448)
**Tesseract.js tarayıcıda çalışır.** Worker, WASM çekirdeği ve dil verisi
`/tesseract` altından servis ediliyor — **CDN'den değil** (§8):
```ts
workerPath: '/tesseract/worker.min.js'
corePath:   '/tesseract/core'
langPath:   '/tesseract/lang'
```
Sunucuya yalnızca **çıkarılan metin** gidiyor (`POST /dashboard/ocr`).

### `/groups` — Gruplar (511)
Oluşturma, davet koduyla katılma, detay. Davet kodu **yalnızca sahibe**.

### `/login` (180) · `/register` (3 satır — `login`'i sarmalar)
**KURAL-17:** rol seçimi kaldırıldı, yerine bilgilendirme notu.
**KURAL-19:** `/gizlilik` bağlantısı eklendi.

### `/gizlilik` (200) — KURAL-19
Üç bölüm: **veri envanteri tablosu** (`GET /verim/envanter` — envanterden
üretiliyor), **verilerimi indir** (JSON dosyası **tarayıcıda** üretilir,
sunucuda kopya kalmaz), **hesabımı sil** (şifre onayı ister).
Yasal metin bölümü "hazırlanıyor" diyor — metin hukuki, kod yazamaz.

---

## 7. admin-panel

```
admin-panel/
├── proxy.ts / guvenlik-basliklari.mjs / next.config.mjs   frontend ile aynı desen
├── scripts/pdfjs-worker-kopyala.mjs   prebuild: pdf.worker + wasm → public/pdfjs
└── app/
    ├── page.tsx            99   giriş
    ├── layout.tsx          29
    ├── components/AdminLayout.tsx  116   kenar çubuğu
    ├── hooks/useAdminAuth.ts        32
    ├── dashboard/page.tsx 176   istatistik + canlı etkinlik akışı
    ├── books/page.tsx     708   ← EN BÜYÜK: kitap yükleme (PDF önizleme)
    ├── users/page.tsx     143   kullanıcı listesi, rol değiştirme, silme
    └── feedbacks/page.tsx  97   geri bildirimler
```

### `useAdminAuth` — ayrı jeton anahtarı

```ts
export const ADMIN_TOKEN_ANAHTARI = "admin_token";
export function adminTokenOku(): string | null   // SSR'da null
export function useAdminKorumasi(): void         // token yoksa "/" e yönlendirir
```

> **Token bilerek state'te TUTULMUYOR.** Eski sürüm state'e yazıyordu; bu efekt
> gövdesinde senkron `setState` demekti (`react-hooks/set-state-in-effect`) —
> gereksiz ikinci render tetikliyor, üstelik aynı mantık dört sayfada
> kopyalanmıştı. İhtiyaç duyan yerler `adminTokenOku()` ile **kullanım anında** okuyor.

Ayrı anahtar (`admin_token` ≠ `token`) sayesinde aynı tarayıcıda öğrenci ve
yönetici oturumları çakışmıyor.

### `books/page.tsx` (708) — kitap yükleme

Backend'in **iki yükleme modunu** kullanıyor:
- `POST /admin/books/upload` → `Chapter`'lara böler (eski mod)
- `POST /admin/books/upload-pages` → `BookPage`'lere böler (güncel mod)

`pdfjs-dist` ile **tarayıcıda PDF önizleme** ve sayfa seçimi.
Kota: `dosya-yukleme` (dakikada 5), boyut 50 MB.

### `dashboard/page.tsx` (176)

`GET /admin/stats` + `GET /activity/stats` (**admin politikası**) —
istemcilerin 30 sn nabzıyla beslenen canlı akış.

---

## 8. Varlık yönetimi — CDN yasağı

**Kural:** üçüncü taraf JS/WASM/yazı tipi CDN'den çekilmez. Paketten gelir,
`prebuild` betikleriyle `public/` altına kopyalanır.

| İstemci | Betik | Kopyaladığı |
|---|---|---|
| frontend | `scripts/tesseract-varliklari-kopyala.mjs` | worker + WASM çekirdeği + `eng` dil verisi |
| admin-panel | `scripts/pdfjs-worker-kopyala.mjs` | `pdf.worker.min.mjs` + `wasm/` |

```json
"prebuild": "node scripts/tesseract-varliklari-kopyala.mjs",
"predev":   "node scripts/tesseract-varliklari-kopyala.mjs"
```

> Betikler kaynak dosyayı bulamazsa **patlar** — sessizce geçip çalışma
> zamanında CDN'e düşmez. Bazı kütüphanelerin *varsayılanı* CDN'dir
> (Tesseract'ta olduğu gibi); o yüzden yollar açıkça veriliyor.

**Neden önemli:** CDN'den kod çekmek CSP'yi gevşetmeyi zorunlu kılar ve
tedarik zincirini üçüncü tarafa açar.

---

## 9. Güvenlik durumu

### İyi olan

- **Nonce'lu CSP** — `'unsafe-inline'` script yok, `'strict-dynamic'` var
- **Statik başlıklar** — `nosniff`, `DENY`, `Referrer-Policy`, `Permissions-Policy`
- **`poweredByHeader: false`** — yığın parmak izi yok
- **Tek HTTP kapısı** her iki istemcide
- **Üçüncü taraf varlıklar pakette** — CDN yok
- **Yönetici jetonu ayrı anahtarda**
- **Rol kayıtta seçilemiyor** (KURAL-17)
- **`/gizlilik`** — veri sahibi hakları erişilebilir (KURAL-19)
- **Yetkiye bağlı butonlar gizli** — ama asıl kontrol backend'de

### Açık olan

| Konu | Etki |
|---|---|
| Jeton `localStorage`'da | XSS ile çalınabilir — **kabul edilmiş risk** (faz 2 kararı A) |
| `style-src 'unsafe-inline'` | Tailwind kaynaklı; stil enjeksiyonu yüzeyi açık kalıyor |
| `NEXT_PUBLIC_API_URL` tanımsızsa | `localhost`'a düşer, üretimde tüm çağrılar CSP'ye takılır — **sessiz** |
| Üç kopya güvenlik dosyası | `proxy.ts`/`guvenlik-basliklari.mjs` iki istemcide ayrı ayrı |

---

## 10. Bilinen eksikler

**Kod sağlığı**
- `frontend/app/words/page.tsx` **927 satır**, `admin-panel/app/books/page.tsx`
  **708 satır** — ikisi de bölünmeye aday
- `books/[id]/page.tsx` 560, `groups/page.tsx` 511
- `frontend/app/components/` içinde **tek bileşen** var (`FeedbackWidget`) —
  mobilde 9 bileşenlik bir tasarım sistemi varken web'de ortak bileşen yok;
  stil sayfalara dağılmış

**Yapı**
- `proxy.ts` + `guvenlik-basliklari.mjs` iki istemcide **kopya** — biri
  güncellenip diğeri unutulabilir
- Web ile mobil arasındaki tip sözleşmesi ayrışmasını yakalayan **kapı yok**

**Test**
- İstemcilerin **birim/bileşen testi yok**. CI yalnızca `tsc` + `next build`
  koşuyor; 6.507 satır web arayüzü kodu davranışsal olarak test edilmiyor
- Tarayıcıda uçtan uca deneme (KURAL-17 sonrası okuma akışı) **yapılmadı**
