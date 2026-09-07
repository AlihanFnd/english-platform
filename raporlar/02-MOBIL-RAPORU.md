# 02 — Mobil İstemci Raporu

> **Ölçüm tarihi:** 2026-09-07 · **Commit:** `6c8f22a`
> **6.727 satır · 22 dosya** — kod tabanının en büyük tek istemcisi
> (backend 8.026, frontend 5.107, admin-panel 1.400).

---

## İçindekiler

1. [Ne olduğu ve ne olmadığı](#1-ne-olduğu-ve-ne-olmadığı)
2. [Dosya envanteri](#2-dosya-envanteri)
3. [Yığın ve sürümler](#3-yığın-ve-sürümler)
4. [Uygulama iskeleti ve gezinme](#4-uygulama-i̇skeleti-ve-gezinme)
5. [`lib/api.ts` — sunucu sözleşmesi](#5-libapits--sunucu-sözleşmesi)
6. [Kimlik ve oturum](#6-kimlik-ve-oturum)
7. [Tema sistemi](#7-tema-sistemi)
8. [Bileşen kütüphanesi](#8-bileşen-kütüphanesi)
9. [Kancalar (hooks)](#9-kancalar-hooks)
10. [Ekran ekran](#10-ekran-ekran)
11. [Webden ayrıldığı yerler](#11-webden-ayrıldığı-yerler)
12. [Güvenlik durumu](#12-güvenlik-durumu)
13. [Çalıştırma ve dağıtım](#13-çalıştırma-ve-dağıtım)
14. [Bilinen eksikler](#14-bilinen-eksikler)

---

## 1. Ne olduğu ve ne olmadığı

**Expo Go üzerinde çalışan bir React Native istemcisi.** Web istemcisinin
mobil kopyası değil — aynı API'yi kullanan **ayrı bir ürün**: gezinme sekmeli,
tema sistemi Material 3'e yakın kendi paleti, telefona özgü davranışlar var
(arka plana atılınca nabız durur, cihaz TTS'i kullanılır).

**Ne DEĞİL:**
- Derlenmiş bir mağaza uygulaması değil — `newArchEnabled: true` ve
  `bundleIdentifier` tanımlı ama henüz EAS build/submit akışı yok.
- Web istemcisinin tüm özelliklerini taşımıyor: **`/gizlilik` ekranı yok**
  (KURAL-19 veri sahibi hakları yalnızca webde), yönetici işlevleri hiç yok.
- OCR'da **görüntü işleme yok** — kullanıcı metni yapıştırır (§10.5).

---

## 2. Dosya envanteri

```
mobile/
├── app.json                    Expo yapılandırması (şema: linguza)
├── package.json                Expo SDK 57 · RN 0.86.3 · React 19.2.3
└── src/
    ├── app/                    ── expo-router: dosya = rota ──
    │   ├── _layout.tsx    85   kök: yazı tipleri, sağlayıcılar, Stack
    │   ├── login.tsx     271   giriş + kayıt (tek ekran, mod değiştirir)
    │   ├── (tabs)/
    │   │   ├── _layout.tsx  85 sekme çubuğu (5 sekme, bulanık zemin)
    │   │   ├── index.tsx   399 panel
    │   │   ├── books.tsx   437 kitaplık + filtre
    │   │   ├── words.tsx  1063 ← EN BÜYÜK: kelime listesi + çalışma modu
    │   │   ├── ocr.tsx     616 metin tara + geçmiş
    │   │   └── groups.tsx  604 gruplar
    │   └── books/[id]/
    │       ├── index.tsx   439 okuma ekranı
    │       └── quiz.tsx    309 quiz
    ├── components/
    │   ├── ui.tsx         358  9 temel bileşen (tasarım sistemi)
    │   ├── CumleGorunumu  328  cümle + çeviri + kelime seçimi
    │   ├── UstBar         309  başlık çubuğu
    │   └── KelimePaneli   235  seçilen kelimenin alt paneli
    ├── context/
    │   ├── AuthContext    125  oturum + korumalı yönlendirme
    │   └── ThemeContext    70  açık/koyu/sistem
    ├── hooks/
    │   ├── useTelaffuz     76  cihaz TTS
    │   └── useEtkinlikTakibi 59 30 sn nabız
    ├── lib/
    │   ├── api.ts         517  sunucu sözleşmesi (tek HTTP kapısı)
    │   └── cumleler.ts    128  cümle normalleştirme
    └── theme/
        ├── palette.ts     149  açık/koyu palet (Material 3 rol adları)
        └── tokens.ts       65  boşluk, yarıçap, yazı tipi, ölçek
```

---

## 3. Yığın ve sürümler

| Katman | Seçim | Not |
|---|---|---|
| Çatı | Expo SDK **57** · React Native **0.86.3** | `newArchEnabled: true` |
| React | **19.2.3** | web istemcisi 19.2.4 — **küçük ayrışma** |
| Gezinme | `expo-router` 57 | dosya tabanlı, web'deki Next mantığına yakın |
| Depolama | `expo-secure-store` (jeton) + `AsyncStorage` (tema) | ayrım bilinçli (§6) |
| Animasyon | `react-native-reanimated` 4.5.1 + `worklets` | |
| İkon | `lucide-react-native` | web ile aynı ikon ailesi |
| Yazı tipi | `@expo-google-fonts` Inter + Plus Jakarta Sans | pakette gelir, CDN yok |
| TTS | `expo-speech` | iOS AVSpeechSynthesizer / Android TextToSpeech |
| TypeScript | **6.0.3** | web'de 5.9.3 — **ayrışma** |

> ⚠️ **Sürüm aralıkları sabitlenmemiş.** `mobile/package.json` hâlâ `~` ve `^`
> kullanıyor; web istemcilerinde KURAL-18 ile sabitlendi, mobil **kapsam
> dışında kaldı**. Guard 18'in `package.json sürüm aralığı` kontrolü yalnızca
> `frontend` ve `admin-panel`'e bakıyor.

---

## 4. Uygulama iskeleti ve gezinme

### Kök (`app/_layout.tsx`)

```
SplashScreen.preventAutoHideAsync()
  └─ useFonts(Inter ×4, PlusJakartaSans ×2)   ← yüklenene kadar splash açık
      └─ GestureHandlerRootView
          └─ SafeAreaProvider
              └─ ThemeProvider          ← tema, kimlikten ÖNCE
                  └─ AuthProvider
                      └─ Yonlendirme()  ← useKorumaliYonlendirme()
                          └─ Stack
```

`Stack` ekranları: `(tabs)` · `login` (fade) · `books/[id]/index` ·
`books/[id]/quiz`. Başlık gizli (`headerShown: false`) — her ekran kendi
`UstBar`'ını çiziyor.

### Sekmeler (`app/(tabs)/_layout.tsx`)

| Sekme | Rota | İkon |
|---|---|---|
| Panel | `index` | `LayoutDashboard` |
| Kitaplık | `books` | `BookOpen` |
| Kelimelerim | `words` | `BookMarked` |
| Metin Tara | `ocr` | (OCR ikonu) |
| Gruplar | `groups` | |

Sekme çubuğu **bulanık zeminli** (`tabBarBackground` → `expo-blur`), renkler
temadan geliyor.

### Korumalı yönlendirme

`AuthContext.useKorumaliYonlendirme()` — oturum yoksa `login`'e, varken
`login`'deyse sekmelere yönlendirir. Kökte tek yerde çağrılıyor; her ekranın
ayrı ayrı kontrol etmesi gerekmiyor.

---

## 5. `lib/api.ts` — sunucu sözleşmesi

**517 satır, tek HTTP kapısı.** Ekranlar `fetch` çağırmaz.

### Taban adres çözümü — mobilin en kritik 15 satırı

```
1. EXPO_PUBLIC_API_URL           ← üretim/dağıtım için açık ayar
2. Constants.expoConfig.hostUri  ← Expo geliştirme sunucusunun IP'si
   (eski Expo Go: expoGoConfig.debuggerHost)
3. http://localhost:5001         ← yalnızca öykünücü/simülatör
```

> **Neden 2. adım var:** telefon `localhost`'u kendi kendisi sanar. Geliştirici
> makinesinin LAN IP'sini Expo'nun kendi sunucu adresinden okumak, herkesin
> elle IP yazmasını gereksiz kılıyor. Bu satır olmadan mobil geliştirme
> "neden bağlanmıyor" turuna dönerdi.

### İstek katmanı (`istek<T>()`)

| Davranış | Ayrıntı |
|---|---|
| Zaman aşımı | **20 sn** — `AbortController` ile; RN'de `fetch` varsayılanı yok |
| Jeton | `Authorization: Bearer` — bellek içi kopyadan okunur |
| **401 → oturum düşür** | Jetonu siler, **dinleyicileri tetikler**, `ApiHatasi(401)` fırlatır |
| Hata biçimi | `{ error: "…" }` okunur — **web istemcisiyle birebir aynı sözleşme** |
| 204 | `undefined` döner |
| Ağ hatası | Cihaza/ağa özgü metin **kullanıcıya gösterilmez**; sade mesaj |

```ts
export class ApiHatasi extends Error { readonly durum: number }
```

**Oturum düşme yayını** (`oturumDustugundeDinle`) mobil için özel: bir arka plan
isteği 401 alırsa, kullanıcı hangi ekranda olursa olsun oturum kapanır ve
yönlendirme tetiklenir. Webde bu iş yönlendiriciye bırakılmış.

### Tip sözleşmesi

`User` · `Book` · `Chapter` · `ReadingProgress` · `Group` · `GroupMember` ·
`GroupDetails` · `WordItem` · `Quiz` · `CalismaKarti` · `KelimeOzeti` ·
`AnalizCumlesi` · `OcrKaydi` — web'deki `frontend/app/api.ts` ile **aynı
alanlar**. İkisi ayrışırsa sunucu değişikliği bir istemcide sessizce kırılır.

> Bu ayrışmayı yakalayan bir kapı **yok** (§14).

---

## 6. Kimlik ve oturum

### Jeton nerede duruyor

| | Mobil | Web |
|---|---|---|
| Depo | **`expo-secure-store`** (iOS Keychain / Android Keystore) | `localStorage` |
| XSS riski | yok (JS bağlamı yok) | **var — kabul edilmiş risk** |
| Bellek kopyası | var (§aşağıda) | — |

> **Mobil bu konuda webden daha güvenli.** Keychain/Keystore işletim sistemi
> korumasında; `localStorage` her XSS'te okunabilir.

**Bellek içi kopya bilinçli:** SecureStore her okumada Keychain'e gidiyor;
her istekte bunu yapmak listeleri gözle görülür biçimde yavaşlatıyordu.
Kopya `jetonYaz`/`jetonSil` ile senkron tutuluyor.

### `AuthContext`

```
kullanici · yukleniyor · girisYap() · kayitOl() · cikisYap()
useKimlik()               ← tüketici kanca
useKorumaliYonlendirme()  ← kökte bir kez çağrılır
```

`cikisYap()` sunucuya ulaşamasa bile **yerel oturumu kapatır** — aksi hâlde
ağı olmayan kullanıcı uygulamada kilitli kalırdı.

**KURAL-17 sonrası:** `kayitOl(kullaniciAdi, email, sifre)` — **rol parametresi
yok.** Kayıt ekranındaki "Öğrenci/Öğretmen" seçimi kaldırıldı; yerine
"öğretmen hesabı için yöneticiye başvur" notu kondu.

---

## 7. Tema sistemi

Üç dosya: `ThemeContext` (seçim) + `theme/palette.ts` (renkler) +
`theme/tokens.ts` (ölçüler).

### Seçim

```
sistem  ← useColorScheme() (varsayılan)
acik / koyu ← kullanıcı seçimi, AsyncStorage'da saklanır
```

Tema tercihi **AsyncStorage'da**, jeton **SecureStore'da**. Ayrım bilinçli:
tema bir sır değil, her okumada Keychain'e gitmesinin anlamı yok.

### Palet — Material 3 rol adları

```
primary · primaryContainer · surface · surfaceDim · surfaceBright
surfaceVariant · surfaceContainerLowest…Highest (5 kademe)
onSurface · onSurfaceVariant · outline · outlineVariant · error …
```

Rol tabanlı olmasının faydası: bileşenler `#1E293B` gibi sabit renk taşımıyor,
`palet.surfaceContainer` diyor. Koyu/açık geçişi tek dosyada.

### Jetonlar

```
Bosluk:   xs 4 · sm 8 · md 12 · lg 16 · xl 20 · xxl 28 · xxxl 40
Yaricap:  sm 10 · md 14 · lg 18 · xl 24 · tam 999
Olcek:    devasa 30 · buyuk 22 · baslik 18 · govde 14 · kucuk 12 · minik 10
YaziTipi: baslik → PlusJakartaSans_800ExtraBold · govde → Inter_400Regular
```

---

## 8. Bileşen kütüphanesi

`components/ui.tsx` — **9 bileşen**, uygulamanın tasarım sistemi:

| Bileşen | İş |
|---|---|
| `Metin` | tur (`devasa`/`baslik`/`govde`/`kucuk`/`minik`), kalın, ikincil, ortala |
| `Kart` | yüzey + gölge + dolgu; `vurgulu` varyantı |
| `Buton` | birincil/ikincil, `yukleniyor`, `tamGenislik`, `disabled` |
| `Rozet` | durum etiketi |
| `IlerlemeCubugu` | yüzde çubuğu |
| `Yukleniyor` | dönen gösterge + isteğe bağlı mesaj |
| `HataKutusu` | hata mesajı kutusu |
| `BosDurum` | "henüz veri yok" ekranı |
| `EkranZemini` | ekran arka planı (gradyan/renk) |

### Alan bileşenleri

**`CumleGorunumu`** (328) — okuma ekranının kalbi. Cümleleri İngilizce/Türkçe
gösterir, kelimeye dokunmayı yakalar, `yenidenDene` verilmişse "yeniden analiz"
butonunu çizer.
→ **KURAL-17:** bu prop artık sayfa modunda **yalnızca öğretmen/yöneticiye**
veriliyor; `undefined` geçilince buton hiç görünmüyor.

**`KelimePaneli`** (235) — seçilen kelimenin alt paneli: çeviri, tür, telaffuz,
"listeme ekle".

**`UstBar`** (309) — başlık + alt başlık; her ekran kendi çubuğunu çiziyor
(`headerShown: false` olduğu için).

---

## 9. Kancalar (hooks)

### `useEtkinlikTakibi` — 30 saniyelik nabız

Yönetici panelindeki "canlı akış" bunu okuyor. Web'deki `useActivityTracker`
ile **aynı tipleri ve aynı 30 sn nabzı** kullanır — iki istemcinin verisi aynı
grafikte anlamlı dursun diye.

Yol → etkinlik eşlemesi:

```
/            → PageView   "Ana Sayfa"
/words       → PageView   "Kelime Listesi"
/ocr         → PageView   "OCR Metin Okuma"
/groups      → PageView   "Gruplar"
/books       → PageView   "Kitaplık"
/login       → AuthView   "Giriş/Kayıt Sayfası"
/books/{id}/quiz → TakeQuiz "Kitap ID: {id} - Quiz Çözüyor"
/books/{id}      → ReadBook "Kitap ID: {id} - Kitap Okuyor"
```

> 🔵 **MOBİLE ÖZGÜ FARK:** uygulama arka plana atıldığında nabız **DURUR**
> (`AppState` dinleniyor). Telefonda "açık ama cepte" hâli çok yaygın;
> durdurulmasaydı kullanıcı kitabı kapattıktan sonra saatlerce
> "kitap okuyor" görünürdü. Webde sekme gizlenince böyle bir durdurma yok.

Bu kayıtlar `UserActivityLogs` tablosuna gidiyor — **90 gün** saklanıyor ve
aynı tablo Groq günlük kota sayacı olarak da kullanılıyor (bkz. 01 raporu §11).

### `useTelaffuz` — cihaz TTS

`expo-speech` sarmalayıcısı. `KELIME_HIZI = 0.85` (kelime tek tek okunurken
biraz yavaş). Yeni bir seslendirme öncesi `Speech.stop()` — üst üste binen
sesler engelleniyor. `konusulan` durumu ile arayüzde "şu an okunuyor" işareti.

Web'de aynı adlı kanca `useTelaffuz.ts` (108 satır) **Web Speech API**
kullanıyor — arayüz aynı, altyapı farklı.

---

## 10. Ekran ekran

### 10.1 `login.tsx` (271)

Tek ekran, `girisModu` bayrağıyla giriş/kayıt arasında geçiş.
**KURAL-17 sonrası rol seçimi kaldırıldı** — yerine bilgilendirme notu.

### 10.2 `(tabs)/index.tsx` — Panel (399)

`GET /dashboard/stats`: okunan kitap sayısı, kelime sayısı, quiz ortalaması,
son okunanlar, devam edilebilecek kitaplar.

### 10.3 `(tabs)/books.tsx` — Kitaplık (437)

Kitap listesi + seviye/kategori filtresi. Her kartta ilerleme yüzdesi.
`GET /books`, `GET /books/taxonomy`.

### 10.4 `(tabs)/words.tsx` — Kelimelerim (1063) ← **en büyük dosya**

İki mod:
- **Liste:** kelimeler, arama, düzenleme, silme
- **Çalışma:** aralıklı tekrar kartları (`GET /books/words/calisma`),
  bildim/bilmedim (`POST /books/words/calisma-sonucu`), özet
  (`GET /books/words/ozet`)

> 1063 satır tek dosyada — **bölünmeye en güçlü aday** (§14).

### 10.5 `(tabs)/ocr.tsx` — Metin Tara (616)

> 🔴 **Webden en çok ayrılan ekran.** Web'de Tesseract.js tarayıcıda görüntüyü
> OCR'lar. **Mobilde görüntü işleme YOK** — kullanıcı metni yapıştırır/yazar.
> `expo-image-picker` bağımlılıklarda var ama OCR akışında kullanılmıyor.

Akış: metin gir → `POST /translate/analyze` → cümle görünümü →
`POST /dashboard/ocr` ile geçmişe kaydet.
Geçmiş: `GET /dashboard/ocr`, silme `DELETE /dashboard/ocr/{id}`.

Geçmiş kaydı başarısız olsa bile **analiz sonucu gösterilir** — kullanıcının
işini bir yan kayıt hatası engellemesin.

### 10.6 `(tabs)/groups.tsx` — Gruplar (604)

Grup listesi, oluşturma, davet koduyla katılma, detay (üyeler, atanan kitaplar,
ilerlemeler, quiz sonuçları). Davet kodu **yalnızca sahibe** görünüyor.

### 10.7 `books/[id]/index.tsx` — Okuma (439)

**KURAL-17 sonrası akış:**
```
api.readPage(kitapId, sayfa)
  ├─ GET  /books/{id}/read          (salt okunur)
  ├─ POST /books/{id}/progress      (beklenmez)
  └─ analizBekliyor ise:
     POST /books/{id}/analyze-page  (yalnızca boşluğu doldurur)
```
"Yeniden dene" butonu sayfa modunda **yalnızca öğretmen/yöneticiye**:
```ts
yenidenDene={!sayfaliMi || yenidenAnalizEdebilir ? yenidenAnalizEt : undefined}
```
Ayrıca `?kelime=` derin bağlantısı: kelime listesinden bir kelimeye tıklayınca
kitapta o kelimenin geçtiği cümle açılıyor.

### 10.8 `books/[id]/quiz.tsx` (309)

`api.getQuiz(bolumId)` — **KURAL-17 sonrası** sarmalayıcı önce `GET`, 404
alırsa `POST` ile üretiyor. Ekran kodu bu değişikliği hiç görmedi.

---

## 11. Webden ayrıldığı yerler

| Konu | Web | Mobil | Değerlendirme |
|---|---|---|---|
| Jeton deposu | `localStorage` | **SecureStore** | mobil **daha güvenli** |
| OCR | Tesseract.js (görüntü) | metin girişi | **özellik eksiği** |
| Etkinlik nabzı | sürekli | arka planda **durur** | mobil **daha doğru** |
| TTS | Web Speech API | `expo-speech` | eşdeğer |
| Veri sahibi hakları | `/gizlilik` var | **YOK** | **KURAL-19 boşluğu** |
| Rol seçimi (kayıt) | kaldırıldı | kaldırıldı | eşit |
| Sürüm sabitleme | **sabit** | `~`/`^` serbest | **KURAL-18 boşluğu** |
| React | 19.2.4 | 19.2.3 | küçük ayrışma |
| TypeScript | 5.9.3 | 6.0.3 | ayrışma |

---

## 12. Güvenlik durumu

### İyi olan

- **Jeton SecureStore'da** — webdeki `localStorage`'dan iyi.
- **Tek HTTP kapısı** (`lib/api.ts`) — yetki/başlık mantığı dağılmıyor.
- **401'de oturum düşürme yayını** — çalınan/süresi dolan jeton her ekranda
  aynı anda geçersizleşiyor.
- **Zaman aşımı 20 sn** — RN'de `fetch` varsayılan zaman aşımı yok;
  olmasaydı istek sonsuza kadar asılı kalırdı.
- **Hata metni sadeleştiriliyor** — ağ/cihaz ayrıntısı kullanıcıya gösterilmiyor.
- **Yazı tipleri pakette** — CDN'den çekilmiyor.
- **Rol kayıtta seçilemiyor** (KURAL-17).
- **"Yeniden analiz" butonu role bağlı** — asıl kontrol backend'de.

### Açık olan

| Konu | Etki |
|---|---|
| **Sürüm aralıkları sabit değil** | `npm install` sürümü sessizce kaydırabilir; guard 18 mobili kapsamıyor |
| **`npm audit` mobilde koşmuyor** | Ne CI'da ne guard'da; zafiyet görünmez |
| **Veri sahibi hakları ekranı yok** | Mobil kullanıcı verisini indiremiyor / hesabını silemiyor |
| **Sertifika sabitleme yok** | MITM'e karşı ek katman yok (HTTPS var) |
| **Geliştirmede `http://` LAN adresi** | Beklenen; üretimde `EXPO_PUBLIC_API_URL` https olmalı |

---

## 13. Çalıştırma ve dağıtım

```bash
cd mobile && npx expo start        # Metro :8081, QR ile Expo Go
npx tsc --noEmit                   # tip denetimi
```

Backend'in **aynı LAN'da :5001'de** çalışıyor olması gerekir; adres otomatik
çözülür (§5).

Üretim için:
```bash
EXPO_PUBLIC_API_URL=https://api-adresin  # .env ya da EAS secret
```

> **EAS build/submit yapılandırması yok.** `app.json`'da `bundleIdentifier`
> (`app.linguza.mobile`) ve Android `package` tanımlı, `newArchEnabled: true`,
> ama `eas.json` yok — mağazaya çıkış için kurulması gerekiyor.

---

## 14. Bilinen eksikler

**Özellik**
- OCR'da görüntüden metin çıkarma yok (`expo-image-picker` kurulu ama kullanılmıyor)
- `/gizlilik` karşılığı yok — KURAL-19 hakları mobilde erişilemez
- Yönetici işlevleri hiç yok (bilinçli — ayrı panel var)

**Kod sağlığı**
- `words.tsx` **1063 satır** — liste ve çalışma modu ayrılmalı
- `ocr.tsx` 616, `groups.tsx` 604 — ikisi de bölünmeye aday
- Web ile tip sözleşmesinin ayrışmasını yakalayan **kapı yok**

**Süreç**
- `package.json` sürümleri sabitlenmemiş (KURAL-18 kapsamı dışında)
- CI mobili hiç derlemiyor/denetlemiyor — `npx tsc --noEmit` elle koşuluyor
- EAS yapılandırması yok

**Sürüm ayrışması**
- React 19.2.3 (web 19.2.4) · TypeScript 6.0.3 (web 5.9.3)
