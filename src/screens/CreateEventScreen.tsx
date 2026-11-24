import { useToast } from '../components/Toast';
import React, { useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import Feather from '@expo/vector-icons/Feather';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Badge, Button, Card, Chip, EmptyState, ErrorMessage, Field, Header, IconButton, Screen } from '../components/ui';
import { useStudioTheme, type Palette } from '../theme';
import { useStudio } from '../state/StudioProvider';
import { formatDate, formatTime, money, paidAmount } from '../domain/helpers';
import { isClientPhone, phoneDigits } from '../domain/validation';
import type { EventInput, EventStatus, EventType, RootStackParamList } from '../domain/types';

import { defaultEventTypes } from '../domain/types';
const statuses: EventStatus[] = ['Scheduled', 'Editing', 'Completed', 'Cancelled'];
const amountPattern = /^\d+(\.\d{1,2})?$/;
const errorText = (cause: unknown) => cause instanceof Error ? cause.message : 'Could not save your event. Please try again.';

const formSteps = [
  { title: 'Event Details', fields: ['location', 'date', 'attendees'] },
  { title: 'Client Details', fields: ['clientPhone', 'clientName'] },
  { title: 'Crew & Equipment', fields: ['crewName', 'equipmentName'] },
  { title: 'Payment & Notes', fields: ['total', 'advance'] },
  { title: 'Review Event', fields: [] },
];

export default function CreateEventScreen() {
  const showToast = useToast();
  const { colors, ui, dark } = useStudioTheme();
  const styles = makeStyles(colors);
 
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'CreateEvent'>>();
  const { data, saveEvent } = useStudio();
  const eventTypes = [...defaultEventTypes, ...(data.customEventTypes ?? [])];
  const existing = data.events.find(event => event.id === route.params?.eventId);
  const [date, setDate] = useState(existing ? new Date(existing.date) : new Date());
  const [location, setLocation] = useState(existing?.location ?? '');
  const [attendees, setAttendees] = useState(existing?.attendees ? String(existing.attendees) : '');
  const [type, setType] = useState<EventType>(existing?.type ?? 'Marriage');
  const [status, setStatus] = useState<EventStatus>(existing?.status ?? 'Scheduled');
  const [clientId, setClientId] = useState<string | undefined>(existing?.clientId);
  const [clientPhone, setClientPhone] = useState('');
  const [step, setStep] = useState(0);
  const [editingFromReview, setEditingFromReview] = useState(false);
  const [clientName, setClientName] = useState('');
  const [crew, setCrew] = useState<string[]>(existing?.crew ?? []);
  const [crewName, setCrewName] = useState('');
  const [equipment, setEquipment] = useState<string[]>(existing?.equipment ?? []);
  const [equipmentName, setEquipmentName] = useState('');
  const [total, setTotal] = useState(existing ? String(existing.totalAmount) : '');
  const [advance, setAdvance] = useState('');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [picker, setPicker] = useState<'date' | 'time'>();
  const [typePicker, setTypePicker] = useState(false);
  const [clientPicker, setClientPicker] = useState(false);
  const [clientQuery, setClientQuery] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const received = existing ? paidAmount(existing) : Number(advance || 0);
  const selectedClient = data.clients.find(client => client.id === clientId);
  const phone = clientPhone.trim();
  const phoneMatches = isClientPhone(phone) ? data.clients.filter(client => phoneDigits(client.phone) === phoneDigits(phone)) : [];

  function addItem(kind: 'crew' | 'equipment') {
    const value = (kind === 'crew' ? crewName : equipmentName).trim();
    const list = kind === 'crew' ? crew : equipment;
    const field = kind === 'crew' ? 'crewName' : 'equipmentName';
    if (!value) { setErrors(current => ({ ...current, [field]: `Enter ${kind === 'crew' ? 'a crew member’s name' : 'an equipment name'} first.` })); return; }
    if (list.some(item => item.toLowerCase() === value.toLowerCase())) { setErrors(current => ({ ...current, [field]: 'Already added. Use a distinct name or include the quantity.' })); return; }
    if (kind === 'crew') { setCrew([...crew, value]); setCrewName(''); } else { setEquipment([...equipment, value]); setEquipmentName(''); }
    setErrors(current => ({ ...current, [field]: '' }));
  }

  function onDateChange(event: DateTimePickerEvent, value?: Date) {
    if (Platform.OS !== 'ios') setPicker(undefined);
    if (event.type === 'set' && value) setDate(value);
  }

  function validateForm() {
    const next: Record<string, string> = {};
    if (!location.trim()) next.location = 'Enter the venue or location.';
    if (Number.isNaN(date.getTime())) next.date = 'Choose a valid event date and time.';
    if (attendees && (!/^\d+$/.test(attendees) || !Number.isSafeInteger(Number(attendees)))) next.attendees = 'Enter a whole number of guests.';
    if (!amountPattern.test(total) || !Number.isFinite(Number(total)) || Number(total) > 1e10) next.total = 'Enter an amount from 0 to 10,000,000,000 with up to 2 decimals.';
    if (!existing && advance && (!amountPattern.test(advance) || !Number.isFinite(Number(advance)))) next.advance = 'Enter a valid non-negative amount with up to 2 decimals.';
    if (Number.isFinite(received) && received > Number(total)) next.total = 'Total amount cannot be less than the amount already received.';
    if (crewName.trim()) next.crewName = 'Add this crew member or clear the field before saving.';
    if (equipmentName.trim()) next.equipmentName = 'Add this equipment or clear the field before saving.';
    if (!phone && !selectedClient && clientName.trim()) next.clientPhone = 'Enter a phone number to add this client.';
    else if (phone && !isClientPhone(phone)) next.clientPhone = 'Enter a valid client phone number.';
    else if (phoneMatches.length > 1) next.clientPhone = 'More than one client uses this number. Choose the client from the directory.';
    else if (phone && !phoneMatches.length && !clientName.trim()) next.clientName = 'Enter a name for the new client.';
    return next;
  }

  function goToStep(target: number) {
    Keyboard.dismiss();
    setPicker(undefined);
    setError('');
    setErrors({});
    setStep(target);
  }

  function editFromReview(target: number) {
    if (saving) return;
    setEditingFromReview(true);
    goToStep(target);
  }

  function goBack() {
    goToStep(editingFromReview ? formSteps.length - 1 : step - 1);
    setEditingFromReview(false);
  }

  async function submit() {
    const next = validateForm();
    const invalidStep = step === formSteps.length - 1
      ? formSteps.findIndex(item => item.fields.some(field => next[field]))
      : formSteps[step].fields.some(field => next[field]) ? step : -1;
    if (invalidStep >= 0) {
      if (invalidStep !== step) editFromReview(invalidStep);
      setErrors(next);
      setError('Please check the highlighted fields.');
      return;
    }
    if (step < formSteps.length - 1) {
      goToStep(editingFromReview ? formSteps.length - 1 : step + 1);
      setEditingFromReview(false);
      return;
    }
    Keyboard.dismiss();
    setError('');
    setSaving(true);
    try {
      const linkedName = phone ? phoneMatches[0]?.name ?? clientName.trim() : selectedClient?.name;
      const title = existing?.title || (linkedName ? `${linkedName} - ${type}` : type);
      const payload: EventInput = { title, date: date.toISOString(), location: location.trim(), attendees: Number(attendees || 0), type, status, clientId, crew, equipment, totalAmount: Number(total), notes: notes.trim(), payments: existing?.payments ?? (received > 0 ? [{ id: `advance-${Date.now()}`, amount: received, date: new Date().toISOString(), note: 'Advance received' }] : []) };
      const id = await saveEvent(payload, existing?.id, phone ? { name: clientName, phone } : undefined);
      showToast(!existing ? 'Event created' : existing.status !== status ? 'Status updated to ' + status : 'Event updated', { sound: true });
      if (existing) navigation.goBack();
      else navigation.replace('EventDetails', { eventId: id });
    } catch (cause) { setError(errorText(cause)); }
    finally { setSaving(false); }
  }

  if (route.params?.eventId && !existing) return <Screen><Header title="Edit Event" onBack={() => navigation.goBack()} /><EmptyState icon="calendar" title="Event unavailable" description="This event may have been deleted. Return to your event list." /></Screen>;

  return <Screen key={step}>
    <Header title={existing ? 'Edit Event' : 'Create Event'} onBack={() => {
      if (saving) return;
      if (step > 0 || editingFromReview) goBack();
      else navigation.goBack();
    }} />
    <View accessibilityLabel={`Step ${step + 1} of ${formSteps.length}, ${formSteps[step].title}`}>
      <View style={ui.between}>
        <Text style={ui.label}>{formSteps[step].title}</Text>
        <Text style={ui.small}>Step {step + 1} of {formSteps.length}</Text>
      </View>
      <View style={styles.progress}>
        {formSteps.map((item, index) => <View key={item.title} style={[styles.progressSegment, index <= step && styles.progressActive]} />)}
      </View>
    </View>
    {step === 0 && <Card style={styles.formCard}>
      <FormHeading title="Event Information" icon="calendar" color="#1761A8" background="#E3F2FF" />
      <View style={[ui.row, { alignItems: 'flex-start' }]}>
        <View style={ui.flex}><Text style={[ui.label, { marginBottom: 8 }]}>Event Date *</Text><Pressable accessibilityRole="button" accessibilityLabel="Select event date" disabled={saving} onPress={() => setPicker('date')} style={styles.dateControl}><View style={styles.pickerIcon}><Feather name="calendar" size={17} color="#1761A8" /></View><Text style={styles.dateText}>{formatDate(date.toISOString())}</Text></Pressable></View>
        <View style={ui.flex}><Text style={[ui.label, { marginBottom: 8 }]}>Event Time *</Text><Pressable accessibilityRole="button" accessibilityLabel="Select event time" disabled={saving} onPress={() => setPicker('time')} style={styles.dateControl}><View style={styles.pickerIcon}><Feather name="clock" size={17} color="#1761A8" /></View><Text style={styles.dateText}>{formatTime(date.toISOString())}</Text></Pressable></View>
      </View>
      {!!errors.date && <ErrorMessage message={errors.date} />}
      {picker && <View><DateTimePicker value={date} mode={picker} display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={onDateChange} accentColor={colors.primary} themeVariant={dark ? 'dark' : 'light'} />{Platform.OS === 'ios' && <Button title="Done" variant="ghost" onPress={() => setPicker(undefined)} />}</View>}
      <Field variant="studio-form" label="Location *" icon="map-pin" placeholder="Enter location / venue" value={location} onChangeText={setLocation} error={errors.location} maxLength={250} editable={!saving} />
      <Field variant="studio-form" label="Expected Attendees" icon="users" placeholder="Enter expected guest count" keyboardType="number-pad" value={attendees} onChangeText={setAttendees} error={errors.attendees} maxLength={8} editable={!saving} />
      <View style={{ gap: 9 }}><Text style={ui.label}>Event Type *</Text><Pressable accessibilityRole="button" accessibilityLabel={`Event type: ${type}. Select event type`} disabled={saving} onPress={() => setTypePicker(true)} style={styles.dateControl}><View style={styles.pickerIcon}><Feather name="aperture" size={17} color="#1761A8" /></View><Text style={[styles.dateText, ui.flex]}>{type}</Text><Feather name="chevron-down" size={17} color={colors.muted} /></Pressable></View>
      {!!existing && <View style={{ gap: 9 }}><Text style={ui.label}>Shoot Status</Text><View style={styles.wrap}>{statuses.map(item => <Chip key={item} label={item} selected={status === item} onPress={() => { if (!saving) setStatus(item); }} />)}</View></View>}
    </Card>}
      {step === 1 && <Card style={styles.formCard}>
        <FormHeading title="Client Details" icon="user" color="#087968" background="#DDF8F1" />
        <Field variant="studio-form" label="Client Name" icon="user" placeholder="Enter client name" value={phoneMatches[0]?.name ?? (!phone && selectedClient ? selectedClient.name : clientName)} onChangeText={setClientName} maxLength={100} error={errors.clientName} editable={!saving && phoneMatches.length !== 1 && Boolean(phone || !selectedClient)} />
        <Field variant="studio-form" label="Client Phone Number" icon="phone" placeholder={selectedClient?.phone || 'Enter phone number'} value={clientPhone} onChangeText={setClientPhone} keyboardType="phone-pad" maxLength={25} error={errors.clientPhone} editable={!saving} />
        {phoneMatches.length === 1 && <Text style={ui.small}>This event will link to {phoneMatches[0].name}.</Text>}
        <Button variant="secondary" title={!phone && selectedClient ? selectedClient.name : 'Choose an existing client'} icon="user" onPress={() => setClientPicker(true)} disabled={saving} />
        <Text style={ui.small}>Saving with a new phone number adds the contact to Clients.</Text>
      </Card>}
    {step === 2 && <>
    <Card style={styles.formCard}>
      <FormHeading title={`Assigned Crew / Staff (${crew.length})`} icon="users" color="#6842AD" background="#F1E9FF" />
      <Field variant="studio-form" icon="user-plus" placeholder="Enter crew member name or username" value={crewName} onChangeText={setCrewName} error={errors.crewName} maxLength={80} editable={!saving} onSubmitEditing={() => addItem('crew')} />
      <Button title="Add Crew Member" variant="secondary" icon="plus" onPress={() => addItem('crew')} disabled={saving} style={{ borderStyle: 'dashed' }} />
      {crew.length ? crew.map((name, index) => <View key={name} style={ui.between}><Text style={[ui.label, ui.flex]}>{name}</Text><IconButton name="x" label={`Remove ${name}`} onPress={() => { if (!saving) setCrew(crew.filter((_, i) => i !== index)); }} /></View>) : <Text style={styles.empty}>No crew assigned yet. Add names above.</Text>}
      <Text style={ui.small}>Crew names are stored with this event on this device.</Text>
    </Card>
    <Card style={styles.formCard}>
      <FormHeading title={`Equipment / Setup (${equipment.length})`} icon="camera" color="#A94B16" background="#FFF0E2" />
      <Field variant="studio-form" icon="camera" placeholder="Equipment name and quantity" value={equipmentName} onChangeText={setEquipmentName} error={errors.equipmentName} maxLength={100} editable={!saving} onSubmitEditing={() => addItem('equipment')} />
      <Button title="Add Equipment" variant="secondary" icon="plus" onPress={() => addItem('equipment')} disabled={saving} style={{ borderStyle: 'dashed' }} />
      {equipment.length ? equipment.map((name, index) => <View key={name} style={ui.between}><Text style={[ui.label, ui.flex]}>{name}</Text><IconButton name="x" label={`Remove ${name}`} onPress={() => { if (!saving) setEquipment(equipment.filter((_, i) => i !== index)); }} /></View>) : <Text style={styles.empty}>No equipment added yet. Add your setup above.</Text>}
    </Card>
    </>}
    {step === 3 && <>
    <Card style={styles.formCard}>
      <FormHeading title="Amount Details" icon="credit-card" color="#26683F" background="#E6F7EB" />
      <View style={[ui.row, { alignItems: 'flex-start' }]}><View style={ui.flex}><Field variant="studio-form" label="Total Amount (₹) *" placeholder="0.00" value={total} onChangeText={setTotal} keyboardType="decimal-pad" error={errors.total} maxLength={16} editable={!saving} /></View>{!existing && <View style={ui.flex}><Field variant="studio-form" label="Advance (₹)" placeholder="0.00" value={advance} onChangeText={setAdvance} keyboardType="decimal-pad" error={errors.advance} maxLength={16} editable={!saving} /></View>}</View>
      {!!existing && <View style={ui.between}><Text style={ui.body}>Payments received</Text><Text style={ui.heading}>{money(received)}</Text></View>}
      <View style={ui.between}><Text style={ui.label}>Payment Status</Text><Badge label={total !== '' && received >= Number(total) ? 'Paid' : received > 0 ? 'Partially Paid' : 'Pending'} tone={total !== '' && received >= Number(total) ? 'success' : 'warning'} /></View>
      <Text style={ui.small}>Payment status is calculated from the amounts received. Record further payments in Event Details.</Text>
    </Card>
    <Card style={styles.formCard}>
      <FormHeading title="Studio Notes" icon="file-text" color="#9C3768" background="#FDEBF4" />
      <Field variant="studio-form" accessibilityLabel="Studio Notes" placeholder="Shot list, timings or special requests…" value={notes} onChangeText={setNotes} multiline numberOfLines={4} maxLength={3000} editable={!saving} />
    </Card>
    </>}
    {step === formSteps.length - 1 && (
      <>
        <ReviewSection title="Event Details" onEdit={() => editFromReview(0)} rows={[
          ['Date', formatDate(date.toISOString())], ['Time', formatTime(date.toISOString())],
          ['Location', location.trim()], ['Type', type], ['Expected attendees', attendees || '0'], ['Status', status],
        ]} />
        <ReviewSection title="Client Details" onEdit={() => editFromReview(1)} rows={[
          ['Name', phone ? phoneMatches[0]?.name ?? clientName.trim() : selectedClient?.name ?? 'No linked client'],
          ['Phone', phone || selectedClient?.phone || '—'],
        ]} />
        <ReviewSection title="Crew & Equipment" onEdit={() => editFromReview(2)} rows={[
          ['Crew', crew.join(', ') || 'None assigned'], ['Equipment', equipment.join(', ') || 'None added'],
        ]} />
        <ReviewSection title="Payment & Notes" onEdit={() => editFromReview(3)} rows={[
          ['Total', money(Number(total))], ['Received', money(received)],
          ['Balance', money(Math.max(0, Number(total) - received))], ['Notes', notes.trim() || '—'],
        ]} />
      </>
    )}
    {!!error && <ErrorMessage message={error} />}
    <View style={ui.row}>
      {(step > 0 || editingFromReview) && <Button title="Back" variant="secondary" icon="arrow-left" onPress={goBack} disabled={saving} />}
      <Button style={ui.flex}
        title={editingFromReview ? 'Return to Review' : step === formSteps.length - 2 ? 'Review Event' : step < formSteps.length - 1 ? 'Continue' : existing ? 'Save Changes' : 'Create Event'}
        icon={step < formSteps.length - 1 ? 'arrow-right' : 'check'}
        onPress={submit} loading={saving} />
    </View>
    <Modal visible={typePicker} transparent statusBarTranslucent animationType="slide" onRequestClose={() => setTypePicker(false)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboard}>
      <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.modalBackdrop}><View style={styles.modalCard}>
        <View style={ui.between}><Text style={ui.heading}>Event Type</Text><IconButton name="x" label="Close event type selection" onPress={() => setTypePicker(false)} /></View>
        <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{eventTypes.map(item => <Pressable key={item} accessibilityRole="radio" accessibilityState={{ checked: type === item }} onPress={() => { setType(item); setTypePicker(false); }} style={styles.clientChoice}><Text style={[ui.label, ui.flex]}>{item}</Text><Feather name={type === item ? 'check-circle' : 'circle'} size={20} color={colors.primary} /></Pressable>)}</ScrollView>
      </View></SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
    <Modal visible={clientPicker} transparent statusBarTranslucent animationType="slide" onRequestClose={() => setClientPicker(false)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboard}>
      <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.modalBackdrop}><View style={styles.modalCard}>
        <View style={ui.between}><Text style={ui.heading}>Choose client</Text><IconButton name="x" label="Close client selection" onPress={() => setClientPicker(false)} /></View>
        <Field variant="studio-form" icon="search" placeholder="Search clients" value={clientQuery} onChangeText={setClientQuery} autoCorrect={false} />
        <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingBottom: 20 }}>
          <Button title="No linked client" variant="secondary" onPress={() => { setClientId(undefined); setClientPhone(''); setClientPicker(false); }} />
          {data.clients.filter(client => `${client.name} ${client.phone}`.toLowerCase().includes(clientQuery.toLowerCase())).map(client => <Pressable key={client.id} accessibilityRole="button" onPress={() => { setClientId(client.id); setClientPhone(''); setClientPicker(false); }} style={styles.clientChoice}><View style={ui.flex}><Text style={ui.label}>{client.name}</Text><Text style={ui.small}>{client.phone || client.email || 'No contact details'}</Text></View><Feather name={clientId === client.id ? 'check-circle' : 'chevron-right'} size={20} color={colors.primary} /></Pressable>)}
          {data.clients.length === 0 && <Text style={ui.body}>Your client directory is empty. You can link a client later by editing this event.</Text>}
          {data.clients.length > 0 && !data.clients.some(client => `${client.name} ${client.phone}`.toLowerCase().includes(clientQuery.toLowerCase())) && <Text style={ui.body}>No clients match your search.</Text>}
        </ScrollView>
      </View></SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  </Screen>;
}

function ReviewSection({ title, rows, onEdit }: {
  title: string; rows: [string, string][]; onEdit: () => void;
}) {
  const { colors, ui, dark } = useStudioTheme();
  const styles = makeStyles(colors);
 
  return <Card style={styles.formCard}>
    <View style={ui.between}>
      <Text accessibilityRole="header" style={[ui.heading, ui.flex]}>{title}</Text>
      <IconButton name="edit-2" label={`Edit ${title}`} onPress={onEdit} />
    </View>
    {rows.map(([label, value]) => (
      <View key={label} style={styles.reviewRow}>
        <Text style={ui.small}>{label}</Text>
        <Text style={ui.label}>{value}</Text>
      </View>
    ))}
  </Card>;
}

function FormHeading({ title, icon, color, background }: {
  title: string; icon: React.ComponentProps<typeof Feather>['name']; color: string; background: string;
}) {
  const { colors, ui, dark } = useStudioTheme();
  const styles = makeStyles(colors);
 
  return <View style={ui.row}>
    <View style={[styles.headingIcon, { backgroundColor: background }]}>
      <Feather name={icon} size={18} color={color} />
    </View>
    <Text accessibilityRole="header" style={[ui.heading, ui.flex]}>{title}</Text>
  </View>;
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  reviewRow: { gap: 3, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  formCard: { gap: 18, padding: 16, borderRadius: 20, borderColor: colors.border },
  headingIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  progress: { flexDirection: 'row', gap: 6, marginTop: 8 },
  progressSegment: { flex: 1, height: 4, borderRadius: 4, backgroundColor: '#DCEDEA' },
  progressActive: { backgroundColor: colors.primary },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dateControl: { minHeight: 54, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, flexDirection: 'row', gap: 8, alignItems: 'center' },
  pickerIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#E3F2FF', alignItems: 'center', justifyContent: 'center' },
  dateText: { color: colors.text, fontSize: 12, fontFamily: 'InterSemiBold', flexShrink: 1 },
  empty: { color: colors.muted, fontSize: 12, lineHeight: 19, textAlign: 'center', padding: 12, borderRadius: 12, backgroundColor: colors.input },
  keyboard: { flex: 1 },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#102A4377' },
  modalCard: { maxHeight: '80%', backgroundColor: colors.card, borderRadius: 24, padding: 20, gap: 16 },
  clientChoice: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: colors.border },
});
