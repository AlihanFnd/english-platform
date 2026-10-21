export interface Yapilandirma {
  apiUrl: string;
  gizlilikUrl?: string;
  kosullarUrl?: string;
  sentryDsn?: string;
}

export class YapilandirmaHatasi extends Error {
  constructor(mesaj: string) {
    super(mesaj);
    this.name = 'YapilandirmaHatasi';
  }
}

/**
 * EXPO_PUBLIC_* değişkenleri derleme anında pakete YALNIZCA `process.env.EXPO_PUBLIC_X`
 * biçiminde STATİK yazıldıklarında gömülür. `const env = process.env; env.X` ya da
 * `process.env[anahtar]` üretim paketinde undefined döner — bu yüzden hepsi burada,
 * tek yerde, statik okunur. (Eski sürüm `envOverride || process.env` okuyordu:
 * testler ortamı dışarıdan verdiği için geçiyor, üretimde her değer boş kalıyordu.)
 */
export const ORTAM: Readonly<Record<string, string | undefined>> = {
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  EXPO_PUBLIC_GIZLILIK_URL: process.env.EXPO_PUBLIC_GIZLILIK_URL,
  EXPO_PUBLIC_KOSULLAR_URL: process.env.EXPO_PUBLIC_KOSULLAR_URL,
  EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
};

/** Gizlilik politikası / kullanım koşulları adresi. Tanımsız ya da bilinmeyen anahtarda undefined. */
export function yasalBaglantiAdresi(anahtar: string): string | undefined {
  switch (anahtar) {
    case 'EXPO_PUBLIC_GIZLILIK_URL':
      return ORTAM.EXPO_PUBLIC_GIZLILIK_URL?.trim() || undefined;
    case 'EXPO_PUBLIC_KOSULLAR_URL':
      return ORTAM.EXPO_PUBLIC_KOSULLAR_URL?.trim() || undefined;
    default:
      return undefined;
  }
}

/**
 * API taban adresi — SAF işlev: api.ts çağırır, testler doğrudan sınar.
 *
 * Öncelik:
 *   1. EXPO_PUBLIC_API_URL — açık ayar. Üretim JS'inde ZORUNLU; eksikse kökteki
 *      yapılandırma denetimi uygulamayı hata ekranında durdurur.
 *   2. Expo geliştirme sunucusunun ana bilgisayarı — gerçek telefonda bilgisayarın
 *      LAN IP'si buradan gelir. Telefon "localhost" derse KENDİSİNİ kasteder.
 *   3. http://localhost:5001 — yalnızca simülatör/öykünücü için son çare.
 *
 * Faz 3'te api.ts'e "iOS ise her zaman localhost" dalı eklenmişti: gerçek iPhone'da
 * 2. adıma hiç gelinmiyor, uygulama backend'e ulaşamıyordu.
 */
export function apiTabaniCoz(acikAdres?: string, gelistirmeSunucusu?: string | null): string {
  const acik = acikAdres?.trim();
  if (acik) return acik.replace(/\/+$/, '');

  const anaBilgisayar = gelistirmeSunucusu?.split(':')[0]?.trim();
  if (anaBilgisayar) return `http://${anaBilgisayar}:5001`;

  return 'http://localhost:5001';
}

/**
 * Üretim yapılandırma sözleşmesi (YH-14 §2).
 * Üretim derlemesinde (!__DEV__) EXPO_PUBLIC_API_URL, EXPO_PUBLIC_GIZLILIK_URL ve EXPO_PUBLIC_KOSULLAR_URL
 * tanımlı olmalı ve https:// ile başlamalıdır. Sessizce localhost'a veya güvensiz adrese düşmek yasaktır.
 */
export function yapilandirmaOku(
  envOverride?: Record<string, string | undefined>,
  isDevOverride?: boolean,
): Yapilandirma {
  const env = envOverride || ORTAM;
  const devModu = isDevOverride !== undefined ? isDevOverride : typeof __DEV__ !== 'undefined' ? __DEV__ : true;

  const apiUrl = env.EXPO_PUBLIC_API_URL;
  const gizlilikUrl = env.EXPO_PUBLIC_GIZLILIK_URL;
  const kosullarUrl = env.EXPO_PUBLIC_KOSULLAR_URL;
  const sentryDsn = env.EXPO_PUBLIC_SENTRY_DSN;

  if (!devModu) {
    if (!apiUrl || !apiUrl.trim().startsWith('https://')) {
      throw new YapilandirmaHatasi(
        'Üretim yapılandırma hatası: EXPO_PUBLIC_API_URL geçerli bir https:// adresi olmalıdır.',
      );
    }
    if (!gizlilikUrl || !gizlilikUrl.trim().startsWith('https://')) {
      throw new YapilandirmaHatasi(
        'Üretim yapılandırma hatası: EXPO_PUBLIC_GIZLILIK_URL geçerli bir https:// adresi olmalıdır.',
      );
    }
    if (!kosullarUrl || !kosullarUrl.trim().startsWith('https://')) {
      throw new YapilandirmaHatasi(
        'Üretim yapılandırma hatası: EXPO_PUBLIC_KOSULLAR_URL geçerli bir https:// adresi olmalıdır.',
      );
    }

    return {
      apiUrl: apiUrl.trim().replace(/\/+$/, ''),
      gizlilikUrl: gizlilikUrl.trim(),
      kosullarUrl: kosullarUrl.trim(),
      sentryDsn: sentryDsn?.trim(),
    };
  }

  const devApiUrl = apiUrl && apiUrl.trim() ? apiUrl.trim().replace(/\/+$/, '') : 'http://localhost:5001';

  return {
    apiUrl: devApiUrl,
    gizlilikUrl: gizlilikUrl?.trim(),
    kosullarUrl: kosullarUrl?.trim(),
    sentryDsn: sentryDsn?.trim(),
  };
}
