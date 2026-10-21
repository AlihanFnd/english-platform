// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // .expo/ Expo'nun ÜRETTİĞİ dosyalar (typed routes); elle yazılmaz, denetlenmez.
    ignores: ['dist/*', '.expo/*'],
  },
  {
    // jest.setup.js bir modül değil, jest'in global ortamında çalışır. Test
    // dosyaları global'leri '@jest/globals' ile AÇIKÇA içe aktarır: TypeScript 6
    // @types paketlerini artık kendiliğinden eklemiyor.
    files: ['jest.setup.js'],
    languageOptions: { globals: { jest: 'readonly' } },
  },
  {
    // Bu iki React Compiler kuralı DOĞRULUK değil performans/kalıp denetimidir:
    // effect içinde senkron setState fazladan bir render doğurur; derleyici elle
    // yazılmış memoizasyonu koruyamazsa bileşeni optimize etmeden bırakır (güvenli
    // geri düşüş). 2026-09-13 denetiminde 23 noktada bulundu; ekran ekran görsel
    // doğrulama olmadan yeniden yazmak gerileme riski taşıdığı için UYARI seviyesine
    // alındı — kaybolmadılar, `npx expo lint` çıktısında görünürler.
    // Doğruluğu etkileyen kurallar (refs, immutability, purity) HATA olarak kalır.
    // Takip: yayina-hazirlik-faz3/YH-14.md.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
]);
