# Linguza — Proje Dokümantasyonu

> **Linguza**, İngilizce metinleri kelime ve cümle bazında anlık çeviriyle okutan,
> okuma ilerlemesini takip eden, OCR ile basılı metin tarayan ve sınıf/grup yönetimi
> sunan bir dil öğrenme platformudur.

Bu klasör projenin **canlı teknik dokümantasyonudur**. Kod değiştiğinde bu dosyalar da
güncellenmelidir.

---

## Dosya Haritası

| Dosya | İçerik | Kime hitap eder |
|---|---|---|
| [00-GENEL-BAKIS.md](00-GENEL-BAKIS.md) | Proje nedir, ne yapar, hangi parçalardan oluşur, nasıl çalıştırılır | Herkes |
| [01-MIMARI.md](01-MIMARI.md) | Katmanlar, servisler, portlar, veri akışları, dış bağımlılıklar | Geliştirici |
| [02-VERITABANI.md](02-VERITABANI.md) | Her tablo, her kolon, ilişkiler, migration geçmişi, seed verisi | Backend |
| [03-API-REFERANSI.md](03-API-REFERANSI.md) | Her endpoint: metot, yol, yetki, istek/yanıt, hata kodları, rate limit | Backend + Frontend |
| [04-BACKEND.md](04-BACKEND.md) | Controller ve servislerin iç işleyişi (JWT, çeviri, PDF, quiz) | Backend |
| [05-FRONTEND.md](05-FRONTEND.md) | Kullanıcı arayüzü: sayfalar, context'ler, hook'lar, tasarım sistemi | Frontend |
| [06-ADMIN-PANEL.md](06-ADMIN-PANEL.md) | Yönetici paneli sayfaları ve PDF yükleme akışı | Frontend |
| [07-GUVENLIK.md](07-GUVENLIK.md) | Mevcut güvenlik önlemleri + **açık tespitler ve düzeltme reçeteleri** | Herkes |
| [08-GELISTIRME-REHBERI.md](08-GELISTIRME-REHBERI.md) | Kurulum, sık yapılan işler, bilinen sorunlar, teknik borç, yol haritası | Geliştirici |

---

## Hızlı Başlangıç

```bash
docker compose up -d postgres
./start-dev.sh
```

| Servis | Adres |
|---|---|
| Kullanıcı arayüzü | http://localhost:3000 |
| Yönetici paneli | http://localhost:3001 |
| Backend API | http://localhost:5001 |
| pgAdmin | http://localhost:8080 |

Yönetici hesabı artık **koda gömülü değil** (KURAL-02). `.env` dosyasındaki
`Seed__AdminEmail` / `Seed__AdminPassword` değerlerinden bir kez tohumlanır;
ikisi de boşsa hiç yönetici oluşturulmaz ve açılışta uyarı loglanır.
Eski `admin@platform.com` tohum hesabı migration ile geçersiz kılındı.

---

## Bu dokümantasyonun kapsamı

Bu dosyalar **2026-08-20 tarihindeki `main` dalı** (`d2cfc0f`) okunarak yazılmıştır.
Kod okunarak çıkarılmıştır; çalışma zamanında doğrulanmamış noktalar dosyaların içinde
**"⚠️ Doğrulanmadı"** etiketiyle açıkça işaretlenmiştir.

Kök dizindeki iki eski doküman ayrı amaçla durur ve bu klasörle çakışmaz:
- `proje-dokumani.md` — projenin **başlangıçtaki niyet/şartname** belgesi
- `faz-0-baslangic.md` — ilk faz kurulum notları
