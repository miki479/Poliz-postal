/**
 * Design system di Runngo: token semantici. Nessun colore, misura o durata arbitraria nei componenti.
 * Contrasti verificati: vedi docs/DESIGN-REFRESH.md.
 */
import type { TextStyle } from 'react-native';

export const color = {
  bg: '#0E1216',
  surface: '#191F25',
  surfaceElevated: '#222A32',
  surfacePressed: '#2A333C',
  text: '#F4F7FA',
  textSecondary: '#A8B3BF',
  textTertiary: '#939EA9',
  /** Separatori decorativi (non usarli come unico confine di un controllo). */
  separator: '#2A313A',
  /** Bordo dei campi: ≥3:1 su tutte le superfici. */
  controlBorder: '#7A8693',
  accent: '#35C6CF',
  accentPressed: '#2BAFB7',
  onAccent: '#04181A',
  accentTint: 'rgba(53,198,207,0.14)',
  /** Viola del logo: solo riempimenti e icone grandi; per il testo usare brandText. */
  brand: '#8268F5',
  brandStrong: '#6B4FE0',
  brandText: '#9F8BFF',
  brandTint: 'rgba(130,104,245,0.16)',
  route: '#7CB6FF',
  achievement: '#FFAF68',
  success: '#38D39F',
  successTint: 'rgba(56,211,159,0.14)',
  warning: '#FFC857',
  warningTint: 'rgba(255,200,87,0.14)',
  danger: '#FF7A7A',
  dangerTint: 'rgba(255,122,122,0.12)',
  overlay: 'rgba(5,7,9,0.72)',
  /** Superfici delle storie (testo sempre bianco su questi fondi). */
  storyInk: '#FFFFFF',
  storyInkSecondary: 'rgba(255,255,255,0.82)',
  storyGlass: 'rgba(255,255,255,0.14)',
} as const;

/** Alias storici usati dalle schermate esistenti. */
export const C = {
  ...color,
  surface2: color.surfaceElevated,
  border: color.separator,
  text2: color.textSecondary,
  text3: color.textTertiary,
  accentInk: color.onAccent,
} as const;

/** Accenti personali del profilo: confinati al profilo, mai ai colori semantici. Tutti ≥4.5:1 su surface. */
export const PROFILE_ACCENTS = {
  teal: { solid: '#35C6CF', deep: '#0F3E44', label: 'Turchese' },
  violet: { solid: '#9F8BFF', deep: '#2B2160', label: 'Viola' },
  amber: { solid: '#F2B84B', deep: '#4A3510', label: 'Ambra' },
  rose: { solid: '#F2879E', deep: '#4D1E2A', label: 'Rosa' },
  lime: { solid: '#A6D86A', deep: '#2C3F14', label: 'Lime' },
  sky: { solid: '#7CB6FF', deep: '#16304F', label: 'Cielo' },
} as const;

export const S = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
export const GUTTER = S.xl;
export const HIT = 44;

export const R = { chip: 8, control: 12, card: 16, sheet: 24, pill: 999, sm: 8, md: 12, lg: 16 } as const;

export const M = { press: 120, local: 200, sheet: 300, reveal: 600 } as const;

export const type = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: -0.6 },
  title1: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.3 },
  title2: { fontSize: 18, lineHeight: 24, fontWeight: '700', letterSpacing: -0.2 },
  headline: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400' },
  callout: { fontSize: 15, lineHeight: 21, fontWeight: '500' },
  subhead: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  metric: { fontSize: 26, lineHeight: 31, fontWeight: '700', fontVariant: ['tabular-nums'], letterSpacing: -0.4 },
  metricSmall: { fontSize: 18, lineHeight: 23, fontWeight: '700', fontVariant: ['tabular-nums'] },
} satisfies Record<string, TextStyle>;

export const Fonts = { sans: 'System' } as const;
