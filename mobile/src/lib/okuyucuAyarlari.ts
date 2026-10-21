import AsyncStorage from '@react-native-async-storage/async-storage';

export interface OkuyucuAyarlari {
  yaziBoyutu: number;
  renkliKelimeler: boolean;
}

export const VARSAYILAN_OKUYUCU_AYARLARI: OkuyucuAyarlari = {
  yaziBoyutu: 18,
  renkliKelimeler: true,
};

export const GEÇERLI_YAZI_BOYUTLARI = [14, 16, 18, 20, 22, 24, 26] as const;

const DEPOLAMA_ANAHTARI = 'linguza_okuyucu_ayarlari';

/**
 * Okuyucu ayarlarını AsyncStorage'dan okur.
 * Okunamazsa varsayılan ayarlarla döner.
 */
export async function okuyucuAyarlariniOku(): Promise<OkuyucuAyarlari> {
  try {
    const ham = await AsyncStorage.getItem(DEPOLAMA_ANAHTARI);
    if (!ham) return { ...VARSAYILAN_OKUYUCU_AYARLARI };

    const veri = JSON.parse(ham) as Partial<OkuyucuAyarlari>;
    const yaziBoyutu =
      typeof veri.yaziBoyutu === 'number' &&
      GEÇERLI_YAZI_BOYUTLARI.includes(veri.yaziBoyutu as any)
        ? veri.yaziBoyutu
        : VARSAYILAN_OKUYUCU_AYARLARI.yaziBoyutu;

    const renkliKelimeler =
      typeof veri.renkliKelimeler === 'boolean'
        ? veri.renkliKelimeler
        : VARSAYILAN_OKUYUCU_AYARLARI.renkliKelimeler;

    return { yaziBoyutu, renkliKelimeler };
  } catch {
    return { ...VARSAYILAN_OKUYUCU_AYARLARI };
  }
}

/**
 * Okuyucu ayarlarını AsyncStorage'a kaydeder.
 */
export async function okuyucuAyarlariniKaydet(
  yeniAyarlar: Partial<OkuyucuAyarlari>,
): Promise<OkuyucuAyarlari> {
  try {
    const mevcut = await okuyucuAyarlariniOku();
    const guncel: OkuyucuAyarlari = {
      yaziBoyutu:
        typeof yeniAyarlar.yaziBoyutu === 'number' &&
        GEÇERLI_YAZI_BOYUTLARI.includes(yeniAyarlar.yaziBoyutu as any)
          ? yeniAyarlar.yaziBoyutu
          : mevcut.yaziBoyutu,
      renkliKelimeler:
        typeof yeniAyarlar.renkliKelimeler === 'boolean'
          ? yeniAyarlar.renkliKelimeler
          : mevcut.renkliKelimeler,
    };

    await AsyncStorage.setItem(DEPOLAMA_ANAHTARI, JSON.stringify(guncel));
    return guncel;
  } catch {
    return { ...VARSAYILAN_OKUYUCU_AYARLARI };
  }
}
