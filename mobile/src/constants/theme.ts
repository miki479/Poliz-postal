/**
 * Design system di Runngo: token semantici. Nessun colore, misura o durata arbitraria nei componenti.
 * Contrasti verificati: vedi docs/DESIGN-REFRESH.md.
 */
import type { TextStyle, ViewStyle, ImageStyle } from 'react-native';

const dark = {
  bg: '#0B0A08',
  surface: '#151411',
  surfaceElevated: '#211F1C',
  surfacePressed: '#2A2723',
  text: '#F7F5EE',
  textSecondary: '#C0BDB7',
  textTertiary: '#83807A',
  /** Separatori decorativi (non usarli come unico confine di un controllo). */
  separator: 'rgba(255,255,255,0.10)',
  /** Bordo dei campi: ≥3:1 su tutte le superfici. */
  controlBorder: 'rgba(255,255,255,0.28)',
  /** Azione primaria e stato attivo: viola elettrico acceso. Il testo bianco ha contrasto ≥3:1 (testo grande e in grassetto), come su un pulsante. */
  accent: '#CBF62E',
  accentPressed: '#B8E21A',
  onAccent: '#100D09',
  accentTint: 'rgba(203,246,46,0.14)',
  /** Viola del logo: solo riempimenti e icone grandi; per il testo usare brandText. */
  brand: '#CBF62E',
  brandStrong: '#A9D414',
  brandText: '#CBF62E',
  brandTint: 'rgba(203,246,46,0.12)',
  route: '#7CB6FF',
  /** Corallo: traguardi, obiettivi personali, record. */
  coral: '#FF6728',
  coralTint: 'rgba(255,103,40,0.16)',
  /** Turchese: gruppo, community, confronto con gli altri. */
  teal: '#87DCF7',
  tealTint: 'rgba(135,220,247,0.16)',
  achievement: '#FFAF68',
  success: '#CBF62E',
  successTint: 'rgba(203,246,46,0.14)',
  warning: '#FFC857',
  warningTint: 'rgba(255,200,87,0.14)',
  danger: '#F1383E',
  dangerTint: 'rgba(255,122,122,0.12)',
  overlay: 'rgba(5,7,9,0.72)',
  /** Superfici delle storie (testo sempre bianco su questi fondi). */
  storyInk: '#FFFFFF',
  storyInkSecondary: 'rgba(255,255,255,0.82)',
  storyGlass: 'rgba(255,255,255,0.14)',
} as const;

export type ThemeMode='dark'|'light';
const light:Record<keyof typeof dark,string>={...dark,coral:'#D9552B',coralTint:'rgba(217,85,43,0.12)',teal:'#0F8F85',tealTint:'rgba(15,143,133,0.12)',bg:'#F4F5F7',surface:'#FFFFFF',surfaceElevated:'#E8EBF0',surfacePressed:'#DEE2E8',text:'#171A20',textSecondary:'#505B68',textTertiary:'#647080',separator:'#D7DCE3',controlBorder:'#788493',accent:'#5C7A00',accentPressed:'#4A6400',onAccent:'#FFFFFF',accentTint:'rgba(92,122,0,0.12)',brand:'#5C7A00',brandText:'#4A6400',brandTint:'rgba(92,122,0,0.10)',success:'#4A6400',successTint:'rgba(74,100,0,0.12)',warning:'#906000',warningTint:'rgba(144,96,0,0.10)',danger:'#BE343E',dangerTint:'rgba(190,52,62,0.10)'};
let mode:ThemeMode='dark';
const listeners=new Set<()=>void>();
export const themeMode=()=>mode;
export function setThemeMode(next:ThemeMode){if(next===mode)return;mode=next;listeners.forEach(fn=>fn());}
export const subscribeTheme=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
export const color=new Proxy(dark as Record<keyof typeof dark,string>,{get:(_,key:string)=>(mode==='light'?light:dark)[key as keyof typeof dark]});
export const C=new Proxy({} as Record<keyof typeof dark|'surface2'|'border'|'text2'|'text3'|'accentInk',string>,{get:(_,key:string)=>color[({surface2:'surfaceElevated',border:'separator',text2:'textSecondary',text3:'textTertiary',accentInk:'onAccent'} as Record<string,keyof typeof dark>)[key]??key as keyof typeof dark]});
/** Static style declarations retain semantic colours when the appearance changes. */
export function themedStyles<T extends Record<string,ViewStyle|TextStyle|ImageStyle>>(styles:T & Record<string,ViewStyle|TextStyle|ImageStyle>):T {
 const origin=mode==='light'?light:dark;
 const remap=(value:unknown):unknown=>{
  if(typeof value==='string'){
   const key=(Object.keys(origin) as (keyof typeof dark)[]).find(k=>origin[k]===value);
   return key?color[key]:value;
  }
  if(Array.isArray(value))return value.map(remap);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,remap(v)]));
  return value;
 };
 return new Proxy(styles,{get:(target,key:string)=>remap(target[key as keyof T])});
}

/** Accenti personali del profilo: confinati al profilo, mai ai colori semantici. Tutti ≥4.5:1 su surface. */
export const PROFILE_ACCENTS = {
  teal: { solid: '#70A7FF', deep: '#1D3157', label: 'Blu' },
  violet: { solid: '#9F8BFF', deep: '#2B2160', label: 'Viola' },
  amber: { solid: '#F2B84B', deep: '#4A3510', label: 'Ambra' },
  rose: { solid: '#F2879E', deep: '#4D1E2A', label: 'Rosa' },
  lime: { solid: '#A6D86A', deep: '#2C3F14', label: 'Lime' },
  sky: { solid: '#7CB6FF', deep: '#16304F', label: 'Cielo' },
} as const;

export const S = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
export const GUTTER = S.xl;
export const HIT = 44;

export const R = { chip: 6, control: 6, card: 8, sheet: 16, pill: 999, sm: 4, md: 6, lg: 8 } as const;
/** Font del design: titoli e numeri in Bebas Neue (caricato in _layout); il testo corrente resta il font di sistema. */
export const DISPLAY = 'BebasNeue_400Regular';

export const M = { press: 120, local: 200, sheet: 300, reveal: 600 } as const;

export const type = {
  display: { fontFamily: 'BebasNeue_400Regular', fontSize: 44, lineHeight: 44, fontWeight: '400', letterSpacing: 0.9 },
  title1: { fontFamily: 'BebasNeue_400Regular', fontSize: 30, lineHeight: 32, fontWeight: '400', letterSpacing: 0.6 },
  title2: { fontFamily: 'BebasNeue_400Regular', fontSize: 22, lineHeight: 24, fontWeight: '400', letterSpacing: 0.5 },
  headline: { fontSize: 15, lineHeight: 21, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '400' },
  callout: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  subhead: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  footnote: { fontSize: 12, lineHeight: 17, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  metric: { fontFamily: 'BebasNeue_400Regular', fontSize: 30, lineHeight: 30, fontWeight: '400', fontVariant: ['tabular-nums'], letterSpacing: 0.4 },
  metricSmall: { fontFamily: 'BebasNeue_400Regular', fontSize: 24, lineHeight: 26, fontWeight: '400', fontVariant: ['tabular-nums'], letterSpacing: 0.3 },
} satisfies Record<string, TextStyle>;

export const Fonts = { sans: 'System' } as const;
