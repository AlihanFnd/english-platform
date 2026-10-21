import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, SeriOzeti } from '@/lib/api';
import { cancelAllHatirlatmalar, syncHatirlatmalar } from '@/lib/hatirlatmalar';
import { useKimlik as useAuth } from './AuthContext';

interface SeriBaglamDegeri {
  ozet: SeriOzeti | null;
  yukleniyor: boolean;
  yenile: () => Promise<void>;
  puanOlayi: () => void;
  ayarlariGuncelle: (ayarlar: {
    gunlukHedefXp?: number;
    saatDilimi?: string;
    seviye?: string;
    ilkAcilisTamamlandi?: boolean;
  }) => Promise<void>;
  gosterKutlama: boolean;
  kutlamayiKapat: () => void;
}

const SeriBaglami = createContext<SeriBaglamDegeri | undefined>(undefined);

export function SeriProvider({ children }: { children: React.ReactNode }) {
  const { kullanici } = useAuth();
  const [ozet, setOzet] = useState<SeriOzeti | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [gosterKutlama, setGosterKutlama] = useState(false);

  const debounceZamanlayici = useRef<NodeJS.Timeout | null>(null);
  const oncekiOzetRef = useRef<SeriOzeti | null>(null);

  const kutlamaKontrolEt = useCallback(async (yeniOzet: SeriOzeti, eskiOzet: SeriOzeti | null) => {
    if (!yeniOzet?.bugun) return;

    const bugunGun = yeniOzet.bugun.gun;
    const hedefTamam = yeniOzet.bugun.hedefTamamlandi;

    // Eğer bugün hedef tamamlandıysa ve eski özette henüz tamamlanmadıysa (veya yeni aktifleştiyse)
    if (hedefTamam) {
      if (!eskiOzet || !eskiOzet.bugun.hedefTamamlandi) {
        const anahtar = `linguza_kutlama_${bugunGun}`;
        const zatenGosterildi = await AsyncStorage.getItem(anahtar);
        if (!zatenGosterildi) {
          await AsyncStorage.setItem(anahtar, '1');
          setGosterKutlama(true);
        }
      }
    }
  }, []);

  const yenile = useCallback(async () => {
    if (!kullanici) return;
    try {
      const yeniOzet = await api.getSeri();
      const eskiOzet = oncekiOzetRef.current;
      oncekiOzetRef.current = yeniOzet;
      setOzet(yeniOzet);

      // Cihaz saat dilimi senkronizasyonu
      const cihazTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (cihazTz && yeniOzet.saatDilimi !== cihazTz) {
        try {
          const guncel = await api.seriAyarlariniGuncelle({ saatDilimi: cihazTz });
          setOzet(guncel);
          oncekiOzetRef.current = guncel;
        } catch {
          // Saat dilimi güncelleme hatası ana akışı engellemez
        }
      }

      await kutlamaKontrolEt(yeniOzet, eskiOzet);
      await syncHatirlatmalar(yeniOzet);
    } catch {
      // Hata durumunda var olan özet korunur
    }
  }, [kullanici, kutlamaKontrolEt]);

  const puanOlayi = useCallback(() => {
    if (debounceZamanlayici.current) {
      clearTimeout(debounceZamanlayici.current);
    }
    debounceZamanlayici.current = setTimeout(() => {
      yenile();
    }, 800);
  }, [yenile]);

  const ayarlariGuncelle = useCallback(
    async (ayarlar: {
      gunlukHedefXp?: number;
      saatDilimi?: string;
      seviye?: string;
      ilkAcilisTamamlandi?: boolean;
    }) => {
      setYukleniyor(true);
      try {
        const guncel = await api.seriAyarlariniGuncelle(ayarlar);
        oncekiOzetRef.current = guncel;
        setOzet(guncel);
        await syncHatirlatmalar(guncel);
      } finally {
        setYukleniyor(false);
      }
    },
    [],
  );

  const kutlamayiKapat = useCallback(() => {
    setGosterKutlama(false);
  }, []);

  useEffect(() => {
    if (kullanici) {
      setYukleniyor(true);
      yenile().finally(() => setYukleniyor(false));
    } else {
      setOzet(null);
      oncekiOzetRef.current = null;
      cancelAllHatirlatmalar();
    }
  }, [kullanici, yenile]);

  // Uygulama ön plana gelince veriyi tazele
  useEffect(() => {
    const abonelik = AppState.addEventListener('change', (sonrakiDurum: AppStateStatus) => {
      if (sonrakiDurum === 'active' && kullanici) {
        yenile();
      }
    });
    return () => abonelik.remove();
  }, [kullanici, yenile]);

  return (
    <SeriBaglami.Provider
      value={{
        ozet,
        yukleniyor,
        yenile,
        puanOlayi,
        ayarlariGuncelle,
        gosterKutlama,
        kutlamayiKapat,
      }}
    >
      {children}
    </SeriBaglami.Provider>
  );
}

export function useSeri() {
  const baglam = useContext(SeriBaglami);
  if (!baglam) {
    throw new Error('useSeri, bir SeriProvider içinde kullanılmalıdır.');
  }
  return baglam;
}
