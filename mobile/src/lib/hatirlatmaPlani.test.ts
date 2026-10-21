import { describe, expect, it } from '@jest/globals';
import { SeriOzeti } from './api';
import { HatirlatmaAyari, hatirlatmaPlani } from './hatirlatmalar';

function sahteOzet(overrides?: Partial<SeriOzeti>): SeriOzeti {
  return {
    mevcutSeri: 5,
    enUzunSeri: 10,
    bugunAktif: false,
    seriRiskte: true,
    bugun: {
      gun: '2026-09-13',
      xp: 0,
      hedefXp: 20,
      hedefTamamlandi: false,
      kirilim: { okuma: 0, kelime: 0, calisma: 0, quiz: 0, cumle: 0 },
    },
    sonGunler: [],
    gunlukHedefXp: 20,
    saatDilimi: 'Europe/Istanbul',
    hedefSecenekleri: [10, 20, 30, 50],
    puanTablosu: [],
    ...overrides,
  };
}

const hedefTamam: Partial<SeriOzeti> = {
  bugun: {
    gun: '2026-09-13',
    xp: 20,
    hedefXp: 20,
    hedefTamamlandi: true,
    kirilim: { okuma: 20, kelime: 0, calisma: 0, quiz: 0, cumle: 0 },
  },
};

describe('hatirlatmaPlani saf işlev testleri (YH-07)', () => {
  const ayarAcik: HatirlatmaAyari = { acik: true, saat: '20:00' };
  const ayarKapali: HatirlatmaAyari = { acik: false, saat: '20:00' };

  it('1. Ayar kapalı ise hiçbir bildirim planlanmamalı', () => {
    const res = hatirlatmaPlani(sahteOzet(), new Date(2026, 8, 13, 10, 0, 0), ayarKapali);
    expect(res).toHaveLength(0);
  });

  it('2. Bugün hedef tamamlandıysa bugün uyarısı çıkmamalı, yalnızca yarın saat 20:00 kurulmalı', () => {
    const res = hatirlatmaPlani(sahteOzet(hedefTamam), new Date(2026, 8, 13, 10, 0, 0), ayarAcik);

    expect(res).toHaveLength(1);
    expect(res[0].tur).toBe('hatirlatma');
    expect(res[0].zaman.getDate()).toBe(14); // Yarın
    expect(res[0].zaman.getHours()).toBe(20);
  });

  it('3. Hedef tamamlanmadı ve saat 20:00 henüz geçmedi (10:00): bugün 20:00, bugün 21:30 (risk) ve yarın 20:00 planlanmalı', () => {
    const res = hatirlatmaPlani(sahteOzet(), new Date(2026, 8, 13, 10, 0, 0), ayarAcik);

    expect(res).toHaveLength(3);
    expect(res[0].tur).toBe('hatirlatma');
    expect(res[0].zaman.getHours()).toBe(20);

    expect(res[1].tur).toBe('risk');
    expect(res[1].zaman.getHours()).toBe(21);
    expect(res[1].zaman.getMinutes()).toBe(30);

    expect(res[2].tur).toBe('hatirlatma');
    expect(res[2].zaman.getDate()).toBe(14);
  });

  it('4. Hedef tamamlanmadı ve 20:00 geçti ama 21:30 geçmedi (20:30): bugün 21:30 (risk) ve yarın 20:00 planlanmalı', () => {
    const res = hatirlatmaPlani(sahteOzet(), new Date(2026, 8, 13, 20, 30, 0), ayarAcik);

    expect(res).toHaveLength(2);
    expect(res[0].tur).toBe('risk');
    expect(res[0].zaman.getHours()).toBe(21);
    expect(res[0].zaman.getMinutes()).toBe(30);

    expect(res[1].tur).toBe('hatirlatma');
    expect(res[1].zaman.getDate()).toBe(14);
  });

  it('5. Hedef tamamlanmadı ve 21:30 da geçti (22:00): yalnızca yarın 20:00 planlanmalı', () => {
    const res = hatirlatmaPlani(sahteOzet(), new Date(2026, 8, 13, 22, 0, 0), ayarAcik);

    expect(res).toHaveLength(1);
    expect(res[0].tur).toBe('hatirlatma');
    expect(res[0].zaman.getDate()).toBe(14);
  });

  it('6. Seri yoksa (mevcutSeri = 0, seriRiskte = false): risk uyarısı eklenmemeli', () => {
    const ozet = sahteOzet({ mevcutSeri: 0, seriRiskte: false });
    const res = hatirlatmaPlani(ozet, new Date(2026, 8, 13, 10, 0, 0), ayarAcik);

    expect(res).toHaveLength(2); // Bugün 20:00 + Yarın 20:00
    expect(res.every((r) => r.tur === 'hatirlatma')).toBe(true);
  });

  it('7. Kullanıcının seçtiği saat ("08:30") dakikasıyla birlikte kullanılır', () => {
    const res = hatirlatmaPlani(
      sahteOzet(hedefTamam),
      new Date(2026, 8, 13, 10, 0, 0),
      { acik: true, saat: '08:30' },
    );

    expect(res).toHaveLength(1);
    expect(res[0].zaman.getDate()).toBe(14);
    expect(res[0].zaman.getHours()).toBe(8);
    expect(res[0].zaman.getMinutes()).toBe(30);
  });
});
