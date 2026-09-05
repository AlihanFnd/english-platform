# Linguza Mobil — Durum ve Devam Notu

> Bu dosya, mobil uygulamanın hangi noktada bırakıldığını ve yeni bir oturumda
> nereden devam edileceğini anlatır. **Yeni oturuma başlarken önce bunu oku.**

Son güncelleme: 2026-09-05

---

## 1. Ne yapıldı

`mobile/` klasöründe **Expo SDK 57** (Expo Go'nun App Store'daki güncel sürümüyle
uyumlu) + expo-router + TypeScript ile yeni bir React Native uygulaması kuruldu.
Amaç: `frontend/` (Next.js) istemcisinin **işlevlerini birebir**, tasarımını ise
mobile uygun biçimde yeniden üretmek.

Eski `mobile/node_modules` kalıntısı (337 MB, yarım/bozuk kurulum, git'te izlenmiyordu)
silindi; klasör sıfırdan kuruldu.

### Kurulu paketler
`expo-router`, `expo-secure-store`, `expo-speech`, `expo-image-picker`,
`expo-clipboard`, `expo-haptics`, `expo-linear-gradient`, `expo-blur`,
`react-native-svg`, `react-native-webview`, `@react-native-async-storage/async-storage`,
`lucide-react-native`, `@expo-google-fonts/inter`, `@expo-google-fonts/plus-jakarta-sans`,
`react-native-reanimated` 4.

---

## 2. Dosya haritası

```
mobile/
  app.json                      Linguza kimliği, Türkçe izin metinleri (kamera/galeri)
  src/
    theme/palette.ts            frontend/app/globals.css renkleri BİREBİR (açık/koyu) + alpha()
    theme/tokens.ts             Bosluk / Yaricap / YaziTipi / Olcek / golge()
    context/ThemeContext.tsx    tema (sistem varsayılan, AsyncStorage'da kalıcı)
    context/AuthContext.tsx     oturum + useKorumaliYonlendirme()
    hooks/useTelaffuz.ts        expo-speech (web'deki speechSynthesis karşılığı, aynı API)
    hooks/useEtkinlikTakibi.ts  30 sn nabız; uygulama arka plandayken DURUR
    lib/api.ts                  frontend/app/api.ts'in tam karşılığı (aşağıya bak)
    lib/cumleler.ts             normalizeSentences port'u + kelimeRengi()
    components/ui.tsx           Metin/Kart/Buton/Rozet/IlerlemeCubugu/Yukleniyor/
                                HataKutusu/BosDurum/EkranZemini
    components/UstBar.tsx       başlık + tema anahtarı + profil sayfası + geri bildirim
    components/KelimePaneli.tsx kelime kartı (çeviri, telaffuz, "Kelimelerime Ekle")
    components/CumleGorunumu.tsx okunabilir metin gövdesi (okuyucu + OCR ortak)
    app/
      _layout.tsx               yazı tipleri, sağlayıcılar, Stack
      login.tsx                 giriş / kayıt (rol seçimi dahil)
      (tabs)/_layout.tsx        alt sekme çubuğu (Panel, Kitaplık, Kelimelerim, Metin Tara, Gruplar)
      (tabs)/index.tsx          Panel
      (tabs)/books.tsx          Kitaplık
      (tabs)/words.tsx          Kelimelerim
      (tabs)/groups.tsx         Gruplar
      (tabs)/ocr.tsx            ❌ HENÜZ YAZILMADI
      books/[id]/index.tsx      Okuyucu
      books/[id]/quiz.tsx       Quiz
```

### api.ts'te web'den ayrılan üç nokta (üçü de bilinçli)
1. **Jeton `expo-secure-store`'da** (iOS Keychain / Android Keystore), `localStorage` değil.
2. **Sunucu adresi** `EXPO_PUBLIC_API_URL` → yoksa Expo dev sunucusunun LAN IP'si
   (`Constants.expoConfig.hostUri`) → yoksa `http://localhost:5001`.
   Telefon "localhost" derse kendini kasteder; bu yüzden IP türetiliyor.
3. **20 sn zaman aşımı** (AbortController) + 401'de jetonu silip oturumu düşürme.

---

## 3. Ekran durumu

| Ekran | Durum | Notlar |
|---|---|---|
| Giriş / Kayıt | ✅ | rol seçimi (öğrenci/öğretmen), hata mesajları web ile aynı |
| Panel | ✅ | okumaya devam et, sayaçlar, hızlı erişim, ipucu/hedef, son okumalar, pull-to-refresh |
| Kitaplık | ✅ | arama, seviye + kategori filtreleri (taksonomi sunucudan, KURAL-05), ilerleme, KURAL-08 sayfa/bölüm ayrımı |
| Okuyucu | ✅ | sayfa+bölüm modu, kaldığın yerden devam bildirimi, cümleye dokun→Türkçe, kelimeye dokun→kart, **basılı tut→kalıp seçimi**, TTS, KURAL-06 uyarısı + "Yeniden dene", tam ekran, yazı boyutu |
| Quiz | ✅ | A/B/C/D, gönder, sonuç + cevap anahtarı |
| Kelimelerim | ✅ | yazarken anlık çeviri (350 ms + önbellek + yarış koruması), alternatif öneriler, düzenle/sil, çalışma seansı (seans boyu, kart, bildim/bilemedim, kalıcı özet) |
| Gruplar | ✅ | oluştur, davet koduyla katıl, detay: üyeler / kitap ata / ilerlemeler / quiz sonuçları, KURAL-08 sahiplik kontrolü |
| **OCR (Metin Tara)** | ❌ | **yazılmadı** — aşağıdaki bölüme bak |

`npx tsc --noEmit` şu an **temiz** geçiyor.

---

## 4. OCR — karar verilmesi gereken tek konu

**Bulgu:** Expo Go içinde görüntüden metin çıkarma (image → text) **mümkün değil.**

- Expo Go'da ML Kit / Vision gibi yerel metin tanıma modülü yok.
- `tesseract.js`'i `react-native-webview` içinde yerel varlıklarla çalıştırma
  denemesi teknik olarak çıkmaz: tesseract `corePath` için **dizin** bekliyor,
  metro ise her varlığa karma (hash) içeren ayrı URL veriyor; `file://` üzerinden
  servis etmek de iOS WKWebView'da CORS'a takılıyor (wasm ve traineddata `fetch`
  ile çekiliyor).
- CDN'den çekmek **yasak** (proje kuralı: üçüncü taraf JS/WASM CDN'den çekilmez).

**Üç seçenek:**

| Seçenek | Ne gerekir | Sonuç |
|---|---|---|
| **A. Yerel akış (önerilen, Expo Go'da çalışır)** | Kod yok | Kullanıcı fotoğrafı seçer, telefonun kendi metin tanıma özelliğiyle (iOS Live Text / Android Lens) metni kopyalar, uygulamada "Panodan Yapıştır" der. Sonrası web ile birebir aynı: çözümle, cümle/kelime çevirisi, telaffuz, kelime ekle, geçmişe kaydet. |
| **B. Sunucu tarafı OCR ucu** | Backend'e `POST /api/dashboard/ocr/image` + Tesseract/Vision bağımlılığı, yetki + hız sınırı + KURAL-10 dosya doğrulaması + test + guard | Hem web hem mobil gerçekten 1:1 olur, en temiz çözüm |
| **C. Dev build (Expo Go'dan çıkmak)** | `expo-dev-client` + `@react-native-ml-kit/text-recognition`, EAS build | Cihazda yerel OCR; ama artık Expo Go ile QR okutarak açılmıyor |

**Şimdilik plan:** A seçeneği yazılacak (ekranın geri kalanı zaten birebir:
fotoğraf seçme/çekme, metin alanı, geçmiş listesi + silme (KURAL-12), çözümleme,
`CumleGorunumu` + `KelimePaneli`). B/C kullanıcı kararı.

---

## 5. Sıradaki işler

1. **`src/app/(tabs)/ocr.tsx` yaz** (yukarıdaki A akışı).
   Kullanılacak uçlar: `api.getOcrRecords()`, `api.saveOcrRecord(text)`,
   `api.deleteOcrRecord(id)`, `api.analyzeText(text)`.
   Ekran `UstBar` + `EkranZemini` + `CumleGorunumu` + `KelimePaneli` kullanmalı;
   diğer sekmelerle aynı düzen (`useBottomTabBarHeight()` ile alt boşluk).
2. **Gerçekten çalıştır ve doğrula.** Kod okuma kanıt değildir:
   - `docker compose up -d postgres`
   - Backend: `set -a && source .env && set +a` + `ConnectionStrings__Default`
     ve `Jwt__Key` dışa aktarılıp `cd EnglishReadingPlatform && dotnet run`
     (bkz. `start-dev.sh`). Sağlık: `curl -i http://localhost:5001/api/books`
   - `cd mobile && npx expo start --ios` (iOS Simülatörde Expo Go)
   - Simülatörde giriş → kitap aç → kelimeye dokun → kelime ekle → quiz →
     çalışma seansı akışlarını ekran görüntüsüyle doğrula.
3. **`npm audit`** çıktısını incele ve raporla — kurulumda **14 orta seviye**
   uyarı çıktı, henüz bakılmadı (KURAL-01: güvenlik bulgusu kapsam dışı olsa
   bile raporlanır).
4. **Dokümantasyon**: `docs/00-GENEL-BAKIS.md` içinde `mobile/` hâlâ
   "boş, başlamamış" yazıyor — güncellenmeli. `docs/01-MIMARI.md` ve
   kök `CLAUDE.md` tablosuna dördüncü istemci olarak mobil eklenmeli.
5. **Üç başlıklı teslim raporu** (KURAL-01 §8): kanıtlanarak kapandı /
   kapanmadı / insan müdahalesi gerekiyor.

---

## 6. Bilinmesi gereken tuzaklar

- **Expo SDK 57 yeni.** Şablonun kendi notu: *"Expo HAS CHANGED — kod yazmadan
  önce https://docs.expo.dev/versions/v57.0.0/ oku."* Ezberden API kullanma.
  - `ThemeProvider`, `DarkTheme`, `DefaultTheme`, `Stack`, `Link` → `expo-router` kökünden
  - JS sekmeler → `expo-router/js-tabs` (`expo-router`'daki `Tabs` **deprecated**)
  - `useBottomTabBarHeight` → `expo-router/js-tabs`
- **Android'de `textDecorationColor` yok sayılır** — kelime türü renkleri yalnızca
  iOS'ta görünür. Bilinen ve kabul edilen kısıt.
- **CORS mobili engellemez**: yerel istemci `Origin` başlığı göndermiyor, KURAL-13
  beyaz listesi yalnızca tarayıcılar için. Üretimde `PublicHost` doğru olmalı
  (HostFiltering).
- **Geliştirmede trafik düz HTTP** (LAN IP). Üretimde `EXPO_PUBLIC_API_URL`
  mutlaka `https://` olmalı — rapora yazılacak.
- Sekme çubuğu `position: absolute`; her sekme ekranı
  `paddingBottom: sekmeYuksekligi + Bosluk.xl` kullanıyor.
