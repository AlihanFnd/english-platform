/**
 * Kelime biçimlendirme ve tür renkleri yardımcıları (YH-02).
 */

export interface KelimeParcalari {
  on: string;
  govde: string;
  son: string;
}

/**
 * Noktalamayı kelime gövdesinden ayırır.
 * Örnek: "adventures." -> { on: '', govde: 'adventures', son: '.' }
 * Örnek: '"Hello,"' -> { on: '"', govde: 'Hello', son: ',"' }
 * Örnek: '...' -> { on: '', govde: '', son: '...' }
 */
export function kelimeyiAyir(raw: string): KelimeParcalari {
  if (!raw) return { on: '', govde: '', son: '' };

  // Yalnızca noktalama veya sembolden oluşuyorsa
  if (!/[a-zA-Z0-9'\u00C0-\u024F-]/.test(raw)) {
    return { on: '', govde: '', son: raw };
  }

  // Baştaki noktalama/tırnak işaretleri
  const baslagicEslestirme = raw.match(/^[^a-zA-Z0-9\u00C0-\u024F]+/);
  const on = baslagicEslestirme ? baslagicEslestirme[0] : '';
  const kalan = raw.slice(on.length);

  // Sondaki noktalama/tırnak işaretleri
  const bitisEslestirme = kalan.match(/[^a-zA-Z0-9\u00C0-\u024F]+$/);
  const son = bitisEslestirme ? bitisEslestirme[0] : '';
  const govde = kalan.slice(0, kalan.length - son.length);

  return { on, govde, son };
}

export type TurKodu =
  | 'isim'
  | 'fiil'
  | 'sifat'
  | 'zarf'
  | 'edat'
  | 'baglac'
  | 'zamir'
  | 'diger';

/**
 * POS etiketini standart Tür Kodu enumuna çevirir.
 */
export function turKodunaCevir(tur?: string): TurKodu {
  if (!tur) return 'diger';
  const t = tur.trim().toLowerCase();

  if (t === 'noun' || t === 'isim' || t === 'n') return 'isim';
  if (t === 'verb' || t === 'fiil' || t === 'v') return 'fiil';
  if (t === 'adj' || t === 'adjective' || t === 'sifat' || t === 'sıfat') return 'sifat';
  if (t === 'adv' || t === 'adverb' || t === 'zarf') return 'zarf';
  if (t === 'prep' || t === 'preposition' || t === 'edat') return 'edat';
  if (t === 'conj' || t === 'conjunction' || t === 'baglac' || t === 'bağlaç') return 'baglac';
  if (t === 'pron' || t === 'pronoun' || t === 'zamir') return 'zamir';

  return 'diger';
}

/**
 * Tür rengi haritası (YH-02 Tasarım dili)
 */
export const TUR_RENKLERI: Record<TurKodu, string> = {
  isim: '#3B82F6',   // Mavi
  fiil: '#10B981',   // Yeşil
  sifat: '#F59E0B',  // Amber
  zarf: '#8B5CF6',   // Mor
  edat: '#EC4899',   // Pembe
  baglac: '#F97316', // Turuncu
  zamir: '#06B6D4',  // Camgöbeği
  diger: '#94A3B8',  // Gri
};

export const TUR_ETIKETLERI: Record<TurKodu, string> = {
  isim: 'isim',
  fiil: 'fiil',
  sifat: 'sıfat',
  zarf: 'zarf',
  edat: 'edat',
  baglac: 'bağlaç',
  zamir: 'zamir',
  diger: 'diğer',
};

export function turRengi(tur?: string): string {
  const kod = turKodunaCevir(tur);
  return TUR_RENKLERI[kod];
}

export function turEtiketi(tur?: string): string {
  const kod = turKodunaCevir(tur);
  return TUR_ETIKETLERI[kod];
}
