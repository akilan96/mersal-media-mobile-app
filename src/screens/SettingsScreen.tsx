import React, { useState } from 'react';
import { Alert, Image, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import Constants from 'expo-constants';
import { Brand, Button, CameraArt, Card, ErrorMessage, Field, Header, IconButton, Screen } from '../components/ui';
import { useToast } from '../components/Toast';
import { defaultEventTypes, type Profile } from '../domain/types';
import { AppearanceSetting } from '../components/AppearanceSetting';
import { FloatingCreateButton } from '../components/PagedList';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { useStudio } from '../state/StudioProvider';
import { useStudioNavigation } from '../navigation/useStudioNavigation';
import { useStudioTheme, type Palette } from '../theme';

const panelTitles = { profile: 'Edit Profile', pin: 'Change PIN', photo: 'Home Photo', types: 'Event Types', newType: 'Add Event Type' } as const;
type Panel = keyof typeof panelTitles | null;
const failureMessage = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';
const blankProfile: Profile = { name: '', studioName: '', username: '', phone: '', email: '' };

export default function SettingsScreen() {
  const navigation = useStudioNavigation();
  const showToast = useToast();
  const { colors, ui } = useStudioTheme();
  const styles = makeStyles(colors);
 
  const { cloud, role, data, saveProfile, changePin, lock, setHomePhoto, addEventType } = useStudio();
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [eventType, setEventType] = useState('');
  const [eventTypeError, setEventTypeError] = useState('');

  async function updateSettings(action: () => Promise<void>) {
    setSettingsBusy(true);
    setSettingsError('');
    try { await action(); }
    catch (cause) { setSettingsError(failureMessage(cause)); }
    finally { setSettingsBusy(false); }
  }

  async function removeHomePhotoFile(uri?: string) {
    const folder = FileSystem.documentDirectory;
    if (Platform.OS === 'web' || !folder || !uri?.startsWith(folder + 'mersal-home-')) return;
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
  }

  function chooseHomePhoto() {
    void updateSettings(async () => {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], quality: 0.8, base64: Platform.OS === 'web',
      });
      if (result.canceled) return;
      const photo = result.assets[0];
      if (Platform.OS === 'web') {
        if (!photo.base64 || photo.base64.length > 2_000_000) throw new Error('Choose a smaller photo for the browser preview.');
        await setHomePhoto('data:image/jpeg;base64,' + photo.base64);
        return;
      }
      const folder = FileSystem.documentDirectory;
      if (!folder) throw new Error('Photo storage is unavailable.');
      const extension = photo.fileName?.match(/\.([a-z0-9]{2,5})$/i)?.[1] ?? 'jpg';
      const destination = folder + 'mersal-home-' + Crypto.randomUUID() + '.' + extension;
      try {
        await FileSystem.copyAsync({ from: photo.uri, to: destination });
        await setHomePhoto(destination);
      } catch (cause) {
        await removeHomePhotoFile(destination);
        throw cause;
      }
      await removeHomePhotoFile(data.homePhoto);
    });
  }
  const profile = data.profile ?? blankProfile;
  const [panel, setPanel] = useState<Panel>(null);
  const [form, setForm] = useState<Profile>(profile);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const initials = profile.name.trim().split(/\s+/).slice(0, 2).map(word => word.charAt(0)).join('').toUpperCase() || 'MM';

  function openPanel(next: Panel) {
    setSettingsError('');
    setEventType('');
    setEventTypeError('');
    setForm({ ...profile });
    setCurrentPin(''); setNewPin(''); setConfirmPin('');
    setErrors({}); setError(''); setPanel(next);
  }

  function update(field: keyof Profile, value: string) {
    setForm(previous => ({ ...previous, [field]: value }));
    setErrors(previous => ({ ...previous, [field]: '' }));
  }

  async function submitProfile() {
    const clean = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim()])) as unknown as Profile;
    const issues: Record<string, string> = {};
    if (!clean.name) issues.name = 'Enter your name.';
    if (!clean.studioName) issues.studioName = 'Enter your studio name.';
    if (!/^[a-zA-Z0-9_.-]{3,40}$/.test(clean.username)) issues.username = 'Use 3–40 letters, numbers, dots, dashes or underscores.';
    if (clean.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.email)) issues.email = 'Enter a valid email address.';
    if (clean.phone && (!/^[+\d\s().-]+$/.test(clean.phone) || !/^\d{7,15}$/.test(clean.phone.replace(/\D/g, '')))) issues.phone = 'Enter a valid phone number.';
    setErrors(issues);
    if (Object.keys(issues).length) return;
    setBusy(true); setError('');
    try { await saveProfile(clean); setPanel(null); }
    catch (exception) { setError(failureMessage(exception)); }
    finally { setBusy(false); }
  }

  async function submitPin() {
    const issues: Record<string, string> = {};
    if (!/^\d{4}$/.test(currentPin)) issues.currentPin = 'Enter your current 4-digit PIN.';
    if (!/^\d{4}$/.test(newPin)) issues.newPin = 'Choose a 4-digit PIN.';
    else if (currentPin === newPin) issues.newPin = 'Choose a PIN different from your current PIN.';
    if (newPin !== confirmPin) issues.confirmPin = 'The new PINs do not match.';
    setErrors(issues);
    if (Object.keys(issues).length) return;
    setBusy(true); setError('');
    try {
      await changePin(currentPin, newPin);
      setPanel(null); setCurrentPin(''); setNewPin(''); setConfirmPin('');
      Alert.alert('PIN updated', 'Use your new PIN the next time you unlock this studio.');
    } catch (exception) { setError(failureMessage(exception)); }
    finally { setBusy(false); }
  }

  function confirmLogout() {
    Alert.alert('Log out?', cloud ? 'Your studio records stay saved online.' : 'Your events and clients stay saved on this device. Enter your PIN to sign in again.', [
      { text: 'Cancel', style: 'cancel' }, { text: 'Log out', style: 'destructive', onPress: lock },
    ]);
  }

  return (
    <Screen>
      <Brand />
      <Card style={styles.profileCard}>
        <View style={styles.profileGlow} />
        <View style={styles.profileRow}>
          <View style={styles.avatar}><Text style={styles.initials}>{initials}</Text></View>
          <View style={styles.profileDetails}>
            <Text style={styles.profileName}>{profile.name}</Text>
            <Text style={styles.studioName}>{profile.studioName}</Text>
            <Text style={ui.small}>@{profile.username}</Text>
          </View>
          <IconButton name="edit" label="Edit profile" onPress={() => openPanel('profile')} />
        </View>
        {profile.email ? <View style={styles.contact}><Feather name="mail" size={14} color={colors.primary} /><Text style={[ui.small, ui.flex]}>{profile.email}</Text></View> : null}
        {profile.phone ? <View style={styles.contact}><Feather name="phone" size={14} color={colors.primary} /><Text style={[ui.small, ui.flex]}>{profile.phone}</Text></View> : null}
      </Card>
      <Card style={styles.settingsCard}>
        {!cloud && (<Pressable accessibilityRole="button" onPress={() => openPanel('pin')} style={styles.settingRow}>
          <View style={styles.settingIcon}><Feather name="lock" size={22} color={colors.primary} /></View>
          <Text style={[styles.rowTitle, ui.flex]}>Change PIN</Text>
          <Feather name="chevron-right" size={22} color={colors.primary} />
        </Pressable>)}
        <View style={styles.appearanceRow}><AppearanceSetting /></View>
        {([
          { panel: 'photo', icon: 'image', value: data.homePhoto ? 'Custom' : 'Default' },
          { panel: 'types', icon: 'tag', value: String(defaultEventTypes.length + (data.customEventTypes?.length ?? 0)) },
        ] as const).map(item => (
          <Pressable key={item.panel} accessibilityRole="button" onPress={() => openPanel(item.panel)} style={styles.settingRow}>
            <View style={styles.settingIcon}><Feather name={item.icon} size={22} color={colors.primary} /></View>
            <Text style={[styles.rowTitle, ui.flex]}>{panelTitles[item.panel]}</Text>
            <Text style={styles.rowValue}>{item.value}</Text>
            <Feather name="chevron-right" size={22} color={colors.primary} />
          </Pressable>
        ))}
        <Pressable accessibilityRole="button" onPress={() => navigation.navigate('Payments')} style={styles.settingRow}>
          <View style={styles.settingIcon}><Feather name="credit-card" size={22} color={colors.primary} /></View>
          <Text style={[styles.rowTitle, ui.flex]}>Payments</Text>
          <Feather name="chevron-right" size={22} color={colors.primary} />
        </Pressable>
        {role === 'owner' && <Pressable accessibilityRole="button" onPress={() => navigation.navigate('Accounts')} style={styles.settingRow}>
          <View style={styles.settingIcon}><Feather name="users" size={22} color={colors.primary} /></View>
          <Text style={[styles.rowTitle, ui.flex]}>Accounts</Text>
          <Feather name="chevron-right" size={22} color={colors.primary} />
        </Pressable>}
        <Pressable accessibilityRole="button" onPress={confirmLogout} style={[styles.settingRow, { borderBottomWidth: 0 }]}>
          <View style={[styles.settingIcon, { backgroundColor: colors.errorBg }]}><Feather name="log-out" size={22} color={colors.error} /></View>
          <Text style={[styles.rowTitle, ui.flex, { color: colors.error }]}>Log out</Text>
          <Feather name="chevron-right" size={22} color={colors.error} />
        </Pressable>
      </Card>
      {!cloud && <View style={styles.storageNote}>
        <Feather name="smartphone" size={17} color={colors.primary} />
        <Text style={[ui.small, ui.flex]}>Events and clients are stored on this device. Your PIN locks access to the app.</Text>
      </View>}
      <Card>
        <View style={ui.row}>
          <Image source={require('../../assets/design/ameyy-logo.jpeg')} style={styles.companyLogo} resizeMode="contain" />
          <View style={ui.flex}>
            <Text style={ui.label}>Ameyy Digital Services</Text>
            <Text style={ui.small}>Digital With Intention</Text>
          </View>
        </View>
        <View style={styles.settingRow}>
          <View style={styles.settingIcon}><Feather name="info" size={22} color={colors.primary} /></View>
          <Text style={[styles.rowTitle, ui.flex]}>App version</Text>
          <Text style={styles.rowValue}>{Constants.expoConfig?.version ?? '1.0.0'}</Text>
        </View>
      </Card>
      <Modal visible={panel !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (!busy && !settingsBusy) setPanel(panel === 'newType' ? 'types' : null); }}>
        <SafeAreaView style={styles.modal} edges={['top', 'bottom']}>
          <KeyboardAvoidingView style={ui.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.modalContent, panel === 'types' && styles.withCreateButton]}>
              <Header title={panel ? panelTitles[panel] : undefined} onBack={() => { if (!busy && !settingsBusy) setPanel(panel === 'newType' ? 'types' : null); }} />
              {panel === 'photo' && <Card style={ui.gap}>
        <Text style={ui.label}>{data.homePhoto ? 'Current Home photo' : 'Default Home photo'}</Text>
        <CameraArt uri={data.homePhoto} size={120} />
        <Button title="Choose Photo" icon="image" variant="secondary" disabled={settingsBusy} onPress={chooseHomePhoto} />
        {data.homePhoto && <Button title="Restore Default Photo" variant="ghost" disabled={settingsBusy}
          onPress={() => void updateSettings(async () => {
            await setHomePhoto(undefined);
            await removeHomePhotoFile(data.homePhoto);
          })} />}
              </Card>}
              {panel === 'types' && (
                <Card style={styles.eventTypes}>
                  {[...defaultEventTypes, ...(data.customEventTypes ?? [])].map(type => (
                    <View key={type} style={styles.eventTypeRow}>
                      <View style={styles.eventTypeIcon}><Feather name="tag" size={17} color={colors.primaryDark} /></View>
                      <Text style={[ui.label, styles.eventTypeLabel]}>{type}</Text>
                    </View>
                  ))}
                </Card>
              )}
              {panel === 'newType' && (
                <Card style={ui.gap}>
        <Field label="New event type" icon="tag" value={eventType} error={eventTypeError}
          onChangeText={value => { setEventType(value); setEventTypeError(''); }} maxLength={60} editable={!settingsBusy} />
        <Button title="Add Event Type" icon="plus" disabled={settingsBusy}
          onPress={() => {
            if (!eventType.trim()) {
              setEventTypeError('Enter a name for the event type.');
              return;
            }
            void updateSettings(async () => {
              try {
                await addEventType(eventType);
                setEventType('');
                setEventTypeError('');
                Keyboard.dismiss();
                setPanel(null);
                showToast('Event type created');
              } catch (cause) {
                setEventTypeError(failureMessage(cause));
              }
            });
          }} />
                </Card>
              )}
              {!!settingsError && <ErrorMessage message={settingsError} />}
              {(panel === 'profile' || panel === 'pin') && <>
              <Card>
                {panel === 'profile' ? <View style={ui.gap}>
                  <Field label="Your name *" icon="user" value={form.name} onChangeText={value => update('name', value)} error={errors.name} maxLength={100} autoCapitalize="words" editable={!busy} />
                  <Field label="Studio name *" icon="camera" value={form.studioName} onChangeText={value => update('studioName', value)} error={errors.studioName} maxLength={100} autoCapitalize="words" editable={!busy} />
                  <Field label="Username *" icon="at-sign" value={form.username} onChangeText={value => update('username', value)} error={errors.username} maxLength={40} autoCapitalize="none" autoCorrect={false} editable={!busy && !cloud} />
                  <Field label="Email" icon="mail" value={form.email} onChangeText={value => update('email', value)} error={errors.email} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} maxLength={150} editable={!busy} />
                  <Field label="Phone" icon="phone" value={form.phone} onChangeText={value => update('phone', value)} error={errors.phone} keyboardType="phone-pad" maxLength={25} editable={!busy} />
                </View> : <View style={ui.gap}>
                  <Field label="Current PIN" icon="lock" value={currentPin} onChangeText={value => { setCurrentPin(value.replace(/\D/g, '')); setErrors(previous => ({ ...previous, currentPin: '' })); }} error={errors.currentPin} secureTextEntry keyboardType="number-pad" maxLength={4} autoComplete="off" editable={!busy} />
                  <Field label="New PIN" icon="key" value={newPin} onChangeText={value => { setNewPin(value.replace(/\D/g, '')); setErrors(previous => ({ ...previous, newPin: '' })); }} error={errors.newPin} secureTextEntry keyboardType="number-pad" maxLength={4} autoComplete="off" editable={!busy} />
                  <Field label="Confirm new PIN" icon="check-circle" value={confirmPin} onChangeText={value => { setConfirmPin(value.replace(/\D/g, '')); setErrors(previous => ({ ...previous, confirmPin: '' })); }} error={errors.confirmPin} secureTextEntry keyboardType="number-pad" maxLength={4} autoComplete="off" editable={!busy} />
                </View>}
              </Card>
              {error ? <ErrorMessage message={error} /> : null}
              <Button title={panel === 'profile' ? 'Save profile' : 'Update PIN'} icon="check" loading={busy} onPress={() => { if (panel === 'profile') void submitProfile(); else void submitPin(); }} />
              <Text style={[ui.small, { textAlign: 'center' }]}>{panel === 'profile' ? (cloud ? 'Your profile is saved online.' : 'Your profile is saved only on this device.') : 'Choose a PIN you can remember. No cloud recovery service is connected.'}</Text>
              </>}
            </ScrollView>
          </KeyboardAvoidingView>
          {panel === 'types' && <FloatingCreateButton label="Add event type" onPress={() => openPanel('newType')} />}
        </SafeAreaView>
      </Modal>
    </Screen>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  eventTypes: { gap: 9 },
  withCreateButton: { paddingBottom: 84 },
  eventTypeRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 14 },
  eventTypeIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: colors.mint },
  eventTypeLabel: { flex: 1, fontSize: 15 },
  appearanceRow: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  companyLogo: { width: 56, height: 42, borderRadius: 6 },
  profileCard: { overflow: 'hidden', marginTop: 16, marginBottom: 4 },
  profileGlow: { position: 'absolute', bottom: -65, right: -20, width: 250, height: 130, borderRadius: 100, backgroundColor: colors.mint },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 65, height: 65, borderRadius: 33, backgroundColor: colors.mint, borderWidth: 2, borderColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  initials: { fontSize: 23, color: colors.primary, fontFamily: 'InterExtraBold' },
  profileDetails: { flex: 1, gap: 3, borderLeftWidth: 1, borderLeftColor: '#CDE5E7', paddingLeft: 12 },
  profileName: { fontSize: 20, fontFamily: 'InterExtraBold', color: colors.text, letterSpacing: -0.4 },
  studioName: { color: colors.primary, fontSize: 12, fontFamily: 'InterBold', lineHeight: 18 },
  contact: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  settingsCard: { paddingVertical: 5 },
  settingRow: { flexDirection: 'row', alignItems: 'center', minHeight: 78, gap: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  settingIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { color: colors.text, fontSize: 15, fontFamily: 'InterBold' },
  rowValue: { color: colors.muted, fontSize: 13, fontFamily: 'InterMedium' },
  storageNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 8, paddingTop: 23 },
  modal: { flex: 1, backgroundColor: colors.background },
  modalContent: { padding: 20, gap: 20, paddingBottom: 40 },
});
