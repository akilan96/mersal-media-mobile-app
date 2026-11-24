import { PagedList } from '../components/PagedList';
import { useToast } from '../components/Toast';
import { useConfirmation } from '../components/ConfirmationDialog';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useFocusEffect } from '@react-navigation/native';
import { useStudioNavigation } from '../navigation/useStudioNavigation';
import { Badge, Brand, Button, Card, Chip, EmptyState, ErrorMessage, Field, Header } from '../components/ui';
import { Client, ClientInput, StudioEvent } from '../domain/types';
import { formatDate, upcomingEvents } from '../domain/helpers';
import { useStudio } from '../state/StudioProvider';
import { useStudioTheme, type Palette } from '../theme';

const sortOptions = ['Newest', 'Name', 'Date', 'Status'] as const;
type Sort = typeof sortOptions[number];
const statusOrder = { Scheduled: 0, Editing: 1, Completed: 2, Cancelled: 3, 'New client': 4 };
const blankClient: ClientInput = { name: '', phone: '', email: '', notes: '' };
const failureMessage = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';

function nextEvent(events: StudioEvent[], now: Date): StudioEvent | undefined {
  const active = events.filter(event => !event.inactive && event.status !== 'Cancelled');
  const upcoming = upcomingEvents(active, now);
  return [...(upcoming.length ? upcoming : active.length ? active : events)].sort((left, right) => upcoming.length
    ? new Date(left.date).getTime() - new Date(right.date).getTime()
    : new Date(right.date).getTime() - new Date(left.date).getTime())[0];
}

export default function ClientsScreen() {
  const confirm = useConfirmation();
  const showToast = useToast();
  const { colors, ui } = useStudioTheme();
  const styles = makeStyles(colors);
 
  const { data, saveClient, deleteClient, reactivateClient } = useStudio();
  const navigation = useStudioNavigation();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('Newest');
  const [editing, setEditing] = useState<Client | null>(null);
  const [visible, setVisible] = useState(false);
  const [form, setForm] = useState<ClientInput>(blankClient);
  const [errors, setErrors] = useState<Partial<Record<keyof ClientInput, string>>>({});
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [busyAction, setBusyAction] = useState<'save' | 'reactivate' | null>(null);
  const busy = busyAction !== null;
  const editingClient = data.clients.find(client => client.id === editing?.id);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  useFocusEffect(useCallback(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []));

  const groups = useMemo(() => data.clients.map(client => {
    const events = data.events.filter(event => event.clientId === client.id);
    return { id: client.id, client, events, event: nextEvent(events, now) };
  }), [data.clients, data.events, now]);

  const clients = useMemo(() => {
    const search = query.trim().toLowerCase();
    return groups.filter(({ client, events }) => {
      const matchesQuery = !search ? !client.inactive : [client.name, client.phone, client.email, ...events.map(event => event.title)]
        .some(value => value.toLowerCase().includes(search));
      return matchesQuery;
    }).sort((left, right) => {
      if (sort === 'Newest') return Date.parse(right.client.createdAt) - Date.parse(left.client.createdAt);
      if (sort === 'Date') {
        const leftDate = left.event ? new Date(left.event.date).getTime() : Number.MAX_SAFE_INTEGER;
        const rightDate = right.event ? new Date(right.event.date).getTime() : Number.MAX_SAFE_INTEGER;
        if (leftDate !== rightDate) return leftDate - rightDate;
      }
      if (sort === 'Status') {
        const difference = statusOrder[left.event?.status ?? 'New client'] - statusOrder[right.event?.status ?? 'New client'];
        if (difference !== 0) return difference;
      }
      return left.client.name.localeCompare(right.client.name);
    });
  }, [groups, query, sort]);

  function openForm(client?: Client) {
    setEditing(client ?? null);
    setForm(client ? { name: client.name, phone: client.phone, email: client.email, notes: client.notes } : { ...blankClient });
    setErrors({});
    setFormError('');
    setVisible(true);
  }

  function change(field: keyof ClientInput, value: string) {
    setForm(previous => ({ ...previous, [field]: value }));
    setErrors(previous => ({ ...previous, [field]: undefined }));
  }

  async function submit() {
    if (busy) return;
    const clean = { name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim(), notes: form.notes.trim() };
    const nextErrors: Partial<Record<keyof ClientInput, string>> = {};
    if (!clean.name) nextErrors.name = 'Enter a client name.';
    if (clean.phone && (!/^[+\d\s().-]+$/.test(clean.phone) || !/^\d{7,15}$/.test(clean.phone.replace(/\D/g, '')))) nextErrors.phone = 'Enter a valid phone number with country code.';
    if (clean.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.email)) nextErrors.email = 'Enter a valid email address.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setBusyAction('save');
    setFormError('');
    try {
      await saveClient(clean, editing?.id);
      showToast(editing ? 'Client updated' : 'Client created');
      setVisible(false);
    } catch (exception) { setFormError(failureMessage(exception)); }
    finally { setBusyAction(null); }
  }

  async function makeActive() {
    if (!editingClient?.inactive || busy) return;
    setBusyAction('reactivate');
    setFormError('');
    try {
      await reactivateClient(editingClient.id);
      showToast('Client is active again');
    } catch (exception) { setFormError(failureMessage(exception)); }
    finally { setBusyAction(null); }
  }

  function confirmDelete(client: Client) {
    confirm({ title: 'Make client inactive?', message: `${client.name} will be hidden from the list. Search for them to view their details.`,
      icon: 'user-x', confirmLabel: 'Make inactive', destructive: true, onConfirm: () => {
        setError('');
        setDeletingId(client.id);
        void deleteClient(client.id).then(() => showToast('Client marked inactive'))
          .catch(exception => setError(failureMessage(exception))).finally(() => setDeletingId(null));
      } });
  }

  async function openContact(url: string) {
    setError('');
    try { await Linking.openURL(url); }
    catch { setError('No app could open this contact action. Check that the relevant phone or messaging app is installed.'); }
  }

  function message(client: Client) {
    const number = client.phone.replace(/[^+\d]/g, '');
    Alert.alert(`Message ${client.name}`, 'Choose a messaging app.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'SMS', onPress: () => { void openContact(`sms:${number}`); } },
      { text: 'WhatsApp', onPress: () => {
        if (!number.startsWith('+')) {
          setError('Edit this client and add their international country code, such as +91, before using WhatsApp.');
          return;
        }
        void openContact(`https://wa.me/${number.replace(/\D/g, '')}`);
      } },
    ]);
  }

  return (
    <>
    <PagedList items={clients} scope={JSON.stringify([query, sort])} createAction={{ label: 'Add client', onPress: () => openForm() }} header={<View style={ui.gap}>
      <View style={ui.between}>
        <Brand />
      </View>
      <Field icon="search" accessibilityLabel="Search clients" placeholder="Search name, event or phone…" value={query} onChangeText={setQuery} autoCapitalize="none" returnKeyType="search" />
      <View style={styles.sortRow}>
        <Text style={ui.small}>Sort:</Text>
        {sortOptions.map(option => (
          <Chip key={option} label={option} selected={sort === option} onPress={() => setSort(option)} />
        ))}
      </View>
      <Text style={ui.label}>{clients.length} {clients.length === 1 ? 'client' : 'clients'}</Text>
      {error ? <ErrorMessage message={error} /> : null}
    </View>}
    empty={<EmptyState icon="users" title={data.clients.length ? 'No matching clients' : 'A little space for your people'} description={data.clients.length ? 'Try another search.' : 'Add your first client, then connect their upcoming shoots.'} action={query.trim() ? <Button title="Clear search" icon="x" onPress={() => setQuery('')} /> : undefined} />}
    renderItem={({ item: { client, events, event } }) => {
            const tone = event?.status === 'Completed' ? 'success' : event?.status === 'Editing' ? 'warning' : event?.status === 'Cancelled' ? 'error' : 'teal';
            const initials = client.name.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join('').toUpperCase();
            return <Card key={client.id} style={styles.clientCard}>
              <View style={styles.cardBody}>
                <View style={styles.cardHeader}>
                  <View style={styles.avatar} accessible={false}><Text style={styles.initials}>{initials}</Text></View>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${client.name}`} onPress={() => openForm(client)} style={styles.nameBlock}>
                    <Text style={styles.clientName}>{client.name}</Text>
                    {(client.phone || client.email) ? <View style={styles.metaItem}>
                      <Feather name={client.phone ? 'phone' : 'mail'} size={13} color={colors.muted} />
                      <Text numberOfLines={1} style={[ui.small, ui.flex]}>{client.phone || client.email}</Text>
                    </View> : null}
                  </Pressable>
                  {client.inactive && <Badge label="Inactive" tone="neutral" />}
                </View>
                {event ? (
                  <Pressable onPress={() => navigation.navigate('EventDetails', { eventId: event.id })} accessibilityRole="button"
                    accessibilityLabel={`View ${event.title}`} style={({ pressed }) => [styles.eventLink, pressed && { opacity: 0.72 }]}>
                    <View style={styles.eventBody}>
                      <Text style={styles.eventTitle} numberOfLines={2}>{event.title}</Text>
                      <View style={styles.eventMeta}>
                        <View style={styles.metaItem}><Feather name="calendar" size={13} color={colors.muted} /><Text style={ui.small}>{formatDate(event.date)}</Text></View>
                        <View style={[styles.metaItem, styles.venueItem]}><Feather name="map-pin" size={13} color={colors.muted} /><Text style={[ui.small, styles.venue]} numberOfLines={1}>{event.location}</Text></View>
                      </View>
                      <View style={styles.eventStatus}><Badge label={event.status} tone={tone} /></View>
                    </View>
                    <Feather name="chevron-right" size={18} color={colors.primaryDark} />
                  </Pressable>
                ) : <Text style={ui.small}>No shoots linked yet</Text>}
              </View>
              <View style={styles.actions}>
                <View style={[styles.metaItem, ui.flex]}>
                  <Feather name="layers" size={15} color={colors.text} />
                  <Text style={[ui.small, ui.flex]}>{events.length} linked {events.length === 1 ? 'shoot' : 'shoots'}</Text>
                </View>
                <View style={styles.actionGroup}>{client.phone ? <>
                  <ClientAction icon="phone" label={`Call ${client.name}`} color={colors.success} onPress={() => { void openContact(`tel:${client.phone.replace(/[^+\d]/g, '')}`); }} />
                  <ClientAction icon="message-circle" label={`Message ${client.name}`} color={colors.success} onPress={() => message(client)} />
                </> : null}
                <ClientAction icon="edit-2" label={`Edit ${client.name}`} color={colors.primaryDark} onPress={() => openForm(client)} />
                {!client.inactive && <ClientAction icon="trash-2" label={`Make ${client.name} inactive`} color={colors.error}
                  disabled={Boolean(deletingId)} loading={deletingId === client.id} onPress={() => confirmDelete(client)} />}
                </View>
              </View>
            </Card>;
    }}
    />
      <Modal visible={visible} animationType="slide" onRequestClose={() => { if (!busy) setVisible(false); }} presentationStyle="pageSheet">
        <SafeAreaView style={styles.modal} edges={['top', 'bottom']}>
          <KeyboardAvoidingView style={ui.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalContent}>
              <Header title={editing ? 'Edit client' : 'Add client'} subtitle="Keep every connection close." onBack={() => { if (!busy) setVisible(false); }} />
              {editingClient && <Card style={ui.gap}>
                <View style={ui.between}>
                  <Text style={ui.label}>Client status</Text>
                  <Badge label={editingClient.inactive ? 'Inactive' : 'Active'} tone={editingClient.inactive ? 'neutral' : 'success'} />
                </View>
                {editingClient.inactive && <Button title="Make Active" icon="check-circle" variant="secondary"
                  disabled={busy} loading={busyAction === 'reactivate'} onPress={() => void makeActive()} />}
              </Card>}
              <Card>
                <View style={ui.gap}>
                  <Field label="Client name *" icon="user" value={form.name} onChangeText={value => change('name', value)} error={errors.name} placeholder="Name or family name" maxLength={100} autoCapitalize="words" editable={!busy} />
                  <Field label="Phone · include country code" icon="phone" value={form.phone} onChangeText={value => change('phone', value)} error={errors.phone} placeholder="+91 98765 43210" keyboardType="phone-pad" maxLength={25} editable={!busy} />
                  <Field label="Email" icon="mail" value={form.email} onChangeText={value => change('email', value)} error={errors.email} placeholder="client@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} maxLength={150} editable={!busy} />
                  <Field label="Notes" icon="file-text" value={form.notes} onChangeText={value => change('notes', value)} placeholder="Preferences, important details…" multiline numberOfLines={4} maxLength={2000} style={{ minHeight: 96, textAlignVertical: 'top' }} editable={!busy} />
                </View>
              </Card>
              {formError ? <ErrorMessage message={formError} /> : null}
              <Button title={editing ? 'Save changes' : 'Save client'} icon="check" onPress={() => { void submit(); }}
                disabled={busy} loading={busyAction === 'save'} />
              <Text style={[ui.small, { textAlign: 'center' }]}>Saved on this device. Link this client when creating or editing an event.</Text>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

function ClientAction({ icon, label, color, disabled, loading = false, onPress }: {
  icon: React.ComponentProps<typeof Feather>['name']; label: string; color: string; disabled?: boolean; loading?: boolean; onPress: () => void;
}) {
  const { colors } = useStudioTheme();
  const styles = makeStyles(colors);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: disabled || loading, busy: loading }}
    disabled={disabled || loading} onPress={onPress} style={({ pressed }) => [styles.actionTarget, (pressed || (disabled && !loading)) && { opacity: 0.55 }]}>
    {loading ? <ActivityIndicator size="small" color={color} /> : <Feather name={icon} size={17} color={color} />}
  </Pressable>;
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  sortRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  clientCard: { overflow: 'hidden', borderRadius: 18, padding: 0 },
  cardBody: { padding: 13, gap: 10 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  avatar: { width: 42, height: 42, borderRadius: 13, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' },
  initials: { color: colors.primaryDark, fontSize: 15, fontFamily: 'InterExtraBold' },
  nameBlock: { flex: 1, minWidth: 0, minHeight: 44, justifyContent: 'center', gap: 2 },
  actionTarget: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  clientName: { color: colors.text, fontSize: 17, fontFamily: 'InterExtraBold', lineHeight: 23 },
  eventLink: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 9, borderWidth: 1, borderColor: colors.border, borderRadius: 12 },
  eventBody: { flex: 1, minWidth: 0, gap: 5 },
  eventTitle: { color: colors.primaryDark, fontSize: 14, fontFamily: 'InterSemiBold', lineHeight: 19 },
  eventMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 9, rowGap: 3 },
  venueItem: { maxWidth: '100%', minWidth: 0 },
  venue: { flexShrink: 1 },
  eventStatus: { alignSelf: 'flex-start' },
  metaItem: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 12, gap: 4 },
  actionGroup: { flexDirection: 'row', alignItems: 'center' },
  modal: { flex: 1, backgroundColor: colors.background },
  modalContent: { padding: 20, gap: 20, paddingBottom: 40 },
});
