/**
 * KURAL-11 — Yönetici panelinin tarayıcı tarafı savunması.
 *
 * TEK KAYNAK: hem `next.config.mjs` (statik başlıklar) hem `middleware.ts`
 * (istek başına nonce'lu CSP) buradan okur. İki dosyaya ayrı ayrı yazılan bir
 * politika, biri güncellenip diğeri unutulduğunda sessizce ayrışır.
 */

/** CSP dışındaki, istekten bağımsız başlıklar. */
export const statikGuvenlikBasliklari = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

/**
 * Nonce'lu CSP. Next.js App Router hidrasyon verisini SATIR İÇİ script ile
 * gönderiyor (`self.__next_f.push`), yani `script-src 'self'` tek başına
 * sayfayı kırar. İki çıkış yolu var: `'unsafe-inline'` (XSS'e karşı CSP'nin
 * anlamını büyük ölçüde yok eder — token localStorage'da olduğu için burada
 * kabul edilemez) ya da nonce. Nonce seçildi.
 *
 * `'strict-dynamic'`: nonce'lu betiğin yüklediği parçalar (Next'in chunk'ları)
 * da güvenilir sayılır. Bu olmadan dinamik import'lar engellenirdi.
 *
 * `'wasm-unsafe-eval'`: pdf.js 6, taranmış PDF'lerdeki JBIG2/JPEG2000
 * görüntülerini WASM ile çözüyor. Chrome, script-src tanımlıyken WASM
 * derlemesi için bu anahtar kelimeyi şart koşar. Keyfî JS eval'ine izin
 * VERMEZ; yalnızca WebAssembly derlemesini açar.
 */
export function cspUret(nonce) {
  const api = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'`,
    // Tailwind ve Next satır içi stil üretiyor; stil enjeksiyonu script
    // enjeksiyonuyla aynı sınıf değil, bilinçli olarak gevşek bırakıldı.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    // pdf.js worker'ı blob URL'den başlatılıyor.
    "worker-src 'self' blob:",
    `connect-src 'self' ${api}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}
