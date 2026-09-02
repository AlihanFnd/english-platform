# Linguza — Proje Kılavuzu

İngilizce okuma + anlık çeviri platformu. Backend ASP.NET Core 8, iki ayrı Next.js
istemcisi, PostgreSQL.

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
| **Açık güvenlik bulguları** | [docs/07-GUVENLIK.md](docs/07-GUVENLIK.md) |
| **Güvenlik çalışması — uygulanacak kurallar** | [guvenlik-kurallari/00-BASLA-BURADAN.md](guvenlik-kurallari/00-BASLA-BURADAN.md) |
| Kurulum, bilinen hatalar, teknik borç | [docs/08-GELISTIRME-REHBERI.md](docs/08-GELISTIRME-REHBERI.md) |

## Hızlı başlangıç

```bash
docker compose up -d postgres && ./start-dev.sh
```

Frontend :3000 · Admin :3001 · API :5001 · pgAdmin :8080

> ⚠️ Backend portu üç yerde farklı yazıyor. İlk kurulumda "Failed to fetch" alırsan
> [docs/08-GELISTIRME-REHBERI.md § 1](docs/08-GELISTIRME-REHBERI.md) bölümüne bak.

## Güvenlik çalışması

Devam eden 12 kurallık güvenlik programı: [`guvenlik-kurallari/`](guvenlik-kurallari/00-BASLA-BURADAN.md)

Her oturum **önce** `00-BASLA-BURADAN.md`, **sonra** sıradaki `KURAL-NN.md` okunarak
yürütülür. Disiplin, pazarlıksız maddeler ve teslim formatı 00 dosyasındadır.
İlerleme tablosu da oradadır — bitirdiğin kuralı işaretle.

## Çalışma kuralları

- **Kod İngilizce, yorumlar ve kullanıcıya dönen mesajlar Türkçe.**
- Frontend'de HTTP çağrıları **yalnızca `frontend/app/api.ts` üzerinden** yapılır.
- Yeni bir uç eklerken: yetki kontrolü, girdi uzunluğu, hız sınırı, hata mesajında
  iç detay sızıntısı — dördünü de kontrol et
  ([docs/07-GUVENLIK.md § D](docs/07-GUVENLIK.md)).
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
2. **Backend hiç statik dosya sunmaz.** `Views/` ve `wwwroot/` ölü koddu, 2026-09-01'de
   silindi; `app.UseStaticFiles()` de kaldırıldı. Razor pipeline'ı hiç kurulmamıştı.
   Statik dosya sunmak gerekirse kökü açma — `RequestPath` ile tek dizin yayınla ve
   `scripts/guard/11-tarayici.sh` kontrolünü güncelle.
