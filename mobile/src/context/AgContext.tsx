import NetInfo from '@react-native-community/netinfo';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Metin } from '@/components/ui';
import { useRenk } from '@/context/ThemeContext';
import { getAktifKullaniciId } from '@/lib/api';
import { kuyrukSayisiAl, kuyruguIsle } from '@/lib/yazmaKuyrugu';
import { alpha } from '@/theme/palette';
import { Bosluk } from '@/theme/tokens';

interface AgDegeri {
  cevrimiciMi: boolean;
  kuyrukSayisi: number;
  setKuyrukSayisi: React.Dispatch<React.SetStateAction<number>>;
  kuyruguTetikle: () => Promise<void>;
}

const AgBaglami = createContext<AgDegeri | undefined>(undefined);

export function AgProvider({ children }: { children: React.ReactNode }) {
  const [cevrimiciMi, setCevrimiciMi] = useState(true);
  const [kuyrukSayisi, setKuyrukSayisi] = useState(0);
  const kenar = useSafeAreaInsets();
  const palet = useRenk();

  const kuyruguTetikle = async () => {
    const userId = getAktifKullaniciId();
    if (userId) {
      const sayi = await kuyrukSayisiAl(userId);
      setKuyrukSayisi(sayi);
      if (cevrimiciMi && sayi > 0) {
        await kuyruguIsle(userId, setKuyrukSayisi);
      }
    }
  };

  useEffect(() => {
    const abonelik = NetInfo.addEventListener((state) => {
      const cevrimici = state.isConnected !== false && state.isInternetReachable !== false;
      setCevrimiciMi(cevrimici);

      if (cevrimici) {
        const userId = getAktifKullaniciId();
        if (userId) {
          kuyruguIsle(userId, setKuyrukSayisi).catch(() => {});
        }
      }
    });

    // İlk açılışta ve periyodik kontrol
    const zamanlayici = setInterval(() => {
      const userId = getAktifKullaniciId();
      if (userId) {
        kuyrukSayisiAl(userId).then((sayi) => {
          setKuyrukSayisi(sayi);
          if (cevrimiciMi && sayi > 0) {
            kuyruguIsle(userId, setKuyrukSayisi).catch(() => {});
          }
        });
      }
    }, 5000);

    return () => {
      abonelik();
      clearInterval(zamanlayici);
    };
  }, [cevrimiciMi]);

  const deger = useMemo<AgDegeri>(
    () => ({
      cevrimiciMi,
      kuyrukSayisi,
      setKuyrukSayisi,
      kuyruguTetikle,
    }),
    [cevrimiciMi, kuyrukSayisi],
  );

  const bantGoster = !cevrimiciMi || kuyrukSayisi > 0;

  return (
    <AgBaglami.Provider value={deger}>
      {bantGoster ? (
        <View
          style={{
            paddingTop: Math.max(kenar.top, 4),
            paddingBottom: 4,
            paddingHorizontal: Bosluk.md,
            backgroundColor: !cevrimiciMi ? palet.error : alpha(palet.primary, 0.9),
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999,
          }}
        >
          <Metin tur="minik" kalin renk="#FFFFFF" ortala>
            {!cevrimiciMi
              ? `Çevrimdışısın — kayıtların bağlantı gelince gönderilecek${
                  kuyrukSayisi > 0 ? ` (${kuyrukSayisi})` : ''
                }`
              : `Kuyruktaki kayıtlar gönderiliyor (${kuyrukSayisi})…`}
          </Metin>
        </View>
      ) : null}
      {children}
    </AgBaglami.Provider>
  );
}

export function useAg() {
  const baglam = useContext(AgBaglami);
  if (!baglam) {
    throw new Error('useAg, AgProvider içinde kullanılmalıdır.');
  }
  return baglam;
}
