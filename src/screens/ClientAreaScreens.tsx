import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import Constants from 'expo-constants';
import Feather from '@expo/vector-icons/Feather';
import { Brand, Card, EmptyState, Header, IconButton, Screen } from '../components/ui';
import { AppearanceSetting } from '../components/AppearanceSetting';
import { MetricCard } from '../components/MetricCard';
import { useStudio } from '../state/StudioProvider';
import { useStudioTheme } from '../theme';
import { greeting, money } from '../domain/helpers';
import type { ClientPaymentSummary } from '../domain/types';

export function ClientHomeScreen() {
  const { accountName, loadClientPayments } = useStudio();
  const { colors, ui, themeName } = useStudioTheme();
  const [payments, setPayments] = useState<ClientPaymentSummary | null>();
  const [paymentError, setPaymentError] = useState(false);
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
    <View style={[styles.greeting, { borderLeftColor: colors.primary }]}>
      <Text style={ui.body}>{greeting()}</Text>
      <Text accessibilityRole="header" style={ui.title}>{accountName ? `${accountName}!` : 'Welcome!'}</Text>
    </View>
    <View style={styles.photoMetrics}>
      <MetricCard label="Total Photos" value={0} caption="In your gallery" icon="image" tone="mint" />
      <MetricCard label="Selected Photos" value={0} caption="Your picks" icon="check-circle" tone="blue" />
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
  return <Screen>
    <Header title="Favourites" />
    <EmptyState icon="heart" title="No favourites yet" description="Photos you mark as favourites will appear here." />
  </Screen>;
}

export function ClientSettingsScreen() {
  const { lock } = useStudio();
  const { colors, ui } = useStudioTheme();
  return <Screen>
    <Header title="Settings" right={<IconButton name="log-out" label="Log out" onPress={lock} />} />
    <Card style={styles.appearance}><AppearanceSetting /></Card>
    <Card style={ui.gap}>
      <View style={ui.row}>
        <Image source={require('../../assets/design/ameyy-logo.jpeg')} style={styles.logo} resizeMode="contain" accessible={false} />
        <View style={ui.flex}>
          <Text style={ui.label}>Ameyy Digital Services</Text>
          <Text style={ui.small}>Digital With Intention</Text>
        </View>
      </View>
      <View style={ui.between}>
        <View style={ui.row}>
          <Feather name="info" size={18} color={colors.primary} />
          <Text style={ui.label}>App version</Text>
        </View>
        <Text style={ui.small}>{Constants.expoConfig?.version ?? '1.0.0'}</Text>
      </View>
    </Card>
  </Screen>;
}

const styles = StyleSheet.create({
  greeting: { marginTop: 8, paddingLeft: 12, borderLeftWidth: 4, gap: 4 },
  photoMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  trustCard: { marginTop: 20, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderRadius: 18, borderWidth: 1 },
  trustIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  appearance: { padding: 0 },
  logo: { width: 44, height: 44, borderRadius: 9 },
});
