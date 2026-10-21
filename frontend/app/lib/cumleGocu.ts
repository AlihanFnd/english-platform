import { api } from '../api';
import { type GocDeposu, type GocSonucu, yerelCumleGocunuYurut } from './cumleGocuCekirdek';

export type { GocSonucu } from './cumleGocuCekirdek';

const tarayiciDeposu: GocDeposu = {
  getItem: (anahtar) => localStorage.getItem(anahtar),
  setItem: (anahtar, deger) => localStorage.setItem(anahtar, deger),
  removeItem: (anahtar) => localStorage.removeItem(anahtar),
};

/**
 * Tarayıcıdaki (localStorage) yerel cümleleri tek seferlik sunucuya taşır (YH-05).
 * Kurallar mobil ile ortak olan cumleGocuCekirdek.ts içinde; burası yalnızca
 * localStorage'ı ve API'yi bağlar.
 */
export async function cumleGocuCalistir(userId: number | string): Promise<GocSonucu> {
  if (typeof window === 'undefined') return { tamamlandi: true, eklenen: 0, atlanan: 0, kirpilan: 0 };

  const sonuc = await yerelCumleGocunuYurut({
    userId,
    veriAnahtarlari: [`linguza_sentences_${userId}`, 'linguza_sentences_default', 'linguza_sentences'],
    depo: tarayiciDeposu,
    gonder: api.topluCumleEkle,
  });

  if (!sonuc.tamamlandi) {
    console.warn('[cumleGocu] Yerel cümleler taşınamadı; bir sonraki açılışta yeniden denenecek.', sonuc.hata);
  }
  return sonuc;
}
