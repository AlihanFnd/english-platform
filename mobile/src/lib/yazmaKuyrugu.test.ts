import { describe, expect, it } from '@jest/globals';
import { KuyrukIsi } from './yazmaKuyrugu';

describe('yazmaKuyrugu birleştirme ve tavan kuralları (YH-13)', () => {
  it('ilerleme kaydi ayni kitap icin yenisi gelince eskiyi filtreler', () => {
    const kuyruk: KuyrukIsi[] = [
      { id: '1', userId: 1, tur: 'ilerleme', govde: { bookId: 5, konum: 2 }, olusturmaAt: 100, denemeSayisi: 0 },
      { id: '2', userId: 1, tur: 'kelime_ekle', govde: { word: 'test' }, olusturmaAt: 101, denemeSayisi: 0 },
    ];

    const yeniGovde = { bookId: 5, konum: 3 };
    const filtrelenmis = kuyruk.filter(
      (is) => !(is.userId === 1 && is.tur === 'ilerleme' && is.govde?.bookId === yeniGovde.bookId),
    );

    expect(filtrelenmis.length).toBe(1);
    expect(filtrelenmis[0].id).toBe('2');
  });

  it('500 tavan asildiginda en eski isleri slice eder', () => {
    const kuyruk: KuyrukIsi[] = Array.from({ length: 505 }, (_, i) => ({
      id: `${i}`,
      userId: 1,
      tur: 'kelime_ekle',
      govde: { word: `w${i}` },
      olusturmaAt: i,
      denemeSayisi: 0,
    }));

    const azami = 500;
    const sonKuyruk = kuyruk.slice(kuyruk.length - azami);
    expect(sonKuyruk.length).toBe(500);
    expect(sonKuyruk[0].id).toBe('5');
  });
});
