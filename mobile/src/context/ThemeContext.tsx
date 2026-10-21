import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import { DARK, LIGHT, Palette } from '@/theme/palette';

type Tema = 'light' | 'dark';
type TemaTercihi = 'system' | 'light' | 'dark';

interface TemaDegeri {
  tema: Tema;
  renk: Palette;
  koyuMu: boolean;
  seciliMod: TemaTercihi;
  temaDegistir: () => void;
  temaAyarla: (tercih: TemaTercihi) => void;
}

const DEPO_ANAHTARI = 'linguza_theme';

const TemaBaglami = createContext<TemaDegeri | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const sistem = useColorScheme();
  const [secim, setSecim] = useState<Tema | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(DEPO_ANAHTARI)
      .then((deger) => {
        if (deger === 'light' || deger === 'dark') setSecim(deger);
      })
      .catch(() => {});
  }, []);

  const tema: Tema = secim ?? (sistem === 'dark' ? 'dark' : 'light');
  const seciliMod: TemaTercihi = secim === null ? 'system' : secim;

  const temaAyarla = useCallback((tercih: TemaTercihi) => {
    if (tercih === 'system') {
      setSecim(null);
      AsyncStorage.removeItem(DEPO_ANAHTARI).catch(() => {});
    } else {
      setSecim(tercih);
      AsyncStorage.setItem(DEPO_ANAHTARI, tercih).catch(() => {});
    }
  }, []);

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
      seciliMod,
      temaDegistir,
      temaAyarla,
    }),
    [tema, seciliMod, temaDegistir, temaAyarla],
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
