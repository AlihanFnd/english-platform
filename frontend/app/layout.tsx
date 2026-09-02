import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import LayoutWrapper from "./layout-wrapper";

/**
 * KURAL-11: yazı tipleri derleme sırasında indirilip kendi origin'imizden
 * servis ediliyor (eskiden globals.css içinden fonts.googleapis.com'a
 * @import ediliyorlardı). "latin-ext" alt kümesi ZORUNLU: arayüz Türkçe ve
 * ş/ğ/ı harfleri "latin" alt kümesinde yok.
 */
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Linguza - İngilizce Çeviri ve Okuma Platformu",
  description: "AI destekli okuma, anlık kelime çevirisi ve sınıf yönetim platformu",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // KURAL-11: nonce'lu CSP'nin çalışabilmesi için sayfa DİNAMİK render edilmeli.
  // Statik ön-render'da HTML derleme anında üretilir; içindeki hidrasyon
  // script'i, isteğe özel üretilen nonce'u taşıyamaz ve tarayıcı onu engeller —
  // sayfa "çalışmıyor" görünür. headers() okumak rotayı dinamiğe çevirir;
  // Next de ürettiği script etiketlerine proxy.ts'in verdiği nonce'u yazar.
  // Değer kullanılmıyor: nonce'u DOM'a yazmak onu XSS için okunabilir kılardı.
  await headers();

  return (
    <html
      lang="tr"
      className={`light h-full antialiased ${jakarta.variable} ${inter.variable}`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <ThemeProvider>
          <AuthProvider>
            <LayoutWrapper>
              {children}
            </LayoutWrapper>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
