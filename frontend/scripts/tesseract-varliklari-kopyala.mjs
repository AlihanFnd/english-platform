/**
 * KURAL-11 — Tesseract.js varlıklarını kendi origin'imize taşır.
 *
 * VARSAYILAN DAVRANIŞ NEDEN SORUN: tesseract.js hiçbir ayar verilmezse
 *   • worker.min.js'i          cdn.jsdelivr.net'ten,
 *   • tesseract-core*.wasm.js'i cdn.jsdelivr.net'ten (worker içinde importScripts ile),
 *   • eng.traineddata.gz'i      cdn.jsdelivr.net'ten
 * çeker. İlk ikisi ÇALIŞTIRILAN JavaScript'tir: CDN ele geçirilirse kullanıcının
 * oturumunda keyfî kod çalışır ve token localStorage'dan okunur. SRI de yoktur.
 * Envanterdeki "CDN'den SRI'sız script" ihlali yalnızca admin panelinde
 * aranmıştı; bu yol kütüphanenin VARSAYILANINDA gizliydi.
 *
 * Varlıklar depoya konmuyor, derleme öncesi node_modules'tan kopyalanıyor:
 * elle kopyalanan bir sürüm paket güncellenince sessizce eskir.
 */
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const kok = join(dirname(fileURLToPath(import.meta.url)), "..");
const nm = join(kok, "node_modules");
const hedefKok = join(kok, "public", "tesseract");

const surum = (p) => JSON.parse(readFileSync(join(nm, p, "package.json"), "utf8")).version;

// 1) Worker betiği
mkdirSync(hedefKok, { recursive: true });
copyFileSync(join(nm, "tesseract.js", "dist", "worker.min.js"),
             join(hedefKok, "worker.min.js"));

// 2) WASM çekirdeği. HANGİ dosyaların gerektiği iki şeye bağlı:
//
//    • Varyant: tarayıcı wasm-feature-detect ile karar veriyor
//      (relaxedsimd → simd → düz), bu yüzden üçü birden gerekli.
//    • Model: tesseract.js varsayılan OEM'de LSTM-ONLY çalışır
//      (createWorker.js: legacyCore/legacyLang verilmedikçe lstmOnly = true),
//      yani "-lstm" ekli dosyaları ister.
//
//    ⚠️ BURASI DENEYLE BULUNDU: önce "-lstm"siz varyantlar kopyalanmıştı ve
//    OCR tarayıcıda "importScripts ... tesseract-core-relaxedsimd-lstm.wasm.js
//    failed to load" ile düştü. Ne test ne guard bunu yakalayabilirdi; yalnızca
//    gerçek tarayıcıda çalıştırmak gösterdi.
//    OCR sayfasında legacyCore/legacyLang açılırsa, "-lstm"siz varyantlar ve
//    4.0.0 dil verisi de buraya eklenmelidir.
const cekirdekKaynak = join(nm, "tesseract.js-core");
const cekirdekHedef = join(hedefKok, "core");
mkdirSync(cekirdekHedef, { recursive: true });

const cekirdekDosyalari = [
  "tesseract-core-lstm",
  "tesseract-core-simd-lstm",
  "tesseract-core-relaxedsimd-lstm",
].flatMap((taban) => [`${taban}.wasm`, `${taban}.wasm.js`]);

for (const ad of cekirdekDosyalari) {
  // Dosya yoksa copyFileSync fırlatır — eksik varyant sessizce geçmez.
  copyFileSync(join(cekirdekKaynak, ad), join(cekirdekHedef, ad));
}
const cekirdekAdedi = cekirdekDosyalari.length;

// 3) Dil verisi. lstmOnly (yukarıdaki gerekçe) → kütüphanenin kendisi de
//    "4.0.0_best_int" klasörünü seçerdi; legacy modeli içermeyen, daha küçük
//    sürüm budur. Yanlış klasörü koymak sessiz bir hata değil ama gereksiz
//    ~6 MB indirme demektir.
const dilHedef = join(hedefKok, "lang");
mkdirSync(dilHedef, { recursive: true });
copyFileSync(join(nm, "@tesseract.js-data", "eng", "4.0.0_best_int", "eng.traineddata.gz"),
             join(dilHedef, "eng.traineddata.gz"));

console.log(
  `Tesseract varlıkları kopyalandı → public/tesseract/ ` +
  `(tesseract.js ${surum("tesseract.js")}, core ${surum("tesseract.js-core")}, ` +
  `${cekirdekAdedi} çekirdek dosyası + eng.traineddata.gz)`
);
