# Linguza Mobil — Durum ve Devam Notu

> Bu dosya, mobil uygulamanın güncel durumunu, tamamlanan ekranları ve geliştirme notlarını belgeler.

Son güncelleme: 2026-09-13

---

## 1. Ne yapıldı

`mobile/` klasöründe **Expo SDK 57** (Expo Go'nun App Store'daki güncel sürümüyle uyumlu) + expo-router + TypeScript ile React Native istemcisi **tamamlandı ve iOS Simülatöründe tüm akışlarıyla doğrulandı**.
Amaç: `frontend/` (Next.js) istemcisinin **işlevlerini birebir**, tasarımını ise mobile uygun modern estetikle (açık/koyu tema, Cam/Kart, mikro-animasyonlar) üretmek.

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
    context/AuthContext.tsx     oturum + dev auto-login + useKorumaliYonlendirme()
    hooks/useTelaffuz.ts        expo-speech (web'deki speechSynthesis karşılığı, aynı API)
    hooks/useEtkinlikTakibi.ts  30 sn nabız; uygulama arka plandayken DURUR
    lib/api.ts                  frontend/app/api.ts'in tam karşılığı
    lib/cumleler.ts             normalizeSentences port'u + kelimeRengi()
    components/ui.tsx           Metin/Kart/Buton/Rozet/IlerlemeCubugu/Yukleniyor/
                                HataKutusu/BosDurum/EkranZemini
    components/UstBar.tsx       başlık + tema anahtarı + profil sayfası + geri bildirim
    components/KelimePaneli.tsx kelime kartı (çeviri, telaffuz, "Kelimelerime Ekle")
    components/CumleGorunumu.tsx okunabilir metin gövdesi (okuyucu + OCR ortak)
    app/
      _layout.tsx               yazı tipleri, sağlayıcılar, Stack
      login.tsx                 giriş / kayıt (rol seçimi dahil, dev kolaylığı)
      (tabs)/_layout.tsx        alt sekme çubuğu (Panel, Kitaplık, Kelimelerim, Metin Tara, Gruplar)
      (tabs)/index.tsx          Panel (istatistikler, son okunanlar, hedefler)
      (tabs)/books.tsx          Kitaplık (kategori/seviye filtreleri, arama, ilerleme)
      (tabs)/words.tsx          Kelimelerim (kelime arama/ekleme/düzenleme/silme, çalışma seansı)
      (tabs)/groups.tsx         Gruplar (sınıf listesi, grup oluştur, davet koduyla katıl)
      (tabs)/ocr.tsx            ✅ Metin Tara / OCR (A seçeneği tamamlandı: fotoğraf, pano, analiz, geçmiş, KURAL-12 silme)
      books/[id]/index.tsx      Okuyucu (bölüm/sayfa navigasyonu, cümle çevirisi, telaffuz, kelime kartı)
      books/[id]/quiz.tsx       Quiz (bölüm sonu anlama testi, şıklar, gönderim)
```

---

## 3. Ekran durumu (Tümü Tamamlandı)

| Ekran | Durum | Doğrulama & Kanıt |
|---|---|---|
| Giriş / Kayıt | ✅ | `01_giris_temiz.png` — rol seçimi (öğrenci/öğretmen), doğrulama |
| Panel | ✅ | `02_panel.png` — gerçek sayaçlar, son okumalar, Kestrel 5001'den canlı veri |
| Kitaplık | ✅ | `03_kitaplik.png` — 17 kitap, kategori taksonomisi, arama ve filtreler |
| Okuyucu | ✅ | `04_kitap_okuyucu.png`, `05_kitap_sayfa.png`, `06_kelime_paneli.png`, `07_kelime_eklendi.png` — cümle çevirisi, TTS, kelime türü renklendirmesi, Kelimelerime Ekle |
| Kelimelerim & Cümlelerim | ✅ | `08_kelimelerim.png`, `09_calisma_seansi.png` — Kelimeler ve Cümlelerim sekmeli yapı, anlık otomatik çevirili seri giriş, Excel/Word (`.xlsx`, `.docx`, `.csv`, `.txt`) toplu ekleme sihirbazı, Çoktan Seçmeli Quiz oyunu (sayaçlı/serbest, 4 şıklı), Spaced Repetition hafıza raporu modalı |
| Quiz | ✅ | `10_quiz.png` — Book 38 Chapter 5 çoktan seçmeli test, şıklar, gönder butonu |
| Gruplar | ✅ | `11_gruplar.png` — grup oluşturma, davet kodu modalı, boş durum |
| **OCR (Metin Tara)** | ✅ | `12_ocr.png`, `13_ocr_analiz.png`, `14_ocr_gecmis.png` — Seçenek A: metin yapıştırma/girişi, `api.analyzeText`, interaktif cümle ve `KelimePaneli`, `api.saveOcrRecord`, geçmiş listesi ve KURAL-12 silme (`api.deleteOcrRecord`) |
| **İlk Açılış & Seviye (YH-10)** | ✅ | `YH-10-01-hosgeldin-acik.png`, `YH-10-02-seviyen-acik.png`, `YH-10-03-hedef-acik.png`, `YH-10-04-hatirlatma-acik.png`, `YH-10-05-kitap-acik.png`, `YH-10-06-koyu.png`, `YH-10-07-gec-sonrasi-panel.png`, `YH-10-08-seviyeli-kitaplik.png` — 5 adımlı onboarding modalı (Hoş geldin, CEFR seviye seçimi, günlük hedef XP, bildirim izni, önerilen kitaplar), seviyeye göre sıralı kitaplık, geri alınamaz `IlkAcilisTamamlandi` bayrağı |
| **Kelime Normalizasyonu (YH-11)** | ✅ | `YH-11-01-kelime-kok-acik.png`, `YH-11-02-kelime-kok-koyu.png`, `YH-11-03-normal-liste.png` — Sunucu tarafında baş/son noktalama ve tırnak temizliği, büyük/küçük harf tekilleştirme, `IngilizceKok` / `kok.ts` kural tabanlı kök tespiti (~200 düzensiz haritası + sonek kuralları), kelime kartında kök rozeti ve köke/orijinale kaydetme seçim ikilisi, tür whitelist kontrolü |
| **Dinleme: Sayfayı Sesli Okuma (YH-12)** | ✅ | `YH-12-01-dinleme-acik.png`, `YH-12-02-dinleme-koyu.png` — Okuyucu başlığında 🎧 Dinle butonu, alt mini oynatıcı (Önceki, Oynat/Duraklat, Sonraki, 0.75×/1×/1.25× hız çipi, en-* ses seçimi, Kapat), aktif cümle sol şerit + zemin vurgulama, AppState arka plan duraklatma takibi |
| **Çevrimdışı Okuma ve Yazma Kuyruğu (YH-13)** | ✅ | `YH-13-01-cevrimdisi-acik.png`, `YH-13-02-cevrimdisi-koyu.png` — Backend `GET /api/books/{id}/sayfalar?bas=1&son=50` salt okunur toplu uç, NetInfo ağ izleme & üst çevrimdışı bildirim bandı, `cevrimdisiDepo.ts` documentDirectory 50 MB LRU önbellek, `yazmaKuyrugu.ts` FIFO yazma kuyruğu (ilerleme birleştirme, 401 pause, 4xx drop, max 500 tavan), okuyucuda Çevrimdışı İndir ve çevrimdışı oku |
| **Yayın Altyapısı (YH-14)** | ✅ | `YH-14-01-acik.png`, `YH-14-02-koyu.png` — EAS profilleri (`mobile/eas.json`), üretim yapılandırma kapısı (`scripts/mobil/uretim-yapilandirma.mjs`), tip sözleşmesi kapısı (`scripts/mobil/tip-sozlesmesi.mjs`), exact package version pinning (0 unpinned), yerel CI (`scripts/ci-yerel.sh`), Guard 18 tedarik kontrolü, 9 test paketi (27 birim testi), modüler ekran refaktörleri (`words.tsx`, `ocr.tsx`, `groups.tsx` ≤ 300 satır) |

TypeScript denetimi: `npx tsc --noEmit` sıfır hatayla geçmektedir.

---

## 4. OCR Uygulaması

DURUM.md § 4'teki **A seçeneği** başarıyla uygulanmıştır:
- Kullanıcı kameradan çekebilir veya galeriden seçebilir (`expo-image-picker`), cihazın yerel Live Text / Lens özelliğiyle metni seçip kopyalayabilir veya doğrudan panodan tek dokunuşla yapıştırabilir (`expo-clipboard`).
- Metin kutusu çok satırlı düzenlemeyi destekler.
- "Metni Çözümle ve Oku" butonu:
  - Backend `POST /api/books/analyze` (`api.analyzeText`) çağrısıyla metni cümlelere ve kelime türlerine (isim, fiil, sıfat vb.) ayırır.
  - İnteraktif okuma alanında `CumleGorunumu` ve `KelimePaneli` ile kelimeye dokunulduğunda Türkçe anlam, telaffuz, eş anlamlılar ve "Kelimelerime Ekle" işlevlerini sunar.
  - Arka planda `POST /api/dashboard/ocr` (`api.saveOcrRecord`) ile tarama geçmişine kaydeder.
- "Geçmiş" sekmesi:
  - `GET /api/dashboard/ocr` ile kullanıcının önceki taramalarını listeler.
  - KURAL-12 uyumlu: her kayıtta kırmızı çöp kutusu butonu ile `DELETE /api/dashboard/ocr/{id}` çağrılarak kayıt silinir ve anında arayüz güncellenir.

---

## 5. Bilinmesi gereken tuzaklar ve çözümler

1. **Backend Portu ve Kestrel Binding**:
   - `EnglishReadingPlatform/appsettings.json` varsayılan olarak 8080'e ayarlıydı; `appsettings.Development.json` dosyasına `Kestrel: { Endpoints: { Http: { Url: "http://0.0.0.0:5001" } } }` eklenerek port 5001 kuralı sağlandı.
2. **`.env` Dosyasında Bash Redirection Sorunu**:
   - `Resend__Gonderen=Linguza <onboarding@resend.dev>` satırındaki `<>` karakterleri `source .env` yapıldığında dosya yönlendirme hatası veriyordu; çift tırnak içerisine alınarak çözüldü.
3. **React Hook Çağrı Sırası**:
   - `KelimePaneli.tsx` içinde `useCallback` ve `useEffect` kancalarının `if (!secim) return null;` öncesine alınması zorunludur (React Rules of Hooks).
4. **`npm audit` 14 Moderate Uyarısı Analizi**:
   - `decode-uri-component <=0.4.2` (`expo-router` -> `query-string` bağımlılığı)
   - `uuid <11.1.1` (`@expo/config-plugins` -> `xcode` bağımlılığı)
   - Her iki uyarı da Expo SDK 57 ve Metro geliştirme araçları ağacından gelmektedir. İstemci çalışma zamanı web sunucusu barındırmaz ve DoS açığı oluşturmaz. `npm audit fix --force` Expo SDK kilidini kırıp bağımlılıkları bozacağı için çalıştırılmamalıdır.
5. **Expo SDK 57 Navigasyonu**:
   - `useBottomTabBarHeight` ve sekmeler `expo-router/js-tabs` üzerinden alınmalıdır.
