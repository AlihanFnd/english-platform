import { describe, expect, it } from '@jest/globals';
describe('seriGorunumu hesaplamalari (YH-04)', () => {
  it('bugunku XP hedef tamamlanma oranini hesaplar', () => {
    const xp = 15;
    const hedefXp = 20;
    const oran = Math.min(100, Math.round((xp / hedefXp) * 100));
    expect(oran).toBe(75);
  });

  it('hedef asildiginda %100 uzerine cikmaz', () => {
    const xp = 50;
    const hedefXp = 20;
    const oran = Math.min(100, Math.round((xp / hedefXp) * 100));
    expect(oran).toBe(100);
  });
});
