import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Keyboard, StyleSheet, Text, View } from 'react-native';
import { Badge, Button, Card, Chip, EmptyState, ErrorMessage, Field, Header, Screen, SectionTitle } from '../components/ui';
import { useToast } from '../components/Toast';
import type { ManagedAccount } from '../domain/types';
import { useStudioNavigation } from '../navigation/useStudioNavigation';
import { useStudio } from '../state/StudioProvider';
import { useStudioTheme } from '../theme';

const roles = ['admin', 'client'] as const;
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Please try again.';

export default function AccountsScreen() {
  const navigation = useStudioNavigation();
  const { colors, ui } = useStudioTheme();
  const { listAccounts, createAccount } = useStudio();
  const showToast = useToast();
  const [accounts, setAccounts] = useState<ManagedAccount[]>([]);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadVersion, setLoadVersion] = useState(0);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState<ManagedAccount['role']>('client');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    setLoadError('');
    setLoading(true);
    if (listAccounts) {
      void listAccounts().then(records => {
        if (active) setAccounts(records);
      }).catch(error => {
        if (active) setLoadError(errorText(error));
      }).finally(() => {
        if (active) setLoading(false);
      });
    } else {
      setLoadError('Account management is unavailable.');
      setLoading(false);
    }
    return () => { active = false; };
  }, [listAccounts, loadVersion]);

  async function save() {
    if (saving || loading || !createAccount) return;
    setSaveError('');
    if (!name.trim() || !/^[a-zA-Z0-9_.-]{3,40}$/.test(username.trim()) || !/^\d{4}$/.test(pin)) {
      setSaveError('Enter a name, a username with 3–40 valid characters, and a four-digit PIN.');
      return;
    }
    Keyboard.dismiss();
    setSaving(true);
    try {
      const created = await createAccount({ name: name.trim(), username: username.trim(), pin, role });
      setAccounts(previous => [...previous.filter(account => account.username !== created.username), created]
        .sort((a, b) => a.username.localeCompare(b.username)));
      setName(''); setUsername(''); setPin('');
      showToast(created.role === 'admin' ? 'Admin account created' : 'Client account created');
    } catch (error) { setSaveError(errorText(error)); }
    finally { setSaving(false); }
  }

  return <Screen>
    <Header title="Accounts" onBack={() => navigation.goBack()} />
    <Card style={ui.gap}>
      <Text style={ui.heading}>Create Account</Text>
      <View style={styles.roleRow}>
        {roles.map(option => <Chip key={option} label={option === 'admin' ? 'Admin' : 'Client'} selected={role === option}
          onPress={() => { if (!saving) setRole(option); }} />)}
      </View>
      <Text style={ui.small}>{role === 'admin' ? 'Access to the studio’s events, clients, payments, and settings.' : 'Access to Photos, Favourites, and Help.'}</Text>
      <Field label="Name" value={name} onChangeText={setName} maxLength={100} editable={!saving} />
      <Field label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} maxLength={40} editable={!saving} />
      <Field label="Four-digit PIN" value={pin} onChangeText={text => setPin(text.replace(/\D/g, '').slice(0, 4))}
        keyboardType="number-pad" maxLength={4} secureTextEntry editable={!saving} />
      {!!saveError && <ErrorMessage message={saveError} />}
      <Button title="Create Account" icon="user-plus" loading={saving} disabled={loading} onPress={() => void save()} />
    </Card>
    <SectionTitle title="Studio Accounts" />
    {loading ? <ActivityIndicator color={colors.primary} accessibilityLabel="Loading studio accounts" />
      : loadError ? <View style={ui.gap}><ErrorMessage message={loadError} /><Button title="Retry" variant="secondary" onPress={() => setLoadVersion(version => version + 1)} /></View>
        : !accounts.length ? <EmptyState icon="users" title="No accounts yet" description="Create an admin or client account above." />
          : accounts.map(account => <Card key={account.username}>
            <View style={ui.between}>
              <View style={ui.flex}><Text style={ui.label}>{account.name}</Text><Text style={ui.small}>@{account.username}</Text></View>
              <Badge label={account.role === 'admin' ? 'Admin' : 'Client'} />
            </View>
          </Card>)}
  </Screen>;
}

const styles = StyleSheet.create({
  roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
