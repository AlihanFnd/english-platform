/// <reference types="node" />
import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

import * as mobil from '@/lib/cumleGocuCekirdek';
import * as web from '../../../frontend/app/lib/cumleGocuCekirdek';

// Web istemcisinde test koşucusu yok. Çekirdek iki istemcide de aynı dosya olduğu
// için senaryolar iki kopyaya da buradan koşturulur ve kopyaların ayrışması yakalanır.
describe('çekirdek kopyaları', () => {
  it('mobil ve web kopyası BİREBİR aynı', () => {
    const kok = join(__dirname, '..', '..', '..');
    expect(readFileSync(join(kok, 'frontend', 'app', 'lib', 'cumleGocuCekirdek.ts'), 'utf8')).toBe(
      readFileSync(join(kok, 'mobile', 'src', 'lib', 'cumleGocuCekirdek.ts'), 'utf8'),
    );
  });
});

const kopyalar: Array<[string, typeof mobil]> = [
  ['mobil', mobil],
  ['web', web],
];

describe.each(kopyalar)('%s çekirdeği', (_ad, cekirdek) => {
  // Web adaptörü localStorage'ı SENKRON sarar; çekirdek iki biçimi de beklemeli.
  function senkronDepo(baslangic: Record<string, string> = {}) {
    const harita = new Map(Object.entries(baslangic));
    return {
      harita,
      getItem: (anahtar: string) => harita.get(anahtar) ?? null,
      setItem: (anahtar: string, deger: string) => {
        harita.set(anahtar, deger);
      },
      removeItem: (anahtar: string) => {
        harita.delete(anahtar);
      },
    };
  }

  describe('sinirla', () => {
    it('sınırın altındaki metne dokunmaz', () => {
      expect(cekirdek.sinirla('abc', 5)).toBe('abc');
    });

    it('sınırda keser', () => {
      expect(cekirdek.sinirla('abcdef', 4)).toBe('abcd');
    });

    it('vekil çiftini ortasından bölmez', () => {
      expect(cekirdek.sinirla('ab😀', 3)).toBe('ab');
    });
  });

  describe('gocOgeleriniHazirla', () => {
    it('eski ve yeni alan adlarını okur; boşları ve nesne olmayanları atar', () => {
      const { ogeler, kirpilan } = cekirdek.gocOgeleriniHazirla([
        { sentence: '  Old field names.  ', translation: ' Eski ', context: ' ctx ' },
        { cumle: 'New field names.', ceviri: 'Yeni', baglam: '' },
        { sentence: '   ', translation: 'boş' },
        null,
        42,
        'metin',
        [],
        { translation: 'cümlesiz' },
      ]);

      expect(ogeler).toEqual([
        { cumle: 'Old field names.', ceviri: 'Eski', baglam: 'ctx' },
        { cumle: 'New field names.', ceviri: 'Yeni', baglam: '' },
      ]);
      expect(kirpilan).toBe(0);
    });

    it('kolonu aşan her alanı kırpar ve öğe başına BİR kez sayar', () => {
      const { ogeler, kirpilan } = cekirdek.gocOgeleriniHazirla([
        { sentence: 'x'.repeat(600), translation: 'y'.repeat(1200), context: 'z'.repeat(450) },
        { sentence: 'Fits.', translation: 'Sığar.' },
      ]);

      expect(ogeler[0]).toEqual({ cumle: 'x'.repeat(500), ceviri: 'y'.repeat(1000), baglam: 'z'.repeat(400) });
      expect(kirpilan).toBe(1);
    });
  });

  describe('parcala', () => {
    it('sona kalan eksik parçayı da verir', () => {
      expect(cekirdek.parcala([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    });

    it('geçersiz boyutu reddeder', () => {
      expect(() => cekirdek.parcala([1], 0)).toThrow(RangeError);
    });
  });

  describe('yerelCumleGocunuYurut (senkron depo)', () => {
    const anahtarlar = ['k_kullanici', 'k_varsayilan'];

    it('kırpar, bütün anahtarları taşır, bozuk veriyi olduğu gibi bırakır', async () => {
      const depo = senkronDepo({
        k_kullanici: '{bozuk',
        k_varsayilan: JSON.stringify([
          { sentence: 'p'.repeat(700), translation: 't' },
          { sentence: 'Two.', translation: 'İki' },
        ]),
      });
      const gonderilen: unknown[] = [];

      const sonuc = await cekirdek.yerelCumleGocunuYurut({
        userId: 3,
        veriAnahtarlari: anahtarlar,
        depo,
        gonder: async (ogeler) => {
          gonderilen.push(...ogeler);
          return { eklenen: ogeler.length, atlanan: 0 };
        },
      });

      expect(sonuc).toEqual({ tamamlandi: true, eklenen: 2, atlanan: 0, kirpilan: 1 });
      expect(gonderilen).toEqual([
        { cumle: 'p'.repeat(500), ceviri: 't', baglam: '' },
        { cumle: 'Two.', ceviri: 'İki', baglam: '' },
      ]);
      expect(depo.harita.get('k_kullanici')).toBe('{bozuk');
      expect(depo.harita.has('k_varsayilan')).toBe(false);
      expect(depo.harita.get(`${cekirdek.GOC_BAYRAGI_ONEKI}3`)).toBe('1');
    });

    it('ikinci parça başarısızsa hiçbir anahtar silinmez ve bayrak konmaz', async () => {
      const liste = JSON.stringify(
        Array.from({ length: cekirdek.TOPLU_PARCA_BOYUTU + 1 }, (_, i) => ({ sentence: `S${i}` })),
      );
      const depo = senkronDepo({ k_kullanici: liste });
      let cagri = 0;

      const sonuc = await cekirdek.yerelCumleGocunuYurut({
        userId: 3,
        veriAnahtarlari: anahtarlar,
        depo,
        gonder: async (ogeler) => {
          cagri++;
          if (cagri === 2) throw new Error('429');
          return { eklenen: ogeler.length, atlanan: 0 };
        },
      });

      expect(sonuc).toMatchObject({ tamamlandi: false, eklenen: cekirdek.TOPLU_PARCA_BOYUTU, atlanan: 0, kirpilan: 0 });
      expect(sonuc.hata).toBeInstanceOf(Error);
      expect(depo.harita.get('k_kullanici')).toBe(liste);
      expect(depo.harita.has(`${cekirdek.GOC_BAYRAGI_ONEKI}3`)).toBe(false);
    });
  });
});
