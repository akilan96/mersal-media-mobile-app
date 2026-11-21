import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Badge, Screen } from '../components/ui';
import { useStudioTheme, type Palette } from '../theme';

export function PhotosScreen() {
  const { colors, ui } = useStudioTheme();
  const styles = makeStyles(colors);
 
  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.artwork}>
        <View style={styles.glow} />
        <Image
          source={require('../../assets/design/photos-hero.png')}
          resizeMode="contain"
          style={styles.hero}
          accessibilityLabel="Photography camera and printed memories"
        />
      </View>
      <View style={styles.filmBadge} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Feather name="film" size={40} color={colors.primary} />
      </View>
      <View><Badge label="COMING SOON" /></View>
      <Text accessibilityRole="header" style={styles.headline}>
        Something Beautiful Is Coming Soon
      </Text>
      <Text style={styles.subheading}>
        We’re creating a better way to manage your photography experience.
      </Text>
      <Text style={[ui.body, styles.description]}>
        From capturing precious moments to organizing unforgettable memories, exciting new features are on their way.
      </Text>
      <View style={styles.decoration} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={styles.dot} />
        <View style={styles.activeDot} />
        <View style={styles.dot} />
      </View>
    </Screen>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  content: { flexGrow: 1, alignItems: 'center', gap: 19, paddingBottom: 40 },
  artwork: { width: '100%', minHeight: 210, justifyContent: 'center', position: 'relative' },
  glow: { position: 'absolute', width: '90%', height: 170, borderRadius: 90, backgroundColor: colors.mint, alignSelf: 'center' },
  hero: { width: '100%', aspectRatio: 1.35, maxHeight: 310 },
  filmBadge: { backgroundColor: colors.mint, width: 86, height: 86, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginTop: -5, borderWidth: 1, borderColor: '#C7EFEB' },
  headline: { fontSize: 29, fontFamily: 'InterExtraBold', color: colors.text, textAlign: 'center', letterSpacing: -0.8, lineHeight: 35, maxWidth: 365 },
  subheading: { color: colors.primary, fontSize: 17, lineHeight: 25, fontFamily: 'InterBold', textAlign: 'center', maxWidth: 360 },
  description: { textAlign: 'center', maxWidth: 360, lineHeight: 23 },
  decoration: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 5 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.mint },
  activeDot: { width: 25, height: 7, borderRadius: 4, backgroundColor: colors.primary },
});
