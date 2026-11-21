import React, { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../services/cloudApi';
import { Image, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Brand, Button, Card, ErrorMessage, Field, Screen } from '../components/ui';
import { useStudio } from '../state/StudioProvider';
import { useStudioTheme, type Palette } from '../theme';

type PinFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  revealed: boolean;
  largeLabel?: boolean;
  disabled?: boolean;
  error?: string;
};

function PinField({ label, value, onChange, revealed, disabled, error, largeLabel }: PinFieldProps) {
  const { colors, ui } = useStudioTheme();
  const styles = makeStyles(colors);
 
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.fieldGroup}>
      <Text style={[ui.label, largeLabel && styles.cloudLabel]}>{label}</Text>
      <Pressable onPress={() => inputRef.current?.focus()} accessible={false}>
        <View style={styles.pinRow} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {[0, 1, 2, 3].map((index) => (
            <View key={index} style={[styles.pinCell, focused && index === Math.min(value.length, 3) && styles.pinCellFocused, error ? styles.pinCellError : null]}>
              <Text style={styles.pinDigit} accessibilityElementsHidden>
                {value[index] ? (revealed ? value[index] : '•') : ''}
              </Text>
            </View>
          ))}
        </View>
        <TextInput
          ref={inputRef}
          accessibilityLabel={label}
          accessibilityHint="Enter four numbers"
          value={value}
          onChangeText={(text) => onChange(text.replace(/\D/g, '').slice(0, 4))}
          keyboardType="number-pad"
          maxLength={4}
          secureTextEntry={!revealed}
          autoComplete="off"
          autoCorrect={false}
          editable={!disabled}
          caretHidden
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={styles.pinInput}
        />
      </Pressable>
      {error ? <Text accessibilityRole="alert" style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

function LocalLoginScreen() {
  const { colors, ui } = useStudioTheme();
  const styles = makeStyles(colors);
 
  const { data, configured, authError, busy, setup, unlock } = useStudio();
  const [name, setName] = useState('');
  const [studioName, setStudioName] = useState('');
  const [username, setUsername] = useState(data.profile?.username ?? '');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showRecovery, setShowRecovery] = useState(false);

  const submit = async () => {
    const next: Record<string, string> = {};
    if (!username.trim()) next.username = 'Enter your username.';
    if (!/^\d{4}$/.test(pin)) next.pin = 'Enter a four-digit PIN.';
    if (!configured) {
      if (!name.trim()) next.name = 'Enter your name.';
      if (!studioName.trim()) next.studioName = 'Enter your studio name.';
      if (!/^[a-zA-Z0-9_.-]{3,40}$/.test(username.trim())) next.username = 'Use 3–40 letters, numbers, dots, dashes or underscores.';
      if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = 'Enter a valid email address.';
      if (confirmPin !== pin || !confirmPin) next.confirmPin = 'The PINs must match.';
    }
    setErrors(next);
    setSubmitError(null);
    if (Object.keys(next).length) return;
    try {
      if (configured) {
        await unlock(username.trim(), pin);
      } else {
        await setup({ name: name.trim(), studioName: studioName.trim(), username: username.trim(), phone: phone.trim(), email: email.trim() }, pin);
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to open your studio. Please try again.');
    }
  };

  return (
    <Screen contentStyle={styles.content}>
      <Image
        source={require('../../assets/design/login-hero.png')}
        resizeMode="contain"
        style={styles.hero}
        accessibilityLabel="Photography studio camera and prints"
      />
      <View style={styles.brand}><Brand /></View>
      <View style={styles.introduction}>
        <Text accessibilityRole="header" style={styles.headline}>{configured ? 'Welcome Back' : 'Welcome to Your Studio'}</Text>
        <Text style={[ui.body, styles.centered]}>
          {configured ? 'Sign in to manage your studio events.' : 'Set up your profile and a four-digit device PIN.'}
        </Text>
      </View>
      <View style={styles.form}>
        {!configured ? (
          <>
            <Field label="Your name" value={name} onChangeText={setName} error={errors.name} placeholder="Enter your name" autoCapitalize="words" editable={!busy} />
            <Field label="Studio name" value={studioName} onChangeText={setStudioName} error={errors.studioName} placeholder="Enter your studio name" autoCapitalize="words" editable={!busy} />
          </>
        ) : null}
        <Field label="Username" value={username} onChangeText={setUsername} error={errors.username} placeholder="Enter your username" autoCapitalize="none" autoCorrect={false} autoComplete="username" editable={!busy} />
        {!configured ? (
          <>
            <Field label="Email (optional)" value={email} onChangeText={setEmail} error={errors.email} placeholder="you@yourstudio.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" editable={!busy} />
            <Field label="Phone (optional)" value={phone} onChangeText={setPhone} placeholder="Your phone number" keyboardType="phone-pad" autoComplete="tel" editable={!busy} />
          </>
        ) : null}
        <View style={styles.pinLabelRow}>
          <Text style={ui.small}>{configured ? 'Unlock your local workspace' : 'Choose a PIN you will remember'}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide PIN' : 'Show PIN'}
            onPress={() => setRevealed(!revealed)}
            hitSlop={8}
            style={styles.visibilityButton}
          >
            <Feather name={revealed ? 'eye-off' : 'eye'} size={20} color={colors.muted} />
          </Pressable>
        </View>
        <PinField label="4-digit PIN" value={pin} onChange={setPin} revealed={revealed} disabled={busy} error={errors.pin} />
        {!configured ? <PinField label="Confirm PIN" value={confirmPin} onChange={setConfirmPin} revealed={revealed} disabled={busy} error={errors.confirmPin} /> : null}
        {configured ? (
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: showRecovery }} onPress={() => setShowRecovery(!showRecovery)} style={styles.recoveryButton}>
            <Text style={styles.recoveryText}>{showRecovery ? 'Hide PIN help' : 'Forgot PIN?'}</Text>
          </Pressable>
        ) : null}
        {showRecovery ? (
          <Card>
            <Text style={ui.label}>Your PIN stays on this device</Text>
            <Text style={[ui.small, styles.helpText]}>
              There is no server-backed PIN recovery. Keep your PIN safe. Clearing or reinstalling this app can erase your local studio records and does not provide a guaranteed PIN reset on every device.
            </Text>
          </Card>
        ) : null}
        {submitError || authError ? <ErrorMessage message={submitError || authError || ''} /> : null}
        <Button title={configured ? 'Login' : 'Create My Studio'} onPress={submit} icon="arrow-right" loading={busy} disabled={busy} />
        <Text style={[ui.small, styles.centered]}>
          {configured ? 'Your studio records are stored on this device.' : 'This creates a local workspace. Your contact details are stored on this device and do not register an online account.'}
        </Text>
      </View>
    </Screen>
  );
}

export function LoginScreen() {
  const { cloud } = useStudio();
  return cloud ? <CloudLoginScreen /> : <LocalLoginScreen />;
}

function CloudLoginScreen() {
  const { unlock, busy } = useStudio();
  const { colors } = useStudioTheme();
  const styles = makeStyles(colors);
  const [username, setUsername] = useState('');
  const [secret, setSecret] = useState('');
  const [pinMode, setPinMode] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void apiRequest('/auth/config').then(response => response.json()).then(config => {
      if (active) setPinMode(config.pinMode === true);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  async function submit() {
    setError('');
    if (!/^[a-zA-Z0-9_.-]{3,40}$/.test(username.trim())) {
      setError('Enter a studio username with 3–40 letters, numbers, dots, dashes or underscores.');
      return;
    }
    if (pinMode ? !/^\d{4}$/.test(secret) : secret.length < 12 || secret.length > 128) {
      setError(pinMode ? 'Enter your four-digit PIN.' : 'Enter a studio password with 12–128 characters.');
      return;
    }

    Keyboard.dismiss();
    try { await unlock(username.trim(), secret); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not sign in.'); }
  }

  return (
    <Screen contentStyle={styles.cloudContent}>
      <View style={styles.cloudPanel}>
        <View style={styles.cloudHeading}>
          <Brand />
          <Text accessibilityRole="header" style={[styles.headline, styles.cloudHeadline]}>Sign In to Your Studio</Text>
        </View>
        <View style={styles.cloudForm}>
          <Field label="Studio username" labelStyle={styles.cloudLabel} style={styles.cloudInput} icon="user"
            value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} autoComplete="username" maxLength={40} editable={!busy} />
          {pinMode ? <PinField label="4-digit studio PIN" largeLabel value={secret} onChange={setSecret} revealed={false} disabled={busy} />
            : <Field label="Studio password" labelStyle={styles.cloudLabel} style={styles.cloudInput} icon="lock" value={secret}
              onChangeText={setSecret} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="current-password" maxLength={128} editable={!busy} />}
          {error ? <ErrorMessage message={error} /> : null}
          <Button title="Sign In" onPress={submit} icon="arrow-right" loading={busy} disabled={busy} textStyle={styles.cloudButtonText} />
        </View>
        <Image source={require('../../assets/design/sign-in-camera.jpg')} resizeMode="cover" style={styles.cloudHero} accessible={false} />
      </View>
    </Screen>
  );
}
const makeStyles = (colors: Palette) => StyleSheet.create({
  content: { gap: 22, paddingTop: 12, paddingBottom: 32 },
  cloudContent: { paddingTop: 20 },
  cloudPanel: { width: '100%', maxWidth: 420, alignSelf: 'center', gap: 16 },
  cloudHero: { width: '68%', maxWidth: 248, aspectRatio: 3.3, alignSelf: 'center', borderRadius: 12 },
  cloudHeading: { alignItems: 'center', gap: 10 },
  cloudHeadline: { fontSize: 29, lineHeight: 35 },
  cloudForm: { gap: 14, padding: 14, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  cloudLabel: { fontSize: 16, lineHeight: 22 },
  cloudInput: { fontSize: 17 },
  cloudButtonText: { fontSize: 17 },
  hero: { width: '100%', height: 180 },
  brand: { alignItems: 'center' },
  introduction: { gap: 8, alignItems: 'center' },
  headline: { color: colors.text, fontSize: 29, fontFamily: 'InterExtraBold', letterSpacing: -0.8, textAlign: 'center' },
  centered: { textAlign: 'center' },
  form: { gap: 18 },
  fieldGroup: { gap: 9 },
  pinLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: -12 },
  visibilityButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pinRow: { flexDirection: 'row', gap: 12 },
  pinCell: { flex: 1, height: 56, borderRadius: 15, backgroundColor: colors.mint, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  pinCellFocused: { borderColor: colors.primary, borderWidth: 2 },
  pinCellError: { borderColor: colors.error },
  pinDigit: { color: colors.text, fontSize: 27, fontFamily: 'InterBold' },
  pinInput: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, color: 'transparent', backgroundColor: 'transparent', opacity: 0.04, fontSize: 27 },
  fieldError: { color: colors.error, fontSize: 12, lineHeight: 18 },
  recoveryButton: { minHeight: 44, justifyContent: 'center', alignItems: 'flex-end' },
  recoveryText: { color: colors.primary, fontFamily: 'InterBold', fontSize: 14 },
  helpText: { marginTop: 8 },
});
