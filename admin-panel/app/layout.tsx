import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Admin Panel | İngilizce Okuma Platformu",
  description: "Yönetici paneli — sadece yetkili personel erişebilir",
  robots: "noindex, nofollow", // Arama motorları indeklemesin
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // KURAL-11: nonce'lu CSP'nin çalışabilmesi için sayfa DİNAMİK render edilmeli.
  // Statik ön-render'da HTML derleme anında üretilir; içindeki hidrasyon
  // script'i, isteğe özel üretilen nonce'u taşıyamaz ve tarayıcı onu engeller —
  // sayfa "çalışmıyor" görünür. headers() okumak rotayı dinamiğe çevirir;
  // Next de ürettiği script etiketlerine proxy.ts'in verdiği nonce'u yazar.
  // Değer kullanılmıyor: nonce'u DOM'a yazmak onu XSS için okunabilir kılardı.
  await headers();

  return (
    <html lang="tr">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
