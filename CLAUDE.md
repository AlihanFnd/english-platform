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
  `frontend/AGENTS.md` uyarısını dikkate al.

## Bilinmesi gereken iki tuhaflık

1. **Kitaplar iki farklı biçimde saklanıyor:** `Chapter` (eski, her okumada yeniden
   çevrilir) veya `BookPage` (güncel, çeviri `SentencesJson`'a bir kez yazılır).
   `hasPages` bayrağı hangisinin geçerli olduğunu söyler.
2. **`EnglishReadingPlatform/Views/` ve `wwwroot/js|lib` ölü kod.** `Program.cs`
   Razor pipeline'ını hiç kurmuyor.
