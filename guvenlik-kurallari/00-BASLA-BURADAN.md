# 00 — BAŞLA BURADAN

> **Bu dosyayı her güvenlik oturumunun başında oku.**
> Sonra sana verilen `KURAL-NN.md` dosyasını oku ve **yalnızca o kuralı** uygula.

---

## Bu klasör ne?

Linguza projesindeki güvenlik açıkları tek tek yamanmayacak. Her açık bir **sınıfa**
aittir ve o sınıfın kod tabanında **birden fazla noktası** vardır. Tek bir route'u
düzeltmek, aynı hatanın diğer 20 noktada durmasını engellemez.

Bu yüzden her kural şu sırayla uygulanır:

```
1. MERKEZÎ ÇÖZÜM kurulur      →  tek bir yerde, herkesin kullanacağı mekanizma
2. ENVANTERDEKİ NOKTALAR taşınır →  mevcut N ihlal merkezî çözüme bağlanır
3. OTOMATİK KAPI eklenir       →  yeni ihlal eklenirse build kırılır
4. BİTTİ KRİTERİ çalıştırılır  →  çıktısı 0 olmalı, ham çıktı rapora konur
5. MUTASYON yapılır            →  düzeltme geri alınır, test KIRMIZI görülür, geri konur
```

Adım atlanamaz. Özellikle 3 ve 5 atlanırsa kural **kapanmış sayılmaz.**

---

## Her kural dosyasında ne var

| Bölüm | Ne işe yarar |
|---|---|
| **Kural metni** | Emir kipinde tek cümle — uygulanacak olan kuraldır |
| **Envanter** | O sınıfın kod tabanındaki nokta sayısı ve tam konumları (gerçek `grep` çıktısıyla ölçüldü) |
| **Merkezî uygulama** | Kopyala-yapıştır kod — tek yerde kurulacak mekanizma |
| **Otomatik kapı** | Yeni ihlal eklenince build'i kıran test / guard script / CI adımı |
| **Bitti kriteri** | Komutla doğrulanabilir; **çıktısı sıfır olmalı** |
| **Geçiş planı** | Envanterdeki N örneğin merkezî çözüme nasıl taşınacağı |
| **Tuzaklar** | Bu kuralı uygularken yapılan tipik hatalar |

---

## Pazarlıksız maddeler

1. **Önce merkezî çözüm, sonra çağrı yerleri.**
   Tek tek route yamalamayın — altı aydır kaybedilen tam olarak bu.

2. **Bitti kriteri çalıştırılmadan "tamam" yazmayın.**
   Kriter bir cümle değil, çıktısı `0` olması gereken bir komuttur.

3. **Mutasyon kontrolü zorunlu.**
   Düzeltmeyi geri alın, testin **kırmızı** olduğunu görün, sonra geri koyun.
   Kırmızıya dönmeyen test, test değildir.

4. **Gerçek veritabanına yazmayın.**
   Şema klonu kullanın (`englishreadingdb_test`); yıkıcı işlem öncesi yedek alın.

5. **Bir kuralı bitirmeden diğerine geçmeyin.**
   Yarım bırakılan kural, kapatılmış sayılmaz.

6. **Kapsayamadığınızı yazın.**
   "Şunu yapamadım çünkü…" kabul edilir; sessizce atlamak edilmez.

---

## Bitirince ne teslim edilecek

Her kural için **üç başlık, ayrı ayrı**:

### 1. Kanıtlanarak kapandı
Bitti kriterinin **ham komut çıktısıyla**. Özet değil, terminalden kopyalanmış çıktı.

```
$ bash scripts/guard/run-all.sh
[02] sizinti-taramasi ......... 0 ihlal  ✓
...
TOPLAM İHLAL: 0
$ echo $?
0
```

### 2. Kapanmadı
Ne kaldı, neden kaldı, ne gerekiyor.

### 3. İnsan müdahalesi gerekiyor
Kodun yapamayacağı adımlar (anahtar iptali, DNS kaydı, sunucu ayarı, ürün kararı).

**Ek olarak:** değiştirilen dosya listesi + commit hash'i.

```bash
git log -1 --format='%H %s' && git diff --stat HEAD~1
```

---

## Kural sırası ve bağımlılıklar

Sıra keyfî değil. Her kural bir öncekinin altyapısını kullanır.

| # | Kural | Bağımlı olduğu | Neden bu sırada |
|---|---|---|---|
| **01** | Kanıt altyapısı | — | Test projesi ve guard mekanizması yoksa **hiçbir kural kanıtlanamaz** |
| **02** | Sırlar koda girmez | 01 | Sızmış JWT anahtarı tüm yetkilendirmeyi geçersiz kılar — önce bu |
| **03** | Varsayılan reddet (yetkilendirme) | 01 | Açık veri sızıntısı var, tek satırla kapanıyor |
| **04** | Token yaşam döngüsü | 01, 03 | Çıkış yapılan token hâlâ geçerli |
| **05** | Girdi doğrulama | 01 | Normal kullanımda 500 üretiyor |
| **06** | Hata ve log hijyeni | 01, 05 | İç detay sızıntısı; 05'in 400'leri buraya bağlanır |
| **07** | Kaynak tüketimi / rate limit | 01, 06 | Bellek sızıntısı + korumasız uçlar |
| **08** | Veri minimizasyonu | 01, 03 | Yetki doğru olsa da fazla veri dönüyor |
| **09** | Kimlik doğrulama sertleştirmesi | 01, 05, 07 | Şifre politikası, sıfırlama, hesap bazlı limit |
| **10** | Dosya yükleme | 01, 05, 06 | İçerik doğrulaması yok |
| **11** | Tarayıcı tarafı savunma | 01 | 0 güvenlik başlığı, CDN'den SRI'sız script |
| **12** | Veri bütünlüğü ve kalıntı | 01, 02 | Unique index eksikleri, repoda duran SQLite |

---

## Ortak zemin — her oturumda geçerli

### Ortam bilgileri (bu makinede doğrulandı, 2026-08-20)

| | Değer |
|---|---|
| .NET SDK | `10.0.302` (`/opt/homebrew/bin/dotnet`) |
| Kurulu runtime | **yalnızca** `Microsoft.NETCore.App 10.0.10` ve `Microsoft.AspNetCore.App 10.0.10` |
| Proje hedefi | `net8.0` |
| Backend derlemesi | ✅ Çalışıyor — `dotnet build` → 0 uyarı, 0 hata, ~24 sn |

> ✅ **GÜNCELLENDİ (2026-08-22, KURAL-01):** Bu makinede artık .NET 8 runtime (8.0.17)
> kurulu — `dotnet_sdk/shared/` içinde zaten duruyordu, aktif dotnet köküne kopyalandı.
> Testler hedef çatıda (net8.0) koşuyor; CI ve Dockerfile ile aynı runtime.
>
> 🔴 **`<RollForward>LatestMajor</RollForward>` KULLANMAYIN.** LatestMajor, net8.0 runtime
> kurulu OLSA BİLE her zaman en yüksek majoru (net10) seçer. O durumda NuGet'ten gelen
> TestHost 8.x ile paylaşılan çatıdan gelen ASP.NET Core 10 JSON biçimlendiricisi çakışır
> ve **gövde döndüren her uç 500 verir**:
> `The PipeWriter 'ResponseBodyPipeWriter' does not implement PipeWriter.UnflushedBytes`
> Doğru değer **`Major`**'dur: net8.0 varsa onu kullanır, yoksa üst majora düşer.
> `scripts/guard/01-altyapi.sh` bunu ve net8.0 runtime'ın varlığını denetler.

> ⚠️ **`dotnet_sdk/dotnet` binary'si yok.** `start-dev.sh` içindeki
> `../dotnet_sdk/dotnet watch run` komutu çalışmaz. Sistemdeki `dotnet` kullanın.

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
| net8.0 runtime kayıpsa geri yükle | `bash scripts/dev/net8-runtime-kur.sh` |

### Test veritabanı (Pazarlıksız madde 4)

Testler **asla** `englishreadingdb`'ye yazmaz. `englishreadingdb_test` kullanılır:

```bash
bash scripts/dev/test-rolu-kur.sh
```

> 🔴 **Veritabanını elle `appuser` ile OLUŞTURMAYIN.** Testler `appuser` ile değil,
> KURAL-02'de açılan ayrı `linguza_test` rolüyle bağlanır. `appuser` ile elle
> `CREATE DATABASE englishreadingdb_test` yaparsanız şemanın sahibi yanlış rol olur ve
> her test `42501: permission denied for schema public` ile düşer. Yukarıdaki betik
> rolü ve şifresini (`.env.test.local`) doğru kurar; veritabanını testler kendi yaratır.

Şema `Database.Migrate()` ile üretilir — yani **gerçek şemanın klonu**, InMemory
sağlayıcı değil. Bu bilinçli bir tercihtir: InMemory sağlayıcı `varchar(n)` taşmasını
yakalamaz ve KURAL-05'in mutasyon testi anlamsızlaşır.

### Yedek alma (yıkıcı işlem öncesi)

```bash
docker exec english_postgres pg_dump -U appuser englishreadingdb > \
  "yedek-$(date +%Y%m%d-%H%M%S).sql"
ls -la yedek-*.sql        # yedeğin alındığını çıktıyla göster
```

> Yedek dosyası PII içerir. `.gitignore`'a `yedek-*.sql` eklendiğini doğrulayın.

---

## Genel bağlam — proje neye benziyor

Ayrıntı için `docs/` klasörü. Güvenlik açısından bilinmesi şart olan üç şey:

1. **Üç istemci, tek API.** `frontend` (:3000, Next 16), `admin-panel` (:3001, Next 14),
   backend (:5001, ASP.NET Core 8). Her ikisi de token'ı `localStorage`'da tutuyor.

2. **Kimlik iki yoldan taşınıyor.** `Authorization: Bearer` başlığı **ve** `jwt_token`
   HttpOnly cookie. `Program.cs` şu an cookie'yi başlığın **önüne** koyuyor — bu KURAL-04'te
   düzeltilecek.

3. **`TokenSecurityService` her şeyi bellekte tutuyor.** Token iptali ve rate limit
   süreç belleğinde; yeniden başlatmada kayboluyor, çoklu replikada hiç çalışmıyor.
   KURAL-04 ve KURAL-07 bunu ele alıyor.

---

# 🧍 İNSAN KARARI GEREKEN İŞLER

> Bu bölüm kasten en sona konuldu. Aşağıdakiler **kodun yapamayacağı** işlerdir.
> Sen (Alihan) yapacaksın. Her biri sade dille, adım adım anlatıldı.
> Hangi kuralın bunu gerektirdiği parantez içinde yazıyor.

---

## 1. ✅ YAPILDI (2026-08-23) — JWT anahtarını değiştir (KURAL-02)

**Sorun nedir?**
JWT anahtarı, kullanıcıların "ben giriş yapmış falanca kişiyim" diyen dijital kimlik
kartlarını imzalayan mühürdür. Bu mühür şu an `appsettings.json` dosyasının içinde
düz metin olarak duruyor ve GitHub'a gitmiş durumda.

**Neden önemli?**
Bu mührü gören biri **kendine sahte bir admin kimlik kartı basabilir.** Sunucu onu
gerçek sanır. Şifre kırmasına gerek yok, giriş ekranını görmesine bile gerek yok.
Yani projedeki bütün yetki kontrolleri bu tek dosya yüzünden anlamsız hale geliyor.

**Ne yapacaksın?**

Adım 1 — Yeni bir anahtar üret. Terminale şunu yaz:

```bash
openssl rand -base64 48
```

Çıkan uzun karakter dizisini kopyala. Örnek görüntüsü:
`k7Jx9mQ2pL...` (seninki farklı olacak)

Adım 2 — Proje kökündeki `.env` dosyasını aç (yoksa `cp .env.example .env` ile oluştur),
şu satırı bul ve yeni anahtarınla değiştir:

```
JWT_KEY=<buraya yapıştır>
```

Adım 3 — Eğer proje bir sunucuda çalışıyorsa, oradaki ortam değişkenini de değiştir.

**Ne olacak?**
Anahtarı değiştirdiğin anda **herkesin oturumu kapanır.** Bu istenen davranıştır —
eski anahtarla basılmış sahte kimlikler de dahil hepsi geçersiz olur. Kullanıcılar
tekrar giriş yapar, o kadar.

---

## 2. ✅ YAPILDI (2026-08-23) — Admin şifresini değiştir (KURAL-02)

> Yeni yönetici: `alihanfndk35@gmail.com` (Id=33, kullanıcı adı `alihanfndk35`).
> Şifre `.env` → `Seed__AdminPassword`. Eski `admin@platform.com` hesabı
> silinmedi (verisi vardı) ama şifresi kimsenin bilmediği bir değere kilitlendi.


**Sorun nedir?**
Sistem ilk kurulduğunda otomatik olarak bir yönetici hesabı açıyor:
`admin@platform.com` / `Admin@2026!`. Bu şifre kaynak kodun içinde yazıyor
(`Data/AppDbContext.cs` dosyasında).

**Neden önemli?**
Projeyi gören herkes bu şifreyi biliyor. Site yayına girdiği anda birisi bu bilgiyle
yönetici paneline girebilir.

**Ne yapacaksın?**

Adım 1 — Yönetici paneline gir: http://localhost:3001
Adım 2 — Şu an şifre değiştirme ekranı **yok** (KURAL-09'da eklenecek).
O yüzden şimdilik veritabanından değiştireceksin. Önce yeni şifrenin hash'ini üret —
bunu sana kod tarafı hazırlayacak. KURAL-02 oturumunda "admin şifresi değiştirme
komutu üret" de, sana tek satırlık komut verecek.

Adım 3 — KURAL-09 tamamlandıktan sonra normal arayüzden değiştirebileceksin.

**Karar vermen gereken:** Yeni admin e-postası ne olsun? `admin@platform.com` mu kalsın,
yoksa kendi e-postan mı olsun?

---

## 3. ✅ YAPILDI (2026-08-23) — Veritabanı şifresini değiştir (KURAL-02)

> `ALTER USER appuser` çalıştırıldı. Dışarıdan eski şifreyle bağlantı denemesi
> `FATAL: password authentication failed` ile reddediliyor.


**Sorun nedir?**
PostgreSQL şifresi (`StrongPass@2026!`) hem `appsettings.json` hem `.env.example` hem
`docker-compose.yml` içinde açıkça yazıyor.

**Neden önemli?**
Veritabanı dışarıya açıksa (5432 portu) bu şifreyle doğrudan bağlanılıp bütün kullanıcı
verisi çekilebilir.

**Ne yapacaksın?**

Adım 1 — Yeni şifre üret:

```bash
openssl rand -base64 24
```

Adım 2 — `.env` dosyasında `POSTGRES_PASSWORD=` satırını değiştir.

Adım 3 — Veritabanı zaten çalışıyorsa şifresini de güncellemen gerekir:

```bash
docker exec english_postgres psql -U appuser -d postgres \
  -c "ALTER USER appuser WITH PASSWORD 'yeni-şifre-buraya';"
```

Adım 4 — Konteynerleri yeniden başlat: `docker compose down && docker compose up -d`

**Not:** Bunu yapmadan önce yedek al (yukarıdaki "Yedek alma" bölümü).

---

## 4. ✅ KONTROL EDİLDİ (2026-08-23) — temiz, işlem gerekmiyor — Groq API anahtarı (KURAL-02)

> `git log -p --all -S "gsk_"` boş döndü: anahtar git geçmişine hiç girmemiş.


**Sorun nedir?**
`GROQ_API_KEY` yapay zekâ çeviri servisinin anahtarı. Şu an `appsettings.json` içinde
boş görünüyor — yani muhtemelen sadece `.env` dosyasında var, bu iyi.

**Ne yapacaksın?**
Sadece kontrol et: anahtarın yanlışlıkla bir commit'e girip girmediğine bak.

```bash
git log -p --all -S "gsk_" -- . | head -40
```

Çıktı **boşsa** sorun yok, bu maddeyi geç.
Çıktıda anahtar görünüyorsa: https://console.groq.com adresinden o anahtarı **iptal et**
ve yenisini üret. Anahtar bir kez git geçmişine girdiyse "silmek" yetmez, iptal etmek gerekir.

---

## 5. 🟨 REPO TARAFI KAPANDI (2026-09-01) — disk ve geçmiş **hâlâ sende** (KURAL-12)

> **Kodun yaptığı:** Dosya sürüm kontrolünden çıkarıldı ve `.gitignore` artık
> tek dosya adını değil **`*.db` / `*.sqlite` / `*.sqlite3`** desenini dışlıyor —
> bir sonraki SQLite dosyası başka bir adla gelse de repoya giremez.
> `scripts/guard/12-butunluk.sh` bunu her CI koşusunda denetliyor.
>
> **Kodun YAPMADIĞI (bilinçli):** Dosya `EnglishReadingPlatform/englishplatform.db`
> yolunda **diskte duruyor** ve **git geçmişinde** de duruyor. İkisi de geri
> alınamaz işlemler ve bu dosyanın 5 e-postasının gerçek insanlara mı ait
> olduğunu yalnızca sen bilirsin. Aşağıdaki adımlar hâlâ senin.

## 5-eski. `englishplatform.db` dosyasına karar ver (KURAL-12)

**Sorun nedir?**
Projede `EnglishReadingPlatform/englishplatform.db` diye eski bir SQLite dosyası var.
İçini denetledim: **5 kullanıcı kaydı, şifre hash'leri, 3 OCR kaydı, 7 okuma ilerlemesi,
1 grup** duruyor. Kullanıcı adları `testadmin`, `testuser`, `demokullanici`, `test_user`,
`testuser123`.

**Neden önemli?**
Bu dosya git ile takip ediliyor, yani repoyu klonlayan herkese gidiyor. İsimlerden
test hesapları gibi duruyor ama **şifre hash'leri gerçek** ve e-posta adresleri var.
Proje artık PostgreSQL kullanıyor, bu dosya hiçbir işe yaramıyor.

**Ne yapacaksın?**

Adım 1 — İçindekilerin gerçekten sadece test verisi olduğunu **sen** doğrula:

```bash
sqlite3 EnglishReadingPlatform/englishplatform.db "SELECT Id, Username, Email, Role FROM Users;"
```

Adım 2 — Karar ver:
- **Hepsi test verisiyse** → dosyayı sil, git geçmişinden de temizle (KURAL-12 komutu verecek)
- **Gerçek bir kullanıcının e-postası varsa** → o kişiye haber verilmesi gerekebilir,
  ayrıca git geçmişi temizliği zorunlu hale gelir

**Bu senin kararın çünkü** bu hesapların gerçek insanlara mı ait olduğunu sadece sen bilirsin.

---

## 6. ⚠️ VARSAYILAN UYGULANDI (2026-08-27): **A** — onayını bekliyor (KURAL-08)

> Karar gelmediği için dosyanın kendi kuralı gereği **A uygulandı**: grup detayında
> yalnızca gruba ATANMIŞ kitapların ilerleme ve quiz kayıtları görünüyor; üyenin
> kişisel okumaları gizli. Ayrıca davet kodu artık yalnızca grup sahibine dönüyor.
> B veya C istiyorsan tek değişecek yer `Authorization/GrupKapsami.cs`.

## 6. Grup verisi gizliliği — ürün kararı (KURAL-08)

**Sorun nedir?**
Şu an bir gruba katılan **herkes**, diğer bütün üyelerin okuma geçmişini görüyor:
hangi kitabı okuduğu, yüzde kaçında olduğu, quiz notları. Üstelik **sadece o gruba
atanan kitapları değil, kişinin okuduğu her şeyi.**

**Neden karar gerekiyor?**
Bu bir hata mı, özellik mi — buna ürün sahibi karar verir. Üç seçenek var:

| Seçenek | Ne olur |
|---|---|
| **A** — Sadece gruba atanan kitaplar görünsün | Öğretmen ödevi takip eder, öğrencinin kişisel okumaları gizli kalır ⭐ önerilen |
| **B** — Sadece grup yöneticisi görsün, üyeler birbirini görmesin | Daha gizli, ama "sınıf sıralaması" gibi özellikler yapılamaz |
| **C** — Şu an olduğu gibi kalsın | Hiçbir şey değişmez, ama öğrenciler birbirinin verisini görür |

**Ne yapacaksın?** KURAL-08 oturumunda hangisini istediğini söyle. Söylemezsen **A**
uygulanacak.

---

## 7. ✅ KARAR VERİLDİ (2026-08-29): **A — Resend ile e-posta servisi** (KURAL-09)

> Kullanıcı kararı: **A** seçildi, servis olarak **Resend** kullanılacak.
> Kapsam: e-posta doğrulama + şifre sıfırlama + **şifre gücü zorlaması** (kullanıcı ayrıca istedi).
>
> API anahtarı henüz alınmadı ("Resend kısmına bakacağız"). Bu yüzden kod
> `IEpostaGonderici` arayüzü ardına yazıldı: anahtar boşken geliştirme kipinde
> bağlantı loglanır, e-posta gönderilmez. Anahtar `.env` → `Resend__ApiKey`
> satırına eklendiği an gerçek gönderime geçer — kod değişikliği gerekmez.

## 7-eski. E-posta doğrulaması — ürün kararı (KURAL-09)

**Sorun nedir?**
Şu an kayıt olurken e-posta adresi doğrulanmıyor. `asdf@asdf.com` yazan biri hemen
hesap açabiliyor.

**Neden karar gerekiyor?**
E-posta doğrulaması eklemek, **e-posta gönderebilen bir servis** kurmayı gerektirir
(SendGrid, Resend, Amazon SES gibi — çoğunun ücretsiz kotası var). Bu bir maliyet ve
kurulum işidir.

Ayrıca **şifre sıfırlama** özelliği de aynı altyapıyı gerektiriyor. Şu an şifresini
unutan kullanıcı hesabına bir daha giremiyor — bu gerçek bir sorun.

**Ne yapacaksın?** Karar ver:

| Seçenek | Ne gerekir |
|---|---|
| **A** — E-posta servisi kur, doğrulama + şifre sıfırlama gelsin | Bir servise kaydol, API anahtarı al ⭐ önerilen |
| **B** — Şimdilik sadece şifre değiştirme (giriş yapmışken) | E-posta gerekmez, ama şifre unutanlar kilitli kalır |
| **C** — İkisi de olmasın | Mevcut durum sürer |

Seçtiğin servisin API anahtarını `.env` dosyasına eklemen gerekecek.

---

## 8. ⚠️ VARSAYIMLA UYGULANDI (2026-09-01) — onayını bekliyor (KURAL-11)

> Karar gelmediği için git geçmişindeki dağıtım izlerine bakıldı
> (`fix: remove output standalone breaking Vercel builds`,
> `fix: commit all missing backend files causing build failure on Render`)
> ve **"TLS'i platform sonlandırıyor"** varsayımıyla ilerlendi:
> Render (backend) / Vercel (istemciler).
>
> Buna göre kod şöyle: üretimde `UseForwardedHeaders` (yalnızca `X-Forwarded-Proto` ve
> `X-Forwarded-For`, `ForwardLimit = 1`) → `UseHsts()` (30 gün, preload KAPALI) →
> `UseHttpsRedirection()` (hedef port 443 **açıkça** verildi).
> Geliştirmede üçü de kapalı.
>
> **Senden istenen iki doğrulama** (kod yapamaz, canlı ortam gerekir):
> 1. Yayındaki adrese `http://` ile git — `https://`'e yönlendiğini gör.
> 2. Hız sınırlarının doğru IP'ye bağlandığını doğrula: Render'ın eklediği
>    `X-Forwarded-For` değerinin EN SAĞDAKİ girdisi gerçek istemci IP'si mi?
>    Değilse (ör. iki proxy katmanı) tüm kullanıcılar tek kovayı paylaşır.
>
> Kendi sunucunda (VPS) yayınlayacaksan söyle: `KnownProxies` daraltılmalı.

## 8-eski. HTTPS'i kim sonlandıracak? (KURAL-11)

**Sorun nedir?**
Uygulama şu an HTTPS zorlamıyor. Kodda `UseHttpsRedirection()` yok. Bu, "önünde
HTTPS'i halleden bir katman var" varsayımıyla yazılmış.

**Neden önemli?**
Eğer o katman yoksa, kullanıcı şifresi ve token'ı **düz metin** olarak ağda gidiyor.
Aynı wifi'daki biri okuyabilir. Ayrıca `Secure` işaretli cookie'ler HTTP üzerinden
hiç gönderilmez, yani cookie tabanlı giriş sessizce çalışmaz.

**Ne yapacaksın?**
Projeyi nerede yayınlayacağını söyle:

| Yer | HTTPS durumu |
|---|---|
| Cloudflare / Vercel / Railway arkasında | Otomatik hallolur ✅ bir şey yapman gerekmez |
| Kendi sunucun (VPS) | Nginx veya Caddy kurup sertifika alman gerekir (Let's Encrypt, ücretsiz) |
| Henüz yayında değil | Şimdilik geç, yayına çıkmadan önce dön |

KURAL-11 oturumunda bunu söyle; kod tarafı buna göre ayarlanacak.

---

## 9. Git geçmişi temizliği (KURAL-02 ve KURAL-12)

**Sorun nedir?**
Sırlar ve `englishplatform.db` dosyası sadece bugünkü kodda değil, **git geçmişinde**
de duruyor. Dosyayı silsen bile eski commit'lere bakan biri görebilir.

**Neden karar gerekiyor?**
Git geçmişini temizlemek, **tüm commit hash'lerini değiştirir**. Bu:
- Repoyu klonlamış herkesin yeniden klonlaması gerekir
- Açık pull request'ler bozulur
- Geri alınamaz bir işlemdir

**Ne yapacaksın?**
Önce şunu sor kendine: **bu repo başka kimseyle paylaşıldı mı?**

| Durum | Yapılacak |
|---|---|
| Repo sadece bende, GitHub'a hiç gitmedi | Geçmiş temizliği **gereksiz**, sadece dosyayı sil ✅ |
| GitHub'da ama private, kimse fork'lamadı | Temizlik iyi olur ama şart değil — anahtarları değiştirmen yeterli |
| Public veya başkaları klonladı | Temizlik **şart**, ayrıca anahtarları mutlaka iptal et |

Karar verdiğinde KURAL-02 oturumunda söyle. Temizlik gerekiyorsa `git filter-repo`
komutlarını sana verecek — ama **önce tam yedek alacak.**

---

## 10. ✅ KARAR VERİLDİ (2026-08-27): **A — tek sunucu, bellekte kalsın** (KURAL-04 ve KURAL-07)

> Kullanıcı kararı: şimdilik tek sunucu çalışacak, Redis eklenmeyecek.
> Bilinen sınır: sunucu yeniden başlarsa çıkışlar ve hız sınırı sayaçları sıfırlanır.
> İkinci bir replika eklendiği gün bu karar yeniden ele alınmalı — kod arayüz
> ardına yazıldığı için geçiş tek kayıt satırıdır.
>
> Ayrıca sorulan NAT sorusu: **okul/kurum NAT'ı arkasından toplu anonim kullanım
> beklenmiyor** → GlobalLimiter tabanı (300/dk) olduğu gibi bırakıldı.

**Sorun nedir?**
Token iptal listesi ve rate limit sayaçları şu an **sunucunun belleğinde** duruyor.

**Neden karar gerekiyor?**
Eğer ileride "trafik arttı, iki sunucu çalıştıralım" dersen, bu mekanizmalar bozulur:
1 numaralı sunucuda çıkış yapan kişi, 2 numaralı sunucuda hâlâ giriş yapmış görünür.

Çözüm Redis eklemek — ama bu **yeni bir servis** demek (bir konteyner daha, biraz daha
karmaşıklık).

**Ne yapacaksın?** Karar ver:

| Seçenek | Ne olur |
|---|---|
| **A** — Şimdilik tek sunucu, bellekte kalsın | Hiçbir şey eklemezsin. Sadece "sunucu yeniden başlarsa çıkışlar sıfırlanır" bilinsin ⭐ şu an için yeterli |
| **B** — Redis ekleyelim | `docker-compose.yml`'e bir servis daha eklenir, kod arayüz üzerinden çalışır |

KURAL-04 kodu **arayüz (interface) üzerinden** yazılacak; yani A'yı seçsen bile ileride
B'ye geçmek tek satırlık değişiklik olacak. Bu yüzden şimdilik A'yı seçmen mantıklı.

---

## Özet — senin yapman gerekenler, sırayla

| # | İş | Ne zaman | Süre |
|---|---|---|---|
| 1 | JWT anahtarı üret ve `.env`'e yaz | KURAL-02'den önce | 2 dk |
| 2 | Veritabanı şifresini değiştir | KURAL-02'den önce | 5 dk |
| 3 | Groq anahtarı git'e girmiş mi kontrol et | KURAL-02 sırasında | 1 dk |
| 4 | `englishplatform.db` içeriğine bak, karar ver | KURAL-12'den önce | 3 dk |
| 5 | Git geçmişi temizliği gerekli mi? Karar ver | KURAL-02 sırasında | düşünme |
| 6 | Grup gizliliği: A/B/C hangisi? | KURAL-08'den önce | düşünme |
| 7 | ✅ E-posta servisi: **A — Resend** seçildi (2026-08-29) | — | bitti |
| 8 | ⚠️ HTTPS: **Render/Vercel varsayıldı**, kod ona göre yazıldı — canlıda doğrula | KURAL-11 sonrası | 5 dk |
| 9 | Redis: A mı B mi? | KURAL-04'ten önce | düşünme |
| 10 | Admin şifresini değiştir | KURAL-02 veya KURAL-09 | 2 dk |

**Karar vermediklerini boş bırakabilirsin** — her kural dosyasında bir varsayılan
seçenek yazıyor, karar gelmezse o uygulanır ve rapora "varsayılan seçildi" diye yazılır.

---

## Her oturuma yapıştıracağın prompt

```
guvenlik-kurallari/00-BASLA-BURADAN.md ve guvenlik-kurallari/KURAL-01.md dosyalarını oku.
Bu kuralı uygula: önce merkezî çözümü kur, sonra envanterdeki noktaları taşı, sonra otomatik kapıyı ekle.
Bitti kriterindeki komutları çalıştır, ham çıktılarını göster.
Düzeltmeyi geri alıp testin kırmızıya döndüğünü de kanıtla.
```

Kural numarasını değiştirerek 12 oturum boyunca aynı prompt kullanılır.

---

## İlerleme takibi

Her kural bitince bu tabloyu güncelle (kural oturumunun son işi budur):

| # | Kural | Durum | Commit | Tarih |
|---|---|---|---|---|
| 01 | Kanıt altyapısı | ✅ Kanıtlanarak kapandı | `7b9a731` | 2026-08-22 |
| 02 | Sırlar koda girmez | ✅ Kanıtlanarak kapandı — anahtarlar döndürüldü, canlıda doğrulandı | `7b9a731` | 2026-08-23 |
| 03 | Varsayılan reddet | ✅ Kanıtlanarak kapandı — FallbackPolicy + sözleşme testi | `7b9a731` | 2026-08-23 |
| 04 | Token yaşam döngüsü | ✅ Kanıtlanarak kapandı — ITokenIptalDeposu + 18 test + 5 mutasyon; kırılgan temizlik testi KURAL-05'te düzeltildi (20/20 yeşil) | `7b9a731` | 2026-08-24 |
| 05 | Girdi doğrulama | ✅ Kanıtlanarak kapandı — Validation/ + 56 test + 17 kapı + 20 mutasyon; taksonomi tek kaynağa indi (3 kopya → 1), rota/sorgu/claim/gövde/koleksiyon sınırları dahil | `7b9a731` | 2026-08-24 |
| 06 | Hata ve log hijyeni | ✅ Kanıtlanarak kapandı — merkezî middleware + KullaniciHatasi + GuvenliLog; 24 envanter noktası kapandı (Console.WriteLine 18→0, ex.Message 5→0), 15 test + 20 kapı + 9 mutasyon; arayüz uyarısı da eklendi ve tarayıcıda görsel olarak doğrulandı. Mutasyon, ölçmeyen bir testi de ortaya çıkardı (JSON non-ASCII kaçırma) — düzeltildi | `7b9a731` | 2026-08-25 |
| 07 | Kaynak tüketimi | ✅ Kanıtlanarak kapandı — CANLI UYGULAMADA DA DOĞRULANDI (2026-08-27: Docker imajı güncel kodla derlendi, 6 akış uçtan uca geçti, 429 uyarısı arayüzde göründü). yerleşik RateLimiter + HesapSayaci + AgirIsKapisi; elle yazılan sayaç servisi SİLİNDİ (bellek sızıntısı tasarım gereği kapandı), 22 uç politikaya bağlandı (16'sı yeni), 16 test + 18 kapı + 7 mutasyon. Dış API'lere zaman aşımı (5 dk → 60 sn) ve yanıt boyutu sınırı eklendi | `7b9a731` | 2026-08-25 |
| 08 | Veri minimizasyonu | ✅ Kanıtlanarak kapandı — Contracts/Yanitlar.cs (10 DTO) + GrupKapsami; grup kapsam filtresi (ilerleme VE quiz), davet kodu yalnızca sahibe, 5 entity dönüşü DTO'ya taşındı, Include 27→13; 13 test + 9 kapı + 4 mutasyon. Aşırı çekim de kapandı: grup sorgusu artık PasswordHash'i belleğe hiç almıyor. Kardeş yol: /api/admin/groups davet kodunu da bırakmıştı, kaldırıldı. **2026-08-29 yeniden doğrulandı:** 163/163 test, tüm kapılar 0 ihlal, 3 mutasyonun hepsi kırmızıya döndü, iki frontend de tsc'den 0 hatayla geçti | `7b9a731` | 2026-08-27 · 2026-08-29 |
| 09 | Kimlik doğrulama sertleştirmesi | ✅ Kanıtlanarak kapandı — SifrePolitikasi (10 kar., 4 sınıftan 3, yaygın liste, kullanıcı adı/e-posta benzerliği) + SifreSifirlamaJetonu (SHA-256, tek kullanımlık, 30 dk) + IEpostaGondericisi/Resend; 3 yeni uç (change/forgot/reset), kayıt enumerasyonu kapatıldı, girişte zamanlama eşitleyici; şifre değişimi VE sıfırlaması oturumları sonlandırıyor. 23 test + 11 kapı + 4 mutasyon. Mevcut kullanıcılar: **B** (yeni şifrelerde geçerli). **Frontend ekranları yapılmadı** (kural kapsamı dışı) | commit bekliyor | 2026-08-29 |
| 10 | Dosya yükleme | ✅ Kanıtlanarak kapandı — Files/DosyaDogrulayici.cs (sihirli bayt + zip-bomb + 500 sayfa + 60 sn bütçe); sayfa başına yeniden açan API SİLİNDİ (O(n²) kalktı), her iki yükleme ucu merkeze bağlandı, kitap artık metin çıkarıldıktan SONRA yaratılıyor (yetim kayıt tasarımdan kalktı). 26 test + 9 kapı + 5 mutasyon. Mutasyon, kapının YORUMLA kandırılabildiğini ve iki testin kendi ölçtüğü sabite bağlı olduğunu ortaya çıkardı — üçü de düzeltildi. DOCX'te sayfa seçimi artık yok sayılıyor (**A** uygulandı); panelde seçiciyi gizlemek teknik borç | commit bekliyor | 2026-08-29 |
| 11 | Tarayıcı tarafı savunma | ✅ Kanıtlanarak kapandı — merkezî başlık middleware'i (5 başlık, hata/404/500 yanıtlarında da), üretimde HSTS+HTTPS+ForwardedHeaders, her iki istemcide **nonce'lu CSP** (`script-src`'te `'unsafe-inline'` YOK), pdf.js ve Tesseract CDN'den pakete alındı, yazı tipleri self-host. 11 test + 18 kapı + 7 mutasyon. Tarayıcıda uçtan uca doğrulandı (OCR ve PDF önizleme gerçekten çalıştırıldı). Denetim 4 yeni bulgu çıkardı: CVE'li pdf.js 2.16.105, Tesseract'ın gizli CDN bağımlılığı, Google Fonts, `UseHttpsRedirection`'ın port olmadan sessizce çalışmaması. **Ek (kullanıcı kararı):** ölü `Views/` + `wwwroot/` ve `UseStaticFiles()` silindi — mutasyonla kanıtlandı (önce 200, sonra 401) | commit bekliyor | 2026-09-01 |
| 12 | Veri bütünlüğü ve kalıntı | ✅ Kanıtlanarak kapandı — 7 unique index + `Groups.AdminUserId` → RESTRICT (migration `20260901141323`, canlı geliştirme veritabanına da uygulandı, veri kaybı yok), `SaklamaTemizligiServisi` (90/365/7 gün), OCR silme ucu, `BenzersizKaydetAsync` ile API idempotent kaldı. 17 test + 11 kapı + 6 mutasyon. Mutasyon iki kapının ÖLÇMEDİĞİNİ ortaya çıkardı: KURAL-04'ün sabit `-A20` penceresi (yapısal hale getirildi) ve KURAL-12'nin metin araması (`if (false)` ile kandırılabiliyordu). Ayrıca kota koruması ayrı bir teste taşındı — FluentAssertions ilk iddiada durduğu için raporda görünmüyordu. **Yan bulgu kapatıldı:** yutulan önbellek yazma hatası izlenen satırı bırakıyor ve aynı kapsamdaki sonraki `SaveChanges`'i 500'e çeviriyordu. **Kalıntı:** ölü MVC katmanı (43 dosya) + commit'lenmiş 2,6 MB `dotnet-ef` ikilisi (25 dosya) depodan çıkarıldı; araç `.config/dotnet-tools.json`'a taşındı | commit bekliyor | 2026-09-01 |

Durum işaretleri: ⬜ Başlamadı · 🟨 Kısmen (neyin kaldığı yazılacak) · ✅ Kanıtlanarak kapandı
