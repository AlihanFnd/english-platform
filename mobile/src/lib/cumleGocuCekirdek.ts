/**
 * YH-05 — Yerel cümlelerin sunucuya tek seferlik göçünün ÇEKİRDEĞİ.
 *
 * Bu dosya mobile/src/lib ve frontend/app/lib altında BİREBİR AYNIDIR ve hiçbir şey
 * içe aktarmaz: depolama (AsyncStorage / localStorage) ve ağ çağrısı dışarıdan verilir.
 * mobile/src/lib/cumleGocuCekirdek.test.ts iki kopyayı aynı senaryolarla koşturur ve
 * dosyaların aynı kaldığını denetler — birini değiştirirsen ötekine de kopyala.
 */

/** Sunucudaki kolon sınırları: AlanSinirlari.Cumle / CumleCevirisi / CumleBaglami. */
export const CUMLE_SINIRLARI = { cumle: 500, ceviri: 1000, baglam: 400 } as const;

/** Sunucunun tek istekte kabul ettiği en fazla öğe: AlanSinirlari.TopluCumleEnCok. */
export const TOPLU_PARCA_BOYUTU = 200;

export const GOC_BAYRAGI_ONEKI = 'linguza_cumle_gocu_';

export interface TopluCumleOgesi {
  cumle: string;
  ceviri: string;
  baglam: string;
}

export interface GocSonucu {
  tamamlandi: boolean;
  eklenen: number;
  atlanan: number;
  /** Kolon sınırına kırpılarak gönderilen öğe sayısı. */
  kirpilan: number;
  /** Göç tamamlanamadıysa nedeni; çağıran günlüğe yazar. */
  hata?: unknown;
}

/** AsyncStorage (async) ve localStorage (senkron) ikisi de bu biçime uyar. */
export interface GocDeposu {
  getItem(anahtar: string): Promise<string | null> | string | null;
  setItem(anahtar: string, deger: string): Promise<void> | void;
  removeItem(anahtar: string): Promise<void> | void;
}

export type TopluGonderici = (
  ogeler: TopluCumleOgesi[],
) => Promise<{ eklenen: number; atlanan: number }>;

export interface GocSecenekleri {
  userId: number | string;
  /** Eski yerel depo anahtarları; HEPSİ okunur ve birleştirilir. */
  veriAnahtarlari: readonly string[];
  depo: GocDeposu;
  gonder: TopluGonderici;
}

/**
 * Metni en fazla `enCok` UTF-16 birimine kısaltır. Bir emojiyi (vekil çifti) ortasından
 * bölmez: yarım kalan vekil geçerli bir Unicode metni değildir.
 */
export function sinirla(metin: string, enCok: number): string {
  if (metin.length <= enCok) return metin;
  const sonKod = metin.charCodeAt(enCok - 1);
  const kesim = sonKod >= 0xd800 && sonKod <= 0xdbff ? enCok - 1 : enCok;
  return metin.slice(0, kesim);
}

function metinAlani(kayit: Record<string, unknown>, adlar: readonly string[]): string {
  for (const ad of adlar) {
    const deger = kayit[ad];
    if (typeof deger === 'string' && deger.trim()) return deger.trim();
  }
  return '';
}

/**
 * Eski yerel kayıtları sunucunun toplu ucuna uygun öğelere çevirir.
 *
 * Eski depoda uzunluk sınırı yoktu. Kolonu aşan alan, canlı kaydetme yolundaki
 * (cumleKaydet) aynı sınıra kırpılır: kırpmadan göndermek cümleyi sunucuda atlatır,
 * yerel kopyası da göç sonunda silindiği için cümle KAYBOLURDU.
 */
export function gocOgeleriniHazirla(kayitlar: readonly unknown[]): {
  ogeler: TopluCumleOgesi[];
  kirpilan: number;
} {
  const ogeler: TopluCumleOgesi[] = [];
  let kirpilan = 0;

  for (const kayit of kayitlar) {
    if (!kayit || typeof kayit !== 'object' || Array.isArray(kayit)) continue;
    const alanlar = kayit as Record<string, unknown>;

    const cumle = metinAlani(alanlar, ['sentence', 'cumle']);
    if (!cumle) continue;
    const ceviri = metinAlani(alanlar, ['translation', 'ceviri']);
    const baglam = metinAlani(alanlar, ['context', 'baglam']);

    const oge: TopluCumleOgesi = {
      cumle: sinirla(cumle, CUMLE_SINIRLARI.cumle).trimEnd(),
      ceviri: sinirla(ceviri, CUMLE_SINIRLARI.ceviri).trimEnd(),
      baglam: sinirla(baglam, CUMLE_SINIRLARI.baglam).trimEnd(),
    };
    if (oge.cumle !== cumle || oge.ceviri !== ceviri || oge.baglam !== baglam) kirpilan++;
    ogeler.push(oge);
  }

  return { ogeler, kirpilan };
}

export function parcala<T>(dizi: readonly T[], boyut: number): T[][] {
  if (!Number.isInteger(boyut) || boyut < 1) {
    throw new RangeError('Parça boyutu pozitif bir tam sayı olmalı.');
  }
  const parcalar: T[][] = [];
  for (let i = 0; i < dizi.length; i += boyut) parcalar.push(dizi.slice(i, i + boyut));
  return parcalar;
}

/**
 * Göçü yürütür. Yerel veri YALNIZCA bütün parçalar sunucuya ulaştıktan sonra silinir;
 * ağ, oturum ya da hız sınırı hatasında hiçbir şey silinmez ve bir sonraki açılışta
 * yeniden denenir. Sunucu aynı cümleyi ikinci kez yazmaz (CumleAnahtari), bu yüzden
 * yarıda kalan bir göçü tekrar göndermek güvenlidir.
 */
export async function yerelCumleGocunuYurut({
  userId,
  veriAnahtarlari,
  depo,
  gonder,
}: GocSecenekleri): Promise<GocSonucu> {
  const bayrak = `${GOC_BAYRAGI_ONEKI}${userId}`;
  const sonuc: GocSonucu = { tamamlandi: false, eklenen: 0, atlanan: 0, kirpilan: 0 };

  try {
    if ((await depo.getItem(bayrak)) === '1') return { ...sonuc, tamamlandi: true };

    // BÜTÜN anahtarlar okunur: yalnızca ilk dolu anahtarı almak, ötekilerdeki
    // cümleleri bayrak konduktan sonra sonsuza dek cihazda bırakıyordu.
    const kayitlar: unknown[] = [];
    const silinecekler: string[] = [];
    for (const anahtar of veriAnahtarlari) {
      const ham = await depo.getItem(anahtar);
      if (!ham) continue;

      let cozulmus: unknown;
      try {
        cozulmus = JSON.parse(ham);
      } catch {
        // Bozuk veri taşınamaz; SİLİNMEZ ve göçün geri kalanını da kilitlemez.
        continue;
      }
      if (!Array.isArray(cozulmus)) continue;

      for (const kayit of cozulmus) kayitlar.push(kayit);
      silinecekler.push(anahtar);
    }

    const { ogeler, kirpilan } = gocOgeleriniHazirla(kayitlar);
    sonuc.kirpilan = kirpilan;

    for (const parca of parcala(ogeler, TOPLU_PARCA_BOYUTU)) {
      const yanit = await gonder(parca);
      sonuc.eklenen += yanit.eklenen;
      sonuc.atlanan += yanit.atlanan;
    }

    for (const anahtar of silinecekler) await depo.removeItem(anahtar);
    await depo.setItem(bayrak, '1');
    return { ...sonuc, tamamlandi: true };
  } catch (hata) {
    return { ...sonuc, hata };
  }
}
