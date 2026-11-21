import React, { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Card, ErrorMessage, Header, Screen } from './ui';
import { daisyThemes } from '../daisyThemes';
import { useStudio } from '../state/StudioProvider';
import { settingsThemes, useStudioTheme } from '../theme';

type Appearance = typeof settingsThemes[number];
const label = (theme: string) => theme[0].toUpperCase() + theme.slice(1);

export function AppearanceSetting() {
  const { setTheme } = useStudio();
  const { colors, themeName, ui } = useStudioTheme();
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState<Appearance | null>(null);
  const [error, setError] = useState('');
  const current = settingsThemes.find(theme => theme === themeName) ?? 'light';

  function close() {
    if (!saving) setVisible(false);
  }

  async function select(theme: Appearance) {
    if (saving || current === theme) return;
    setSaving(theme);
    setError('');
    try {
      await setTheme(theme);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the theme.');
    } finally {
      setSaving(null);
    }
  }

  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`Appearance, ${label(current)}`}
      onPress={() => { setError(''); setVisible(true); }}
      style={({ pressed }) => [styles.entry, pressed && { backgroundColor: colors.mint }]}>
      <View style={[styles.icon, { backgroundColor: colors.mint }]}><Feather name="sun" size={20} color={colors.primary} /></View>
      <View style={ui.flex}><Text style={ui.label}>Appearance</Text><Text style={ui.small}>{label(current)}</Text></View>
      <Feather name="chevron-right" size={20} color={colors.primary} />
    </Pressable>
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <Screen>
        <Header title="Appearance" onBack={close} />
        <Card style={styles.themes}>
          {settingsThemes.map(theme => {
            const palette = daisyThemes[theme === 'pancake' ? 'caramellatte' : theme];
            const selected = current === theme;
            return <Pressable key={theme} accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled: Boolean(saving) }}
              disabled={Boolean(saving)} onPress={() => void select(theme)}
              style={({ pressed }) => [styles.option, {
                borderColor: selected ? colors.primary : colors.border,
                backgroundColor: selected || pressed ? colors.mint : colors.card,
              }]}>
              <View style={[styles.swatch, { backgroundColor: palette.background, borderColor: colors.border }]}>
                <View style={[styles.dot, { backgroundColor: palette.primary }]} />
              </View>
              <Text style={[ui.label, styles.optionLabel]}>{label(theme)}</Text>
              {saving === theme ? <ActivityIndicator size="small" color={colors.primary} accessibilityLabel="Saving appearance" />
                : <Feather name={selected ? 'check-circle' : 'circle'} size={20} color={selected ? colors.primary : colors.muted} />}
            </Pressable>;
          })}
        </Card>
        {!!error && <ErrorMessage message={error} />}
      </Screen>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  entry: { minHeight: 61, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 11, borderRadius: 12 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  themes: { gap: 9 },
  option: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderRadius: 14 },
  optionLabel: { flex: 1, fontSize: 15 },
  swatch: { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 17, height: 17, borderRadius: 9 },
});
