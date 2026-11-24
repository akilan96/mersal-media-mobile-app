import React, { type ComponentProps, type ReactElement, type ReactNode, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { LinearGradient } from 'expo-linear-gradient';
import { useStudioTheme, type Palette } from '../theme';
type IconName = ComponentProps<typeof Feather>['name'];
export function Screen({ children, scroll = true, contentStyle, refreshing, onRefresh }: { children: ReactNode; scroll?: boolean; contentStyle?: StyleProp<ViewStyle>; refreshing?: boolean; onRefresh?: () => void }) {
  const { colors, themeName } = useStudioTheme();
  const styles = makeStyles(colors);
 
  const insets = useSafeAreaInsets();
  const content = [styles.content, { paddingBottom: Math.max(28, insets.bottom + 16) }, contentStyle];
  return <LinearGradient colors={[themeName === 'light' || themeName === 'dark' ? colors.background : colors.mint, colors.background, colors.background]} locations={[0, 0.4, 1]} style={styles.fill}>
    <SafeAreaView style={styles.fill} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? <ScrollView contentContainerStyle={content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false} refreshControl={onRefresh ? <RefreshControl refreshing={refreshing ?? false} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} /> : undefined}>{children}</ScrollView> : <View style={[content, styles.fill]}>{children}</View>}
      </KeyboardAvoidingView>
    </SafeAreaView>
  </LinearGradient>;
}
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useStudioTheme();
  const styles = makeStyles(colors);
  return <View style={[styles.card, style]}>{children}</View>; }
export function Button({ title, onPress, variant = 'primary', icon, loading = false, disabled = false, style, textStyle }: { title: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; icon?: IconName; loading?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>; textStyle?: StyleProp<TextStyle> }) {
  const { colors } = useStudioTheme();
  const styles = makeStyles(colors);
 
  const foreground = variant === 'primary' ? colors.onPrimary : variant === 'danger' ? colors.error : colors.primaryDark;
  const child = <>{loading ? <ActivityIndicator size="small" color={foreground} /> : icon ? <Feather name={icon} size={18} color={foreground} /> : null}<Text style={[styles.buttonText, { color: foreground }, textStyle]}>{title}</Text></>;
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: disabled || loading, busy: loading }} onPress={onPress} disabled={disabled || loading} style={({ pressed }) => [styles.buttonBase, variant === 'secondary' && styles.outlineButton, variant === 'ghost' && styles.ghostButton, variant === 'danger' && styles.dangerButton, (disabled || loading) && { opacity: 0.55 }, pressed && { opacity: 0.8, transform: [{ scale: 0.99 }] }, style]}>
    {variant === 'primary' ? <LinearGradient colors={[colors.primary, colors.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.buttonInner}>{child}</LinearGradient> : <View style={styles.buttonInner}>{child}</View>}
  </Pressable>;
}
export function Field({ label, labelStyle, error, icon, style, onFocus, onBlur, variant, ...props }: TextInputProps & { label?: string; labelStyle?: StyleProp<TextStyle>; error?: string; icon?: IconName | ReactElement; variant?: 'studio-form' }) {
  const { colors, ui } = useStudioTheme();
  const styles = makeStyles(colors);
 
  const [focused, setFocused] = useState(false);
  return <View style={{ gap: 8 }}>
    {label && <Text style={[ui.label, labelStyle]}>{label}</Text>}
    <View style={[styles.fieldShell, variant === 'studio-form' && styles.studioFieldShell, focused && { borderColor: colors.primary, backgroundColor: colors.card }, !!error && { borderColor: colors.error }, props.editable === false && { opacity: 0.6 }]}>
      {icon && (
        <View style={[styles.fieldIcon, variant === 'studio-form' && icon === 'map-pin' && styles.locationIcon]}>
          {typeof icon === 'string' ? <Feather name={icon} size={18}
            color={variant === 'studio-form' && icon === 'map-pin' ? '#15803D' : colors.primary} /> : icon}
        </View>
      )}
      <TextInput {...props} accessibilityLabel={props.accessibilityLabel ?? label ?? props.placeholder} placeholderTextColor={colors.muted} selectionColor={colors.primary} onFocus={event => { setFocused(true); onFocus?.(event); }} onBlur={event => { setFocused(false); onBlur?.(event); }} style={[styles.field, props.multiline && { minHeight: 106, textAlignVertical: 'top', paddingTop: 14 }, style]} />
    </View>
    {!!error && <Text accessibilityRole="alert" style={{ color: colors.error, fontSize: 12, lineHeight: 18 }}>{error}</Text>}
  </View>;
}
export function Brand({ compact = false }: { compact?: boolean }) {
  const { colors, ui } = useStudioTheme();
  const styles = makeStyles(colors);
 
  return <View style={[ui.row, { gap: 10 }]} accessible accessibilityLabel="Mersal Media Photography">
    <Image source={require('../../assets/design/brand-logo.png')} style={{ width: compact ? 39 : 46, height: compact ? 39 : 46, borderRadius: 12 }} resizeMode="contain" />
    <View><Text style={[styles.wordmark, compact && { fontSize: 15 }]}>MERSAL <Text style={{ color: colors.primary }}>MEDIA</Text></Text><Text style={styles.tagline}>— PHOTOGRAPHY —</Text></View>
  </View>;
}
export function Header({ title, subtitle, onBack, right }: { title?: string; subtitle?: string; onBack?: () => void; right?: ReactNode }) {
  const { ui } = useStudioTheme();
 
  return <View style={[ui.between, { minHeight: 52, marginBottom: 5 }]}><View style={[ui.row, ui.flex, { gap: 6 }]}>{onBack && <IconButton name="arrow-left" label="Go back" onPress={onBack} />}<View style={ui.flex}>{title ? <Text accessibilityRole="header" style={[ui.heading, { fontSize: 22 }]}>{title}</Text> : <Brand compact />}{subtitle && <Text style={[ui.small, { marginTop: 3 }]}>{subtitle}</Text>}</View></View>{right}</View>;
}
const getBadgeTones = (colors: Palette) => ({ teal: [colors.mint, colors.primaryDark], success: [colors.successBg, colors.success], warning: [colors.warningBg, colors.warning], error: [colors.errorBg, colors.error], neutral: [colors.input, colors.muted] } as const);
export function Badge({ label, tone = 'teal' }: { label: string; tone?: keyof ReturnType<typeof getBadgeTones> }) {
  const { colors } = useStudioTheme();
  const styles = makeStyles(colors);
  const badgeTones = getBadgeTones(colors);
  return <View style={[styles.badge, { backgroundColor: badgeTones[tone][0] }]}><Text style={[styles.badgeText, { color: badgeTones[tone][1] }]}>{label}</Text></View>; }
export function IconButton({ name, label, onPress, color }: { name: IconName; label: string; onPress: () => void; color?: string }) {
  const { colors } = useStudioTheme();
  const styles = makeStyles(colors);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={2} style={({ pressed }) => [styles.iconButton, pressed && { backgroundColor: colors.mint }]}><Feather name={name} size={21} color={color ?? colors.primary} /></Pressable>; }
export function EmptyState({ icon, title, description, action }: { icon: IconName; title: string; description: string; action?: ReactNode }) {
  const { colors, ui } = useStudioTheme();
  const styles = makeStyles(colors);
 
  return <Card style={styles.empty}><View style={styles.emptyIcon}><Feather name={icon} size={29} color={colors.primary} /></View><Text style={[ui.heading, { textAlign: 'center' }]}>{title}</Text><Text style={[ui.body, { textAlign: 'center', maxWidth: 310 }]}>{description}</Text>{action && <View style={{ alignSelf: 'stretch', marginTop: 3 }}>{action}</View>}</Card>;
}
export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const { colors, ui } = useStudioTheme();
  return <View style={ui.between}><Text accessibilityRole="header" style={[ui.heading, ui.flex]}>{title}</Text>{action && onAction && <Pressable accessibilityRole="button" onPress={onAction} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.primary, fontSize: 13, fontFamily: 'InterExtraBold' }}>{action}</Text></Pressable>}</View>; }
export function ErrorMessage({ message }: { message: string }) {
  const { colors } = useStudioTheme();
  const styles = makeStyles(colors);
  return <View accessibilityRole="alert" style={styles.error}><Feather name="alert-circle" size={18} color={colors.error} /><Text style={{ flex: 1, color: colors.error, lineHeight: 20, fontSize: 13 }}>{message}</Text></View>; }
export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors } = useStudioTheme();
  const styles = makeStyles(colors);
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [styles.chip, selected && { backgroundColor: colors.primary, borderColor: colors.primary }, pressed && { opacity: 0.7 }]}><Text style={{ fontSize: 12, fontFamily: 'InterBold', color: selected ? colors.onPrimary : colors.muted }}>{label}</Text></Pressable>; }
export function CameraArt({ size = 150, uri }: { size?: number; uri?: string }) { return <Image source={uri ? { uri } : require('../../assets/design/dashboard-camera.png')} style={{ width: size, height: size * 0.85 }} resizeMode="contain" accessible={false} />; }
const makeStyles = (colors: Palette) => StyleSheet.create({
  fill: { flex: 1 }, content: { padding: 20, gap: 16, flexGrow: 1, width: '100%', maxWidth: 720, alignSelf: 'center' },
  card: { backgroundColor: colors.card, borderRadius: 20, padding: 17, borderWidth: 1, borderColor: colors.border, shadowColor: '#193B4B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.045, shadowRadius: 12, elevation: 2 },
  buttonBase: { borderRadius: 15, overflow: 'hidden' }, buttonInner: { minHeight: 51, paddingVertical: 13, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 }, buttonText: { fontSize: 14, fontFamily: 'InterExtraBold', flexShrink: 1, textAlign: 'center' },
  outlineButton: { borderWidth: 1, borderColor: '#A9DCD6', backgroundColor: colors.input }, ghostButton: { backgroundColor: 'transparent' }, dangerButton: { backgroundColor: colors.errorBg },
  fieldShell: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#DCE8E9', borderRadius: 14, backgroundColor: colors.input, paddingHorizontal: 6 },
  studioFieldShell: { minHeight: 54, borderRadius: 12, backgroundColor: colors.card, borderColor: colors.border, paddingHorizontal: 8 },
  locationIcon: { backgroundColor: '#DCFCE7' },
  field: { flex: 1, color: colors.text, minHeight: 49, fontSize: 14, paddingHorizontal: 10, paddingVertical: 11 }, fieldIcon: { width: 34, height: 34, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  logoFrame: { padding: 2, width: 46, height: 46, borderRadius: 14 }, logoInner: { flex: 1, borderRadius: 12, borderWidth: 3, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFFCF9' },
  wordmark: { fontSize: 18, color: colors.text, fontFamily: 'InterExtraBold', letterSpacing: 1 }, tagline: { marginTop: 3, color: colors.muted, letterSpacing: 2.4, fontSize: 8, fontFamily: 'InterSemiBold' },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start', flexShrink: 1 }, badgeText: { fontSize: 10, fontFamily: 'InterExtraBold' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  empty: { alignItems: 'center', paddingVertical: 28, gap: 12 }, emptyIcon: { width: 60, height: 60, borderRadius: 18, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  error: { flexDirection: 'row', gap: 9, backgroundColor: colors.errorBg, borderRadius: 12, padding: 13, alignItems: 'flex-start' },
  chip: { minHeight: 40, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 8 },
});
