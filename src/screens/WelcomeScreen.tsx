import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Brand, Button, Screen } from '../components/ui';
import type { RootStackParamList } from '../domain/types';
import { useStudioTheme, type Palette } from '../theme';

export function WelcomeScreen() {
  const { colors, ui } = useStudioTheme();
  const styles = makeStyles(colors);
 
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <Screen contentStyle={styles.content}>
      <Brand />
      <View style={styles.artwork}>
        <View style={styles.glow} />
        <Image
          source={require('../../assets/design/welcome-hero.png')}
          style={styles.hero}
          resizeMode="contain"
          accessibilityLabel="Camera and photography prints"
        />
      </View>
      <View style={styles.introduction}>
        <View style={styles.headlineRow}>
          <View style={styles.accent} />
          <Text accessibilityRole="header" style={styles.headline}>
            Capture. Manage. Deliver.
          </Text>
        </View>
        <Text style={[ui.body, styles.description]}>
          A smart platform for photography events — from booking to final delivery.
        </Text>
      </View>
      <Button title="Get Started" icon="arrow-right" onPress={() => navigation.navigate('Login')} />
      <Text style={styles.localNote}>Your studio, beautifully organized on this device.</Text>
    </Screen>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  content: { flexGrow: 1, gap: 24, paddingTop: 20, paddingBottom: 28 },
  artwork: { flexGrow: 1, minHeight: 260, justifyContent: 'center', position: 'relative' },
  glow: { position: 'absolute', width: '82%', height: 190, borderRadius: 100, backgroundColor: colors.mint, alignSelf: 'center' },
  hero: { width: '100%', aspectRatio: 1.15, maxHeight: 390 },
  introduction: { gap: 16 },
  headlineRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  accent: { width: 4, height: '80%', minHeight: 38, borderRadius: 4, backgroundColor: colors.aqua },
  headline: { flex: 1, color: colors.text, fontSize: 32, fontFamily: 'InterExtraBold', letterSpacing: -1, lineHeight: 39 },
  description: { paddingLeft: 18, fontSize: 16, lineHeight: 25 },
  localNote: { textAlign: 'center', color: colors.muted, fontSize: 12, lineHeight: 18 },
});
