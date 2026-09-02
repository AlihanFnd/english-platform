import { NextResponse, type NextRequest } from "next/server";
import { cspUret } from "./guvenlik-basliklari.mjs";

/**
 * KURAL-11: her belge isteğine tek kullanımlık nonce'lu CSP ekler.
 *
 * Dosya adı `proxy.ts`: Next.js 16'da `middleware.ts` kullanımdan kalktı
 * (build "deprecated" uyarısı veriyor) ve dışa aktarılan işlevin adı da
 * `middleware` değil `proxy` olmalı — aksi halde derleme E394 ile durur.
 *
 * Next.js, istek başlıklarında bir CSP görürse içindeki nonce'u KENDİ ürettiği
 * script etiketlerine de yazar — hidrasyon script'i böylece nonce'lu olur ve
 * `'unsafe-inline'` gerekmez.
 */
export function proxy(istek: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = cspUret(nonce);

  const istekBasliklari = new Headers(istek.headers);
  istekBasliklari.set("x-nonce", nonce);
  istekBasliklari.set("Content-Security-Policy", csp);

  const yanit = NextResponse.next({ request: { headers: istekBasliklari } });
  yanit.headers.set("Content-Security-Policy", csp);
  return yanit;
}

export const config = {
  matcher: [
    /*
     * Yalnızca BELGE istekleri. Statik varlıkların (/_next/static, ikonlar)
     * nonce'a ihtiyacı yok; onları da kapsamak her varlık için middleware
     * çalıştırmak demekti. CSP dışındaki başlıkları onlara next.config veriyor.
     */
    {
      source: "/((?!_next/static|_next/image|favicon.ico|tesseract|images).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
