import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Keyboard, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Badge, Button, Card, EmptyState, ErrorMessage, Field, Header, Screen } from '../components/ui';
import { PagedList } from '../components/PagedList';
import { PinField } from '../components/PinField';
import { useToast } from '../components/Toast';
import type { ManagedAccount } from '../domain/types';
import { useStudioNavigation } from '../navigation/useStudioNavigation';
import { useStudio } from '../state/StudioProvider';
import { useStudioTheme, type Palette } from '../theme';

const roles = [
  { value: 'admin', title: 'Admin', icon: 'shield', description: 'Manage studio records and settings.' },
  { value: 'client', title: 'Client', icon: 'user', description: 'Access Photos, Favourites, and Settings.' },
] as const;
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Please try again.';

export default function AccountsScreen() {
  const navigation = useStudioNavigation();
  const { colors, ui } = useStudioTheme();
  const styles = makeStyles(colors);
  const { data, listAccounts, createAccount, linkClientAccount } = useStudio();
  const showToast = useToast();
  const [accounts, setAccounts] = useState<ManagedAccount[]>([]);
  const [query, setQuery] = useState('');
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadVersion, setLoadVersion] = useState(0);
  const [formVisible, setFormVisible] = useState(false);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState<ManagedAccount['role']>('client');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [linkAccount, setLinkAccount] = useState<ManagedAccount | null>(null);
  const [linkedClientId, setLinkedClientId] = useState('');
  const [linkQuery, setLinkQuery] = useState('');
  const [linkSaving, setLinkSaving] = useState(false);
  const [linkError, setLinkError] = useState('');

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

  const term = query.trim().toLowerCase();
  const displayedAccounts = accounts
    .filter(account => [account.name, account.username, '@' + account.username, account.role]
      .some(value => value.toLowerCase().includes(term)))
    .sort((a, b) => a.name.localeCompare(b.name) || a.username.localeCompare(b.username))
    .map(account => ({ ...account, id: account.username }));

  function openForm() {
    Keyboard.dismiss();
    setName(''); setUsername(''); setPin(''); setRole('client'); setSaveError('');
    setFormVisible(true);
  }

  function closeForm() {
    if (saving) return;
    setPin('');
    setFormVisible(false);
  }

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
      setAccounts(previous => [...previous.filter(account => account.username !== created.username), created]);
      setPin('');
      setQuery('');
      setFormVisible(false);
      showToast(created.role === 'admin' ? 'Admin account created' : 'Client account created', { sound: true });
    } catch (error) { setSaveError(errorText(error)); }
    finally { setSaving(false); }
  }

  function openLink(account: ManagedAccount) {
    setLinkedClientId(account.clientId ?? '');
    setLinkQuery(''); setLinkError(''); setLinkAccount(account);
  }

  async function saveLink() {
    if (!linkAccount || !linkClientAccount || !linkedClientId || linkSaving) return;
    Keyboard.dismiss();
    setLinkSaving(true);
    setLinkError('');
    try {
      await linkClientAccount(linkAccount.username, linkedClientId);
      setAccounts(previous => previous.map(account => account.username === linkAccount.username
        ? { ...account, clientId: linkedClientId } : account));
      setLinkAccount(null);
      showToast('Client account linked');
    } catch (error) { setLinkError(errorText(error)); }
    finally { setLinkSaving(false); }
  }

  return <>
    <PagedList
      items={displayedAccounts}
      scope={term}
      createAction={createAccount && !loading ? { label: 'Create account', onPress: openForm } : undefined}
      header={<View style={ui.gap}>
        <Header title="Accounts" onBack={() => navigation.goBack()} />
        <Field icon="search" placeholder="Search name, username, or role" accessibilityLabel="Search accounts"
          value={query} onChangeText={setQuery} returnKeyType="search" autoCapitalize="none" />
      </View>}
      empty={loading ? <ActivityIndicator color={colors.primary} accessibilityLabel="Loading studio accounts" />
        : loadError ? <View style={ui.gap}>
          <ErrorMessage message={loadError} />
          <Button title="Retry" variant="secondary" onPress={() => setLoadVersion(version => version + 1)} />
        </View> : <EmptyState icon="users" title={term ? 'No matching accounts' : 'No accounts yet'}
          description={term ? 'Try a different name, username, or role.' : 'Use the plus button to create an admin or client account.'} />}
      renderItem={({ item }) => <Card style={styles.accountCard}>
        <View style={ui.between}>
          <View style={styles.accountIcon}><Feather name={item.role === 'admin' ? 'shield' : 'user'} size={19} color={colors.primaryDark} /></View>
          <View style={ui.flex}>
            <Text style={ui.label}>{item.name}</Text>
            <Text style={ui.small}>@{item.username}</Text>
          </View>
          <Badge label={item.role === 'admin' ? 'Admin' : 'Client'} />
        </View>
        {item.role === 'client' && linkClientAccount && <Button
          title={item.clientId ? 'Change linked client' : 'Link client'} icon="link" variant="secondary"
          onPress={() => openLink(item)} />}
      </Card>}
    />
    <Modal visible={formVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeForm}>
      <Screen>
        <Header title="Create Account" onBack={closeForm} />
        <Card style={ui.gap}>
          <Text style={ui.heading}>Account type</Text>
          {roles.map(option => <Pressable key={option.value} accessibilityRole="radio"
            accessibilityState={{ checked: role === option.value, disabled: saving }}
            disabled={saving} style={[styles.roleOption, role === option.value && styles.selected]}
            onPress={() => { setRole(option.value); setSaveError(''); }}>
            <View style={styles.accountIcon}><Feather name={option.icon} size={19} color={colors.primaryDark} /></View>
            <View style={ui.flex}><Text style={ui.label}>{option.title}</Text><Text style={ui.small}>{option.description}</Text></View>
            <Feather name={role === option.value ? 'check-circle' : 'circle'} size={19} color={colors.primaryDark} />
          </Pressable>)}
        </Card>
        <Card style={ui.gap}>
          <Field label="Name" icon="user" value={name} onChangeText={setName} maxLength={100} editable={!saving} />
          <Field label="Username" icon="at-sign" value={username} onChangeText={setUsername}
            autoCapitalize="none" autoCorrect={false} maxLength={40} editable={!saving} />
          <PinField label="Four-digit PIN" value={pin} onChange={setPin} revealed={false} disabled={saving} />
        </Card>
        {!!saveError && <ErrorMessage message={saveError} />}
        <Button title="Create Account" icon="user-plus" loading={saving} onPress={() => void save()} />
      </Screen>
    </Modal>
    <Modal visible={linkAccount !== null} animationType="slide" presentationStyle="pageSheet"
      onRequestClose={() => { if (!linkSaving) setLinkAccount(null); }}>
      <Screen>
        <Header title="Link Client" onBack={() => { if (!linkSaving) setLinkAccount(null); }} />
        <Text style={ui.body}>Choose which client record @{linkAccount?.username} can see payment totals for.</Text>
        <Field icon="search" placeholder="Find a client" accessibilityLabel="Find a client to link"
          value={linkQuery} onChangeText={setLinkQuery} editable={!linkSaving} />
        {data.clients.filter(client => `${client.name} ${client.phone} ${client.email}`.toLowerCase().includes(linkQuery.trim().toLowerCase()))
          .map(client => <Pressable key={client.id} accessibilityRole="radio"
            accessibilityState={{ checked: client.id === linkedClientId, disabled: linkSaving }}
            disabled={linkSaving} style={[styles.roleOption, client.id === linkedClientId && styles.selected]}
            onPress={() => { setLinkedClientId(client.id); setLinkError(''); }}>
            <View style={ui.flex}>
              <Text style={ui.label}>{client.name}</Text>
              {!!(client.phone || client.email) && <Text style={ui.small}>{client.phone || client.email}</Text>}
            </View>
            <Feather name={client.id === linkedClientId ? 'check-circle' : 'circle'} size={19} color={colors.primaryDark} />
          </Pressable>)}
        {!data.clients.length && <Text style={ui.small}>Create a client record in Clients first.</Text>}
        {!!linkError && <ErrorMessage message={linkError} />}
        <Button title="Save Client Link" icon="link" loading={linkSaving} disabled={!linkedClientId} onPress={() => void saveLink()} />
      </Screen>
    </Modal>
  </>;
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  accountCard: { gap: 10 },
  accountIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' },
  roleOption: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 14 },
  selected: { borderColor: colors.primary, backgroundColor: colors.mint },
});
