# 06 — Yönetici Paneli (`admin-panel/`)

**Next.js 14.2.35 (App Router)** · **React 18** · **Tailwind CSS v3** · Port **3001**
`output: 'standalone'`

> ⚠️ `next.config.mjs` içinde **hem** `eslint.ignoreDuringBuilds: true` **hem**
> `typescript.ignoreBuildErrors: true` açık. Tip hataları ve lint uyarıları build'i
> durdurmaz — yani bozuk kod üretime çıkabilir. Bkz. [08-GELISTIRME-REHBERI.md](08-GELISTIRME-REHBERI.md).

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
1. useEffect → pdf.js CDN'den <script> ile yüklenir
      https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = …/pdf.worker.min.js

2. Kullanıcı PDF seçer
      FileReader → ArrayBuffer → pdfjsLib.getDocument() → pdfDoc

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

> ⚠️ **Üç sorun:**
> 1. pdf.js **CDN'den, SRI (`integrity`) olmadan** yükleniyor. CDN ele geçirilirse
>    yönetici oturumunda keyfi JavaScript çalışır. `npm i pdfjs-dist` ile pakete alınmalı.
> 2. Script yüklenmeden PDF seçilirse `window.pdfjsLib` tanımsızdır.
> 3. Çok sayfalı PDF'lerde **her sayfa aynı anda** canvas'a render ediliyor — 300 sayfalık
>    bir PDF tarayıcıyı kilitleyebilir. Sanallaştırma (virtualization) yok.

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
| 3 | `ignoreBuildErrors` / `ignoreDuringBuilds` kapat | Tip hataları prod'a sızıyor |
| 4 | pdf.js'i npm paketine al + lazy import | CDN + SRI yok = tedarik zinciri riski |
| 5 | `<a href>` → `<Link>` | Tam sayfa yenilemesi |
| 6 | 401/403 için ortak yakalayıcı | Token dolunca sayfa sessizce boş kalıyor |
| 7 | Kitap listesine `pageCount` ekle (backend + panel) | Sayfa modundaki kitaplar boş görünüyor |
| 8 | Seviye/kategori listesini tek kaynağa taşı | frontend ile senkron değil |
| 9 | Kullanıcı silme düğmesi ekle | Backend ucu var, arayüz yok |
| 10 | React 18 → 19, Next 14 → 16 | İki uygulama arasındaki sürüm uçurumunu kapat |
