/**
 * Ölçü ve tipografi belirteçleri.
 *
 * Web tarafında bunlar Tailwind sınıflarının içinde dağınık duruyor; mobilde
 * StyleSheet ile yazdığımız için tek yerde toplanmaları gerekiyor. Amaç aynı:
 * her ekranda aynı köşe yarıçapı, aynı boşluk, aynı yazı ölçeği.
 */

export const Bosluk = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 40,
} as const;

export const Yaricap = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  tam: 999,
} as const;

/**
 * Yazı tipi aileleri — `useFonts` ile yüklenen dosya adlarıyla birebir aynı
 * olmak zorunda. Yüklenmeden önce sistem yazı tipi kullanılır (undefined).
 */
export const YaziTipi = {
  baslik: 'PlusJakartaSans_800ExtraBold',
  baslikOrta: 'PlusJakartaSans_700Bold',
  govdeKalin: 'Inter_700Bold',
  govdeYariKalin: 'Inter_600SemiBold',
  govde: 'Inter_400Regular',
  govdeOrta: 'Inter_500Medium',
} as const;

export const Olcek = {
  devasa: 30,
  buyuk: 22,
  baslik: 18,
  altBaslik: 15,
  govde: 14,
  kucuk: 12,
  minik: 10,
} as const;

/** Kartların gölgesi — iOS ve Android'de aynı ağırlıkta görünsün diye tek yerde. */
export function golge(renk: string, seviye: 1 | 2 | 3 = 1) {
  const ayar = {
    1: { yukseklik: 2, bulanik: 8, opaklik: 1, elevation: 2 },
    2: { yukseklik: 6, bulanik: 16, opaklik: 1, elevation: 5 },
    3: { yukseklik: 12, bulanik: 28, opaklik: 1, elevation: 10 },
  }[seviye];

  return {
    shadowColor: renk,
    shadowOffset: { width: 0, height: ayar.yukseklik },
    shadowOpacity: ayar.opaklik,
    shadowRadius: ayar.bulanik,
    elevation: ayar.elevation,
  };
}
