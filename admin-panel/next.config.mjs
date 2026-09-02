import { statikGuvenlikBasliklari } from "./guvenlik-basliklari.mjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // NOT: `typescript.ignoreBuildErrors` ve `eslint` anahtarları bilerek YOK.
  // Öncekinde ignoreBuildErrors=true vardı; tip hataları sessizce üretime gidiyordu.
  // Artık `next build` tip hatasında kırılır — kapı build'in kendisi.

  // KURAL-11: sunucu parmak izi. Next varsayılan olarak "X-Powered-By: Next.js"
  // yazıyor; hangi yığının çalıştığını söylemenin bir faydası yok.
  poweredByHeader: false,

  // KURAL-11: CSP burada DEĞİL, proxy.ts'te üretiliyor — istek başına nonce
  // gerektiği için. Aynı başlığı iki yerden göndermek ikisinin de uygulanmasına
  // (kesişim) yol açar ve sayfayı sessizce kırar.
  async headers() {
    return [{ source: "/:path*", headers: statikGuvenlikBasliklari }];
  },
};

export default nextConfig;
