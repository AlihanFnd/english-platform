# 06 — Yönetici Paneli (`admin-panel/`)

**Next.js 16.3.2 (App Router)** · **React 19.2.4** · **Tailwind CSS v4** · Port **3001**

> ✅ Derleme kapıları **AÇIK**. `eslint.ignoreDuringBuilds` ve `typescript.ignoreBuildErrors`
> kaldırıldı; `next build` artık tip hatasında kırılır. KURAL-11'de pdf.js paketten
> alınınca ortaya iki gerçek tip hatası çıktı (ikisi de düzeltildi) — kapının yıllardır
> ne sakladığının somut örneği.
>
> 🔒 **KURAL-11:** Sayfalar dinamik render ediliyor; `proxy.ts` istek başına nonce'lu CSP
> yazıyor ve `app/layout.tsx` içindeki `await headers()` bunun ön koşulu (statik ön-render
> nonce taşıyamaz).

---

## 1. Frontend'den farkları

| | `frontend/` | `admin-panel/` |
|---|---|---|
| Next.js | 16.2.10 | 14.2.35 |
| React | 19 | 18 |
| Tailwind | v4 (`@theme`) | v3 (`tailwind.config.ts`) |
| API katmanı | `api.ts` — tek merkez | **Yok** — her sayfa elle `fetch` |
| Oturum | `AuthContext` | `useAdminAuth()` hook'u, yalnızca `dashboard/page.tsx`'te tanımlı |
| Token anahtarı | `localStorage["token"]` | `localStorage["admin_token"]` |
| Tema | light/dark | Yalnızca koyu (`bg-gray-950`) |
| İkonlar | `lucide-react` | Emoji (`📊 📚 👥 💬 🛡️`) |

> İki uygulamanın `localStorage` anahtarları farklı olduğu için **aynı tarayıcıda ikisine
> ayrı ayrı giriş yapılabilir** ✅ — bilinçli bir izolasyon.

---

## 2. Sayfalar

### `/` — Yönetici girişi (`app/page.tsx`, 99 satır)

```
POST /api/auth/login  (frontend ile AYNI uç)
  → data.user.role !== "admin"  →  "Bu panele sadece yoneticiler erisebilir."
  → localStorage["admin_token"] = data.token
  → localStorage["admin_user"]  = JSON.stringify(data.user)
  → router.push("/dashboard")
```

> ⚠️ Rol kontrolü **istemcide** yapılıyor. Bu bir güvenlik sınırı değildir — asıl koruma
> backend'deki `[Authorize(Roles = "admin")]`'dir ✅. Ama admin olmayan bir kullanıcının
> token'ı yine de `localStorage`'a yazılır (`return`'den önce `setError` çağrılıyor, token
> yazılmıyor — doğru sırada). Panele girse bile her API çağrısı 403 döner.

### `/dashboard` (191 satır)

İki uç çağırır:

| Uç | Ne gösterir |
|---|---|
| `GET /api/admin/stats` | Toplam kullanıcı / kitap / grup / quiz sayısı, son 5 kullanıcı |
| `GET /api/activity/stats` | **Canlı aktivite akışı** — kim, ne yapıyor, ne kadar süredir |

> 🔴 `/api/activity/stats` ucunda **admin kontrolü yok**. Panel bunu doğru kullanıyor ama
> uç herkese açık. Bkz. [07-GUVENLIK.md](07-GUVENLIK.md) #1.

`useAdminAuth()` hook'u token yoksa `/`'a yönlendirir. Bu hook **yalnızca bu dosyada
tanımlı**; diğer sayfalar aynı mantığı kopyala-yapıştır ile tekrarlıyor.

### `/books` — Kitap yönetimi (619 satır, en büyük dosya) ⭐

#### PDF sayfa seçici — panelin en dikkat çekici parçası

```
1. Kullanıcı PDF seçer → pdfKitapligiYukle()
      await import("pdfjs-dist")            (npm paketi, sürüm 6.3.289)
      GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs"   (kendi origin'imiz)

2. file.arrayBuffer() → getDocument({ data, wasmUrl: "/pdfjs/wasm/" }) → pdfDoc

3. Her sayfa için <PdfThumbnail> bileşeni
      page.getViewport({ scale: 0.35 }) → <canvas>'a render

4. Yönetici istediği sayfaları tıklayarak seçer → selectedPages: number[]

5. Gönderim:
      FormData { title, author, description, language, level, category,
                 file, selectedPages: "3,4,5,7" }
      → POST /api/admin/books/upload-pages
```

`PdfThumbnail` içinde `active` bayrağı ile temizlik yapılıyor — bileşen unmount olursa
render iptal ediliyor ✅.

> ✅ **KURAL-11 (2026-09-01) ile kapanan iki sorun:**
> 1. ~~pdf.js CDN'den, SRI olmadan~~ → npm paketinden. Üstelik çekilen sürüm (2.16.105)
>    **CVE-2024-4367'ye açıktı**: kötü niyetli bir PDF açmak panelde kod çalıştırmaya
>    yetiyordu. 6.3.289 yamalı sürümdür.
> 2. ~~Script yüklenmeden PDF seçilirse `window.pdfjsLib` tanımsız~~ → artık `await import`
>    ediliyor; "1 saniye bekle ve umut et" kurgusu kalktı.
>
> ⚠️ **Duran sorun:** Çok sayfalı PDF'lerde **her sayfa aynı anda** canvas'a render
> ediliyor — 300 sayfalık bir PDF tarayıcıyı kilitleyebilir. Sanallaştırma yok.
> (Sunucu tarafındaki sayfa sınırı KURAL-10'da kondu; bu, tarayıcı tarafıdır.)
>
> ℹ️ Worker ve WASM çözücüler `public/pdfjs/` altına derleme öncesi kopyalanır
> (`scripts/pdfjs-worker-kopyala.mjs`, `.gitignore`'da). Elle kopyalanmazlar ki paket
> güncellenince eski bir sürüm sessizce kalmasın.

#### Diğer işlevler

| İşlev | Uç |
|---|---|
| Kitap listesi | `GET /api/admin/books` |
| Kitap düzenleme (modal) | `PUT /api/admin/books/{id}` |
| Kitap silme | `DELETE /api/admin/books/{id}` — `confirm()` ile onay |
| Yükleme | `POST /api/admin/books/upload-pages` |

Form alanları: Başlık*, Yazar, Açıklama, Dil, **Seviye**, **Kategori**.
Seviye/kategori seçenekleri commit `300e294` ile eklendi.

> ⚠️ Seviye ve kategori listeleri burada **elle yazılmış** ve `frontend/app/books/page.tsx`
> içindeki `LEVELS`/`CATEGORIES` sabitleriyle senkron tutulmuyor. İki listeden biri
> değişirse kitaplar filtrelerde kaybolur. Ortak bir kaynağa taşınmalı (tercihen backend'den
> `GET /api/books/taxonomy` gibi bir uçla).
>
> ⚠️ `GET /api/admin/books` yanıtında `pageCount` yok — sayfa modunda yüklenen kitaplar
> listede `chapterCount: 0` görünür, yönetici "boş kitap" sanabilir.

#### Eski `POST /api/admin/books/upload` (bölüm modu)

Backend'de duruyor ama **panelde ona giden bir form yok**. Yalnızca API üzerinden
çağrılabilir. Bölüm modu fiilen terk edilmiş durumda (yalnızca seed kitapları öyle).

### `/users` — Kullanıcı yönetimi (157 satır)

| İşlev | Uç |
|---|---|
| Liste | `GET /api/admin/users` — okuma/kelime/quiz sayaçlarıyla |
| Rol değiştirme | `PUT /api/admin/users/{id}/role` |

Silme (`DELETE /api/admin/users/{id}`) backend'de var ama **panelde düğmesi yok**.

> ✅ Rol değiştiğinde kullanıcının mevcut tokenları **anında iptal edilir**
> (`ITokenIptalDeposu.KullaniciTumTokenlariniIptalEt`, KURAL-04).

### `/feedbacks` — Geri bildirimler (112 satır)

`GET /api/feedback/list` (AdminOnly). Salt okunur — yanıtlama, okundu işaretleme,
silme yok.

---

## 3. `AdminLayout` bileşeni (100 satır)

Tek paylaşılan bileşen. Sağladığı:
- 256px sabit sidebar (masaüstü) / hamburger ile açılan panel (mobil)
- Menü: Dashboard, Kitap Yönetimi, Kullanıcı Yönetimi, Geri Bildirimler
- "Oturumu Kapat" → `localStorage.clear(); router.replace("/")`

> ⚠️ Çıkışta `POST /api/auth/logout` **çağrılmıyor** — token sunucuda iptal edilmiyor,
> sadece tarayıcıdan siliniyor. (Zaten iptal mekanizması da bozuk, bkz.
> [07-GUVENLIK.md](07-GUVENLIK.md) #5.)
>
> ⚠️ `localStorage.clear()` **tüm** localStorage'ı siler — aynı origin'de başka veri
> varsa o da gider.
>
> ⚠️ Menü bağlantıları `<a href>` kullanıyor, `<Link>` değil → her tıklamada **tam sayfa
> yenilemesi**. Next.js istemci taraflı yönlendirmesi devre dışı.

---

## 4. İyileştirme listesi

| # | Öneri | Neden |
|---|---|---|
| 1 | Ortak `lib/api.ts` oluştur | 4 sayfada `fetch` + token okuma kopyalanıyor |
| 2 | `useAdminAuth()`'u `hooks/` altına taşı | Şu an sadece dashboard'da tanımlı |
| 3 | ~~`ignoreBuildErrors` / `ignoreDuringBuilds` kapat~~ | ✅ KURAL-11 |
| 4 | ~~pdf.js'i npm paketine al + lazy import~~ | ✅ KURAL-11 |
| 5 | `<a href>` → `<Link>` | Tam sayfa yenilemesi |
| 6 | 401/403 için ortak yakalayıcı | Token dolunca sayfa sessizce boş kalıyor |
| 7 | Kitap listesine `pageCount` ekle (backend + panel) | Sayfa modundaki kitaplar boş görünüyor |
| 8 | Seviye/kategori listesini tek kaynağa taşı | frontend ile senkron değil |
| 9 | Kullanıcı silme düğmesi ekle | Backend ucu var, arayüz yok |
| 10 | ~~React 18 → 19, Next 14 → 16~~ | ✅ Yapılmış (16.3.2 / 19.2.4) |
