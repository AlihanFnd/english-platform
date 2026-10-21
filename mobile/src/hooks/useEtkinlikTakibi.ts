import { usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useKimlik } from '@/context/AuthContext';
import { api } from '@/lib/api';

/**
 * Arka planda etkinlik kaydı — yönetici panelindeki "canlı akış" bunu okuyor.
 * Web'deki `useActivityTracker` ile aynı tipleri ve aynı 30 saniyelik nabzı
 * kullanır, böylece iki istemcinin verisi aynı grafikte anlamlı durur.
 *
 * MOBİLE ÖZGÜ FARK: uygulama arka plana atıldığında nabız DURUR. Telefonda
 * "açık ama cepte" hâli çok yaygın; durdurmazsak kullanıcı kitabı kapattıktan
 * sonra saatlerce "kitap okuyor" görünürdü.
 */

const NABIZ_SANIYE = 30;

function etkinlikCoz(yol: string): { tur: string; ayrinti: string } {
  if (yol === '/' || yol === '/index') return { tur: 'PageView', ayrinti: 'Ana Sayfa' };
  if (yol === '/words') return { tur: 'PageView', ayrinti: 'Kelime Listesi' };
  if (yol === '/ocr') return { tur: 'PageView', ayrinti: 'OCR Metin Okuma' };
  if (yol === '/groups') return { tur: 'PageView', ayrinti: 'Gruplar' };
  if (yol === '/books') return { tur: 'PageView', ayrinti: 'Kitaplık' };
  if (yol === '/login') return { tur: 'AuthView', ayrinti: 'Giriş/Kayıt Sayfası' };

  const quiz = yol.match(/^\/books\/(\d+)\/quiz$/);
  if (quiz) return { tur: 'TakeQuiz', ayrinti: `Kitap ID: ${quiz[1]} - Quiz Çözüyor` };

  const kitap = yol.match(/^\/books\/(\d+)/);
  if (kitap) return { tur: 'ReadBook', ayrinti: `Kitap ID: ${kitap[1]} - Kitap Okuyor` };

  return { tur: 'PageView', ayrinti: yol };
}

export function useEtkinlikTakibi() {
  const yol = usePathname();
  const { kullanici } = useKimlik();

  const yolRef = useRef(yol);
  // Zamanlayıcı en güncel yolu okur; ref render'da değil commit sonrası yazılır.
  // Bu effect aşağıdakinden ÖNCE tanımlı olmalı: effect'ler tanım sırasıyla çalışır.
  useEffect(() => {
    yolRef.current = yol;
  }, [yol]);

  useEffect(() => {
    if (!kullanici) return;

    const ilk = etkinlikCoz(yolRef.current);
    api.logActivity(ilk.tur, ilk.ayrinti, 5).catch(() => {});

    const sayac = setInterval(() => {
      // Uygulama önde değilse kayıt atmıyoruz (yukarıdaki gerekçe).
      if (AppState.currentState !== 'active') return;
      const etkinlik = etkinlikCoz(yolRef.current);
      api.logActivity(etkinlik.tur, etkinlik.ayrinti, NABIZ_SANIYE).catch(() => {});
    }, NABIZ_SANIYE * 1000);

    return () => clearInterval(sayac);
  }, [kullanici, yol]);
}
