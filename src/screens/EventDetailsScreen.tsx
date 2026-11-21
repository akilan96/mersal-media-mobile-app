import { useToast } from '../components/Toast';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, Modal, StyleSheet, Text, TextInput, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Print from 'expo-print';
import { Asset } from 'expo-asset';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import * as FileSystem from 'expo-file-system/legacy';
import { eventPdfFileName, eventPdfHtml, eventPdfPage } from '../domain/eventPdf';
import * as Sharing from 'expo-sharing';
import { useAudioPlayer } from 'expo-audio';
import { Badge, Button, CameraArt, Card, EmptyState, ErrorMessage, Field, Header, IconButton, Screen, SectionTitle } from '../components/ui';
import { useStudioTheme, type Palette } from '../theme';
import { useStudio } from '../state/StudioProvider';
import { balanceAmount, formatDate, formatTime, money, paidAmount, paymentLabel } from '../domain/helpers';
import type { EventStatus, RootStackParamList, StudioEvent } from '../domain/types';

type PaymentReceipt = { amount: number; event: StudioEvent };

async function readFont(moduleId: number) {
  const asset = await Asset.fromModule(moduleId).downloadAsync();
  if (!asset.localUri) throw new Error('The PDF font could not be loaded.');
  return FileSystem.readAsStringAsync(asset.localUri, { encoding: FileSystem.EncodingType.Base64 });
}

export default function EventDetailsScreen() {
  const showToast = useToast();
  const paymentSound = useAudioPlayer(require('../../assets/audio/payment.mp3'));
  const { colors, ui } = useStudioTheme();
  const styles = makeStyles(colors);
 
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'EventDetails'>>();
  const { data, setEventStatus, deleteEvent, recordPayment } = useStudio();
  const event = data.events.find(item => item.id === route.params.eventId);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<EventStatus | null>(null);
  const [savingPayment, setSavingPayment] = useState(false);
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);
  const paymentInProgress = useRef(false);
  const [sharingPdf, setSharingPdf] = useState(false);
  const pdfInProgress = useRef(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const client = data.clients.find(item => item.id === event?.clientId);
  const fail = (cause: unknown) => setError(cause instanceof Error ? cause.message : 'Something went wrong. Please try again.');

  async function updateStatus(status: EventStatus) {
    if (!event || busy || event.status === status) return;
    setBusy(true); setPendingStatus(status); setError('');
    try {
      await setEventStatus(event.id, status);
      showToast('Status updated to ' + status, { sound: true });
    } catch (cause) {
      fail(cause);
    } finally {
      setPendingStatus(null);
      setBusy(false);
    }
  }

  function confirmCancellation() {
    if (!event || busy || event.status === 'Cancelled') return;
    Alert.alert('Cancel this event?', 'The booking and payments stay on record. Upcoming reminders will be cleared.', [
      { text: 'Keep booking', style: 'cancel' },
      { text: 'Cancel event', style: 'destructive', onPress: () => { void updateStatus('Cancelled'); } },
    ]);
  }
  function confirmDelete() {
    if (!event || busy) return;
    Alert.alert('Delete this event?', `“${event.title}” and its payment records will be permanently removed from this device.`, [
      { text: 'Keep event', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setBusy(true); setError('');
        try { await deleteEvent(event.id); navigation.popToTop(); } catch (cause) { fail(cause); } finally { setBusy(false); }
      } },
    ]);
  }
  async function shareEvent() {
    if (!event || busy || pdfInProgress.current) return;
    pdfInProgress.current = true;
    setSharingPdf(true);
    setError('');
    try {
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error('PDF sharing is available in the Android or iOS app.');
      }
      const [regular, bold] = await Promise.all([readFont(Inter_400Regular), readFont(Inter_700Bold)]);
      const { base64 } = await Print.printToFileAsync({
        html: eventPdfHtml(event, client, { regular, bold }), ...eventPdfPage(event), base64: true,
      });
      if (!base64 || !FileSystem.cacheDirectory) throw new Error('The event PDF could not be prepared.');
      // Write into the current Expo experience's cache so Android can grant access to the file.
      const directory = `${FileSystem.cacheDirectory}event-ticket-${Date.now()}/`;
      await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
      const uri = directory + encodeURIComponent(eventPdfFileName(event, client));
      await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
      try {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Share Event PDF',
        });
      } catch (cause) {
        fail(cause);
        Alert.alert('Could not open the share sheet', 'Open the print menu to print or save this PDF.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Print', onPress: () => { void Print.printAsync({ uri }).catch(fail); } },
        ]);
      }
    } catch (cause) {
      fail(cause);
    } finally {
      pdfInProgress.current = false;
      setSharingPdf(false);
    }
  }

  async function addPayment() {
    if (!event || busy || paymentInProgress.current) return;
    const amount = Number(paymentAmount);
    if (!/^\d+(\.\d{1,2})?$/.test(paymentAmount) || !Number.isFinite(amount) || amount <= 0) { setPaymentError('Enter an amount greater than zero with up to 2 decimals.'); return; }
    if (amount > Math.round(balanceAmount(event) * 100) / 100) { setPaymentError('This payment exceeds the remaining balance.'); return; }
    paymentInProgress.current = true;
    Keyboard.dismiss();
    setPaymentError(''); setError(''); setBusy(true); setSavingPayment(true);
    try {
      const saved = await recordPayment(event.id, amount, paymentNote.trim() || 'Payment received');
      setPaymentAmount(''); setPaymentNote('');
      setReceipt({ amount, event: saved });
      void paymentSound.seekTo(0).then(() => paymentSound.play()).catch(() => undefined);
    } catch (cause) {
      setPaymentError(cause instanceof Error ? cause.message : 'Could not save the payment. Please try again.');
    } finally {
      paymentInProgress.current = false;
      setSavingPayment(false);
      setBusy(false);
    }
  }
  function showOptions() {
    if (!event || busy) return;
    Alert.alert('Event actions', event.title, [
      { text: 'Edit event', onPress: () => navigation.navigate('CreateEvent', { eventId: event.id }) },
      { text: 'Delete event', style: 'destructive', onPress: confirmDelete },
      { text: 'Close', style: 'cancel' },
    ]);
  }

  if (!event) return <Screen><Header title="Event Details" onBack={() => navigation.goBack()} /><EmptyState icon="calendar" title="Event unavailable" description="This event may have been deleted. Return to your events to choose another shoot." /></Screen>;
  return <Screen>
    <Header title="Event Details" onBack={() => navigation.goBack()} right={<View style={{ flexDirection: 'row' }}><IconButton name="share-2" label="Share event PDF" onPress={shareEvent} /><IconButton name="more-vertical" label="Event actions" onPress={showOptions} /></View>} />
    <Card style={{ gap: 14, overflow: 'hidden' }}>
      <View style={ui.between}><View style={{ flex: 1, gap: 10 }}><Text style={styles.eyebrow}>SHOOT DETAILS</Text><View style={{ alignSelf: 'flex-start' }}><Badge label={event.type} tone="teal" /></View></View><CameraArt size={110} /></View>
      <View style={styles.divider} />
      <DetailRow icon="calendar" text={`${formatDate(event.date)} · ${formatTime(event.date)}`} />
      <DetailRow icon="map-pin" text={event.location} />
      {!!client && <DetailRow icon="user" text={`${client.name}${client.phone ? ` · ${client.phone}` : ''}`} />}
      <View style={{ alignSelf: 'flex-start' }}><Badge label={event.status} tone={event.status === 'Completed' ? 'success' : event.status === 'Cancelled' ? 'error' : 'teal'} /></View>
    </Card>
    <Card style={ui.gap}>
      <View style={ui.between}><Text style={ui.heading}>Amount Summary</Text><Badge label={paymentLabel(event)} tone={balanceAmount(event) <= 0 ? 'success' : 'warning'} /></View>
      <View style={ui.row}><View style={ui.flex}><Text style={ui.small}>Total amount</Text><Text style={styles.amount}>{money(event.totalAmount)}</Text></View><View style={styles.verticalDivider} /><View style={ui.flex}><Text style={ui.small}>Received</Text><Text style={[styles.amount, { color: colors.primary }]}>{money(paidAmount(event))}</Text></View></View>
      <View style={styles.balance}><Text style={ui.label}>Balance Due</Text><Text style={[ui.heading, { color: colors.primaryDark }]}>{money(balanceAmount(event))}</Text></View>
    </Card>
    <SectionTitle title={`Assigned Crew (${event.crew.length})`} />
    <Card style={{ gap: 12 }}>{event.crew.length ? event.crew.map(name => <View key={name} style={ui.between}><DetailRow icon="users" text={name} /><Badge label="Assigned" tone="teal" /></View>) : <Text style={ui.body}>No crew assigned. Add team members by editing this event.</Text>}</Card>
    <Card><DetailRow icon="users" text={`${event.attendees} expected ${event.attendees === 1 ? 'guest' : 'guests'}`} /></Card>
    <SectionTitle title={`Equipment / Setup (${event.equipment.length})`} />
    <Card style={{ gap: 14 }}>{event.equipment.length ? event.equipment.map(name => <DetailRow key={name} icon="camera" text={name} />) : <Text style={ui.body}>No equipment added. Edit this event to plan your setup.</Text>}</Card>
    <SectionTitle title="Payment History" />
    <Card style={ui.gap}>
      {event.payments.length ? event.payments.map(payment => <View key={payment.id} style={ui.between}><View style={{ flex: 1, gap: 3 }}><Text style={ui.label}>{payment.note}</Text><Text style={ui.small}>{formatDate(payment.date)}</Text></View><Text style={styles.payment}>{money(payment.amount)}</Text></View>) : <Text style={ui.body}>No payments received yet.</Text>}
      <View style={styles.divider} /><View style={ui.between}><Text style={ui.label}>Remaining balance</Text><Text style={ui.heading}>{money(balanceAmount(event))}</Text></View>
      {balanceAmount(event) > 0 && <View style={ui.gap}>
        <PaymentAmountField value={paymentAmount} onChangeText={value => { setPaymentAmount(value); setPaymentError(''); }} error={paymentError} editable={!busy} />
        <Field label="Payment Note" placeholder="Cash, bank transfer, receipt reference…" value={paymentNote} onChangeText={setPaymentNote} editable={!busy} maxLength={200} />
        <Button title={savingPayment ? 'Recording payment…' : 'Add Payment'} icon="plus" onPress={addPayment} disabled={busy} loading={savingPayment} />
        <Text style={ui.small}>Records money you have received. This app does not process payments.</Text>
      </View>}
    </Card>
    {!!event.notes && <Card style={{ gap: 8 }}><Text style={ui.heading}>Studio Notes</Text><Text style={ui.body}>{event.notes}</Text></Card>}
    <View style={styles.total}><Text style={ui.label}>Total Amount</Text><Text style={[ui.heading, { color: colors.primaryDark }]}>{money(event.totalAmount)}</Text></View>
    {!!error && <ErrorMessage message={error} />}
    <Button title="Share Event PDF" icon="share-2" onPress={shareEvent} disabled={busy} loading={sharingPdf} />
    <Card style={ui.gap}>
      <SectionTitle title="Shoot Workflow" />
      {pendingStatus && <View style={styles.statusProgress} accessible accessibilityLiveRegion="polite" accessibilityState={{ busy: true }}>
        <ActivityIndicator color={colors.primary} />
        <Text style={ui.label}>{pendingStatus === 'Cancelled' ? 'Cancelling event…' : `Updating status to ${pendingStatus}…`}</Text>
      </View>}
      {event.status === 'Cancelled' ? (
        <Text style={ui.small}>This event is cancelled.</Text>
      ) : (
        <>
          <View style={ui.row}>
            <Button title="Editing" icon="edit-3" variant="secondary" onPress={() => updateStatus('Editing')} disabled={busy || event.status === 'Editing'} loading={pendingStatus === 'Editing'} style={ui.flex} />
            <Button title="Completed" icon="check-circle" variant="secondary" onPress={() => updateStatus('Completed')} disabled={busy || event.status === 'Completed'} loading={pendingStatus === 'Completed'} style={ui.flex} />
          </View>
          <Button title="Cancel Event" icon="x-circle" variant="danger" onPress={confirmCancellation} disabled={busy} loading={pendingStatus === 'Cancelled'} />
        </>
      )}
      <Button title="Edit Event" icon="edit" variant="ghost" onPress={() => navigation.navigate('CreateEvent', { eventId: event.id })} disabled={busy} />
    </Card>
    {receipt && <PaymentConfirmation receipt={receipt} onClose={() => setReceipt(null)} />}
  </Screen>;
}

function PaymentAmountField({ value, onChangeText, editable, error }: {
  value: string; onChangeText: (value: string) => void; editable: boolean; error: string;
}) {
  const { colors, ui } = useStudioTheme();
  const styles = makeStyles(colors);
  const [focused, setFocused] = useState(false);

  return <View style={styles.amountGroup}>
    <Text style={ui.label}>Payment amount</Text>
    <View style={[styles.amountField, focused && styles.amountFieldFocused, !!error && styles.amountFieldInvalid]}>
      <View style={styles.currencyChip} accessible={false}>
        <Text style={styles.currencySymbol}>₹</Text>
      </View>
      <TextInput
        accessibilityLabel="Payment amount in rupees"
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="decimal-pad"
        editable={editable}
        placeholder="0.00"
        placeholderTextColor={colors.muted}
        selectionColor={colors.primary}
        maxLength={16}
        style={styles.amountInput}
      />
    </View>
    {!!error && <ErrorMessage message={error} />}
  </View>;
}

function PaymentConfirmation({ receipt, onClose }: { receipt: PaymentReceipt; onClose: () => void }) {
  const { colors, ui } = useStudioTheme();
  const styles = makeStyles(colors);
  const remaining = balanceAmount(receipt.event);

  return <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
    <Screen contentStyle={styles.receiptScreen}>
      <View style={styles.receiptContent}>
        <View style={styles.receiptIconRing} accessible={false}>
          <View style={styles.receiptIcon}><Feather name="check" size={50} color="#FFFFFF" /></View>
        </View>
        <View style={styles.receiptHeading} accessibilityLiveRegion="polite">
          <Text accessibilityRole="header" style={[ui.title, styles.receiptCentered]}>{remaining > 0 ? 'Part Payment Received' : 'Payment completed'}</Text>
          <Text style={[ui.body, styles.receiptCentered]}>{receipt.event.title}</Text>
          <Text style={[ui.small, styles.receiptCentered]}>Amount received</Text>
          <Text style={styles.receiptAmount}>{money(receipt.amount)}</Text>
        </View>
        <Card style={styles.receiptSummary}>
          <View style={ui.between}><Text style={ui.label}>Total received</Text><Text style={ui.heading}>{money(paidAmount(receipt.event))}</Text></View>
          <View style={styles.divider} />
          <View style={ui.between}><Text style={ui.label}>Remaining balance</Text><Text style={ui.heading}>{money(remaining)}</Text></View>
        </Card>
        <Button title="Done" icon="check" onPress={onClose} />
      </View>
    </Screen>
  </Modal>;
}

function DetailRow({ icon, text }: { icon: React.ComponentProps<typeof Feather>['name']; text: string }) {
  const { colors, ui } = useStudioTheme();
  const styles = makeStyles(colors);
 
  return <View style={[ui.row, { flexShrink: 1 }]}><View style={styles.detailIcon}><Feather name={icon} size={17} color={colors.primary} /></View><Text style={[ui.label, { flexShrink: 1, lineHeight: 21 }]}>{text}</Text></View>;
}
const makeStyles = (colors: Palette) => StyleSheet.create({
  eyebrow: { color: colors.primary, fontSize: 10, fontFamily: 'InterExtraBold', letterSpacing: 1.5 },
  detailIcon: { height: 34, width: 34, borderRadius: 10, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' },
  divider: { height: 1, backgroundColor: colors.border },
  verticalDivider: { height: 40, width: 1, backgroundColor: colors.border },
  amount: { fontSize: 22, fontFamily: 'InterExtraBold', color: colors.text, marginTop: 5 },
  balance: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, alignItems: 'center', backgroundColor: colors.mint, borderRadius: 13, padding: 13 },
  payment: { fontSize: 15, color: colors.success, fontFamily: 'InterExtraBold' },
  total: { borderColor: colors.primary, borderWidth: 1, backgroundColor: colors.mint, borderRadius: 18, padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  amountGroup: { gap: 8 },
  amountField: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 18, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.input, paddingHorizontal: 12, minHeight: 68 },
  amountFieldFocused: { borderColor: colors.primary },
  amountFieldInvalid: { borderColor: colors.error },
  currencyChip: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' },
  currencySymbol: { color: colors.primaryDark, fontSize: 24, fontFamily: 'InterExtraBold' },
  amountInput: { flex: 1, color: colors.text, fontSize: 26, fontFamily: 'InterBold', minHeight: 52, paddingVertical: 8 },
  statusProgress: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: colors.mint },
  receiptScreen: { flexGrow: 1, justifyContent: 'center' },
  receiptContent: { width: '100%', maxWidth: 440, alignSelf: 'center', gap: 22 },
  receiptIconRing: { alignSelf: 'center', borderRadius: 68, padding: 10, backgroundColor: colors.successBg },
  receiptIcon: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#16864C', alignItems: 'center', justifyContent: 'center' },
  receiptHeading: { gap: 5 },
  receiptCentered: { textAlign: 'center' },
  receiptAmount: { color: colors.success, fontSize: 38, lineHeight: 46, textAlign: 'center', fontFamily: 'InterExtraBold', fontVariant: ['tabular-nums'] },
  receiptSummary: { gap: 12 },
});
