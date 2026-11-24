import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { LinearGradient } from 'expo-linear-gradient';
import Feather from '@expo/vector-icons/Feather';
import { Brand, Button, Card, Header, Screen } from '../components/ui';
import { AppearanceSetting } from '../components/AppearanceSetting';
import { AmeyyWebsiteCard } from '../components/AmeyyWebsiteCard';
import { MetricCard } from '../components/MetricCard';
import { useStudio } from '../state/StudioProvider';
import { useStudioTheme } from '../theme';
import { greeting, money } from '../domain/helpers';
import type { ClientPaymentSummary, ClientPhotoSummary } from '../domain/types';
import { ClientGalleryScreen } from './ClientPhotosScreen';

export function ClientHomeScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<{ Photos: undefined; Favourites: undefined }>>();
  const { accountName, loadClientPayments, loadClientPhotoSummary, galleryChange } = useStudio();
  const { colors, ui, themeName } = useStudioTheme();
  const [payments, setPayments] = useState<ClientPaymentSummary | null>();
  const [paymentError, setPaymentError] = useState(false);
  const [photos, setPhotos] = useState<ClientPhotoSummary>();
  const [photoError, setPhotoError] = useState(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    setPhotoError(false);
    void loadClientPhotoSummary?.().then(summary => {
      if (active) setPhotos(summary);
    }).catch(() => {
      if (active) setPhotoError(true);
    });
    return () => { active = false; };
  }, [loadClientPhotoSummary, galleryChange]));
  useFocusEffect(useCallback(() => {
    let active = true;
    if (loadClientPayments) {
      setPaymentError(false);
      void loadClientPayments().then(summary => {
        if (active) setPayments(summary);
      }).catch(() => {
        if (active) { setPayments(undefined); setPaymentError(true); }
      });
    }
    return () => { active = false; };
  }, [loadClientPayments]));
  const caption = payments ? '' : paymentError ? 'Unavailable' : payments === null ? 'Awaiting studio link' : 'Loading…';

  return <Screen>
    <Brand />
    <LinearGradient colors={[colors.card, colors.mint]} style={[styles.homeHero, { borderColor: colors.border }]}>
      <View style={styles.heroText}>
        <Text style={ui.body}>{greeting()}</Text>
        <Text accessibilityRole="header" style={ui.title}>{accountName || 'Welcome'}</Text>
        <Button title="Open gallery" icon="image" onPress={() => navigation.navigate('Photos')} />
      </View>
      <Image source={require('../../assets/design/photos-hero.png')} style={styles.heroPhoto}
        resizeMode="cover" accessible={false} />
    </LinearGradient>
    <Text accessibilityRole="header" style={ui.heading}>Your photos</Text>
    <View style={styles.photoMetrics}>
      <MetricCard label="Total Photos" value={photos?.total ?? '—'} caption={photoError ? 'Could not refresh' : 'In your gallery'}
        icon="image" tone="mint" onPress={() => navigation.navigate('Photos')} />
      <MetricCard label="Selected Photos" value={photos?.selected ?? '—'} caption={photoError ? 'Could not refresh' : 'Your picks'}
        icon="heart" tone="blue" onPress={() => navigation.navigate('Favourites')} />
    </View>
    <Text accessibilityRole="header" style={ui.heading}>Payments</Text>
    <View style={styles.photoMetrics}>
      <MetricCard label="Total Payment" value={payments ? money(payments.total) : '—'} caption={caption || 'Booking total'} icon="credit-card" tone="teal" />
      <MetricCard label="Pending Payment" value={payments ? money(payments.pending) : '—'} caption={caption || 'Balance due'} icon="clock" tone="gold" />
    </View>
    {payments === undefined && !paymentError && !!loadClientPayments && <ActivityIndicator size="small" color={colors.primary} accessibilityLabel="Loading payment totals" />}
    <LinearGradient colors={themeName === 'light' ? ['#E6F8F1', '#EFF9FE'] : [colors.mint, colors.card]} style={[styles.trustCard, { borderColor: colors.border }]}>
      <View style={[styles.trustIcon, { backgroundColor: colors.card }]}>
        <Feather name="shield" size={22} color={colors.primaryDark} />
      </View>
      <View style={ui.flex}>
        <Text style={ui.heading}>You’re in safe hands</Text>
        <Text style={ui.body}>Your login shows only the booking details linked to your account.</Text>
      </View>
    </LinearGradient>
  </Screen>;
}

export function ClientFavouritesScreen() {
  return <ClientGalleryScreen favourites />;
}

export function ClientSettingsScreen() {
  const { lock } = useStudio();
  const { colors, ui } = useStudioTheme();

  function confirmLogout() {
    Alert.alert('Log out?', 'Sign in again to access your gallery.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: lock },
    ]);
  }

  return <Screen contentStyle={styles.settingsContent}>
    <Header title="Settings" />
    <Card style={styles.appearance}><AppearanceSetting /></Card>
    <Card style={styles.logoutCard}>
      <Pressable accessibilityRole="button" onPress={confirmLogout}
        style={({ pressed }) => [styles.logoutRow, pressed && { backgroundColor: colors.errorBg }]}>
        <View style={[styles.settingsIcon, { backgroundColor: colors.errorBg }]}>
          <Feather name="log-out" size={22} color={colors.error} />
        </View>
        <Text style={[styles.logoutLabel, ui.flex, { color: colors.error }]}>Log out</Text>
        <Feather name="chevron-right" size={22} color={colors.error} />
      </Pressable>
    </Card>
    <AmeyyWebsiteCard />
  </Screen>;
}

const styles = StyleSheet.create({
  homeHero: { borderRadius: 24, borderWidth: 1, overflow: 'hidden' },
  heroText: { padding: 18, gap: 10 },
  heroPhoto: { width: '100%', height: 140 },
  photoMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  trustCard: { marginTop: 20, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderRadius: 18, borderWidth: 1 },
  trustIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  appearance: { padding: 0 },
  logoutCard: { padding: 0, overflow: 'hidden' },
  logoutRow: { flexDirection: 'row', alignItems: 'center', minHeight: 78, gap: 14, paddingHorizontal: 16 },
  logoutLabel: { fontSize: 15, fontFamily: 'InterBold' },
  settingsIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  settingsContent: { flexGrow: 1 },
});
