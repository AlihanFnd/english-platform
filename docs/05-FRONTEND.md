# 05 — Kullanıcı Arayüzü (`frontend/`)

**Next.js 16.3.2 (App Router)** · **React 19.2.4** · **Tailwind CSS v4** · **TypeScript 5**

Bağımlılıklar: `lucide-react` (ikonlar), `tesseract.js` (tarayıcıda OCR),
`@tesseract.js-data/eng` (dil verisi — geliştirme bağımlılığı, derlemede `public/` altına
kopyalanır). **Durum yönetimi kütüphanesi yok** — sadece React Context + `useState`.

> 🔒 **KURAL-11 (2026-09-01):** Sayfalar artık **dinamik** render ediliyor. Sebep:
> `proxy.ts` her isteğe tek kullanımlık nonce'lu bir CSP yazıyor ve statik ön-render'daki
> script etiketleri isteğe özel nonce'u taşıyamaz. `app/layout.tsx` içindeki `await headers()`
> çağrısı bu yüzden vardır — **silinirse hidrasyon script'i CSP tarafından engellenir.**
> Yazı tipleri `next/font/google` ile derleme sırasında indirilip kendi origin'imizden
> servis ediliyor; `globals.css` içinde artık Google Fonts `@import`'u yok.

> ⚠️ `frontend/AGENTS.md` uyarısı: *"This is NOT the Next.js you know"* — Next 16 breaking
> change'ler içeriyor. Kod yazmadan önce `node_modules/next/dist/docs/` altındaki rehbere
> bakılmalı. `frontend/CLAUDE.md` sadece `@AGENTS.md` içerir.

---

## 1. Dosya yapısı

```
app/
├── layout.tsx              RootLayout — <html lang="tr" class="light">
│                           ThemeProvider > AuthProvider > LayoutWrapper
├── layout-wrapper.tsx      358 satır — tüm kabuk (sidebar, header, mobil menü, tur)
├── api.ts                  274 satır — TEK API istemcisi + tüm TypeScript arayüzleri
├── globals.css             921 satır — Material 3 token'ları + .bk-* okuyucu stilleri
│
├── context/
│   ├── AuthContext.tsx     Oturum: user, loading, login, register, logout
│   └── ThemeContext.tsx    light/dark, localStorage["linguist_theme"]
├── hooks/
│   └── useActivityTracker.ts   30 sn heartbeat
├── components/
│   └── FeedbackWidget.tsx  Sağ alt köşe geri bildirim balonu
│
├── page.tsx                / — Panel (dashboard)
├── login/page.tsx          /login
├── register/page.tsx       /register — 5 satır, login sayfasını yeniden kullanır
├── books/page.tsx          /books — kitaplık + filtreler
├── books/[id]/page.tsx     /books/5 — OKUYUCU (en karmaşık sayfa, 449 satır)
├── books/[id]/quiz/page.tsx
├── words/page.tsx          /words — kelime listesi + flashcard + kalıcı çalışma seansı
├── ocr/page.tsx            /ocr — Tesseract.js ile metin tarama
└── groups/page.tsx         /groups — grup oluştur/katıl/yönet
```

---

## 2. `api.ts` — tek API istemcisi

Tüm HTTP çağrıları buradan geçer. Hiçbir sayfa doğrudan `fetch` **kullanmaz** ✅.

```ts
const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001') + '/api';

async function apiRequest<T>(endpoint, method = 'GET', body?): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const response = await fetch(`${API_BASE_URL}${endpoint}`, { method, headers, body: … });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
  }
  return response.json();
}
```

**Davranış notları**
- Backend'in `{ error: "…" }` gövdesi otomatik olarak `Error.message`'a dönüşür ✅
- `credentials` belirtilmemiş → tarayıcı varsayılanı `same-origin` → **cookie gönderilmez**,
  yalnızca `Authorization` başlığı kullanılır
- 401 için **global yakalayıcı yok** — token süresi dolduğunda her sayfa kendi hatasını
  gösterir, otomatik `/login` yönlendirmesi yalnızca `AuthContext` ilk yüklemede olur
- Yeni bir uç eklerken: (1) arayüz tipi, (2) `api` nesnesine metot — ikisi de burada

**Dışa aktarılan tipler:** `User`, `Book`, `Chapter`, `ReadingProgress`, `Group`,
`GroupMember`, `GroupDetails`, `WordItem`, `Quiz`, `QuizQuestion`, `OcrRecord`

---

## 3. Context'ler

### `AuthContext`

```
Sağladığı: { user, loading, login, register, logout }
```

- Mount olunca `localStorage["token"]` okur → varsa `api.me()` ile doğrular
- Token yoksa ve sayfa `/login`/`/register` değilse → `router.push('/login')`
- `api.me()` başarısızsa token silinir ve `/login`'e atılır
- `login`/`register` başarılıysa token yazılır ve `/` sayfasına gidilir
- `logout` → `api.logout()` (hatası yutulur) → token silinir → `/login`

> ⚠️ `useEffect` bağımlılıkları `[pathname, router]` — **her sayfa geçişinde `api.me()`
> yeniden çağrılır.** Gereksiz istek trafiği; kullanıcı zaten yüklenmişse atlanmalı.

### `ThemeContext`

`light` / `dark`, `localStorage["linguist_theme"]`'e yazılır, `<html>` sınıfı değiştirilir.

> ⚠️ Tema **`useEffect` içinde** uygulanıyor, yani ilk render hep `light` ile yapılıyor.
> Koyu tema kullanıcıları sayfa açılışında **beyaz bir flaş** (FOUC) görür.
> Çözüm: `<head>` içine bloklayan inline script koymak.

---

## 4. `layout-wrapper.tsx` — uygulama kabuğu

Tek dosyada dört ayrı düzen:

| Kırılım | Bileşen |
|---|---|
| Masaüstü (`md:`) | 280px koyu lacivert (`#1E293B`) sabit sidebar + üst app bar |
| Mobil | 64px yüksekliğinde koyu üst bar + hamburger ile açılan yan panel |
| Auth sayfaları | Kabuk **hiç render edilmez** (`isAuthPage \|\| !user`) |
| Yükleniyor | Tam ekran spinner |

**Navigasyon öğeleri:** Panel `/`, Kitaplık `/books`, Kelime Listem `/words`,
Metin Tara (OCR) `/ocr`, Sınıf / Gruplar `/groups`

**Hoş geldin turu:** `localStorage["welcome_tour_seen"]` yoksa modal açılır; kapatılınca
`FeedbackWidget`'a "buradan geri bildirim gönderebilirsin" tooltip'i tetiklenir (commit `d30099d`).

### ⚠️ Dekoratif ama işlevsiz öğeler

Üst app bar'da şu öğeler **hiçbir şeye bağlı değil** — sadece görsel:

- "Ana Sayfa / Seriler / Günlük Hedefler" sekmeleri (tıklanınca hiçbir şey olmaz)
- 🔥 Seri, 🏆 Rütbe, 🎯 Hedef ikonları
- "Yükselt" düğmesi
- Sidebar'daki *"Seçkin Rütbe • Seviye 4"* metni — **sabit yazılmış**, kullanıcı verisi değil

Bunlar bir gamification planının görsel taslağıdır; backend'de karşılığı yoktur.

---

## 5. Sayfalar

### `/` — Panel (`page.tsx`, 299 satır)

`api.getDashboardStats()` çağırır. Gösterdiği:
- "Kaldığın yerden devam et" kartı → `/books/{id}?chapter={n}`
- Kelime sayısı, quiz sayısı sayaçları
- Kitaplık / Kelime Listem / OCR kısayolları

> `recentProgress` boşsa (hiç kitap açılmamışsa) davranışı kontrol edilmeli.

### `/books` — Kitaplık (305 satır)

**Filtreleme tamamen istemci tarafında** (`useMemo`), backend'e filtre parametresi gitmez:

```ts
matchesSearch   → title | author | description içinde arama (case-insensitive)
matchesCategory → 'story' seçilirse category boş olanlar da dahil edilir (geriye dönük uyumluluk)
matchesLevel    → tam eşleşme
```

**CEFR seviyeleri** (`LEVELS` sabiti) — 12 seçenek, renk kodlu:
`A1`, `A1-A2`, `A2` (emerald) · `A2-B1`, `B1` (sky) · `B1-B2`, `B2` (indigo) ·
`B2-C1`, `C1` (purple) · `C1-C2`, `C2` (rose)

**Kategoriler:** Tümü, Hikayeler (`story`), Makaleler (`article`), Diğer (`other`)

> ⚠️ Bu listeler backend'de **hiçbir yerde tanımlı değil**. Yönetici paneli farklı bir
> seviye listesi kullanırsa (veya biri elle `Level: "B3"` yazarsa) kitap hiçbir filtrede
> görünmez. Tek kaynak haline getirilmeli.
>
> ⚠️ Tüm kitaplar **tek istekte** çekilip bellekte filtreleniyor. Kitap sayısı büyüdüğünde
> sunucu taraflı sayfalama gerekecek.

Mobilde arama kutusu ve kategori "pill"leri yan yana, yatay kaydırmalı (commit `c2a7639`).

### `/books/[id]` — Okuyucu ⭐

> **KURAL-06 — çevrilemeyen satır uyarısı (2026-08-25).**
> Backend her cümlede `ceviriBasarili` bayrağı gönderiyor. `false` ise
> `translation` alanı gerçek bir çeviri DEĞİL, özgün İngilizce metnin kendisidir.
> Okuyucu bu durumda:
> 1. sayfa başına **"N satır çevrilemedi"** şeridi + **Yeniden dene** butonu koyar
>    (buton `handleReanalyze` → `readPage(..., reanalyze=true)` çağırır),
> 2. o satırın çeviri kutusunda yanıltıcı metin yerine uyarı gösterir.
>
> ⚠️ **Bayrak yoksa `true` varsayılır.** KURAL-06 öncesi yazılmış
> `BookPage.SentencesJson` kayıtları bu alanı taşımıyor; eksikliği "başarısız"
> saymak veritabanındaki tüm eski sayfaları hatalı işaretlerdi.
>
> Başarısız çeviri `SentencesJson`'a **kalıcı** yazıldığı için kurtulmanın tek
> yolu yeniden analizdir — buton bu yüzden zorunlu, dekoratif değil.


Uygulamanın kalbi. Akışı:

```
1. api.readPage(bookId, page) çağrılır
2. hasPages === true  → sentencesJson JSON.parse edilir
   hasPages === false → api.readChapter() + api.analyzeText() (her açılışta yeniden analiz)
3. normalizeSentences() ile veri temizlenir
4. Her cümle bir blok olarak basılır
```

**`normalizeSentences()` ne yapar** — backend verisine güvenmeyen savunmacı bir katman:

| Sorun | Çözüm |
|---|---|
| PascalCase / camelCase karışıklığı | `s.original \|\| s.Original` ile ikisi de okunur |
| Başlık ve paragraf aynı satırda birleşmiş | `CHAPTER…` regex'iyle ikiye bölünür (backend'dekiyle **aynı regex**) |
| `words` dizisi boş | Cümle boşluktan bölünüp kelime dizisi üretilir |
| `CHAPTER` ile başlayan cümle | `isHeading: true`, `alignment: center` yapılır |

**Etkileşimler**

| Eylem | Sonuç |
|---|---|
| Cümleye tıkla | Altında Türkçe çeviri açılır (`openTr` state) |
| Kelimeye tıkla | `api.translateWord(w, cümle, false)` → sağ alt kelime paneli |
| **Metin seç** (fare veya uzun basış) | Çok kelimeli "kalıp" olarak çevrilir |
| 🔊 düğmesi | Web Speech API (`SpeechSynthesisUtterance`, `lang = 'en-US'`) |
| "Kelimelerime Ekle" | `api.addWord()` |
| ⛶ Tam ekran | `body.reader-fullscreen-active` sınıfı → sidebar/header CSS ile gizlenir |

**Metin seçimi iki ayrı mekanizmayla dinleniyor:**
1. `onMouseUp` / `onTouchEnd` → `handleSelection()`, 150ms gecikme
2. `document.addEventListener('selectionchange')` → 500ms debounce (mobilde parmakla
   kelime kelime sürüklerken çalışsın diye)

> ⚠️ İkisi birlikte, tek seçimde **iki API çağrısı** tetikleyebilir. Ayrıca
> `selectionchange` dinleyicisi `document` seviyesinde ve component unmount olana kadar
> aktif kalıyor.

**Tam ekran modu** (commit `d2cfc0f`): `.reader-fullscreen-active` sınıfı `aside`, `header`
ve `[data-mobile-header="true"]` öğelerini gizler. Mobilde tam ekran düğmesinin üst barla
çakışması bu commit'te düzeltildi.

> ⚠️ `handleReanalyze()` fonksiyonu hâlâ tanımlı ama **onu çağıran düğme kaldırıldı**
> (commit `2d9cc0c`). Ölü kod. `loadingAI` state'i de tanımlı ama kullanılmıyor.

### `/books/[id]/quiz` (258 satır)

`?chapterId=N` sorgu parametresiyle açılır. `api.getQuiz(chapterId)` → şıklar seçilir →
`api.submitQuiz()` → doğru/yanlış detaylı sonuç ekranı.

> Sayfa modundaki kitaplarda quiz düğmesi hiç görünmez (`!hasPages && chapter` koşulu).

### `/words` — Kelime Listem (680 satır)

Üç mod:

1. **Hızlı ekleme:** kelime yaz → `api.translateWord()` ile otomatik çeviri gelir → düzenleyip kaydet
2. **Kart listesi:** her kelime bir flashcard; tıklayınca çevrilir (`flippedCards: Set<number>`)
3. **Çalışma modu:** seans boyu seçilir (10/20/30/50), kartlar tek tek gösterilir,
   "Biliyorum / Bilmiyorum" **sunucuya kaydedilir**

**Flip kilidi:** `flipLockRef` ile 600ms boyunca ikinci tıklama engellenir
(commit `0a684d8` — sonsuz dönme döngüsü hatası). 3D dönme animasyonu commit `ecca859`
ile kaldırıldı, artık anlık geçiş var.

Satır içi düzenleme (`editingId`) ile kelime/çeviri/bağlam güncellenebilir.

> ✅ **Çözüldü:** Çalışma sonuçları artık kalıcı. Eskiden "Biliyorum/Bilmiyorum"
> yalnızca bir React sayacıydı ve sayfa kapanınca kayboluyordu; 200 kelimelik bir
> listede kullanıcı hangi kelimeyi çalıştığını hiç bilemiyordu.

**Çalışma akışı**

| Adım | Çağrı |
|---|---|
| Sayfa açılışı | `api.getWords()` + `api.getKelimeOzeti()` (paralel) |
| "Pratik Yap" | `api.getCalismaSeansi(seansBoyu)` — karıştırma **sunucuda** |
| Her karttan sonra | `api.kaydetCalismaSonucu(id, bildim)` — **arka planda** |
| Seans sonu | `api.getKelimeOzeti()` ile sayaçlar tazelenir |

**Seans boyu seçici:** kullanıcı 200 kelimeyi tek oturumda bitiremiyordu.
Artık kaçarlık çalışacağını seçiyor; sunucu **önce hiç çalışılmamışları** veriyor,
böylece her seans farklı kartlar geliyor ama liste bitmeden hiçbiri tekrar etmiyor.

**Kart ilerlemesi arayüzü beklemez.** `handleStudyAction` önce kartı ilerletir,
kaydı sonra gönderir — ağ yavaşsa her kartta donmuş bir ekran görünmemeli.
Tek bir kaydın düşmesi seansı kesmez; o kelime bir sonraki seansta yine
"hiç çalışılmamış" bandında gelir.

**Üst bantta üç kalıcı sayaç:** Toplam · Bildiğim (öğrenildi) · Kalan (hiç çıkmamış).
"Öğrenildi" eşiği `ozet.ogrenildiEsigi` ile **sunucudan** okunur — istemcide
kopyalanmaz, yoksa iki sayı ayrışır.

### `/ocr` — Metin Tara (406 satır)

```
Dosya seç → Tesseract.recognize(file, 'eng', { logger: p => setOcrProgress(...) })
   → çıkan metin gösterilir ve düzenlenebilir
   → api.saveOcrRecord(text)   (OcrRecords tablosuna)
   → api.analyzeText(text)     (okuyucu deneyimi)
   → kelimeye tıkla → aynı kelime paneli → kelime listesine ekle
```

**Görsel sunucuya hiç gitmez.** Tesseract'ın worker'ı, WASM çekirdeği ve `eng` dil verisi
**kendi origin'imizden** servis edilir (KURAL-11): `public/tesseract/` altına derleme öncesi
`scripts/tesseract-varliklari-kopyala.mjs` ile kopyalanırlar (~22 MB, `.gitignore`'da).
Eskiden üçü de `cdn.jsdelivr.net`'ten geliyordu ve ilk ikisi `importScripts` ile
ÇALIŞTIRILIYORDU — kodda tek bir URL görünmeden oluşan bir tedarik zinciri riskiydi.

> ⚠️ `Tesseract.recognize` çağrısındaki `workerPath` / `corePath` / `langPath` silinirse
> kütüphane sessizce CDN varsayılanlarına döner. `scripts/guard/11-tarayici.sh` bunu
> kapıda tutuyor. Kopyalanan çekirdek dosyaları **LSTM varyantlarıdır**; OCR'da
> `legacyCore`/`legacyLang` açılırsa kopyalama betiği de güncellenmelidir.

> ⚠️ Yalnızca İngilizce (`'eng'`) modeli yükleniyor. Türkçe metin taranırsa sonuç bozuk olur.
> ⚠️ Geçmiş kayıtlar listeleniyor ama **silinemiyor** (backend'de DELETE ucu yok).

### `/groups` (498 satır)

Üç bölüm: grup oluştur, davet koduyla katıl, yönettiğin grupların detayı
(üyeler, atanmış kitaplar, üye ilerlemeleri, quiz sonuçları).

> ⚠️ Gruptan ayrılma, üye çıkarma, grup silme, atama kaldırma **yok** (backend'de de yok).

### `/login` ve `/register`

`register/page.tsx` yalnızca 5 satır — `login/page.tsx`'i `mode="register"` benzeri bir
şekilde yeniden kullanır. Formlar `AuthContext.login/register` çağırır.

---

## 6. Tasarım sistemi (`globals.css`)

### Renk token'ları — Material Design 3

Tailwind v4 `@theme` bloğuyla CSS değişkenleri Tailwind sınıflarına bağlanır:

```css
@theme {
  --color-primary: var(--primary);
  --color-surface-container-high: var(--surface-container-high);
  /* … ~30 rol */
}
:root, .light { --primary: …; --surface: …; }
.dark          { --primary: …; --surface: …; }
```

Kullanılabilir roller: `primary`, `secondary`, `tertiary`, `error` (+ `on-*` ve `*-container`
varyantları), `background`, `surface`, `surface-dim/bright/variant`,
`surface-container-lowest/low/…/highest`, `outline`, `outline-variant`, `inverse-*`.

Kullanımı: `bg-surface-container-high text-on-surface border-outline-variant`

### Yardımcı sınıflar

| Sınıf | Ne yapar |
|---|---|
| `.glass-panel`, `.glass-card` | Bulanık cam efekti (backdrop-filter) |
| `.glass-input`, `.glass-input:focus` | Form alanı |
| `.bouncy-btn` | Hover'da hafif büyüme, tıklamada küçülme |
| `.geometric-bg` | Arka plan deseni (sabit konumlu, `pointer-events: none`) |

### Okuyucu stilleri — `.bk-*` ailesi

`globals.css`'in ~600 satırı okuyucuya ait:

```
.bk-wrap / .bk-wrap--fullscreen   dış kapsayıcı
.bk-header .bk-back .bk-title .bk-loc .bk-quiz .bk-fullscreen-toggle
.bk-page                          sayfa kartı
.bk-sentences .bk-sent-block .bk-sent-en .bk-sent-words .bk-sent-tr
.bk-sent-block--heading .bk-sent-en--heading    başlık varyantları
.bk-word + .word-{isim,fiil,sifat,zarf,edat,baglac,zamir,default}
.bk-speak .bk-tr-flag .bk-tr-text
.bk-ceviri-uyari .bk-ceviri-uyari__{ikon,metin,btn}   KURAL-06 çevrilemedi şeridi
.bk-sent-tr--hata .bk-tr-flag--hata .bk-tr-text--hata  çevrilemeyen satır (amber)
.bk-pagination .bk-nav .bk-pageno
.bk-word-panel .bk-wp-{top,type,word,tr,x,ctx,add}
.reader-fullscreen-active         body'ye eklenir, kabuk öğelerini gizler
```

Kırılım noktaları: 480px, 600px, 640px, 768px.

> 🔴 **`.word-isim`, `.word-fiil` gibi tür renkleri şu an hiç görünmüyor.** Backend
> `SentencesJson` üretirken her kelimeye `type: "default"` yazıyor
> ([04-BACKEND.md § 5.6](04-BACKEND.md)), dolayısıyla tüm kelimeler `.word-default`
> sınıfını alıyor. Renkli sözcük türü özelliği CSS'te ve frontend'de hazır ama
> **backend beslemiyor.** Küçük bir düzeltmeyle (analiz sırasında `GuessType()` çağırmak)
> aktif hale gelir.

---

## 7. Bilinen frontend sorunları — özet

| # | Sorun | Dosya |
|---|---|---|
| 1 | Her sayfa geçişinde `api.me()` çağrılıyor | `context/AuthContext.tsx` |
| 2 | Tema `useEffect`'te uygulandığı için koyu temada açılışta beyaz flaş | `context/ThemeContext.tsx` |
| 3 | Metin seçimi iki ayrı dinleyiciyle yakalanıyor → mükerrer istek | `books/[id]/page.tsx` |
| 4 | ~~`handleReanalyze` ölü kod~~ → **KURAL-06 (2026-08-25) ile bağlandı**: çevrilemeyen satır uyarısındaki "Yeniden dene" butonu onu çağırıyor. `loadingAI` hâlâ ölü kod | `books/[id]/page.tsx` |
| 5 | Sözcük türü renkleri devre dışı (backend hep `"default"` gönderiyor) | `globals.css` + backend |
| 6 | Başlık ayrıştırma regex'i backend'de 2, frontend'de 1 kez tekrarlanıyor | 3 dosya |
| 7 | 401 için global yakalayıcı yok — token dolunca sayfalar kırık hata gösterir | `api.ts` |
| 8 | Kitaplık sunucu taraflı filtreleme/sayfalama yapmıyor | `books/page.tsx` |
| 9 | Gamification öğeleri (seri, rütbe, hedef, Yükselt) işlevsiz | `layout-wrapper.tsx` |
| ~~10~~ | ~~Çalışma modu istatistikleri kalıcı değil~~ ✅ kapandı — `DogruSeri`/`SonCalismaAt` veritabanında | `words/page.tsx` |
| 11 | `any` tipi birçok yerde (`selWord`, hata nesneleri) | çeşitli |
| 12 | Token hâlâ `localStorage`'da. KURAL-11 nonce'lu CSP ile riski azalttı; cookie'ye tam geçiş açık teknik borç | `api.ts`, `context/AuthContext.tsx` |
