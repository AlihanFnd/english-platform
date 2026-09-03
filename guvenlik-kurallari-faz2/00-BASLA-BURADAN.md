# 00 — BAŞLA BURADAN (FAZ 2)

> **Bu dosyayı her güvenlik oturumunun başında oku.**
> Sonra sana verilen `KURAL-NN.md` dosyasını oku ve **yalnızca o kuralı** uygula.

---

## Faz 2 ne demek?

Faz 1 (`guvenlik-kurallari/`, KURAL-01…12) **kapandı**: 241 test yeşil,
12 guard kapısı sıfır ihlal, her kural mutasyonla kanıtlandı.

Ama "12 kural bitti" ile **"yayına hazır"** aynı şey değil. Faz 1 bittikten sonra
yapılan üç ek denetim (kimlik doğrulama, dağıtım yapılandırması, yayın öncesi
gözden geçirme) **faz 1'in hiç bakmadığı yerlerde** yeni bulgular çıkardı.

En çarpıcısı şu: faz 1'in KURAL-11'i "tarayıcı tarafı savunma" başlığını taşıyordu
ve CSP, HSTS, güvenlik başlıkları, SRI — hepsini kapattı. **CORS'a hiç bakmadı.**
Bugün API'nin CORS politikası her kaynağa, üstelik kimlik bilgisiyle açık.

Faz 2 bu boşlukları kapatır. **Aynı disiplinle:**

```
1. MERKEZÎ ÇÖZÜM kurulur      →  tek bir yerde, herkesin kullanacağı mekanizma
2. ENVANTERDEKİ NOKTALAR taşınır →  mevcut N ihlal merkezî çözüme bağlanır
3. OTOMATİK KAPI eklenir       →  yeni ihlal eklenirse build kırılır
4. BİTTİ KRİTERİ çalıştırılır  →  çıktısı 0 olmalı, ham çıktı rapora konur
5. MUTASYON yapılır            →  düzeltme geri alınır, test KIRMIZI görülür, geri konur
```

Adım atlanamaz. Özellikle 3 ve 5 atlanırsa kural **kapanmış sayılmaz.**

---

## Faz 1'den öğrenilen üç ders — faz 2'de baştan uygulanacak

Bunlar faz 1 sırasında **pahalıya öğrenildi**. Tekrar öğrenmeye gerek yok.

### 1. Kapı, metin araması değil DAVRANIŞ araması olmalı

KURAL-12'nin mutasyonu, kapının `if (false)` ile kandırılabildiğini gösterdi:
kapı yalnızca hata mesajındaki bir kelimeyi arıyordu. Koşul ölü hâle geldi,
mesaj yerinde kaldı, **kapı yeşil verdi.**

> Kapı yazarken sor: *"Bu kontrolü etkisiz hâle getirip kapıyı yeşil bırakabilir miyim?"*
> Cevap evetse kapı bozuktur. Mümkünse **üretilmiş çıktıdan** oku
> (model anlık görüntüsü, derlenmiş yapılandırma), elle yazılan kaynaktan değil.

### 2. Sabit satır penceresi (`grep -A20`) kırılgandır

KURAL-12, `DeleteUser`'a meşru bir kontrol ekledi; KURAL-04'ün kapısı
`grep -A20` kullanıyordu ve koruma pencerenin dışına taştı. **Koruma yerindeydi,
kapı kırmızı verdi.** Yanlış alarm, gerçek alarmdan daha hızlı güven kaybettirir.

> Uç gövdesini yapısal kes (bir sonraki `[Http...]` attribute'una kadar),
> sabit satır sayısı kullanma.

### 3. Test, ölçtüğünü ADIYLA söylemeli

`Saklama_temizligi_eski_loglari_siler_yenileri_BIRAKIR` testinde kota koruması
**üçüncü** iddiaydı. FluentAssertions ilk başarısız iddiada durduğu için,
saklama süresi bozulduğunda rapor yalnızca "yeni log silindi" diyordu —
**kotanın da sıfırlandığı hiç görünmüyordu.**

> Kritik bir davranışın kendi testi olsun ve adı o davranışı söylesin.
> `..._GROQ_KOTA_SAYACINI_asla_silmez` gibi.

---

## Her kural dosyasında ne var

| Bölüm | Ne işe yarar |
|---|---|
| **Kural metni** | Emir kipinde tek cümle — uygulanacak olan kuraldır |
| **Envanter** | O sınıfın kod tabanındaki nokta sayısı ve tam konumları (gerçek `grep` çıktısıyla ölçüldü) |
| **Merkezî uygulama** | Kopyala-yapıştır kod — tek yerde kurulacak mekanizma |
| **Otomatik kapı** | Yeni ihlal eklenince build'i kıran test / guard script / CI adımı |
| **Bitti kriteri** | Komutla doğrulanabilir; **çıktısı sıfır olmalı** |
| **Mutasyon kontrolü** | Düzeltmeyi geri alıp testin kırmızı olduğunu görme adımları |
| **Geçiş planı** | Envanterdeki N örneğin merkezî çözüme nasıl taşınacağı |
| **Tuzaklar** | Bu kuralı uygularken yapılan tipik hatalar |

---

## Pazarlıksız maddeler

1. **Önce merkezî çözüm, sonra çağrı yerleri.** Tek tek route yamalamayın.

2. **Bitti kriteri çalıştırılmadan "tamam" yazmayın.**
   Kriter bir cümle değil, çıktısı `0` olması gereken bir komuttur.

3. **Mutasyon kontrolü zorunlu.** Düzeltmeyi geri alın, testin **kırmızı**
   olduğunu görün, sonra geri koyun. Kırmızıya dönmeyen test, test değildir.
   **Mutasyonun uygulandığını da doğrulayın** — uygulanmamış mutasyon yeşil verir
   ve yanlış güven yaratır.

4. **Gerçek veritabanına yazmayın.** Şema klonu (`englishreadingdb_test`) kullanın;
   yıkıcı işlem öncesi yedek alın ve yedeğin alındığını çıktıyla gösterin.

5. **Bir kuralı bitirmeden diğerine geçmeyin.**

6. **Kapsayamadığınızı yazın.** "Şunu yapamadım çünkü…" kabul edilir;
   sessizce atlamak edilmez.

7. **FAZ 2'YE ÖZEL — faz 1'in kapılarını kırmayın.**
   Her faz-2 oturumunun sonunda `bash scripts/guard/run-all.sh` **12 kapının
   tamamıyla** çalıştırılır. Faz 2'de yaptığın bir değişiklik faz 1'in bir
   kapısını kırarsa, **kapıyı değil davranışı** düzelt — kapıyı ancak kapının
   kendisi hatalıysa değiştir ve o zaman da mutasyonla hâlâ ölçtüğünü kanıtla
   (KURAL-12'de tam olarak bu yapıldı, bkz. yukarıdaki ders 2).

---

## Bitirince ne teslim edilecek

Her kural için **üç başlık, ayrı ayrı**:

### 1. Kanıtlanarak kapandı
Bitti kriterinin **ham komut çıktısıyla**. Özet değil, terminalden kopyalanmış çıktı.

### 2. Kapanmadı
Ne kaldı, neden kaldı, ne gerekiyor.

### 3. İnsan müdahalesi gerekiyor
Kodun yapamayacağı adımlar (anahtar tanımlama, ürün kararı, canlı doğrulama).

**Ek olarak:** değiştirilen dosya listesi + commit hash'i.

```bash
git log -1 --format='%H %s' && git diff --stat HEAD~1
```

---

## Kural sırası ve bağımlılıklar

Sıra keyfî değil.

| # | Kural | Bağımlı olduğu | Neden bu sırada |
|---|---|---|---|
| **13** | Köken ve kaynak denetimi | — | CORS her kaynağa kimlik bilgisiyle açık. Tek satır, en yüksek etki |
| **14** | Eksik yapılandırmada kapalı kal | — | Şifre sıfırlama bağlantısı loga yazılıyor; sızıntı **şu anda** açık |
| **15** | Dağıtım kapısı | 13, 14 | 13 ve 14'ün canlıda doğrulanabilmesi için sağlık ucu ve ortam sözleşmesi lazım |
| **16** | Hesap yaşam döngüsü | 14 | E-posta doğrulaması ve kurtarma arayüzü, çalışan bir e-posta servisi ister |
| **17** | Maliyetli iş ve paylaşılan yazma | — | LLM maliyeti kontrolsüz; paylaşılan analiz herkese açık yazılabiliyor |
| **18** | Tedarik zinciri ve kripto sertleştirme | 15 | CI kırık; kapı düzelmeden bağımlılık disiplini kurulamaz |
| **19** | Kişisel veri yaşam döngüsü | 16 | Silme/dışa aktarma talebi bir hesaba bağlıdır |

---

## Ortak zemin — her oturumda geçerli

### Ortam bilgileri (bu makinede doğrulandı, 2026-09-02)

| | Değer |
|---|---|
| .NET SDK | `10.0.302` (`/opt/homebrew/bin/dotnet`) |
| Proje hedefi | `net8.0` · `<RollForward>Major</RollForward>` |
| Test sayısı (faz 1 sonu) | **241 yeşil** |
| Guard kapısı (faz 1 sonu) | **12 kapı, 0 ihlal** |
| Son commit | `03b8adc` |

### 🔴 `dotnet-ef` artık depoda DEĞİL — manifestten geliyor

KURAL-12, `EnglishReadingPlatform/dotnet-ef` + `.store/**` altındaki **2,6 MB
derlenmiş araç ikilisini** (Windows `.exe`'leri dâhil) depodan çıkardı.
Yerine sürümü **metin olarak** sabitleyen `.config/dotnet-tools.json` geldi.

```bash
dotnet tool restore          # bir kez; dotnet-ef 8.0.11 kurulur
```

> ⚠️ **Tasarım zamanı ortam değişkeni tuzağı.** `dotnet dotnet-ef`, `Program.cs`'i
> çalıştırır ve `SirDogrulayici` fail-fast davrandığı için sırlar olmadan
> **hiçbir ef komutu çalışmaz.** `migrations add` veritabanına BAĞLANMAZ —
> yer tutucu değerler yeter:
>
> ```bash
> cd EnglishReadingPlatform && \
> Jwt__Key='DESIGN_TIME_ONLY_placeholder_key_32chars_minimum!!' \
> Jwt__Issuer='EnglishPlatform' Jwt__Audience='EnglishPlatformUsers' \
> ConnectionStrings__Default='Host=localhost;Database=tasarim_zamani;Username=x;Password=y' \
> CorsOrigins='http://localhost:3000' Groq__ApiKey='' \
> dotnet dotnet-ef migrations add MigrationAdi
> ```
>
> **`migrations remove` BAĞLANIR** (migration uygulanmış mı diye bakar).
> Orada gerçek bağlantı dizesi gerekir, yoksa `28P01: password authentication failed`
> alırsın ve **mutasyon geri alınamaz**:
>
> ```bash
> set -a; . ./.env; set +a
> cd EnglishReadingPlatform && \
> Jwt__Key='...' Jwt__Issuer='EnglishPlatform' Jwt__Audience='EnglishPlatformUsers' \
> ConnectionStrings__Default="Host=localhost;Database=englishreadingdb;Username=${POSTGRES_USER};Password=${POSTGRES_PASSWORD}" \
> dotnet dotnet-ef migrations remove
> ```

### Komut kısayolları

```bash
cd /Users/alihanfindikci/Desktop/ingilizceproje
```

| İş | Komut |
|---|---|
| Derle | `dotnet build Linguza.sln` |
| Testleri çalıştır | `dotnet test Linguza.sln` |
| Tüm kapıları çalıştır | `bash scripts/guard/run-all.sh` |
| **CI'nin tamamını yerelde koştur** | `bash scripts/ci-yerel.sh` |
| Test veritabanını aç | `docker compose up -d postgres` |
| EF aracını kur | `dotnet tool restore` |

### 🔴 "Testlerin 148'i birden düştü" — önce buraya bak

Faz 1'in son oturumunda testlerin yarısı bir anda kırmızıya döndü. Sebep koddaki
bir regresyon **değildi**: Docker Desktop kapanmıştı.

```
Npgsql.NpgsqlException : Failed to connect to 127.0.0.1:5432
---- SocketException : Connection refused
```

Çok sayıda test **aynı anda ve saniyeler içinde** düşerse önce şunu çalıştır:

```bash
docker info >/dev/null 2>&1 || open -a Docker      # daemon ayakta mı
docker compose up -d postgres
docker exec english_postgres pg_isready -U appuser
```

> Bu bir güvenlik bulgusu değildir; ama bunu bilmeyen bir oturum, olmayan bir
> regresyonu kovalayarak saatini harcar.

### Test veritabanı

Testler **asla** `englishreadingdb`'ye yazmaz. `englishreadingdb_test` kullanılır:

```bash
bash scripts/dev/test-rolu-kur.sh
```

> 🔴 **Veritabanını elle `appuser` ile OLUŞTURMAYIN.** Testler `linguza_test`
> rolüyle bağlanır; yanlış sahip her testi `42501: permission denied for schema public`
> ile düşürür. Betik rolü ve şifresini kurar, veritabanını testler kendi yaratır.

### Yedek alma (yıkıcı işlem öncesi)

```bash
docker exec english_postgres pg_dump -U appuser englishreadingdb > \
  "yedek-$(date +%Y%m%d-%H%M%S).sql"
ls -la yedek-*.sql
```

> `.gitignore`'da `yedek-*.sql`, `*.dump`, `*.db` var (KURAL-12'de uzantı bazlı
> hâle getirildi). Yedek dosyası PII içerir.

---

## Faz 1'den devreden bilinmesi gerekenler

1. **Üç istemci, tek API.** `frontend` (:3000, Next 16), `admin-panel` (:3001, Next 16),
   backend (:5001, ASP.NET Core 8). Ara katman dosyası `middleware.ts` **değil**,
   `proxy.ts`; dışa aktarılan işlev `proxy`.

2. **CSP nonce zinciri kırılgan.** `proxy.ts` istek başına nonce üretir,
   `app/layout.tsx` içindeki `await headers()` sayfayı dinamik yapar. O satır
   silinirse sayfa statik ön-render'a döner ve **tarayıcı hidrasyon script'ini
   engeller** — sayfa sessizce etkileşimsiz kalır.

3. **Yazma ucu eklerken `[EnableRateLimiting(HizSinirlari.…)]` zorunlu** —
   unutursan `HizSiniriSozlesmesiTests` build'i kırar.

4. **Backend hiç statik dosya sunmaz.** `Views/` ve `wwwroot/` silindi,
   `UseStaticFiles()` kaldırıldı.

5. **Kitaplar iki biçimde saklanıyor:** `Chapter` (eski) veya `BookPage` (güncel).
   `hasPages` bayrağı hangisinin geçerli olduğunu söyler. **`BookPage` GLOBALDİR** —
   `UserId` taşımaz, yani içeriği bütün kullanıcılar paylaşır (KURAL-17'nin konusu).

---

# 🧍 İNSAN KARARI GEREKEN İŞLER — FAZ 2

> Bu bölüm kasten sona konuldu. Aşağıdakiler **kodun yapamayacağı** işlerdir.
> Hangi kuralın gerektirdiği parantez içinde yazıyor.

---

## 1. 🔴 ACİL — Resend API anahtarı (KURAL-14)

**Sorun nedir?**
Şifre sıfırlama e-postasını gönderecek servisin anahtarı tanımlı değil. Anahtar
yokken kod, bağlantıyı **uygulama loguna yazan** bir yedeğe düşüyor.

**Neden acil?**
`POST /api/auth/forgot-password` **anonim ve herkese açık.** Saldırgan senin
e-postanı yazar → sıfırlama bağlantısı loga düşer → **logu görebilen herkes o
hesabı ele geçirir.** Render panelinde log görebilen herkes buna dâhil.

**Ne yapacaksın?**

Adım 1 — https://resend.com adresinden hesap aç, API anahtarı üret.
Adım 2 — Render → Environment → `Resend__ApiKey` olarak ekle.
Adım 3 — Yerelde de denemek istersen `.env` dosyasına ekle:

```
Resend__ApiKey=re_xxxxxxxxxxxx
Resend__Gonderen=Linguza <onboarding@resend.dev>
```

**Anahtarı hemen alamayacaksan:** KURAL-14 kodu, üretimde anahtar yokken sıfırlama
ucunu **503 ile kapatacak** şekilde yazılacak. Yani "çalışmayan özellik" olur,
"sızdıran özellik" olmaz. Bu senin onayınla yapılacak — istemiyorsan söyle.

---

## 2. 🔴 Üretim veritabanında mükerrer kayıt taraması (KURAL-15)

**Sorun nedir?**
KURAL-12'nin 7 tekillik kısıtı, uygulama açılışında `Database.Migrate()` ile
uygulanıyor. Üretimde tek bir mükerrer satır varsa migration düşer ve
**uygulama hiç açılmaz.**

**Ne yapacaksın?** Deploy'dan **önce** üretim veritabanında çalıştır
(sorgular `KURAL-15.md` içinde hazır). Satır dönerse temizlik SQL'i
faz 1'in `KURAL-12.md` adım 2'sinde — ama **önce yedek al.**

Yerelde 7 tabloda da 0 çıktı. Üretimi görmedim.

---

## 3. `reanalyze` paylaşılan analizi kim tazeleyebilsin? (KURAL-17)

**Sorun nedir?**
Okuma ekranındaki "yeniden analiz et" butonu, sayfa modundaki kitaplarda
`BookPages.SentencesJson` alanını **üzerine yazıyor**. `BookPage` global —
yani bir öğrencinin bastığı buton **bütün kullanıcıların gördüğü** çeviriyi
değiştiriyor. Bölüm modunda aynı buton hiçbir şeyi kalıcılaştırmıyor.

**Neden karar gerekiyor?** Bu bir hata mı, özellik mi — ürün sahibi bilir.

| Seçenek | Ne olur |
|---|---|
| **A** — Yalnızca öğretmen/yönetici tazeleyebilsin | Öğrenci mevcut analizi görür; bozuksa öğretmene bildirir ⭐ önerilen |
| **B** — Herkes tazeleyebilsin ama sonuç kişiye özel kaydedilsin | Şema değişikliği gerekir (sayfa analizi kullanıcı bazlı olur) |
| **C** — Şu an olduğu gibi kalsın, yalnızca maliyet sınırı sıkılaşsın | Paylaşılan yazma sürer |

**Söylemezsen A uygulanır.**

---

## 4. Token nerede dursun? (KURAL-13 sonrası)

**Sorun nedir?**
Token her iki istemcide `localStorage`'da. XSS ile çalınabilir. KURAL-11'in
nonce'lu CSP'si bu yüzeyi daralttı ama kapatmadı.

**Neden karar gerekiyor?**
Tamamen çözmek, kimliği **yalnızca HttpOnly çereze** taşımak demek. Bu:
- Önce KURAL-13'ün (CORS) kapanmasını gerektirir
- İstemci kodunda kayda değer değişiklik demektir
- `SameSite` ayarı yüzünden bazı gömme senaryolarını kırabilir

| Seçenek | Ne olur |
|---|---|
| **A** — Şimdilik kalsın, CSP'ye güven | Hiçbir şey değişmez; XSS riski kabul edilmiş olur ⭐ bu ölçekte savunulabilir |
| **B** — HttpOnly çereze taşı | Daha güvenli, ama iki istemcide de kimlik akışı yeniden yazılır |

**Söylemezsen A uygulanır** ve rapora "kabul edilmiş risk" diye yazılır.

---

## 5. KVKK / aydınlatma metni (KURAL-19)

**Sorun nedir?**
Sistem gerçek kişisel veri topluyor: e-posta, kullanıcı adı, okuma geçmişi,
taranan belge metinleri (OCR), hangi kelimeleri bilmediği. Aydınlatma metni yok,
açık rıza akışı yok, veri saklama politikası yayımlanmamış, silme talebi yolu yok.

**Neden karar gerekiyor?**
Bu teknik değil **hukuki** bir gerekliliktir ve metinleri kod yazamaz.
KURAL-19 teknik tarafı (silme ucu, dışa aktarma, saklama süreleri) kuracak;
metinleri sen sağlayacaksın.

**Ne yapacaksın?**
1. Aydınlatma metni ve gizlilik politikası hazırla (şablon yeterli değilse danış)
2. Hangi verinin ne kadar tutulacağına karar ver — KURAL-12'de teknik varsayılan
   kuruldu: aktivite 90 gün, çeviri önbelleği 365 gün, sıfırlama jetonu 7 gün
3. **`OcrRecords` için süre henüz YOK** — kaç gün tutulsun?

---

## 6. Devreden: `englishplatform.db` (faz 1, KURAL-12'den)

Dosya depodan çıkarıldı ve `.gitignore` artık `*.db` deseniyle uzantı bazlı
dışlıyor. Ama **dosya diskte duruyor** ve **git geçmişinde de var**.

```bash
sqlite3 EnglishReadingPlatform/englishplatform.db "SELECT Id, Username, Email, Role FROM Users;"
```

Hepsi test verisiyse sil. Gerçek bir e-posta varsa git geçmişi temizliği şart
(`git filter-repo`, önce `git bundle create --all` ile tam yedek).

Ayrıca kök dizinde PII taşıyan dört döküm var (`*.dump`, `neon_dump.sql`,
~3,5 MB). Depoda değiller ama iCloud ile eşitlenen bir klasördeler.

---

## 7. Devreden: canlı ortam doğrulamaları (faz 1, KURAL-11'den)

Kod yazıldı, **canlıda hiç doğrulanmadı**:

1. Yayındaki adrese `http://` ile git — `https://`'e yönlendiğini gör.
2. Render'ın eklediği `X-Forwarded-For` başlığının **en sağdaki** girdisi gerçek
   istemci IP'si mi? Değilse tüm kullanıcılar tek hız sınırı kovasını paylaşır.

KURAL-15 bu iki kontrolü tekrarlanabilir bir betiğe çevirecek.

---

## Özet — senin yapman gerekenler, sırayla

| # | İş | Ne zaman | Süre |
|---|---|---|---|
| 1 | Resend API anahtarı al ve Render'a ekle | KURAL-14'ten önce | 10 dk |
| 2 | Üretimde mükerrer kayıt taraması | Deploy'dan önce | 5 dk |
| 3 | `reanalyze` kararı: A / B / C | KURAL-17'den önce | düşünme |
| 4 | Token saklama kararı: A / B | KURAL-13 sonrası | düşünme |
| 5 | KVKK metinleri ve `OcrRecords` saklama süresi | KURAL-19'dan önce | hukuk + karar |
| 6 | `englishplatform.db` içeriğine bak, karar ver | ne zaman istersen | 3 dk |
| 7 | Canlıda HTTPS ve IP doğrulaması | KURAL-15 sonrası | 5 dk |

**Karar vermediklerini boş bırakabilirsin** — her kural dosyasında bir varsayılan
yazıyor, karar gelmezse o uygulanır ve rapora "varsayılan seçildi" diye yazılır.

---

## Her oturuma yapıştıracağın prompt

```
guvenlik-kurallari-faz2/00-BASLA-BURADAN.md ve guvenlik-kurallari-faz2/KURAL-13.md dosyalarını oku.
Bu kuralı uygula: önce merkezî çözümü kur, sonra envanterdeki noktaları taşı, sonra otomatik kapıyı ekle.
Bitti kriterindeki komutları çalıştır, ham çıktılarını göster.
Düzeltmeyi geri alıp testin kırmızıya döndüğünü de kanıtla.
```

Kural numarasını değiştirerek 7 oturum boyunca aynı prompt kullanılır.

---

## İlerleme takibi

Her kural bitince bu tabloyu güncelle (kural oturumunun son işi budur):

| # | Kural | Durum | Commit | Tarih |
|---|---|---|---|---|
| 13 | Köken ve kaynak denetimi | ⬜ Başlamadı | — | — |
| 14 | Eksik yapılandırmada kapalı kal | ⬜ Başlamadı | — | — |
| 15 | Dağıtım kapısı | ⬜ Başlamadı | — | — |
| 16 | Hesap yaşam döngüsü | ⬜ Başlamadı | — | — |
| 17 | Maliyetli iş ve paylaşılan yazma | ⬜ Başlamadı | — | — |
| 18 | Tedarik zinciri ve kripto sertleştirme | ⬜ Başlamadı | — | — |
| 19 | Kişisel veri yaşam döngüsü | ⬜ Başlamadı | — | — |

Durum işaretleri: ⬜ Başlamadı · 🟨 Kısmen (neyin kaldığı yazılacak) · ✅ Kanıtlanarak kapandı

---

## Faz 1 ilerleme tablosu (referans — hepsi kapalı)

| # | Kural | Durum |
|---|---|---|
| 01–12 | Kanıt altyapısı → Veri bütünlüğü | ✅ 12/12 kanıtlanarak kapandı (`2bd12bc`) |

Ayrıntı: [`../guvenlik-kurallari/00-BASLA-BURADAN.md`](../guvenlik-kurallari/00-BASLA-BURADAN.md)
