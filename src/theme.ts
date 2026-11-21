import { daisyThemes } from './daisyThemes';
import { createContext, useContext, useMemo } from 'react';
import type { ThemeName } from './domain/types';
import { StyleSheet } from 'react-native';
const light = {
  onPrimary: '#FFFFFF', primary: '#0A8F88', primaryDark: '#086E68', aqua: '#2DD4BF', mint: '#E1F5F3',
  background: '#FFFFFF', card: '#FFFFFF', text: '#0F172A', muted: '#475569',
  border: '#E3EEEF', input: '#FFFFFF', success: '#18794E', successBg: '#E7F6ED',
  warning: '#9B650A', warningBg: '#FFF4D8', error: '#BD3535', errorBg: '#FFF0EE',
};
const makeUI = (colors: Palette) => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { color: colors.text, fontSize: 26, fontFamily: 'InterExtraBold', letterSpacing: -0.8 },
  heading: { color: colors.text, fontSize: 18, fontFamily: 'InterExtraBold', letterSpacing: -0.3 },
  body: { fontFamily: 'InterRegular', color: colors.muted, fontSize: 14, lineHeight: 21 },
  label: { color: colors.text, fontSize: 13, fontFamily: 'InterBold' },
  small: { fontFamily: 'InterRegular', color: colors.muted, fontSize: 12, lineHeight: 18 },
  gap: { gap: 16 }, flex: { flex: 1 },
});

export type Palette = typeof light;
const palettes: Partial<Record<ThemeName, Palette>> = {
  light,
  dark: { ...light, onPrimary: '#05201B', primary: '#39E6C5', primaryDark: '#78E2D1', aqua: '#54DCCA', mint: '#233D3C', background: '#000000', card: '#000000', input: '#000000', border: '#333333', text: '#EFF7FD', muted: '#B1C5D4', success: '#88DFAC', successBg: '#253D34', warning: '#FFD589', warningBg: '#463622', error: '#FFA8A8', errorBg: '#472D34' },
};
export const settingsThemes = ['dark', 'light', 'halloween', 'pancake', 'forest'] as const;
export const ThemeContext = createContext<ThemeName>('light');
export function useStudioTheme() {
  const savedTheme = useContext(ThemeContext);
  const themeName = savedTheme;
  const source = daisyThemes[themeName === 'pancake' ? 'caramellatte' : themeName];
  const dark = source.dark;
  const colors = useMemo<Palette>(() => palettes[themeName] ?? {
    ...(dark ? palettes.dark! : light),
    ...source,
    primaryDark: source.text,
    muted: source.text + 'C9',
    mint: source.border,
    input: source.card,
  }, [themeName, source, dark]);
  return { themeName, dark, colors, ui: useMemo(() => makeUI(colors), [colors]) };
}
