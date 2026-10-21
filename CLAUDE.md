# Linguza — Proje Kılavuzu

İngilizce okuma + anlık çeviri platformu. Backend ASP.NET Core 8, iki ayrı Next.js
istemcisi, Expo Go mobil istemcisi, PostgreSQL.

## 📚 Dokümantasyon

**Bir işe başlamadan önce [`docs/`](docs/README.md) klasörünü oku.**

| Ne arıyorsan | Dosya |
|---|---|
| Proje ne yapar, nasıl çalıştırılır | [docs/00-GENEL-BAKIS.md](docs/00-GENEL-BAKIS.md) |
| Katmanlar, veri akışları, portlar | [docs/01-MIMARI.md](docs/01-MIMARI.md) |
| Tablolar, kolonlar, migration'lar | [docs/02-VERITABANI.md](docs/02-VERITABANI.md) |
| Her endpoint'in istek/yanıtı | [docs/03-API-REFERANSI.md](docs/03-API-REFERANSI.md) |
| Servislerin iç işleyişi | [docs/04-BACKEND.md](docs/04-BACKEND.md) |
| Sayfalar, context'ler, tasarım sistemi | [docs/05-FRONTEND.md](docs/05-FRONTEND.md) |
| Yönetici paneli | [docs/06-ADMIN-PANEL.md](docs/06-ADMIN-PANEL.md) |
| Mobil istemci (Expo Go) | [mobile/DURUM.md](mobile/DURUM.md) |
| **Açık güvenlik bulguları** | [docs/07-GUVENLIK.md](docs/07-GUVENLIK.md) |
| **Güvenlik çalışması faz 1 (kapandı)** | [guvenlik-kurallari/00-BASLA-BURADAN.md](guvenlik-kurallari/00-BASLA-BURADAN.md) |
| **Güvenlik çalışması faz 2** | [guvenlik-kurallari-faz2/00-BASLA-BURADAN.md](guvenlik-kurallari-faz2/00-BASLA-BURADAN.md) |
| **Faz 3 — yayına hazırlık (sıradaki)** | [yayina-hazirlik-faz3/00-BASLA-BURADAN.md](yayina-hazirlik-faz3/00-BASLA-BURADAN.md) |
| Mobil eksik analizi (faz 3'ün kaynağı) | [raporlar/04-MOBIL-EKSIK-ANALIZI.md](raporlar/04-MOBIL-EKSIK-ANALIZI.md) |
| Kurulum, bilinen hatalar, teknik borç | [docs/08-GELISTIRME-REHBERI.md](docs/08-GELISTIRME-REHBERI.md) |

## Hızlı başlangıç

```bash
docker compose up -d postgres && ./start-dev.sh
```

Frontend :3000 · Admin :3001 · API :5001 · pgAdmin :8080 · Mobil Metro :8081

Mobil istemciyi başlatmak için:
```bash
cd mobile && npx expo start
```

> ⚠️ Backend portu üç yerde farklı yazıyor. İlk kurulumda "Failed to fetch" alırsan
> [docs/08-GELISTIRME-REHBERI.md § 1](docs/08-GELISTIRME-REHBERI.md) bölümüne bak.

## Güvenlik çalışması

| Faz | Klasör | Durum |
|---|---|---|
| **Faz 1** — KURAL-01…12 | [`guvenlik-kurallari/`](guvenlik-kurallari/00-BASLA-BURADAN.md) | ✅ 12/12 kapandı (`2bd12bc`) |
| **Faz 2** — KURAL-13…19 | [`guvenlik-kurallari-faz2/`](guvenlik-kurallari-faz2/00-BASLA-BURADAN.md) | 🟨 6/7 (16 hariç hepsi kapandı) |
| **Faz 3** — YH-01…15 yayına hazırlık | [`yayina-hazirlik-faz3/`](yayina-hazirlik-faz3/00-BASLA-BURADAN.md) | ✅ 15/15 kapandı (2026-09-13) |

> **Faz 3 neden var:** güvenli olmak yayına hazır olmak değil. Mobil analiz
> (raporlar/04) günlük döngünün (seri, hedef, tekrar, hatırlatma) ve mağaza
> zorunluluklarının (uygulama içi hesap silme, gizlilik bağlantısı) eksik
> olduğunu, ayrıca istemci koduna gerçek bir giriş bilgisinin gömüldüğünü
> gösterdi. **Konuşma/telaffuz kaydı kapsam dışıdır** (kullanıcı kararı).

Her oturum **önce** ilgili fazın `00-BASLA-BURADAN.md`, **sonra** sıradaki
`KURAL-NN.md` okunarak yürütülür. Disiplin, pazarlıksız maddeler ve teslim
formatı 00 dosyasındadır. İlerleme tablosu da oradadır — bitirdiğin kuralı işaretle.

> **Faz 2 neden var:** faz 1 bittikten sonra yapılan denetimler, 12 kuralın hiç
> bakmadığı yerlerde bulgular çıkardı. En çarpıcısı: KURAL-11 "tarayıcı tarafı
> savunma" başlığını taşıyor ama **CORS'a hiç bakmamıştı** (KURAL-13 kapattı).
> Şifre sıfırlama bağlantısı da, Resend anahtarı tanımlı olmadığı için uygulama
> loguna yazılıyordu (KURAL-14 kapattı).
>
> Faz 2, faz 1'in kapılarını **kırmamak zorundadır**: her oturumun sonunda
> `bash scripts/guard/run-all.sh` bütün kapılarla çalıştırılır.

## Çalışma kuralları

- **Kod İngilizce, yorumlar ve kullanıcıya dönen mesajlar Türkçe.**
- Frontend'de HTTP çağrıları **yalnızca `frontend/app/api.ts` üzerinden** yapılır.
- Yeni bir uç eklerken: yetki kontrolü, girdi uzunluğu, hız sınırı, hata mesajında
  iç detay sızıntısı — dördünü de kontrol et
  ([docs/07-GUVENLIK.md § D](docs/07-GUVENLIK.md)).
- **Yeni bir kişisel veri alanı eklerken `Data/KisiselVeriEnvanteri.cs`'e yaz**
  (KURAL-19: sebebi, ömrü, dışa aktarılıp aktarılmadığı). Yazmazsan
  `KisiselVeriTests` kırılır. Dışa aktarma envanterden üretiliyor.
- **Şifre hash'lemek için `Security/SifreHashleme.cs` kullan** (KURAL-18) —
  doğrudan `BCrypt.Net.BCrypt.*` çağırmak yasak, kapı denetliyor. İş faktörü
  tek yerde (12). **`package.json` sürümleri sabittir**, aralık (`^`) eklenmez.
- **Para harcayan ya da PAYLAŞILAN veri yazan bir uç eklerken bunu
  `[ParaHarcar]` / `[PaylasilanVeriYazar]` ile BİLDİR** (KURAL-17). Ücretli uç
  en dar kotada (`AgirAnaliz`/`Ceviri`) olmalı; paylaşılan veriyi **üzerine
  yazan** uç yetki politikası ister. **Durum değiştiren iş `GET` ile yapılmaz** —
  çerez `SameSite=Lax`, üst düzey gezinmede gönderilir.
- **Kayıt rol kabul etmez** — her hesap `student` doğar, öğretmenliği yalnızca
  yönetici verir (`PUT /api/admin/users/{id}/role`).
- **Oyunlaştırma değerleri (XP, seri, sayaç, "öğrenildi") istemciden alınmaz** —
  sunucuda hesaplanır (faz 3). **İstemci koduna giriş bilgisi yazılmaz**, geliştirme
  kolaylığı için bile; `EXPO_PUBLIC_*`/`NEXT_PUBLIC_*` pakete gömülür, sır taşımaz
  (YH-01, `scripts/guard/02-sirlar.sh` madde 10–12).
- **Dağıtımdan önce `bash scripts/dagitim/on-kontrol.sh`, sonra
  `bash scripts/dagitim/canli-dogrula.sh <adres>`** (KURAL-15). Zorunlu ortam
  değişkenleri `Configuration/OrtamSozlesmesi.cs` içinde; üretimde biri eksikse
  **uygulama başlamaz.** `appsettings.Production.json` bilerek sürüm
  kontrolündedir — `.gitignore`'a alınırsa üretime hiç gitmez.
- **Yeni bir dış servis bağımlılığı eklerken `Configuration/DisServisSozlesmesi.cs`
  içine sınıfını yaz** (KURAL-14: uygulama açılmaz / özellik kapanır / işlev bozulur).
  Sınıflandırılmamış bir `X:ApiKey` okuması `scripts/guard/14-yapilandirma.sh`
  kapısını kırar. **Yapılandırma eksikken zayıf bir yedeğe düşmek yasaktır** —
  özellik kapanır, sessizce bozulmaz.
- **Yazma ucu (`POST`/`PUT`/`DELETE`) eklerken `[EnableRateLimiting(HizSinirlari.…)]`
  zorunludur** — unutursan `HizSiniriSozlesmesiTests` build'i kırar. Sayılar tek
  kaynakta: `EnglishReadingPlatform/RateLimiting/HizSinirlari.cs`.
- Kod değiştirdiğinde ilgili dokümanı da güncelle
  ([docs/08-GELISTIRME-REHBERI.md § 8](docs/08-GELISTIRME-REHBERI.md)).
- `frontend/` **Next.js 16** kullanıyor — API'ler eğitim verisinden farklı olabilir,
  `frontend/AGENTS.md` uyarısını dikkate al. **Her iki istemci de Next 16'dır** ve
  ara katman dosyasının adı `middleware.ts` değil **`proxy.ts`**, dışa aktarılan işlev
  de `proxy` olmalıdır.
- **İstemcilerde CSP nonce zinciri kırılgandır** (KURAL-11): `proxy.ts` istek başına
  nonce üretir, `app/layout.tsx` içindeki `await headers()` sayfayı dinamik yapar.
  O satır silinirse sayfa statik ön-render'a döner, nonce tutmaz ve **tarayıcı hidrasyon
  script'ini engeller** — sayfa sessizce etkileşimsiz kalır. `scripts/guard/11-tarayici.sh`
  bunu denetliyor.
- **Üçüncü taraf JS/WASM/yazı tipi CDN'den çekilmez.** pdf.js, Tesseract ve yazı tipleri
  paketten gelir; `public/` altına `prebuild` betikleriyle kopyalanır. Bir kütüphanenin
  *varsayılanı* CDN'e düşüyorsa (Tesseract'ta olduğu gibi) yollar açıkça verilir.

## Bilinmesi gereken iki tuhaflık

1. **Kitaplar iki farklı biçimde saklanıyor:** `Chapter` (eski, her okumada yeniden
   çevrilir) veya `BookPage` (güncel, çeviri `SentencesJson`'a bir kez yazılır).
   `hasPages` bayrağı hangisinin geçerli olduğunu söyler.
   **`BookPage` GLOBALDİR** — `UserId` taşımaz, içeriği bütün kullanıcılar paylaşır.
   Bu yüzden analizi *üzerine yazan* uç öğretmen/yönetici yetkisine bağlı;
   *boşluğu dolduran* uç herkese açık (KURAL-17).
2. **Backend hiç statik dosya sunmaz.** `Views/` ve `wwwroot/` ölü koddu, 2026-09-01'de
   silindi; `app.UseStaticFiles()` de kaldırıldı. Razor pipeline'ı hiç kurulmamıştı.
   Statik dosya sunmak gerekirse kökü açma — `RequestPath` ile tek dizin yayınla ve
   `scripts/guard/11-tarayici.sh` kontrolünü güncelle.
