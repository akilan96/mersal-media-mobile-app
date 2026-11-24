import React from 'react';
import { Platform, StyleSheet, Text } from 'react-native';
import { greeting } from '../domain/helpers';
import { useStudioTheme } from '../theme';

export function HomeGreeting() {
  const { colors } = useStudioTheme();
  return <Text style={[styles.greeting, { color: colors.primaryDark }]}>{greeting()}</Text>;
}

const styles = StyleSheet.create({
  greeting: {
    fontFamily: Platform.select({ ios: 'Snell Roundhand', default: 'cursive' }),
    fontSize: 27,
    lineHeight: 36,
  },
});
