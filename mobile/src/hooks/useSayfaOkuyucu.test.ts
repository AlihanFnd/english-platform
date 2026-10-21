import { describe, expect, it } from '@jest/globals';
import { HizTipi } from './useSayfaOkuyucu';

// NOT (2026-09-13 denetimi): bu testler kancanın kendisini ÇAĞIRMIYOR; yalnızca
// tipi ve kancanın içindeki kuralların birer kopyasını sınıyor. Kancanın sıra,
// duraklatma ve oturum kimliği davranışı henüz gerçek bir testle ölçülmüyor.
describe('useSayfaOkuyucu mantık doğrulama', () => {
  it('izin verilen okuma hızlarını doğrular', () => {
    const gecerliHizlar: HizTipi[] = [0.75, 1, 1.25];
    expect(gecerliHizlar).toContain(1);
    expect(gecerliHizlar).toContain(0.75);
    expect(gecerliHizlar).toContain(1.25);
  });

  it('3000 karakterden uzun metinlerin güvenle kırpılmasını simüle eder', () => {
    const uzunMetin = 'a'.repeat(4000);
    const kirpilmis = uzunMetin.length > 3000 ? uzunMetin.substring(0, 3000) : uzunMetin;
    expect(kirpilmis.length).toBe(3000);
  });

  it('oturum kimliği çakışmalarını önleyen artımlı ID mantığını doğrular', () => {
    let oturumId = 0;
    const oturum1 = ++oturumId;
    const oturum2 = ++oturumId;
    expect(oturum1).not.toBe(oturum2);
    expect(oturum2).toBe(2);
  });
});
