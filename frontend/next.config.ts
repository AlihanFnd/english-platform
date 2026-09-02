import type { NextConfig } from "next";
import { statikGuvenlikBasliklari } from "./guvenlik-basliklari.mjs";

const nextConfig: NextConfig = {
  // KURAL-11: sunucu parmak izi. Next varsayılan olarak "X-Powered-By: Next.js"
  // yazıyor; hangi yığının çalıştığını söylemenin bir faydası yok.
  poweredByHeader: false,

  // KURAL-11: CSP burada DEĞİL, middleware.ts'te üretiliyor — istek başına
  // nonce gerektiği için. Aynı başlığı iki yerden göndermek ikisinin de
  // uygulanmasına (kesişim) yol açar ve sayfayı sessizce kırar.
  async headers() {
    return [{ source: "/:path*", headers: statikGuvenlikBasliklari }];
  },
};

export default nextConfig;
