import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { PagedList } from '../components/PagedList';
import { Badge, Button, Card, Chip, EmptyState, Field, Header, IconButton } from '../components/ui';
import { balanceAmount, formatDate, money, paidAmount, paymentLabel } from '../domain/helpers';
import { phoneDigits } from '../domain/validation';
import { useStudioNavigation } from '../navigation/useStudioNavigation';
import { useStudio } from '../state/StudioProvider';
import { useStudioTheme } from '../theme';

export default function PaymentsScreen() {
  const navigation = useStudioNavigation();
  const { data } = useStudio();
  const { colors, ui } = useStudioTheme();
  const [filter, setFilter] = useState<'pending' | 'paid'>('pending');
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string>();

  const summary = useMemo(() => {
    const clients = new Map(data.clients.map(client => [client.id, client]));
    const rows = data.events.filter(event => event.status !== 'Cancelled').map(event => ({
      id: event.id,
      event,
      client: event.clientId ? clients.get(event.clientId) : undefined,
      collected: Math.round(paidAmount(event) * 100),
      pending: Math.round(balanceAmount(event) * 100),
    })).sort((a, b) => Date.parse(b.event.createdAt) - Date.parse(a.event.createdAt));
    const pending = rows.filter(row => row.pending > 0);
    const paid = rows.filter(row => row.pending === 0);
    return {
      pending,
      paid,
      collectedAmount: rows.reduce((sum, row) => sum + row.collected, 0) / 100,
      pendingAmount: pending.reduce((sum, row) => sum + row.pending, 0) / 100,
    };
  }, [data.events, data.clients]);

  const search = query.trim().toLowerCase();
  const items = useMemo(() => {
    const digits = /^[+\d\s().-]+$/.test(search) ? phoneDigits(search) : '';
    return summary[filter].filter(({ event, client }) =>
      !search || [event.title, event.type, event.location, client?.name, client?.phone]
        .some(value => value?.toLowerCase().includes(search)) ||
      Boolean(digits && client?.phone && phoneDigits(client.phone).includes(digits))
    );
  }, [summary, filter, search]);

  return (
    <PagedList
      items={items}
      scope={JSON.stringify([filter, search])}
      header={<View style={ui.gap}>
        <Header title="Payments" onBack={() => navigation.goBack()} />
        <View style={styles.totals}>
          <Card style={[styles.totalCard, { backgroundColor: colors.successBg, borderColor: colors.success }]}>
            <Feather name="check-circle" size={21} color={colors.success} />
            <Text style={[ui.label, { color: colors.success }]}>Total collected</Text>
            <Text style={[ui.heading, { color: colors.success }]}>{money(summary.collectedAmount)}</Text>
          </Card>
          <Card style={[styles.totalCard, { backgroundColor: colors.warningBg, borderColor: colors.warning }]}>
            <Feather name="clock" size={21} color={colors.warning} />
            <Text style={[ui.label, { color: colors.warning }]}>Total pending</Text>
            <Text style={[ui.heading, { color: colors.warning }]}>{money(summary.pendingAmount)}</Text>
          </Card>
        </View>
        <View style={styles.filters}>
          <Chip label={`Pending (${summary.pending.length})`} selected={filter === 'pending'} onPress={() => { setFilter('pending'); setExpandedId(undefined); }} />
          <Chip label={`Paid (${summary.paid.length})`} selected={filter === 'paid'} onPress={() => { setFilter('paid'); setExpandedId(undefined); }} />
        </View>
        <Field icon="search" accessibilityLabel="Search payments" placeholder="Search name, venue, or phone"
          value={query} onChangeText={setQuery} autoCorrect={false} returnKeyType="search" />
      </View>}
      empty={<EmptyState icon={filter === 'pending' ? 'clock' : 'check-circle'}
        title={search ? 'No matching bookings' : filter === 'pending' ? 'No pending payments' : 'No fully paid bookings'}
        description={search ? 'Try another name, venue, or phone number.' : filter === 'pending' ? 'Bookings with a balance due will appear here.' : 'Bookings appear here when their balance reaches zero.'}
        action={search ? <Button title="Clear search" variant="secondary" onPress={() => setQuery('')} /> : undefined} />}
      renderItem={({ item }) => {
        const name = item.client?.name ?? item.event.title;
        const canExpand = filter === 'paid' || item.event.status === 'Completed';
        const expanded = canExpand && expandedId === item.id;
        return (
          <Card style={styles.bookingCard}>
            <View style={[ui.row, { gap: 4 }]}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Open event for ${name}`}
                onPress={() => navigation.navigate('EventDetails', { eventId: item.id })}
                style={({ pressed }) => [ui.between, ui.flex, pressed && { opacity: 0.75 }]}>
              <View style={ui.flex}>
                <Text style={ui.heading}>{name}</Text>
                <Text style={ui.small}>{item.event.type} · {formatDate(item.event.date)}</Text>
              </View>
              <Feather name="chevron-right" size={21} color={colors.primary} />
              </Pressable>
              {canExpand && (
                <IconButton name={expanded ? 'eye-off' : 'eye'}
                  label={`${expanded ? 'Hide' : 'Show'} payments for ${name}`}
                  onPress={() => setExpandedId(expanded ? undefined : item.id)} />
              )}
            </View>
            <View style={styles.badges}>
              <Badge label={paymentLabel(item.event)} tone={item.pending ? 'warning' : 'success'} />
            </View>
            <View style={ui.between}>
              <Text style={[ui.small, ui.flex]}>Received {money(item.collected / 100)}</Text>
              <Text style={[ui.label, { color: item.pending ? colors.warning : colors.success }]}>
                {item.pending ? `Due ${money(item.pending / 100)}` : 'Paid in full'}
              </Text>
            </View>
            {expanded && (
              <View style={[styles.paymentHistory, { borderTopColor: colors.border }]}>
                <Text style={ui.label}>Payments Added</Text>
                {item.event.payments.length === 0 ? (
                  <Text style={ui.small}>No payments recorded.</Text>
                ) : [...item.event.payments].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).map(payment => (
                  <View key={payment.id} style={ui.between}>
                    <View style={ui.flex}>
                      <Text style={ui.label}>{payment.note || 'Payment received'}</Text>
                      <Text style={ui.small}>{formatDate(payment.date)}</Text>
                    </View>
                    <Text style={[ui.label, { color: colors.success }]}>{money(payment.amount)}</Text>
                  </View>
                ))}
              </View>
            )}
          </Card>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  totals: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  totalCard: { flexGrow: 1, flexBasis: 130, gap: 6, padding: 12 },
  filters: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  bookingCard: { gap: 10 },
  paymentHistory: { paddingTop: 10, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
