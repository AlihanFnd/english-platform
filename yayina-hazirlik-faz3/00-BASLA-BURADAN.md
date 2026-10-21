# 00 — BAŞLA BURADAN (FAZ 3 · YAYINA HAZIRLIK)

> **Bu dosyayı her faz-3 oturumunun başında oku.**
> Sonra sıradaki `YH-NN.md` dosyasını oku ve **yalnızca o işi** yap.

---

## Faz 3 ne demek?

Faz 1 (`guvenlik-kurallari/`, KURAL-01…12) ve faz 2
(`guvenlik-kurallari-faz2/`, KURAL-13…19) sistemi **güvenli** hâle getirdi.
Güvenli olmak "yayına hazır" olmak değil.

2026-09-13'te yapılan mobil analiz
([`raporlar/04-MOBIL-EKSIK-ANALIZI.md`](../raporlar/04-MOBIL-EKSIK-ANALIZI.md))
üç sonuç çıkardı:

1. **Okuma güçlü, döngü yok.** Bir dil uygulamasını ayakta tutan şey —
   günlük seri, hedef, tekrar zamanı, hatırlatma — hiç yok. Paneldeki
   "hedef" kartı sabit bir yazı.
2. **Mağaza engelleri var.** Uygulama içi hesap silme yok, gizlilik
   bağlantısı yok, istenen kamera izni hiçbir işe yaramıyor.
3. **Kodda gerçek bir giriş bilgisi var ve depo herkese açık.**

Faz 3 bunları kapatır. Güvenlik fazlarından farkı: işlerin çoğu **yeni
özellik.** Bu yüzden disiplin "önce kapı" değil, "önce sözleşme, sonra ekran,
sonra görsel kanıt" biçimindedir — **ama faz 1–2'nin bütün kuralları her yeni
uçta aynen geçerlidir.**

---

## Her iş için çalışma sırası

```
1. KARAR     → tasarım kararları YH dosyasında yazılı mı? Değilse önce yaz
2. SÖZLEŞME  → backend ucu + DTO + test (yetki, girdi, hız sınırı, envanter, maliyet)
3. İSTEMCİ   → yalnızca lib/api.ts üzerinden; ekran kodu fetch çağırmaz
4. GÖRSEL    → simülatörde AÇIK ve KOYU tema ekran görüntüsü; etkileşim gerçekten denenir
5. KAPI      → dotnet test · guard/run-all.sh · mobile: npx tsc --noEmit
6. MUTASYON  → güvenlik açısından kritik her davranış: geri al, KIRMIZIYI gör, geri koy
7. BELGE     → docs/, mobile/DURUM.md, bu dosyanın ilerleme tablosu
```

**Adım 4 atlanamaz.** Bir arayüz işi "tsc geçti" diye bitmiş sayılmaz —
tsc, kelime kutucuklarının üst üste bindiğini söylemez.

---

## Pazarlıksız maddeler

1. **Faz 1–2 kapılarını kırma.** Her oturumun sonunda
   `bash scripts/guard/run-all.sh` → `TOPLAM İHLAL: 0`. Kırılırsa **kapıyı değil
   davranışı** düzelt.

2. **Oyunlaştırma değerleri istemciden ALINMAZ.** Puan, seri, sayaç, "öğrenildi"
   rozeti sunucuda hesaplanır. İstemciden gelen bir "XP" alanı seriyi tek
   istekle satın aldırır — `KelimeCalismasi`'nda `DogruSeri` için öğrenilen ders.

3. **Yeni kişisel veri → envanter.** `Data/KisiselVeriEnvanteri.cs`: sınıfı,
   sebebi, ömrü, dışa aktarılıp aktarılmadığı. Ardından **dışa aktarma**
   (`VerimController.DisaAktar`) ve **hesap silme** (cascade) kapsamı kontrol edilir.

4. **Yeni uç → dört kontrol.** Yetki (sahiplik sorgunun İÇİNDE) · girdi sınırı
   (`AlanSinirlari` + whitelist) · hız sınırı (`[EnableRateLimiting]`) · hata
   mesajında iç detay yok. Para harcıyorsa `[ParaHarcar]` + dar kota.
   **GET durum değiştirmez.**

5. **Gerçek veritabanına test yazılmaz.** `englishreadingdb_test`.

6. **Yeni paket:** `npx expo install <paket>` (SDK uyumlu sürüm) → sonra
   `package.json`'da aralığı kaldırıp **sabitle.** Lisans ve son sürüm tarihi
   kontrol edilir. CDN'den kod çekilmez.

7. **Expo Go sınırı.** Yerel (native) modül isteyen paket — ML Kit, konuşma
   tanıma, `@sentry/react-native` — Expo Go'da **çalışmaz**. Böyle bir iş
   YH-14 (development build) kapanmadan başlatılamaz.

8. **Kapsayamadığını yaz.** "Şunu yapamadım çünkü…" kabul edilir; sessizce
   atlamak edilmez.

---

## ⛔ Kapsam dışı — kullanıcı kararı (2026-09-13)

**Konuşma, telaffuz kaydı ve karşılaştırma, taklit ederek tekrar (shadowing)
EKLENMEYECEK.**

Gerekçe: mikrofon izni, ses kaydı (yeni ve hassas bir kişisel veri sınıfı) ve
development build gerektirir. Karar değişirse yeni bir YH dosyası açılır;
mevcut işlerin içine "küçük bir ses kaydı" olarak sızdırılmaz.

---

## Sıra ve bağımlılıklar

| # | İş | Bağımlı | Neden bu sırada |
|---|---|---|---|
| **01** | Koda gömülü giriş bilgisi temizliği | — | 🔴 Depo herkese açık; en kısa, en acil |
| **02** | Okuyucu: kelime kutucukları, renk dili, sayfa geçişleri | — | En çok zaman geçirilen ekran; kullanıcının 1 numaralı isteği |
| **03** | Okurken cümle kurma ve kaydetme | 02 | Kutucuk seçimi 02'nin bileşeni üzerine kurulur |
| **04** | Günlük seri ve günlük hedef | — | Tutundurmanın çekirdeği; 05, 06, 07 buna puan yazar |
| **05** | Cümlelerim sunucuya taşınır | 03, 04 | Cihazlar arası eşitleme, envanter, seri puanı |
| **06** | Gerçek aralıklı tekrar | 04 | "Bugün 12 kelimen seni bekliyor" döngüsü |
| **07** | Hatırlatma bildirimleri | 04 | Seri riskteyken hatırlatmak için seri verisi lazım |
| **08** | Mağaza zorunlulukları | — | Hesap silme, verilerim, gizlilik, şifre, izinler, OCR butonu |
| **09** | Arayüz cilası ve erişilebilirlik | 02 | Türkçe büyük harf, kapaklar, sayaçlar, profil, etiketler |
| **10** | İlk açılış ve seviye | 04, 07 | Hedef seçimi ve bildirim izni ilk açılışta sorulur |
| **11** | Kelime normalizasyonu | 02 | Noktalama, kök, tür etiketi |
| **12** | Dinleme: sayfayı sesli okuma | 02 | Okunan cümle kutucuklarda vurgulanır |
| **13** | Çevrimdışı okuma | 05 | Yazma kuyruğu, sunucudaki cümle ucuna da yazar |
| **14** | Yayın altyapısı | 01 | EAS, sürüm, çökme raporlama, mobil CI, sürüm sabitleme, testler |
| **15** | Web eşitliği ve faz kapanışı | 04, 05 | Web'e seri + cümle kurma; raporların yenilenmesi |

> 01 → 04 arası birbirinden bağımsız yürütülebilir; 05'ten sonrası sıraya uyar.

---

## Ortak zemin

### Ortam (2026-09-13)

| | Değer |
|---|---|
| .NET SDK | `10.0.302` · proje hedefi `net8.0` |
| Mobil | Expo SDK 57 · React Native 0.86.3 · React 19.2.3 · **Expo Go** |
| Simülatör | iPhone 17 Pro · iOS 26 |
| Test (faz 2 sonu) | 315 |
| Kapı | 18 (`16` yok — KURAL-16 açık) |
| Faz 3 başlangıç commit'i | `e42f97b` |

### Çalıştırma

```bash
cd /Users/alihanfindikci/Desktop/ingilizceproje

docker info >/dev/null 2>&1 || open -a Docker     # daemon ayakta mı
docker compose up -d postgres

# Backend (sırlar .env'den; backend .env'i kendisi okumaz)
set -a; . ./.env; set +a
export ConnectionStrings__Default="Host=localhost;Database=englishreadingdb;Username=$POSTGRES_USER;Password=$POSTGRES_PASSWORD"
export Jwt__Key="$JWT_KEY"
cd EnglishReadingPlatform && dotnet run

# Mobil (ayrı terminal)
cd mobile && npx expo start --ios
```

> Claude oturumunda sunucular Bash ile değil `.claude/launch.json`
> yapılandırmalarıyla başlatılır (`api`, `mobil`).

### Görsel doğrulama

- Ekran görüntüleri: `mobile/screenshots/faz3/YH-NN-<ne>.png`
- Her arayüz işinde **açık ve koyu** tema.
- "Çalışıyor" demeden önce etkileşim **gerçekten** yapılır (dokun, kaydır, kaydet).

### Migration

```bash
dotnet tool restore
cd EnglishReadingPlatform && \
Jwt__Key='DESIGN_TIME_ONLY_placeholder_key_32chars_minimum!!' \
Jwt__Issuer='EnglishPlatform' Jwt__Audience='EnglishPlatformUsers' \
ConnectionStrings__Default='Host=localhost;Database=tasarim_zamani;Username=x;Password=y' \
CorsOrigins='http://localhost:3000' Groq__ApiKey='' \
dotnet dotnet-ef migrations add MigrationAdi
```

> `migrations remove` veritabanına **bağlanır** — gerçek bağlantı dizesi ister
> (faz 2 00 dosyası, "dotnet-ef" bölümü).

---

# 🧍 İNSAN KARARI GEREKEN İŞLER — FAZ 3

> Kodun yapamayacağı işler. Parantez içinde hangi iş gerektiriyor.
> **Karar verilmezse yazan varsayılan uygulanır** ve rapora "varsayılan seçildi" yazılır.

| # | İş | Aciliyet | Varsayılan |
|---|---|---|---|
| 1 | **Koddaki hesabın CANLI şifresini değiştir** (YH-01) | 🔴 bugün | — (varsayılanı yok) |
| 2 | Git geçmişi temizlensin mi, depo herkese açık kalsın mı (YH-01) | 🔴 | Geçmiş temizlenmez; şifre değişimi yeterli sayılır |
| 3 | Seri tanımı: "bir gün = en az 1 XP" mi, "hedefi tamamlamak" mı (YH-04) | 🟡 | **A — en az 1 XP** (Duolingo davranışı) |
| 4 | Puan tablosu ve günlük tavanlar (YH-04 §Puan tablosu) | 🟡 | Dosyadaki tablo |
| 5 | Seri verisinin saklama süresi (YH-04) | 🟡 | Hesap silinene kadar |
| 6 | Gizlilik politikası / KVKK aydınlatma metni ve yayın adresi (YH-08) | 🔴 mağazadan önce | Bağlantı yeri hazırlanır, metin yok |
| 7 | OCR kamera butonları: kaldırılsın mı, gerçek OCR mı (YH-08) | 🟡 | **Kaldırılır** (gerçek OCR development build ister) |
| 8 | Apple Developer + Google Play hesapları, EAS hesabı (YH-14) | 🟡 | — |
| 9 | Çökme raporlama servisi (Sentry vb.) kullanılsın mı (YH-14) | 🟡 | Kullanılmaz; karar gelirse dış servis sözleşmesine yazılır |
| 10 | Hatırlatma saati ve metinleri (YH-07) | 🟢 | 20:00 · dosyadaki metinler |

---

## Her oturuma yapıştıracağın prompt

```
yayina-hazirlik-faz3/00-BASLA-BURADAN.md ve yayina-hazirlik-faz3/YH-02.md dosyalarını oku.
Bu işi dosyadaki tasarım kararlarına uyarak uygula: önce sözleşme ve testler, sonra ekran.
Simülatörde açık ve koyu temada ekran görüntüsüyle kanıtla; bitti kriterindeki komutların ham çıktısını göster.
Güvenlik açısından kritik davranışlar için mutasyon kontrolünü yap.
```

İş numarasını değiştirerek aynı prompt kullanılır.

---

## İlerleme takibi

Her iş bitince bu tabloyu güncelle (oturumun son işi budur):

| # | İş | Durum | Commit | Tarih |
|---|---|---|---|---|
| 01 | Koda gömülü giriş bilgisi temizliği | ✅ Kanıtlanarak kapandı | `71a9cfe` | 2026-09-13 |
| 02 | Okuyucu yeniden tasarımı | ✅ Kanıtlanarak kapandı | `71a9cfe` | 2026-09-13 |
| 03 | Cümle kurma ve kaydetme | ✅ Kanıtlanarak kapandı | `71a9cfe` | 2026-09-13 |
| 04 | Günlük seri ve hedef | ✅ Kanıtlanarak kapandı | `71a9cfe` | 2026-09-13 |
| 05 | Cümlelerim sunucuya | ✅ Kanıtlanarak kapandı | `71a9cfe` | 2026-09-13 |
| 06 | Aralıklı tekrar | ✅ Kanıtlanarak kapandı | `71a9cfe` | 2026-09-13 |
| 07 | Hatırlatma bildirimleri | ✅ Kanıtlanarak kapandı | `71a9cfe` | 2026-09-13 |
| 08 | Mağaza zorunlulukları | ✅ Kanıtlanarak kapandı | `71a9cfe` | 2026-09-13 |
| 09 | Arayüz cilası ve erişilebilirlik | ✅ Kanıtlanarak kapandı | `71a9cfe` | 2026-09-13 |
| 10 | İlk açılış ve seviye | ✅ Kanıtlanarak kapandı | `71a9cfe` | 2026-09-13 |
| 11 | Kelime normalizasyonu | ✅ Kanıtlanarak kapandı | `71a9cfe` | 2026-09-13 |
| 12 | Dinleme | ✅ Kanıtlanarak kapandı | `71a9cfe` | 2026-09-13 |
| 13 | Çevrimdışı okuma | ✅ Kanıtlanarak kapandı | `71a9cfe` | 2026-09-13 |
| 14 | Yayın altyapısı | ✅ Kanıtlanarak kapandı | `71a9cfe` | 2026-09-13 |
| 15 | Web eşitliği ve faz kapanışı | ✅ Kanıtlanarak kapandı | `71a9cfe` | 2026-09-13 |

Durum işaretleri: ⬜ Başlamadı · 🟨 Kısmen (neyin kaldığı yazılır) · ✅ Kanıtlanarak kapandı

> Commit sütunu kullanıcı commit istediğinde doldurulur; commit'siz kapanan işte `— (commit bekliyor)` yazılır.

---

## Faz 1–2 ilerleme (referans)

| Faz | Durum |
|---|---|
| Faz 1 — KURAL-01…12 | ✅ 12/12 (`2bd12bc`) |
| Faz 2 — KURAL-13…19 | 🟨 6/7 — KURAL-16 Resend anahtarı bekliyor |
