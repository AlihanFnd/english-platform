/**
 * Linguza renk paleti — web arayüzüyle BİREBİR aynı.
 *
 * Kaynak: frontend/app/globals.css içindeki `:root/.light` ve `.dark` blokları.
 * Değerler oradan kopyalandı; web tarafında bir renk değişirse burası da
 * güncellenmeli. İki istemcinin aynı ürün gibi görünmesinin tek yolu bu.
 */

export interface Palette {
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;

  tertiary: string;
  onTertiary: string;

  background: string;
  onBackground: string;

  surface: string;
  onSurface: string;
  surfaceDim: string;
  surfaceBright: string;
  surfaceVariant: string;
  onSurfaceVariant: string;
  surfaceContainerLowest: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;

  outline: string;
  outlineVariant: string;

  error: string;
  onError: string;
  errorContainer: string;
  onErrorContainer: string;

  /** Yan menü / üst şeridin koyu lacivert zemini (web'de #1E293B). */
  navy: string;

  /** "Cam" yüzeyler — web'deki backdrop-filter'ın mobil karşılığı. */
  glassBg: string;
  glassBorder: string;
  glassShadow: string;

  success: string;
  warning: string;
}

export const LIGHT: Palette = {
  primary: '#006e2f',
  onPrimary: '#ffffff',
  primaryContainer: '#22c55e',
  onPrimaryContainer: '#004b1e',

  tertiary: '#005ac2',
  onTertiary: '#ffffff',

  background: '#e9ecef',
  onBackground: '#191c1e',

  surface: '#f8f9fa',
  onSurface: '#191c1e',
  surfaceDim: '#eef1f3',
  surfaceBright: '#fdfefe',
  surfaceVariant: '#f1f3f5',
  onSurfaceVariant: '#3d4a3d',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#f8f9fa',
  surfaceContainer: '#f1f3f5',
  surfaceContainerHigh: '#e9ecef',
  surfaceContainerHighest: '#dee2e6',

  outline: '#7c887b',
  outlineVariant: '#c6d3c3',

  error: '#ba1a1a',
  onError: '#ffffff',
  errorContainer: '#ffdad6',
  onErrorContainer: '#93000a',

  navy: '#1e293b',

  glassBg: 'rgba(255, 255, 255, 0.72)',
  glassBorder: 'rgba(198, 211, 195, 0.55)',
  glassShadow: 'rgba(0, 0, 0, 0.08)',

  success: '#16a34a',
  warning: '#b45309',
};

export const DARK: Palette = {
  primary: '#22c55e',
  onPrimary: '#ffffff',
  primaryContainer: '#005321',
  onPrimaryContainer: '#6bff8f',

  tertiary: '#82abff',
  onTertiary: '#003d88',

  background: '#101415',
  onBackground: '#e2e2e6',

  surface: '#101415',
  onSurface: '#e2e2e6',
  surfaceDim: '#101415',
  surfaceBright: '#363a3b',
  surfaceVariant: '#3d4a3d',
  onSurfaceVariant: '#bccbb9',
  surfaceContainerLowest: '#0b0f10',
  surfaceContainerLow: '#191c1e',
  surfaceContainer: '#1d2022',
  surfaceContainerHigh: '#272b2d',
  surfaceContainerHighest: '#323538',

  outline: '#6d7b6c',
  outlineVariant: '#3d4a3d',

  error: '#ffb4ab',
  onError: '#690005',
  errorContainer: '#93000a',
  onErrorContainer: '#ffdad6',

  navy: '#161d29',

  glassBg: 'rgba(29, 32, 34, 0.72)',
  glassBorder: 'rgba(255, 255, 255, 0.08)',
  glassShadow: 'rgba(0, 0, 0, 0.45)',

  success: '#4ade80',
  warning: '#fbbf24',
};

/** Renge saydamlık ekler — web'deki `color-mix(... %, transparent)` karşılığı. */
export function alpha(hexOrRgb: string, oran: number): string {
  const h = hexOrRgb.trim();
  if (h.startsWith('#')) {
    const kisa = h.length === 4;
    const r = parseInt(kisa ? h[1] + h[1] : h.slice(1, 3), 16);
    const g = parseInt(kisa ? h[2] + h[2] : h.slice(3, 5), 16);
    const b = parseInt(kisa ? h[3] + h[3] : h.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${oran})`;
  }
  // rgb()/rgba() geldiyse olduğu gibi bırak — çağıran zaten saydamlık vermiş.
  return h;
}
