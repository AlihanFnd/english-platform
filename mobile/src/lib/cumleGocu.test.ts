import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { api } from '@/lib/api';
import { cumleGocuCalistir } from '@/lib/cumleGocu';

jest.mock('@/lib/api', () => ({ api: { topluCumleEkle: jest.fn() } }));

type Oge = { cumle: string; ceviri?: string; baglam?: string };

// Sunucunun GÜNCEL sözleşmesi (CumlelerController.TopluEkle): kolonu aşan ya da
// tekrar eden öğe yazılmaz, 'atlanan' sayılır; istek yine 200 döner. İstemci bu
// yüzden uzun cümleyi olduğu gibi gönderirse cümle sunucuda YOK olur, yerelden de silinir.
const KOLON = { cumle: 500, ceviri: 1000, baglam: 400 };

const UID = 7;
const KULLANICI_ANAHTARI = `@linguza_sentences_${UID}`;
const VARSAYILAN_ANAHTAR = '@linguza_sentences_default';
const BAYRAK = `linguza_cumle_gocu_${UID}`;

const topluCumleEkle = jest.mocked(api.topluCumleEkle);
let sunucu: Oge[] = [];
let gonderilenler: Oge[][] = [];

function yarimVekilVarMi(metin: string): boolean {
  for (let i = 0; i < metin.length; i++) {
    const kod = metin.charCodeAt(i);
    if (kod >= 0xdc00 && kod <= 0xdfff) return true;
    if (kod >= 0xd800 && kod <= 0xdbff) {
      const sonraki = metin.charCodeAt(i + 1);
      if (!(sonraki >= 0xdc00 && sonraki <= 0xdfff)) return true;
      i++;
    }
  }
  return false;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  sunucu = [];
  gonderilenler = [];
  topluCumleEkle.mockReset();
  topluCumleEkle.mockImplementation(async (ogeler) => {
    gonderilenler.push(ogeler);
    let eklenen = 0;
    let atlanan = 0;
    for (const oge of ogeler) {
      const cumle = oge.cumle.trim();
      const tasar =
        cumle.length > KOLON.cumle ||
        (oge.ceviri ?? '').trim().length > KOLON.ceviri ||
        (oge.baglam ?? '').trim().length > KOLON.baglam;
      const tekrar = sunucu.some((s) => s.cumle.toLowerCase() === cumle.toLowerCase());
      if (!cumle || tasar || tekrar) {
        atlanan++;
        continue;
      }
      sunucu.push({ ...oge, cumle });
      eklenen++;
    }
    return { eklenen, atlanan };
  });
});

describe('cumleGocuCalistir (mobil)', () => {
  it('kolonu aşan yerel cümle göçü KİLİTLEMEZ ve KAYBOLMAZ — sınıra kırpılarak taşınır', async () => {
    const uzun = 'Long legacy paragraph '.repeat(40);
    await AsyncStorage.setItem(
      KULLANICI_ANAHTARI,
      JSON.stringify([
        { sentence: 'Short sentence.', translation: 'Kısa cümle.' },
        { sentence: uzun, translation: 'Uzun', context: 'b'.repeat(900) },
      ]),
    );

    const sonuc = await cumleGocuCalistir(UID);

    expect(sonuc).toEqual({ tamamlandi: true, eklenen: 2, atlanan: 0, kirpilan: 1 });
    expect(sunucu).toHaveLength(2);
    for (const oge of gonderilenler.flat()) {
      expect(oge.cumle.length).toBeLessThanOrEqual(KOLON.cumle);
      expect((oge.baglam ?? '').length).toBeLessThanOrEqual(KOLON.baglam);
    }
    expect(await AsyncStorage.getItem(KULLANICI_ANAHTARI)).toBeNull();
    expect(await AsyncStorage.getItem(BAYRAK)).toBe('1');
  });

  it('emoji sınırda BÖLÜNMEZ — yarım vekil çifti sunucuda JSON hatası üretir', async () => {
    const cumle = 'a'.repeat(KOLON.cumle - 1) + '😀 tail';
    await AsyncStorage.setItem(KULLANICI_ANAHTARI, JSON.stringify([{ sentence: cumle, translation: 'x' }]));

    const sonuc = await cumleGocuCalistir(UID);

    expect(sonuc.tamamlandi).toBe(true);
    const gonderilen = gonderilenler.flat()[0];
    expect(gonderilen.cumle.length).toBeLessThanOrEqual(KOLON.cumle);
    expect(yarimVekilVarMi(gonderilen.cumle)).toBe(false);
    expect(sunucu).toHaveLength(1);
  });

  it('BÜTÜN eski anahtarlar taşınır — yalnızca ilk dolu anahtar değil', async () => {
    await AsyncStorage.setItem(KULLANICI_ANAHTARI, JSON.stringify([{ sentence: 'From user key.', translation: 'a' }]));
    await AsyncStorage.setItem(VARSAYILAN_ANAHTAR, JSON.stringify([{ sentence: 'From default key.', translation: 'b' }]));

    const sonuc = await cumleGocuCalistir(UID);

    expect(sonuc.tamamlandi).toBe(true);
    expect(sunucu.map((s) => s.cumle).sort()).toEqual(['From default key.', 'From user key.']);
    expect(await AsyncStorage.getItem(KULLANICI_ANAHTARI)).toBeNull();
    expect(await AsyncStorage.getItem(VARSAYILAN_ANAHTAR)).toBeNull();
  });

  it('bozuk JSON göçü KİLİTLEMEZ ve bozuk veri SİLİNMEZ', async () => {
    await AsyncStorage.setItem(KULLANICI_ANAHTARI, '{bozuk');
    await AsyncStorage.setItem(VARSAYILAN_ANAHTAR, JSON.stringify([{ sentence: 'Still migrates.', translation: 'c' }]));

    const sonuc = await cumleGocuCalistir(UID);

    expect(sonuc.tamamlandi).toBe(true);
    expect(sunucu.map((s) => s.cumle)).toEqual(['Still migrates.']);
    expect(await AsyncStorage.getItem(KULLANICI_ANAHTARI)).toBe('{bozuk');
    expect(await AsyncStorage.getItem(BAYRAK)).toBe('1');
  });

  it('gönderim başarısızsa yerel veri SİLİNMEZ ve bayrak KONMAZ', async () => {
    const veri = JSON.stringify([{ sentence: 'Keep me.', translation: 'd' }]);
    await AsyncStorage.setItem(KULLANICI_ANAHTARI, veri);
    topluCumleEkle.mockRejectedValueOnce(new Error('ağ yok'));

    const sonuc = await cumleGocuCalistir(UID);

    expect(sonuc.tamamlandi).toBe(false);
    expect(await AsyncStorage.getItem(KULLANICI_ANAHTARI)).toBe(veri);
    expect(await AsyncStorage.getItem(BAYRAK)).toBeNull();
  });

  it('bayrak varsa hiçbir şey gönderilmez', async () => {
    await AsyncStorage.setItem(BAYRAK, '1');
    await AsyncStorage.setItem(KULLANICI_ANAHTARI, JSON.stringify([{ sentence: 'Ignored.', translation: 'e' }]));

    expect((await cumleGocuCalistir(UID)).tamamlandi).toBe(true);
    expect(topluCumleEkle).not.toHaveBeenCalled();
  });

  it('sunucunun istek başına sınırı kadar parçalara bölünür', async () => {
    const liste = Array.from({ length: 450 }, (_, i) => ({ sentence: `Sentence ${i}.`, translation: `${i}` }));
    await AsyncStorage.setItem(KULLANICI_ANAHTARI, JSON.stringify(liste));

    const sonuc = await cumleGocuCalistir(UID);

    expect(gonderilenler.map((p) => p.length)).toEqual([200, 200, 50]);
    expect(sonuc).toMatchObject({ tamamlandi: true, eklenen: 450 });
  });
});
