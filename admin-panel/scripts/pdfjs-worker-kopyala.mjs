/**
 * KURAL-11 — pdf.js worker'ını pakete bağlar.
 *
 * Panel eskiden pdf.js'i cdnjs'ten SRI'sız çekiyordu: CDN ele geçirilse
 * yönetici oturumunun içinde keyfî JavaScript çalışır, admin_token doğrudan
 * çalınırdı. Artık kütüphane npm paketinden geliyor; worker dosyası da
 * derlemeden ÖNCE buradan public/ altına kopyalanıyor ki aynı origin'den
 * servis edilsin (CSP: worker-src 'self').
 *
 * Dosya elle kopyalanmıyor çünkü elle kopyalanan bir sürüm paket güncellendiğinde
 * sessizce eskir — yani yamalanmış sanılan bir pdf.js çalışmaya devam eder.
 */
import { copyFileSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const kok = join(dirname(fileURLToPath(import.meta.url)), "..");
const paket = join(kok, "node_modules", "pdfjs-dist");

const surum = JSON.parse(readFileSync(join(paket, "package.json"), "utf8")).version;
const kaynak = join(paket, "build", "pdf.worker.min.mjs");
const hedefDizin = join(kok, "public", "pdfjs");
const hedef = join(hedefDizin, "pdf.worker.min.mjs");

mkdirSync(hedefDizin, { recursive: true });
copyFileSync(kaynak, hedef);          // kaynak yoksa burada patlar — sessiz geçmez

// WASM çözücüler (JBIG2, OpenJPEG, QCMS). Taranmış kitap PDF'lerinde JBIG2
// yaygındır; bu dosyalar olmadan pdf.js o sayfaları çizemez. Varsayılan yolları
// paketin kendi dizinine göredir, bu yüzden getDocument'a wasmUrl veriliyor.
const wasmKaynak = join(paket, "wasm");
const wasmHedef = join(hedefDizin, "wasm");
mkdirSync(wasmHedef, { recursive: true });
let wasmAdedi = 0;
for (const ad of readdirSync(wasmKaynak)) {
  if (ad.endsWith(".wasm")) {
    copyFileSync(join(wasmKaynak, ad), join(wasmHedef, ad));
    wasmAdedi++;
  }
}
if (wasmAdedi === 0) throw new Error("pdfjs-dist/wasm içinde .wasm bulunamadı.");

console.log(
  `pdf.js kopyalandı (sürüm ${surum}) → public/pdfjs/ ` +
  `(worker + ${wasmAdedi} wasm çözücü)`
);
