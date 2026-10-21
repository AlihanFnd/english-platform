# 04 — Mobil Eksik Analizi

> **Ölçüm tarihi:** 2026-09-13 · **Commit:** `e42f97b`
> **Kapsam:** `mobile/` istemcisi. Ölçüt: yayındaki dil öğrenme uygulamaları
> (günlük seri + aralıklı tekrar + okuma uygulamaları) ve App Store / Google Play kuralları.
> **Sonuç:** bulgular [`yayina-hazirlik-faz3/`](../yayina-hazirlik-faz3/00-BASLA-BURADAN.md)
> içinde iş kalemlerine dönüştürüldü — eşleme §9'da.

---

## İçindekiler

1. [Tek paragrafta](#1-tek-paragrafta)
2. [Acil güvenlik bulgusu](#2-acil-güvenlik-bulgusu)
3. [Belgelerle kod arasındaki ayrışma](#3-belgelerle-kod-arasındaki-ayrışma)
4. [Güçlü yanlar](#4-güçlü-yanlar)
5. [Dört beceri](#5-dört-beceri)
6. [Özellik eksikleri](#6-özellik-eksikleri)
7. [Profesyonellik eksikleri](#7-profesyonellik-eksikleri)
8. [Doğrulanamayanlar](#8-doğrulanamayanlar)
9. [Faz 3 eşlemesi](#9-faz-3-eşlemesi)
10. [Bu raporu yeniden üretmek](#10-bu-raporu-yeniden-üretmek)

---

## 1. Tek paragrafta

Mobil istemci **okuma** tarafında güçlü: cümle çevirisi, kelime kartı, kaldığın
yerden devam, koyu tema, dokunsal geri bildirim. Ama bir dil uygulamasını
ayakta tutan **günlük döngü** yok: seri yok, hedef yok (paneldeki "hedef" sabit
yazı), gerçek aralıklı tekrar yok, hatırlatma yok. Mağazaya çıkışı engelleyen
eksikler var (uygulama içi hesap silme, gizlilik bağlantısı, kullanılmayan
kamera izni). Ve kaynak kodda **gerçek bir hesabın giriş bilgisi** duruyor;
depo herkese açık.

---

## 2. Acil güvenlik bulgusu

**Bulgu:** `mobile/src/app/login.tsx:27-28` ve `mobile/src/context/AuthContext.tsx:29`
içinde gerçek bir kişisel e-posta adresi ve sızmış-şifre listesinde bulunan
zayıf bir şifre **düz metin** olarak yazılı (geliştirme kolaylığı için
"otomatik giriş" ve form ön doldurma).

> Değerler bu belgeye bilerek yazılmadı — bir belgeye kopyalamak sızıntıyı
> çoğaltmaktır.

### Kanıt (ham çıktı)

```
$ curl -s -o /dev/null -w "HTTP %{http_code}\n" https://api.github.com/repos/AlihanFnd/english-platform
HTTP 200                                        ← anonim erişim: depo HERKESE AÇIK

$ git log -S'<şifre>' --oneline --all -- mobile frontend admin-panel
ebf3fbb düzeltme: Docker Compose yapılandırması, CORS, dev CSP ve oturum akışı düzeltildi

$ git branch -r --contains ebf3fbb
  origin/HEAD -> origin/main
  origin/main                                   ← gönderilmiş

$ grep -c "<e-posta>" neon_dump.sql
1
tablo: COPY public."Users" ("Id", "Username", "Email", "PasswordHash", "Role", "CreatedAt") FROM stdin;
rol alanı: student                              ← hesap canlı döküm anında (2026-08-20) VARDI

$ bash scripts/guard/02-sirlar.sh
  ...
  TOPLAM İHLAL: 0                               ← kapı YAKALAMIYOR
```

### Üretim paketine giriyor mu? — Hayır (iOS)

```
$ npx expo export --platform ios --output-dir <scratchpad>/expo-export
exit=0 · _expo/static/js/ios/entry-a88eacaed4c4a08e93a661b30e43b37d.hbc (6.1MB)

$ grep -a -c ... entry-*.hbc          # pozitif kontrol: aramanın paketi gerçekten okuduğu
linguza_token            1
/auth/login              1
@linguza_sentences_      1
<e-posta>                0             ← __DEV__ dalı derlemede ölü kod olarak siliniyor
```

Pakette şifre dizesi **bir kez** eşleşiyor; bağlamı base64 alfabesi
(`…xyz0123456789+/=`) — **yanlış alarm**: rakam dizisinin alt dizisi, şifre değil.

### Neden kapı yakalamadı

`scripts/guard/02-sirlar.sh` madde 1 yalnızca `SirDogrulayici.YasakliDegerler`
dizisindeki **5 sunucu sırrını** arıyor. İstemci koduna gömülü bir giriş
bilgisi (e-posta + şifre çifti, `__DEV__` ön doldurma, `EXPO_PUBLIC_*` ile
pakete gömülen değişken) hiçbir maddenin kapsamında değil.

→ **YH-01** kapatır. Şifre değişimi ve geçmiş kararı **insan işi.**

---

## 3. Belgelerle kod arasındaki ayrışma

`raporlar/02-MOBIL-RAPORU.md` `6c8f22a`'da ölçüldü; ondan sonra `7c871cb` ve
`ea498e7` mobilde 5.400+ satır değiştirdi.

| Belge ne diyor | Kod ne diyor | Komut |
|---|---|---|
| 02: 22 dosya · 6.727 satır | **26 dosya · 8.909 satır** | `find mobile/src -type f \| xargs wc -l` |
| 02: `words.tsx` 1.063 satır | **1.595 satır** | aynı |
| 02: `expo-image-picker` kullanılmıyor | Kullanılıyor — ama çekilen fotoğraf **atılıyor**, yalnızca "Live Text ile kopyala" uyarısı çıkıyor | `ocr.tsx:185-198`, `:215-228` |
| DURUM.md: "rol seçimi dahil" | Rol seçimi yok (KURAL-17) | `grep -n role mobile/src/app/login.tsx` |
| DURUM.md: "dev auto-login" | **Doğru — ve §2'deki bulgunun kendisi** | `AuthContext.tsx:27` |
| DURUM.md: `POST /api/books/analyze` | `POST /api/translate/analyze` | `api.ts:473` |
| `ea498e7` mesajı: "backend OCR analizi" | Backend'de OCR ucu yok | `grep -rn '\[Http' EnglishReadingPlatform/Controllers` |

Yeni dosyalar (02'de yok): `TopluEkleModal.tsx` 694 · `dosyaAyristirici.ts` 566 ·
`cumleDeposu.ts` 197 · `IlerlemeRaporuModal.tsx` 191.

---

## 4. Güçlü yanlar

- **Okuma deneyimi:** kaldığın yerden devam bandı, yazı boyutu, tam ekran, cümle seslendirme.
- **Tasarım sistemi:** Material 3 rol adlı palet, açık/koyu, 9 temel bileşen, haptik.
- **Durum ekranları:** yükleniyor / hata / boş durum bileşenleri her ekranda.
- **Toplu içe aktarma:** Word/Excel/metinden kelime ve cümle.
- **Güvenlik iskeleti:** jeton SecureStore'da, tek HTTP kapısı, 401'de oturum yayını,
  20 sn zaman aşımı, ağ hatası metni sadeleştiriliyor.

---

## 5. Dört beceri

| Beceri | Durum | Gerekçe |
|---|---|---|
| Okuma | 🟢 Güçlü | Uygulamanın omurgası |
| Kelime | 🟡 Orta | Liste, kart, çoktan seçmeli var; **tekrar zamanı** yok |
| Dinleme | 🟠 Zayıf | Yalnızca cihaz TTS'i, cümle/kelime tek tek; sayfayı dinleme yok |
| Konuşma | 🔴 Yok | **Kapsam dışı** — kullanıcı kararı 2026-09-13 (faz 3 §Kapsam dışı) |
| Yazma | 🔴 Yok | Cümle kurma (YH-03) ilk adım |
| Dilbilgisi | 🔴 Yok | Analiz var, açıklama yok |

---

## 6. Özellik eksikleri

### A. Günlük döngü (en büyük boşluk)

| # | Eksik | Kanıt |
|---|---|---|
| A1 | **Seri ve günlük hedef yok** — paneldeki "Hedefin: 5 yeni kelime" ve "Günün İpucu" SABİT METİN | `(tabs)/index.tsx:337`, `:361` |
| A2 | **Hatırlatma yok** | `grep notifications mobile/package.json` → yok |
| A3 | **Gerçek aralıklı tekrar yok** — sıralama: hiç çalışılmamış → çalışılıyor → öğrenilmiş bandı + son çalışma tarihi + rastgele; "sonraki tekrar" alanı yok | `BooksController.cs:548-552` |
| A4 | **İlk açılış / seviye seçimi yok** — kitaplarda `Level` var, kullanıcıda yok | `AppModels.cs:33` |

### B. Öğrenme derinliği

| # | Eksik | Kanıt |
|---|---|---|
| B1 | **Okuyucuda kelime ayrımı görünmüyor** — kelimeler iç içe `Text`; boşluk da altı çizili metnin içinde olduğu için satır boyunca **tek çizgi** oluşuyor. Android `textDecorationColor`'ı yok sayıyor → orada tür renkleri de yok | `CumleGorunumu.tsx:195-212`, `:204` yorumu |
| B2 | **Sayfa değişimi sert** — her geçişte bütün ekran "Sayfa hazırlanıyor…" yükleyicisine dönüyor, başlık ve alt çubuk kayboluyor; geçiş animasyonu yok | `books/[id]/index.tsx:78`, `:184-192` |
| B3 | **Okurken cümle kaydetme yok** | — |
| B4 | **Bilinen kelimeler metinde işaretlenmiyor** — renk yalnızca kelime türünden | `cumleler.ts:117` |
| B5 | **Kelime normalizasyonu yok** — "conversation." noktayla kayıtlı; kayıttan önce yalnızca `trim` | `words.tsx:295`, ekran `03-kelimelerim.png` |
| B6 | **Tür etiketi hatalı** — "loves" İSİM etiketiyle, "seviyor" çevirisiyle | ekran `10-kelime-paneli.png` |
| B7 | **Kelime kartı zayıf** — fonetik, İngilizce tanım, örnek, kök yok | `KelimePaneli.tsx` |
| B8 | **Sayfayı dinleme yok** | `useTelaffuz.ts` yalnızca tek metin |
| B9 | **Gerçek OCR yok** | §3 |
| B10 | **Çevrimdışı çalışmıyor** — önbellek/ağ durumu paketi yok | `package.json` |
| B11 | **"Cümlelerim" yalnızca cihazda** — web'le eşitlenmiyor, envanterde yok, dışa aktarmaya girmiyor | `cumleDeposu.ts:1`, `KisiselVeriEnvanteri.cs` |

### C. Öğretmen / sosyal

Ödev son tarihi, grup sıralaması, "öğrencin bitirdi" bildirimi yok.

---

## 7. Profesyonellik eksikleri

### Mağaza engelleri

| Eksik | Neden engel | Kanıt |
|---|---|---|
| **Uygulama içi hesap silme yok** | App Store 5.1.1(v) ve Google Play hesap oluşturan uygulamada zorunlu tutuyor | `api.ts`'de `verim` yok; backend ucu hazır: `POST /api/verim/hesabimi-sil` |
| **Gizlilik politikası bağlantısı yok** | Her iki mağaza listesi için zorunlu | `grep -ri gizlilik mobile/src` → yok |
| **Kamera/galeri izni kullanılmıyor** | İzin metni "metne çevirebilmek için" diyor, fotoğraf çevrilmiyor → inceleme reddi riski | `app.json` izin metinleri + `ocr.tsx:185` |
| **Şifre değiştir / şifremi unuttum yok** | Kullanıcı hesabını yönetemiyor | uçlar var (`/auth/change-password`) |
| **Mağaza derlemesi yok** | `eas.json` yok, OTA güncelleme yok | `ls mobile/eas.json` |

### Arayüz cilası (ekran görüntülerinden)

| Sorun | Kaynak |
|---|---|
| Türkçe büyük harf: "ISIM", "SERI KELIME GIRIŞI" | `ui.tsx:57` `textTransform: 'uppercase'` locale bilmiyor |
| Kapakta başlık kelime ortasından bölünüyor ("Adventur / es") | `01-panel.png`, `index.tsx:132` |
| Panel "Bölüm 2", okuyucu "Sayfa 2 / 19" | `index.tsx:147` |
| Kelimelerim sayaçları toplamı tutmuyor (3 · 1 · 0) | `03-kelimelerim.png` |
| Profil: yalnızca tema, geri bildirim, çıkış | `UstBar.tsx:157-187` |
| Erişilebilirlik: 77 dokunulabilir öğeye 13 etiket; `words.tsx`'te 0 | `grep -rn accessibilityLabel mobile/src \| wc -l` |

### Mühendislik

- Mobilde hiç test yok; CI mobili derlemiyor.
- Çökme raporlama yok.
- Sürümler sabit değil (`^`, `~`) — KURAL-18 kapsamı dışında.
- `words.tsx` 1.595 satır.
- Üretimde `EXPO_PUBLIC_API_URL` tanımsızsa `localhost`'a düşüyor — sessiz bozulma (`api.ts:47`).

---

## 8. Doğrulanamayanlar

| Konu | Neden |
|---|---|
| O hesabın **canlı** şifresi hâlâ aynı mı | Giriş denemesi yapılmadı — yapılmamalı |
| Android üretim paketi | Yalnızca iOS paketi derlendi |
| Deponun başkası tarafından kopyalanıp kopyalanmadığı | GitHub çatal/klon istatistiği sahip hesabı ister |
| Ekranların Android görünümü | Yalnızca iOS simülatör görüntüleri incelendi |

---

## 9. Faz 3 eşlemesi

| Bulgu | İş |
|---|---|
| §2 gömülü giriş bilgisi | **YH-01** |
| B1, B2, B4 | **YH-02** okuyucu yeniden tasarımı |
| B3 | **YH-03** cümle kurma ve kaydetme |
| A1 | **YH-04** günlük seri ve hedef |
| B11 | **YH-05** cümleler sunucuya |
| A3 | **YH-06** aralıklı tekrar |
| A2 | **YH-07** hatırlatma bildirimleri |
| §7 mağaza engelleri, B9 | **YH-08** |
| §7 arayüz cilası | **YH-09** |
| A4 | **YH-10** ilk açılış ve seviye |
| B5, B6, B7 | **YH-11** kelime normalizasyonu |
| B8 | **YH-12** dinleme |
| B10 | **YH-13** çevrimdışı |
| §7 mühendislik | **YH-14** yayın altyapısı |
| C, web eşitliği, rapor yenileme | **YH-15** |
| Konuşma | **Kapsam dışı** |

---

## 10. Bu raporu yeniden üretmek

```bash
# Dosya/satır
find mobile/src -type f | xargs wc -l | sort -rn

# Erişilebilirlik oranı
grep -rn "accessibilityLabel" mobile/src | wc -l
grep -rn "<Pressable\|<TouchableOpacity" mobile/src | wc -l

# Eksik paketler
grep -E "notifications|netinfo|sentry|expo-updates" mobile/package.json || echo yok

# Depo görünürlüğü
curl -s -o /dev/null -w "HTTP %{http_code}\n" https://api.github.com/repos/AlihanFnd/english-platform

# Kapı 02
bash scripts/guard/02-sirlar.sh

# Üretim paketi (iOS) — çıktı dizini depo DIŞINDA olmalı
cd mobile && npx expo export --platform ios --output-dir /tmp/linguza-export
```
