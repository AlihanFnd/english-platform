#!/usr/bin/env node

/**
 * Üretim Derlemesi Öncesi Yapılandırma Sözleşmesi Denetimi (YH-14 §2)
 *
 * EAS derlemesinde mobile/package.json → "eas-build-pre-install" kancasıyla çalışır.
 * EXPO_PUBLIC_API_URL, EXPO_PUBLIC_GIZLILIK_URL, EXPO_PUBLIC_KOSULLAR_URL denetler.
 *
 * Hangi derlemede denetlenir: `development` DIŞINDAKİ her EAS profilinde.
 * `development` geliştirme istemcisidir (__DEV__ true). `preview` ve `production`
 * ise ÜRETİM JS'i taşır: uygulama kökündeki çalışma zamanı denetimi eksik
 * yapılandırmada uygulamayı hata ekranında durdurur — o hâlde derlemenin de
 * burada durması gerekir, yoksa dağıtılan paket açılır açılmaz kilitlenir.
 *
 * Elle denetim: `node scripts/mobil/uretim-yapilandirma.mjs --check`
 */

const profil = process.env.EAS_BUILD_PROFILE;
const denetle =
  process.argv.includes('--check') ||
  process.env.NODE_ENV === 'production' ||
  (profil !== undefined && profil !== 'development');

if (denetle) {
  const errors = [];
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  const gizlilikUrl = process.env.EXPO_PUBLIC_GIZLILIK_URL;
  const kosullarUrl = process.env.EXPO_PUBLIC_KOSULLAR_URL;

  if (!apiUrl || !apiUrl.startsWith('https://')) {
    errors.push('EXPO_PUBLIC_API_URL tanımlı değil veya https:// ile başlamıyor.');
  }
  if (!gizlilikUrl || !gizlilikUrl.startsWith('https://')) {
    errors.push('EXPO_PUBLIC_GIZLILIK_URL tanımlı değil veya https:// ile başlamıyor.');
  }
  if (!kosullarUrl || !kosullarUrl.startsWith('https://')) {
    errors.push('EXPO_PUBLIC_KOSULLAR_URL tanımlı değil veya https:// ile başlamıyor.');
  }

  if (errors.length > 0) {
    console.error(`❌ MOBİL ÜRETİM YAPILANDIRMA HATASI (profil: ${profil ?? 'elle denetim'}):`);
    errors.forEach((err) => console.error(`  - ${err}`));
    console.error('Derleme durduruldu.');
    process.exit(1);
  }
  console.log(`✓ Mobil üretim yapılandırma kontrolü başarılı (profil: ${profil ?? 'elle denetim'}).`);
} else {
  console.log(`- Mobil üretim yapılandırma denetimi atlandı (profil: ${profil ?? 'yok'}; geliştirme derlemesi).`);
}
