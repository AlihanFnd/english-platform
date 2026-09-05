import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import { DARK, LIGHT, Palette } from '@/theme/palette';

type Tema = 'light' | 'dark';

interface TemaDegeri {
  tema: Tema;
  renk: Palette;
  koyuMu: boolean;
  temaDegistir: () => void;
}

const DEPO_ANAHTARI = 'linguza_theme';

const TemaBaglami = createContext<TemaDegeri | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const sistem = useColorScheme();
  // Kullanıcı henüz seçim yapmadıysa TELEFONUN tercihine uyulur. Web'de
  // varsayılan "light"tı; mobilde sistemi yok saymak yabancı bir uygulama
  // hissi veriyor, bu yüzden başlangıç sistemden geliyor.
  const [secim, setSecim] = useState<Tema | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(DEPO_ANAHTARI)
      .then((deger) => {
        if (deger === 'light' || deger === 'dark') setSecim(deger);
      })
      .catch(() => {
        /* Tercih okunamazsa sistem temasıyla devam edilir — akışı kesmeye değmez. */
      });
  }, []);

  const tema: Tema = secim ?? (sistem === 'dark' ? 'dark' : 'light');

  const temaDegistir = useCallback(() => {
    setSecim((oncekiSecim) => {
      const suanki = oncekiSecim ?? (sistem === 'dark' ? 'dark' : 'light');
      const yeni: Tema = suanki === 'light' ? 'dark' : 'light';
      AsyncStorage.setItem(DEPO_ANAHTARI, yeni).catch(() => {});
      return yeni;
    });
  }, [sistem]);

  const deger = useMemo<TemaDegeri>(
    () => ({
      tema,
      renk: tema === 'dark' ? DARK : LIGHT,
      koyuMu: tema === 'dark',
      temaDegistir,
    }),
    [tema, temaDegistir],
  );

  return <TemaBaglami.Provider value={deger}>{children}</TemaBaglami.Provider>;
}

export function useTema(): TemaDegeri {
  const baglam = useContext(TemaBaglami);
  if (!baglam) throw new Error('useTema, ThemeProvider içinde kullanılmalıdır.');
  return baglam;
}

/** Yalnızca renklere ihtiyaç duyan bileşenler için kısa yol. */
export function useRenk(): Palette {
  return useTema().renk;
}
