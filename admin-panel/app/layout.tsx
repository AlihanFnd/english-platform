import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Admin Panel | İngilizce Okuma Platformu",
  description: "Yönetici paneli — sadece yetkili personel erişebilir",
  robots: "noindex, nofollow", // Arama motorları indeklemesin
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
