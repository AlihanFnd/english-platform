import { describe, expect, it } from '@jest/globals';
import { apiTabaniCoz, yapilandirmaOku, YapilandirmaHatasi } from './yapilandirma';

describe('apiTabaniCoz — API taban adresi', () => {
  it('açık adres her şeyin önündedir ve sondaki eğik çizgiler atılır', () => {
    expect(apiTabaniCoz('https://api.linguza.app//', '192.168.1.37:8081')).toBe('https://api.linguza.app');
  });

  it('açık adres yoksa GERÇEK TELEFON için Expo sunucusunun LAN IP’si kullanılır', () => {
    // Faz 3'teki "iOS ise her zaman localhost" dalı tam olarak bunu bozuyordu.
    expect(apiTabaniCoz(undefined, '192.168.1.37:8081')).toBe('http://192.168.1.37:5001');
  });

  it('yalnızca boşluktan oluşan açık adres yok sayılır', () => {
    expect(apiTabaniCoz('   ', '10.0.0.5:8081')).toBe('http://10.0.0.5:5001');
  });

  it('hiçbiri yoksa localhost son çaredir', () => {
    expect(apiTabaniCoz(undefined, undefined)).toBe('http://localhost:5001');
  });
});

describe('yapilandirmaOku üretim sözleşmesi (YH-14)', () => {
  it('geliştirme modunda (dev=true) API URL verilmese de varsayılana düşer', () => {
    const config = yapilandirmaOku({}, true);
    expect(config.apiUrl).toBe('http://localhost:5001');
  });

  it('üretim modunda (dev=false) https olmayan API URL hata fırlatır', () => {
    expect(() => {
      yapilandirmaOku(
        {
          EXPO_PUBLIC_API_URL: 'http://ornek.com',
          EXPO_PUBLIC_GIZLILIK_URL: 'https://ornek.com/gizlilik',
          EXPO_PUBLIC_KOSULLAR_URL: 'https://ornek.com/kosullar',
        },
        false,
      );
    }).toThrow(YapilandirmaHatasi);
  });

  it('üretim modunda (dev=false) eksik gizlilik URL hata fırlatır', () => {
    expect(() => {
      yapilandirmaOku(
        {
          EXPO_PUBLIC_API_URL: 'https://api.ornek.com',
          EXPO_PUBLIC_KOSULLAR_URL: 'https://ornek.com/kosullar',
        },
        false,
      );
    }).toThrow(YapilandirmaHatasi);
  });

  it('üretim modunda tüm HTTPS adresleri geçerli ise yapılandırma döner', () => {
    const config = yapilandirmaOku(
      {
        EXPO_PUBLIC_API_URL: 'https://api.linguza.app',
        EXPO_PUBLIC_GIZLILIK_URL: 'https://linguza.app/gizlilik',
        EXPO_PUBLIC_KOSULLAR_URL: 'https://linguza.app/kosullar',
      },
      false,
    );

    expect(config.apiUrl).toBe('https://api.linguza.app');
    expect(config.gizlilikUrl).toBe('https://linguza.app/gizlilik');
  });
});
