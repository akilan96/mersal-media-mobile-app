import React from 'react';
import { Alert, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import Feather from '@expo/vector-icons/Feather';
import { Card } from './ui';
import { useStudioTheme } from '../theme';

export function AmeyyWebsiteCard() {
  const { colors } = useStudioTheme();
  const version = Constants.expoConfig?.version ?? '1.0.0';
  function openWebsite() {
    void Linking.openURL('https://ameyy.in').catch(() => {
      Alert.alert('Could not open the website', 'Try opening ameyy.in directly in your browser.');
    });
  }

  return <View style={styles.footer}>
    <Text style={[styles.credit, { color: colors.muted }]}>Design &amp; Developed By</Text>
    <Pressable accessibilityRole="link" accessibilityLabel={`Ameyy Digital Services, app version ${version}`}
      accessibilityHint="Opens ameyy.in in your browser" onPress={openWebsite}
      style={({ pressed }) => pressed && styles.pressed}>
      <Card style={styles.card}>
        <Image source={require('../../assets/design/ameyy-logo.jpeg')} style={styles.logo} resizeMode="contain" accessible={false} />
        <Text style={[styles.name, { color: colors.text }]}>Ameyy Digital Services</Text>
        <Text style={[styles.version, { color: colors.primaryDark, backgroundColor: colors.mint }]}>v{version}</Text>
        <Feather name="external-link" size={13} color={colors.muted} />
      </Card>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  footer: { marginTop: 'auto', width: '100%', maxWidth: 308, alignSelf: 'center', gap: 5 },
  credit: { fontFamily: 'InterSemiBold', fontSize: 9, textAlign: 'center' },
  pressed: { opacity: 0.75 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 14 },
  logo: { width: 30, height: 30, borderRadius: 7 },
  name: { flex: 1, fontFamily: 'InterSemiBold', fontSize: 12, lineHeight: 17 },
  version: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3, fontFamily: 'InterMedium', fontSize: 11, fontVariant: ['tabular-nums'] },
});
