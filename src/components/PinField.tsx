import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useStudioTheme, type Palette } from '../theme';

type PinFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  revealed: boolean;
  largeLabel?: boolean;
  disabled?: boolean;
  error?: string;
};

export function PinField({ label, value, onChange, revealed, disabled, error, largeLabel }: PinFieldProps) {
  const { colors, ui } = useStudioTheme();
  const styles = makeStyles(colors);
 
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.fieldGroup}>
      <Text style={[ui.label, largeLabel && styles.largeLabel]}>{label}</Text>
      <Pressable onPress={() => inputRef.current?.focus()} accessible={false}>
        <View style={styles.pinRow} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {[0, 1, 2, 3].map((index) => (
            <View key={index} style={[styles.pinCell, focused && index === Math.min(value.length, 3) && styles.pinCellFocused, error ? styles.pinCellError : null]}>
              <Text style={styles.pinDigit} accessibilityElementsHidden>
                {value[index] ? (revealed ? value[index] : '•') : ''}
              </Text>
            </View>
          ))}
        </View>
        <TextInput
          ref={inputRef}
          accessibilityLabel={label}
          accessibilityHint="Enter four numbers"
          value={value}
          onChangeText={(text) => onChange(text.replace(/\D/g, '').slice(0, 4))}
          keyboardType="number-pad"
          maxLength={4}
          secureTextEntry={!revealed}
          autoComplete="off"
          autoCorrect={false}
          editable={!disabled}
          caretHidden
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={styles.pinInput}
        />
      </Pressable>
      {error ? <Text accessibilityRole="alert" style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}


const makeStyles = (colors: Palette) => StyleSheet.create({
  largeLabel: { fontSize: 16, lineHeight: 22 },
  fieldGroup: { gap: 9 },
  pinRow: { flexDirection: 'row', gap: 12 },
  pinCell: { flex: 1, height: 56, borderRadius: 15, backgroundColor: colors.mint, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  pinCellFocused: { borderColor: colors.primary, borderWidth: 2 },
  pinCellError: { borderColor: colors.error },
  pinDigit: { color: colors.text, fontSize: 27, fontFamily: 'InterBold' },
  pinInput: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, color: 'transparent', backgroundColor: 'transparent', opacity: 0.04, fontSize: 27 },
  fieldError: { color: colors.error, fontSize: 12, lineHeight: 18 },
});
