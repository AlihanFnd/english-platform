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
  ogrenildi: number;
  calisiliyor: number;
  hicCalisilmadi: number;
  asina: number;
}

const DEPO_ONEKI = 'linguza_sentences_';

function getDepoAnahtari(userId?: number | string): string {
  return `${DEPO_ONEKI}${userId ?? 'default'}`;
}

export const cumleDeposu = {
  getCumleler(userId?: number | string): SentenceItem[] {
    if (typeof window === 'undefined') return [];
    try {
      const anahtar = getDepoAnahtari(userId);
      const veri = localStorage.getItem(anahtar);
      if (!veri) return [];
      const liste: SentenceItem[] = JSON.parse(veri);
      return Array.isArray(liste) ? liste : [];
    } catch {
      return [];
    }
  },

  cumleEkle(
    userId: number | string | undefined,
    sentence: string,
    translation: string,
    context?: string,
  ): SentenceItem {
    const anahtar = getDepoAnahtari(userId);
    const mevcut = cumleDeposu.getCumleler(userId);

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

    if (typeof window !== 'undefined') {
      localStorage.setItem(anahtar, JSON.stringify(mevcut));
    }
    return yeni;
  },

  topluCumleEkle(
    userId: number | string | undefined,
    items: Array<{ sentence: string; translation: string; context?: string }>,
  ): number {
    if (!items.length) return 0;
    const anahtar = getDepoAnahtari(userId);
    const mevcut = cumleDeposu.getCumleler(userId);
    let eklenen = 0;

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
        eklenen++;
      }
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem(anahtar, JSON.stringify(mevcut));
    }
    return eklenen;
  },

  cumleGuncelle(
    userId: number | string | undefined,
    id: string,
    sentence: string,
    translation: string,
    context?: string,
  ): void {
    const anahtar = getDepoAnahtari(userId);
    const liste = cumleDeposu.getCumleler(userId);
    const index = liste.findIndex((c) => c.id === id);
    if (index >= 0) {
      liste[index] = {
        ...liste[index],
        sentence: sentence.trim(),
        translation: translation.trim(),
        context: context?.trim() || '',
      };
      if (typeof window !== 'undefined') {
        localStorage.setItem(anahtar, JSON.stringify(liste));
      }
    }
  },

  cumleSil(userId: number | string | undefined, id: string): void {
    const anahtar = getDepoAnahtari(userId);
    const liste = cumleDeposu.getCumleler(userId);
    const filtrelenmis = liste.filter((c) => c.id !== id);
    if (typeof window !== 'undefined') {
      localStorage.setItem(anahtar, JSON.stringify(filtrelenmis));
    }
  },

  cumleCalismaKaydet(
    userId: number | string | undefined,
    id: string,
    bildim: boolean,
  ): SentenceItem | null {
    const anahtar = getDepoAnahtari(userId);
    const liste = cumleDeposu.getCumleler(userId);
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

    if (typeof window !== 'undefined') {
      localStorage.setItem(anahtar, JSON.stringify(liste));
    }
    return hedef;
  },

  cumleOzeti(userId?: number | string): CumleOzeti {
    const liste = cumleDeposu.getCumleler(userId);
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
