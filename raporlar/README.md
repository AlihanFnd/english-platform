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

| Belge | Ne anlatır |
|---|---|
| [01-MIMARI-RAPORU.md](01-MIMARI-RAPORU.md) | Katmanlar, uçlar, veri modeli, akışlar, güvenlik katmanları, dağıtım |

## Yeni belge eklerken

1. Numaralı ad kullan: `02-…`, `03-…`
2. Başına **ölçüm tarihi ve commit hash'i** yaz — bir rapor, hangi ana ait
   olduğunu söylemiyorsa doğrulanamaz.
3. Verdiğin her sayının **komutunu** da yaz. "14 uç var" değil,
   "14 uç var (`grep -c '\[Http' …`)".
4. Yukarıdaki içindekiler tablosuna satır ekle.
