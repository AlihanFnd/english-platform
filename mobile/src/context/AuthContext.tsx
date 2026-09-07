import { useRouter, useSegments } from 'expo-router';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { api, jetonSil, jetonYaz, jetonOku, oturumDustugundeDinle, User } from '@/lib/api';

interface KimlikDegeri {
  kullanici: User | null;
  yukleniyor: boolean;
  girisYap: (email: string, sifre: string) => Promise<void>;
  // KURAL-17: rol parametresi KALDIRILDI — kayıt her zaman "student" üretir.
  kayitOl: (kullaniciAdi: string, email: string, sifre: string) => Promise<void>;
  cikisYap: () => Promise<void>;
}

const KimlikBaglami = createContext<KimlikDegeri | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [kullanici, setKullanici] = useState<User | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);

  useEffect(() => {
    let iptalEdildi = false;

    (async () => {
      const jeton = await jetonOku();
      if (!jeton) {
        if (__DEV__ && process.env.EXPO_PUBLIC_AUTO_LOGIN === 'true') {
          try {
            const veri = await api.login('alihanfnd35@gmail.com', '12345678');
            await jetonYaz(veri.token);
            if (!iptalEdildi) setKullanici(veri.user);
          } catch {
            if (!iptalEdildi) setKullanici(null);
          } finally {
            if (!iptalEdildi) setYukleniyor(false);
          }
          return;
        }
        if (!iptalEdildi) setYukleniyor(false);
        return;
      }
      try {
        const veri = await api.me();
        if (!iptalEdildi) setKullanici(veri.user);
      } catch {
        // Jeton geçersiz ya da sunucuya ulaşılamıyor: her iki durumda da
        // oturumu açık saymıyoruz. api katmanı 401'de jetonu zaten sildi.
        if (!iptalEdildi) setKullanici(null);
      } finally {
        if (!iptalEdildi) setYukleniyor(false);
      }
    })();

    return () => {
      iptalEdildi = true;
    };
  }, []);

  // Jeton sunucu tarafında iptal edilirse (KURAL-04) ilk 401'de haber gelir.
  useEffect(() => oturumDustugundeDinle(() => setKullanici(null)), []);

  const girisYap = useCallback(async (email: string, sifre: string) => {
    const veri = await api.login(email, sifre);
    await jetonYaz(veri.token);
    setKullanici(veri.user);
  }, []);

  const kayitOl = useCallback(
    async (kullaniciAdi: string, email: string, sifre: string) => {
      const veri = await api.register(kullaniciAdi, email, sifre);
      await jetonYaz(veri.token);
      setKullanici(veri.user);
    },
    [],
  );

  const cikisYap = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Sunucuya ulaşılamasa bile YEREL oturum kapanmalı; aksi hâlde
      // "çıkış yapamayan kullanıcı" ortaya çıkar.
    }
    await jetonSil();
    setKullanici(null);
  }, []);

  const deger = useMemo<KimlikDegeri>(
    () => ({ kullanici, yukleniyor, girisYap, kayitOl, cikisYap }),
    [kullanici, yukleniyor, girisYap, kayitOl, cikisYap],
  );

  return <KimlikBaglami.Provider value={deger}>{children}</KimlikBaglami.Provider>;
}

export function useKimlik(): KimlikDegeri {
  const baglam = useContext(KimlikBaglami);
  if (!baglam) throw new Error('useKimlik, AuthProvider içinde kullanılmalıdır.');
  return baglam;
}

/**
 * Oturumu olmayan kullanıcıyı giriş ekranına, olan kullanıcıyı da giriş
 * ekranından uygulamaya yönlendirir.
 *
 * NEDEN AYRI KANCA: yönlendirme kökteki düzen bileşeninde YAPILAMAZ — router
 * ilk render'da henüz hazır olmayabilir. `useSegments` hazır olduğunda tetiklenir.
 */
export function useKorumaliYonlendirme() {
  const { kullanici, yukleniyor } = useKimlik();
  const segmentler = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (yukleniyor) return;

    const girisEkranindaMi = segmentler[0] === 'login';

    if (!kullanici && !girisEkranindaMi) {
      router.replace('/login');
    } else if (kullanici && girisEkranindaMi) {
      router.replace('/');
    }
  }, [kullanici, yukleniyor, segmentler, router]);
}
