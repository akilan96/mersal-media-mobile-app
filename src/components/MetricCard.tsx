import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';
import { useStudioTheme, type Palette } from '../theme';

const metricColors = {
  mint: { surface: ['#FFFFFF', '#EDFFF7'], tile: ['#2ED4A9', '#128A70'], wave: '#11C997' },
  blue: { surface: ['#FFFFFF', '#EAF8FF'], tile: ['#55CBFA', '#168AC7'], wave: '#20A8EE' },
  gold: { surface: ['#FFFFFF', '#FFF9E2'], tile: ['#FFE055', '#DFA800'], wave: '#EAB500' },
  teal: { surface: ['#FFFFFF', '#EBFFF9'], tile: ['#20D4A4', '#087A66'], wave: '#09C8A0' },
} as const;
const waveLine = 'M0 43 C15 46 25 22 40 22 S56 38 70 23 S91 -4 103 9';

export function MetricCard({ label, value, icon, caption, tone, onPress }: {
  label: string;
  value: number | string;
  icon: React.ComponentProps<typeof Feather>['name'];
  caption: string;
  tone: keyof typeof metricColors;
  onPress?: () => void;
}) {
  const { colors, ui, themeName } = useStudioTheme();
  const styles = makeStyles(colors);
 
  const palette = metricColors[tone];
  const gradientId = `metric-wave-${tone}`;
  const content = (
      <LinearGradient colors={themeName === 'dark' ? [colors.card, colors.card] : themeName === 'light' ? palette.surface : [colors.card, colors.mint]} style={styles.metric}>
        <View style={styles.metricHeader}>
          <LinearGradient colors={palette.tile} style={styles.metricIcon}>
            <Feather name={icon} size={21} color="#FFFFFF" />
          </LinearGradient>
          <Text style={styles.metricLabel}>{label}</Text>
        </View>
        <View style={styles.metricBody}>
          <View style={ui.flex}>
            <Text style={[styles.value, typeof value === 'string' && styles.moneyValue]}>{value}</Text>
            <Text style={styles.metricCaption}>{caption}</Text>
          </View>
          <View style={[styles.metricWave, typeof value === 'string' && styles.moneyWave]} pointerEvents="none" importantForAccessibility="no-hide-descendants">
            <Svg width="100%" height="100%" viewBox="0 0 104 58">
              <Defs>
                <SvgGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                  <Stop offset="0" stopColor={palette.wave} stopOpacity={0.4} />
                  <Stop offset="1" stopColor={palette.wave} stopOpacity={0} />
                </SvgGradient>
              </Defs>
              <Path d={`${waveLine} L103 58 H0 Z`} fill={`url(#${gradientId})`} />
              <Path d={waveLine} fill="none" stroke={palette.wave} strokeWidth={1.5} />
            </Svg>
          </View>
        </View>
      </LinearGradient>

  );
  return onPress ? <Pressable onPress={onPress} accessibilityRole="button"
    style={({ pressed }) => [styles.metricWrap, pressed && { opacity: 0.78 }]}
    accessibilityLabel={`${label}: ${value}, ${caption}`}>{content}</Pressable>
    : <View style={styles.metricWrap}>{content}</View>;
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  metricWrap: { flexGrow: 1, flexBasis: '45%', borderRadius: 18, backgroundColor: colors.card, elevation: 2, shadowColor: '#248B7B', shadowOpacity: 0.13, shadowRadius: 7, shadowOffset: { width: 0, height: 4 } },
  metric: { flex: 1, minHeight: 113, borderRadius: 18, borderWidth: 1.5, borderColor: colors.border, padding: 10, gap: 6 },
  metricHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metricIcon: { width: 37, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  metricLabel: { flex: 1, color: colors.text, fontSize: 13, fontFamily: 'InterBold' },
  metricBody: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  metricCaption: { color: colors.text, fontSize: 12 },
  metricWave: { width: '41%', height: 37 },
  value: { color: colors.text, fontSize: 29, fontFamily: 'InterExtraBold', letterSpacing: -0.7 },
  moneyValue: { fontSize: 20 },
  moneyWave: { position: 'absolute', bottom: 0, right: 0, opacity: 0.24, zIndex: -1 },
});
