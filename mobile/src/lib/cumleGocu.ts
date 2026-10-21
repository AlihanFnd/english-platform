import AsyncStorage from '@react-native-async-storage/async-storage';

import { api } from '@/lib/api';
import { type GocSonucu, yerelCumleGocunuYurut } from '@/lib/cumleGocuCekirdek';

export type { GocSonucu } from '@/lib/cumleGocuCekirdek';

/**
 * Cihazdaki yerel cümleleri tek seferlik sunucuya taşır (YH-05).
 * Kurallar web ile ortak olan cumleGocuCekirdek.ts içinde; burası yalnızca
 * AsyncStorage'ı ve API'yi bağlar.
 */
export async function cumleGocuCalistir(userId: number | string): Promise<GocSonucu> {
  const sonuc = await yerelCumleGocunuYurut({
    userId,
    veriAnahtarlari: [`@linguza_sentences_${userId}`, '@linguza_sentences_default', '@linguza_sentences'],
    depo: AsyncStorage,
    gonder: api.topluCumleEkle,
  });

  if (!sonuc.tamamlandi) {
    console.warn('[cumleGocu] Yerel cümleler taşınamadı; bir sonraki açılışta yeniden denenecek.', sonuc.hata);
  }
  return sonuc;
}
