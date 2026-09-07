# raporlar/

Bu klasör, Linguza'nın **olduğu gibi (as-built)** mimari kaydıdır. Yeni bir
özellik eklendikçe buraya belge eklenir.

## `docs/` ile farkı

| | `docs/` | `raporlar/` |
|---|---|---|
| Amaç | Nasıl kullanılır, nasıl geliştirilir | Sistem **şu anda** neye benziyor |
| Okuyucu | Projeye yeni katılan | Değişiklik yapmadan önce karar veren |
| Güncelleme | Değişiklikle birlikte | Ölçülerek — sayılar komutla üretilir |

`docs/` bir kılavuzdur; burası bir **envanterdir.** İkisi çelişirse burası
ölçüme dayanır — her sayının altında onu üreten komut yazılıdır.

## İçindekiler

| Belge | Kapsam | Satır |
|---|---|---|
| [01-MIMARI-RAPORU.md](01-MIMARI-RAPORU.md) | Sistem geneli: katmanlar, istek hattı, veri modeli, 53 uç, akışlar, güvenlik kapıları, dağıtım | ~990 |
| [02-MOBIL-RAPORU.md](02-MOBIL-RAPORU.md) | Expo/RN istemcisi: gezinme, api katmanı, tema sistemi, 9 bileşen, ekran ekran, webden ayrıldığı yerler | ~490 |
| [03-WEB-ISTEMCILERI-RAPORU.md](03-WEB-ISTEMCILERI-RAPORU.md) | `frontend` + `admin-panel`: CSP nonce zinciri, api katmanı, ekranlar, varlık yönetimi | ~390 |

### Kapsam dengesi

Kod tabanının dağılımı — raporların da bu oranı yansıtması gerekiyor:

| Alan | Satır | Oran |
|---|---|---|
| Backend (`EnglishReadingPlatform/`, migration hariç) | 8.026 | %38 |
| Mobil (`mobile/src/`) | 6.727 | %31 |
| Web öğrenci (`frontend/app/`) | 5.107 | %24 |
| Web yönetici (`admin-panel/app/`) | 1.400 | %7 |

> İlk sürümde istemcilere raporun yalnızca %5'i ayrılmıştı; 02 ve 03 bu
> dengesizliği kapatmak için yazıldı.

## Yeni belge eklerken

1. Numaralı ad kullan: `02-…`, `03-…`
2. Başına **ölçüm tarihi ve commit hash'i** yaz — bir rapor, hangi ana ait
   olduğunu söylemiyorsa doğrulanamaz.
3. Verdiğin her sayının **komutunu** da yaz. "14 uç var" değil,
   "14 uç var (`grep -c '\[Http' …`)".
4. Yukarıdaki içindekiler tablosuna satır ekle.
