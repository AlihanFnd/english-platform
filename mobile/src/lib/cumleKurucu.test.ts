import { describe, expect, it } from '@jest/globals';
import { cumleyiBicimle } from './cumleKurucu';
import { kelimeyiAyir } from './kelimeBicimi';

describe('cumleyiBicimle (YH-03)', () => {
  it('seçilen gövdeleri tek boşlukla birleştirir ve ilk harfi büyütür', () => {
    const sonuc = cumleyiBicimle([
      { govde: 'tom' },
      { govde: 'loves' },
      { govde: 'adventures' },
    ]);
    expect(sonuc).toBe('Tom loves adventures');
  });

  it('son parça nokta içeriyorsa noktayı korur', () => {
    const sonuc = cumleyiBicimle([
      { govde: 'tom' },
      { govde: 'loves' },
      { govde: 'adventures', son: '.' },
    ]);
    expect(sonuc).toBe('Tom loves adventures.');
  });

  it('son parçada nokta yoksa kendiliğinden nokta eklemez', () => {
    const sonuc = cumleyiBicimle([
      { govde: 'state' },
      { govde: 'of' },
      { govde: 'the' },
      { govde: 'art' },
    ]);
    expect(sonuc).toBe('State of the art');
  });

  it('boş dizide boş metin döner', () => {
    expect(cumleyiBicimle([])).toBe('');
  });

  // Okuyucudaki gerçek zincir: kutucuk metni kelimeyiAyir'dan geçer, seçim
  // cumleyiBicimle ile cümleye döner. İkisinin biçimleri ayrışırsa burası kırılır.
  it('kelimeyiAyir çıktısını doğrudan cümleye çevirir', () => {
    const parcalar = ['The', 'quick', 'fox.'].map(kelimeyiAyir);
    expect(cumleyiBicimle(parcalar)).toBe('The quick fox.');
  });
});
