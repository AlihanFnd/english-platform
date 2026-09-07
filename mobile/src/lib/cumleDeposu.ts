import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SentenceItem {
  id: string;
  sentence: string;
  translation: string;
  context?: string;
  addedAt: string;
  dogruSayisi: number;
  yanlisSayisi: number;
  dogruSeri: number;
  sonCalismaAt?: string;
}

export interface CumleOzeti {
  toplam: number;
  ogrenildi: number; // dogruSeri >= 2
  calisiliyor: number;
  hicCalisilmadi: number;
  asina: number; // dogruSayisi > 0
}

const DEPO_ONEKI = '@linguza_sentences_';

function getDepoAnahtari(userId?: number | string): string {
  return `${DEPO_ONEKI}${userId ?? 'default'}`;
}

export const cumleDeposu = {
  async getCumleler(userId?: number | string): Promise<SentenceItem[]> {
    try {
      const anahtar = getDepoAnahtari(userId);
      const veri = await AsyncStorage.getItem(anahtar);
      if (!veri) return [];
      const liste: SentenceItem[] = JSON.parse(veri);
      return Array.isArray(liste) ? liste : [];
    } catch {
      return [];
    }
  },

  async cumleEkle(
    userId: number | string | undefined,
    sentence: string,
    translation: string,
    context?: string,
  ): Promise<SentenceItem> {
    const anahtar = getDepoAnahtari(userId);
    const mevcut = await cumleDeposu.getCumleler(userId);

    const yeni: SentenceItem = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      sentence: sentence.trim(),
      translation: translation.trim(),
      context: context?.trim() || '',
      addedAt: new Date().toISOString(),
      dogruSayisi: 0,
      yanlisSayisi: 0,
      dogruSeri: 0,
    };

    // Aynı cümle daha önce eklenmişse güncelle veya listeye ekle
    const index = mevcut.findIndex(
      (c) => c.sentence.toLowerCase() === yeni.sentence.toLowerCase(),
    );
    if (index >= 0) {
      mevcut[index] = {
        ...mevcut[index],
        translation: yeni.translation,
        context: yeni.context || mevcut[index].context,
      };
    } else {
      mevcut.unshift(yeni);
    }

    await AsyncStorage.setItem(anahtar, JSON.stringify(mevcut));
    return yeni;
  },

  async topluCumleEkle(
    userId: number | string | undefined,
    items: Array<{ sentence: string; translation: string; context?: string }>,
  ): Promise<number> {
    if (!items.length) return 0;
    const anahtar = getDepoAnahtari(userId);
    const mevcut = await cumleDeposu.getCumleler(userId);
    let eklenenSayisi = 0;

    for (const item of items) {
      const s = item.sentence.trim();
      const t = item.translation.trim();
      if (!s || !t) continue;

      const varMi = mevcut.findIndex((c) => c.sentence.toLowerCase() === s.toLowerCase());
      if (varMi >= 0) {
        mevcut[varMi].translation = t;
        if (item.context) mevcut[varMi].context = item.context;
      } else {
        mevcut.unshift({
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          sentence: s,
          translation: t,
          context: item.context?.trim() || '',
          addedAt: new Date().toISOString(),
          dogruSayisi: 0,
          yanlisSayisi: 0,
          dogruSeri: 0,
        });
        eklenenSayisi++;
      }
    }

    await AsyncStorage.setItem(anahtar, JSON.stringify(mevcut));
    return eklenenSayisi;
  },

  async cumleGuncelle(
    userId: number | string | undefined,
    id: string,
    sentence: string,
    translation: string,
    context?: string,
  ): Promise<void> {
    const anahtar = getDepoAnahtari(userId);
    const liste = await cumleDeposu.getCumleler(userId);
    const index = liste.findIndex((c) => c.id === id);
    if (index >= 0) {
      liste[index] = {
        ...liste[index],
        sentence: sentence.trim(),
        translation: translation.trim(),
        context: context?.trim() || '',
      };
      await AsyncStorage.setItem(anahtar, JSON.stringify(liste));
    }
  },

  async cumleSil(userId: number | string | undefined, id: string): Promise<void> {
    const anahtar = getDepoAnahtari(userId);
    const liste = await cumleDeposu.getCumleler(userId);
    const filtrelenmis = liste.filter((c) => c.id !== id);
    await AsyncStorage.setItem(anahtar, JSON.stringify(filtrelenmis));
  },

  async cumleCalismaKaydet(
    userId: number | string | undefined,
    id: string,
    bildim: boolean,
  ): Promise<SentenceItem | null> {
    const anahtar = getDepoAnahtari(userId);
    const liste = await cumleDeposu.getCumleler(userId);
    const index = liste.findIndex((c) => c.id === id);
    if (index === -1) return null;

    const hedef = liste[index];
    if (bildim) {
      hedef.dogruSayisi = (hedef.dogruSayisi || 0) + 1;
      hedef.dogruSeri = (hedef.dogruSeri || 0) + 1;
    } else {
      hedef.yanlisSayisi = (hedef.yanlisSayisi || 0) + 1;
      hedef.dogruSeri = 0;
    }
    hedef.sonCalismaAt = new Date().toISOString();
    liste[index] = hedef;

    await AsyncStorage.setItem(anahtar, JSON.stringify(liste));
    return hedef;
  },

  async cumleOzeti(userId?: number | string): Promise<CumleOzeti> {
    const liste = await cumleDeposu.getCumleler(userId);
    const toplam = liste.length;
    let ogrenildi = 0;
    let calisiliyor = 0;
    let hicCalisilmadi = 0;
    let asina = 0;

    for (const c of liste) {
      if (c.dogruSayisi > 0) asina++;
      if (c.dogruSeri >= 2) {
        ogrenildi++;
      } else if (c.sonCalismaAt) {
        calisiliyor++;
      } else {
        hicCalisilmadi++;
      }
    }

    return {
      toplam,
      ogrenildi,
      calisiliyor,
      hicCalisilmadi,
      asina,
    };
  },
};
