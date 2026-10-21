import { describe, expect, it } from '@jest/globals';
import { kelimeyiAyir } from './kelimeBicimi';

describe('kelimeyiAyir (YH-02)', () => {
  it('temiz kelimeyi noktalamasız dondurur', () => {
    const res = kelimeyiAyir('hello');
    expect(res.govde).toBe('hello');
    expect(res.son).toBe('');
  });

  it('sonundaki noktalamayi ayirir', () => {
    const res = kelimeyiAyir('world,');
    expect(res.govde).toBe('world');
    expect(res.son).toBe(',');
  });

  it('tırnak ve parantez icindeki kelimeyi temizler', () => {
    const res = kelimeyiAyir('"apple"');
    expect(res.govde).toBe('apple');
  });

  it('bos metinde bos govde dondurur', () => {
    const res = kelimeyiAyir('   ');
    expect(res.govde).toBe('');
  });
});
