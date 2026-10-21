import { api, CumleItem } from '@/lib/api';
import { CUMLE_SINIRLARI, sinirla } from '@/lib/cumleGocuCekirdek';

export interface CumleKaydetParametreleri {
  userId?: number | string;
  cumle: string;
  ceviri: string;
  baglam?: string;
}

/**
 * Okuyucudan cümle kaydetmenin tek giriş noktası (YH-03 / YH-05).
 * YH-05: Cümleler doğrudan sunucuya yazılır.
 */
export async function cumleKaydet({
  cumle,
  ceviri,
  baglam,
}: CumleKaydetParametreleri): Promise<CumleItem> {
  // Sınırlar ve kırpma kuralı göçle ortak: emoji ortasından bölünmez.
  const sinirliCumle = sinirla(cumle, CUMLE_SINIRLARI.cumle);
  const sinirliCeviri = sinirla(ceviri, CUMLE_SINIRLARI.ceviri);
  const sinirliBaglam = baglam ? sinirla(baglam, CUMLE_SINIRLARI.baglam) : '';

  return await api.addSentence(
    sinirliCumle,
    sinirliCeviri,
    sinirliBaglam,
  );
}
