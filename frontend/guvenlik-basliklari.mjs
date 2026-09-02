/**
 * KURAL-11 — Öğrenci uygulamasının tarayıcı tarafı savunması.
 *
 * TEK KAYNAK: hem `next.config.ts` (statik başlıklar) hem `middleware.ts`
 * (istek başına nonce'lu CSP) buradan okur.
 */

/** CSP dışındaki, istekten bağımsız başlıklar. */
export const statikGuvenlikBasliklari = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    // Kamera/mikrofon kapalı: uygulama yalnızca konuşma SENTEZİ (TTS) kullanıyor,
    // o da izin gerektirmiyor. OCR görseli <input type=file> ile geliyor.
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

/**
 * Nonce'lu CSP — gerekçeler admin-panel/guvenlik-basliklari.mjs ile aynı.
 *
 * `'wasm-unsafe-eval'`: Tesseract.js OCR'ı WebAssembly ile çalışıyor.
 * `worker-src blob:`: tesseract.js worker'ı blob URL'den başlatıyor.
 * Worker ve WASM çekirdeği artık kendi origin'imizden servis ediliyor
 * (bkz. scripts/tesseract-varliklari-kopyala.mjs), bu yüzden CSP'de hiçbir
 * üçüncü taraf alan adı YOK.
 */
export function cspUret(nonce) {
  const api = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    `connect-src 'self' ${api}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}
