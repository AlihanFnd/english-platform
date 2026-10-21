import AsyncStorage from '@react-native-async-storage/async-storage';

import { api, ApiHatasi } from './api';

export type KuyrukIsTuru = 'ilerleme' | 'kelime_ekle' | 'cumle_ekle' | 'calisma_sonucu';

export interface KuyrukIsi {
  id: string;
  userId: number;
  tur: KuyrukIsTuru;
  govde: any;
  olusturmaAt: number;
  denemeSayisi: number;
}

const KUYRUK_ANAHTARI = '@linguza_yazma_kuyrugu';
const AZAMI_KUYRUK_BOYUTU = 500;

let islemeKilitli = false;

/** Diskten mevcut yazma kuyruğunu okur. */
export async function kuyruguOku(): Promise<KuyrukIsi[]> {
  try {
    const json = await AsyncStorage.getItem(KUYRUK_ANAHTARI);
    if (!json) return [];
    return JSON.parse(json) as KuyrukIsi[];
  } catch {
    return [];
  }
}

/** Yazma kuyruğunu diske kaydeder. */
export async function kuyruguKaydet(kuyruk: KuyrukIsi[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KUYRUK_ANAHTARI, JSON.stringify(kuyruk));
  } catch {
    // Yutulur
  }
}

/**
 * Kuyruğa yeni bir iş ekler.
 * Birleştirme Kuralı: Aynı kitabın 'ilerleme' işlerinden yalnızca en sonuncusu tutulur.
 * Tavan Kuralı: En fazla 500 iş tutulur.
 */
export async function isEkle(
  userId: number,
  tur: KuyrukIsTuru,
  govde: any,
): Promise<number> {
  let kuyruk = await kuyruguOku();

  if (tur === 'ilerleme' && govde?.bookId) {
    // Aynı kullanıcının aynı kitabına ait önceki ilerleme kayıtlarını temizle
    kuyruk = kuyruk.filter(
      (is) => !(is.userId === userId && is.tur === 'ilerleme' && is.govde?.bookId === govde.bookId),
    );
  }

  const yeniIs: KuyrukIsi = {
    id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    userId,
    tur,
    govde,
    olusturmaAt: Date.now(),
    denemeSayisi: 0,
  };

  kuyruk.push(yeniIs);

  if (kuyruk.length > AZAMI_KUYRUK_BOYUTU) {
    // 500 tavanını aşarsa en eski işleri kırp (FIFO)
    kuyruk = kuyruk.slice(kuyruk.length - AZAMI_KUYRUK_BOYUTU);
  }

  await kuyruguKaydet(kuyruk);
  return kuyruk.filter((i) => i.userId === userId).length;
}

/** Belirtilen kullanıcıya ait veya tüm kuyruk işlerini temizler. */
export async function temizleKuyruk(userId?: number): Promise<void> {
  if (userId === undefined) {
    await AsyncStorage.removeItem(KUYRUK_ANAHTARI);
  } else {
    const kuyruk = await kuyruguOku();
    const kalanlar = kuyruk.filter((is) => is.userId !== userId);
    await kuyruguKaydet(kalanlar);
  }
}

/** Kuyruktaki toplam iş sayısını döndürür. */
export async function kuyrukSayisiAl(userId?: number): Promise<number> {
  const kuyruk = await kuyruguOku();
  if (userId === undefined) return kuyruk.length;
  return kuyruk.filter((is) => is.userId === userId).length;
}

/**
 * Kuyruktaki işleri sırayla (FIFO) sunucuya gönderir.
 * - 401 hatasında: Kuyruk durdurulur, silinmez.
 * - 4xx (401/429 hariç) hatasında: İş düşürülür (silinir) ve sıradaki işe geçilir.
 * - 429 veya Ağ hatasında (durum === 0): İşlem durdurulur.
 */
export async function kuyruguIsle(
  userId: number,
  onKuyrukSayisiGuncelle?: (sayi: number) => void,
): Promise<void> {
  if (islemeKilitli) return;
  islemeKilitli = true;

  try {
    let kuyruk = await kuyruguOku();
    let kullaniciIsleri = kuyruk.filter((is) => is.userId === userId);

    if (kullaniciIsleri.length === 0) {
      if (onKuyrukSayisiGuncelle) onKuyrukSayisiGuncelle(0);
      return;
    }

    if (onKuyrukSayisiGuncelle) {
      onKuyrukSayisiGuncelle(kullaniciIsleri.length);
    }

    let i = 0;
    while (i < kuyruk.length) {
      const is = kuyruk[i];
      if (is.userId !== userId) {
        i++;
        continue;
      }

      try {
        if (is.tur === 'ilerleme') {
          await api.saveProgress(is.govde.bookId, is.govde.konum);
        } else if (is.tur === 'kelime_ekle') {
          await api.addWord(is.govde.word, is.govde.translation, is.govde.context);
        } else if (is.tur === 'cumle_ekle') {
          await api.addSentence(is.govde.cumle, is.govde.ceviri, is.govde.baglam);
        } else if (is.tur === 'calisma_sonucu') {
          if (is.govde.tur === 'cumle') {
            await api.kaydetCumleCalismaSonucu(is.govde.cumleId, is.govde.bildim);
          } else {
            await api.kaydetCalismaSonucu(is.govde.kelimeId, is.govde.bildim);
          }
        }

        // Başarılı: İş kuyruktan çıkarılır
        kuyruk.splice(i, 1);
        await kuyruguKaydet(kuyruk);
        const kalanSayisi = kuyruk.filter((item) => item.userId === userId).length;
        if (onKuyrukSayisiGuncelle) onKuyrukSayisiGuncelle(kalanSayisi);
      } catch (hata) {
        if (hata instanceof ApiHatasi) {
          if (hata.durum === 401) {
            // 401: Oturum düştü — kuyruk durdurulur, silinmez!
            console.warn('[yazmaKuyrugu] 401 Oturum hatası, kuyruk durduruldu.');
            break;
          } else if (hata.durum === 429 || hata.durum === 0) {
            // 429 veya Ağ hatası — işlem durdurulur, deneme sayısı artırılır
            is.denemeSayisi = (is.denemeSayisi || 0) + 1;
            await kuyruguKaydet(kuyruk);
            console.warn('[yazmaKuyrugu] Ağ/Hız sınırı hatası, bekleniyor.', hata.message);
            break;
          } else if (hata.durum >= 400 && hata.durum < 500) {
            // Diğer 4xx (400, 404, 409 vs.): Geçersiz iş kuyruktan düşürülür
            console.warn(`[yazmaKuyrugu] ${hata.durum} hatası nedeniyle iş düşürüldü:`, is);
            kuyruk.splice(i, 1);
            await kuyruguKaydet(kuyruk);
            const kalanSayisi = kuyruk.filter((item) => item.userId === userId).length;
            if (onKuyrukSayisiGuncelle) onKuyrukSayisiGuncelle(kalanSayisi);
          } else {
            // 5xx sunucu hatası — durdur
            break;
          }
        } else {
          // Bilinmeyen hata — durdur
          break;
        }
      }
    }
  } finally {
    islemeKilitli = false;
  }
}
