/**
 * Cümle kurucu biçimlendirme kuralları (YH-03).
 */

export interface CumleParcasi {
  govde: string;
  son?: string;
}

/**
 * Seçilen kelime parçalarını kurallara uygun biçimde birleştirir.
 *
 * KURALLAR:
 * 1. Gövdeler tek boşlukla birleşir.
 * 2. İlk harf büyütülür (en-US yereliyle).
 * 3. Son seçilen kelimenin sonekinde (. ! ?) varsa korunur; yoksa nokta eklenmez.
 * 4. Birden fazla boşluk teke indirilir, uçlar kırpılır.
 */
export function cumleyiBicimle(parcalar: CumleParcasi[]): string {
  if (!parcalar || parcalar.length === 0) return '';

  const temizParcalar = parcalar
    .map((p) => ({
      govde: p.govde ? p.govde.trim() : '',
      son: p.son ? p.son.trim() : '',
    }))
    .filter((p) => p.govde.length > 0);

  if (temizParcalar.length === 0) return '';

  let metin = temizParcalar.map((p) => p.govde).join(' ');

  // 1. İlk harfi büyüt (İngilizce yereli)
  if (metin.length > 0) {
    metin = metin.charAt(0).toLocaleUpperCase('en-US') + metin.slice(1);
  }

  // 2. Son seçilen kelimenin noktalama işareti varsa ekle
  const sonParca = temizParcalar[temizParcalar.length - 1];
  if (sonParca.son) {
    const noktalamaEslestirme = sonParca.son.match(/[.!?]+/);
    if (noktalamaEslestirme) {
      metin = metin + noktalamaEslestirme[0];
    }
  }

  // 3. Çift boşlukları ve uçlardaki boşlukları temizle
  metin = metin.replace(/\s+/g, ' ').trim();

  return metin;
}

/**
 * Sıra numarası simgesi (1->①, 2->② ... 20->⑳)
 */
export function siraRozeti(no: number): string {
  const rozetler = [
    '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩',
    '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑯', '⑲', '⑳',
  ];
  if (no >= 1 && no <= 20) return rozetler[no - 1];
  return `(${no})`;
}
