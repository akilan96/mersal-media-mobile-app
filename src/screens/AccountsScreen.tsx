import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Keyboard, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { GoogleDriveIcon } from '../components/GoogleDriveIcon';
import { Badge, Button, Card, EmptyState, ErrorMessage, Field, Header, Screen } from '../components/ui';
import { PagedList } from '../components/PagedList';
import { PinField } from '../components/PinField';
import { useToast } from '../components/Toast';
import { useConfirmation } from '../components/ConfirmationDialog';
import type { ManagedAccount } from '../domain/types';
import { useStudioNavigation } from '../navigation/useStudioNavigation';
import { useStudio } from '../state/StudioProvider';
import { useStudioTheme, type Palette } from '../theme';

const roles = [
  { value: 'admin', title: 'Admin', icon: 'shield', description: 'Manage studio records and settings.' },
  { value: 'client', title: 'Client', icon: 'user', description: 'Access Photos, Favourites, and Settings.' },
] as const;
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Please try again.';
const accountPageSize = 5;
type AccountGroup = { id: string; clientId?: string; clientName?: string; accounts: ManagedAccount[] };

export default function AccountsScreen() {
  const confirm = useConfirmation();
  const navigation = useStudioNavigation();
  const { colors, ui } = useStudioTheme();
  const styles = makeStyles(colors);
  const { data, listAccounts, createAccount, updateAccount, deleteAccount, linkClientAccount } = useStudio();
  const showToast = useToast();
  const [accounts, setAccounts] = useState<ManagedAccount[]>([]);
  const [query, setQuery] = useState('');
  const [accountFilter, setAccountFilter] = useState<ManagedAccount['role']>('client');
  const [accountLimit, setAccountLimit] = useState(accountPageSize);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadVersion, setLoadVersion] = useState(0);
  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState<ManagedAccount>();
  const [deleting, setDeleting] = useState<string>();
  const [actionError, setActionError] = useState('');
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
  const clientTerm = linkQuery.trim().toLowerCase();
  const activeClients = data.clients.filter(client => !client.inactive).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const matchingClients = clientTerm ? activeClients.filter(client =>
    `${client.name} ${client.phone} ${client.email}`.toLowerCase().includes(clientTerm)) : activeClients.slice(0, 5);
  const selectedClient = data.clients.find(client => client.id === linkedClientId);
  const clientNames = new Map(data.clients.map(client => [client.id, client.name]));
  const clientLoginCounts = new Map<string, number>();
  for (const account of accounts) {
    if (account.role === 'client' && account.clientId) {
      clientLoginCounts.set(account.clientId, (clientLoginCounts.get(account.clientId) ?? 0) + 1);
    }
  }
  const matchingAccounts = accounts.filter(account => account.role === accountFilter
    && [account.name, account.username, '@' + account.username, account.role, clientNames.get(account.clientId ?? '') ?? '']
      .some(value => value.toLowerCase().includes(term)))
    .sort((a, b) => (Date.parse(b.createdAt ?? '') || 0) - (Date.parse(a.createdAt ?? '') || 0)
      || a.name.localeCompare(b.name) || a.username.localeCompare(b.username));
  const accountGroups = new Map<string, AccountGroup>();
  for (const account of matchingAccounts.slice(0, accountLimit)) {
    const clientId = account.role === 'client' ? account.clientId : undefined;
    const id = clientId ? `client:${clientId}` : `account:${account.username}`;
    const group = accountGroups.get(id);
    if (group) group.accounts.push(account);
    else accountGroups.set(id, {
      id, clientId, clientName: clientId ? clientNames.get(clientId) ?? 'Linked client' : undefined, accounts: [account],
    });
  }
  const displayedGroups = [...accountGroups.values()];

  function openForm(account?: ManagedAccount) {
    Keyboard.dismiss();
    setEditing(account);
    setName(account?.name ?? ''); setUsername(account?.username ?? ''); setPin(''); setRole(account?.role ?? 'client'); setSaveError('');
    setFormVisible(true);
  }

  function closeForm() {
    if (saving) return;
    setPin('');
    setFormVisible(false);
  }

  async function save() {
    if (saving || loading || !createAccount || (editing && !updateAccount)) return;
    setSaveError('');
    if (!name.trim() || !/^[a-zA-Z0-9_.-]{3,40}$/.test(username.trim()) || ((!editing || pin) && !/^\d{4}$/.test(pin))) {
      setSaveError(editing ? 'Enter a valid name and username. If changing the PIN, enter four digits.'
        : 'Enter a name, a username with 3–40 valid characters, and a four-digit PIN.');
      return;
    }
    Keyboard.dismiss();
    setSaving(true);
    try {
      const details = { name: name.trim(), username: username.trim(), role };
      const saved = editing && updateAccount ? await updateAccount(editing.username, { ...details, pin: pin || undefined })
        : await createAccount({ ...details, pin });
      setAccounts(previous => [...previous.filter(account => account.username !== (editing?.username ?? saved.username)), saved]);
      setPin('');
      setQuery('');
      setAccountFilter(saved.role);
      setAccountLimit(accountPageSize);
      setFormVisible(false);
      showToast(editing ? 'Account updated' : saved.role === 'admin' ? 'Admin account created' : 'Client account created');
    } catch (error) { setSaveError(errorText(error)); }
    finally { setSaving(false); }
  }

  function confirmDelete(account: ManagedAccount) {
    if (!deleteAccount || deleting) return;
    confirm({ title: 'Delete account?', message: `@${account.username} will lose sign-in access. Their linked client record stays saved.`,
      icon: 'trash-2', confirmLabel: 'Delete', destructive: true, onConfirm: async () => {
        setDeleting(account.username);
        setActionError('');
        try {
          await deleteAccount(account.username);
          setAccounts(current => current.filter(item => item.username !== account.username));
          showToast('Account deleted');
        } catch (error) { setActionError(errorText(error)); }
        finally { setDeleting(undefined); }
      } });
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
      items={displayedGroups}
      scope={JSON.stringify([accountFilter, term])}
      manualLoadMore={{ hasMore: accountLimit < matchingAccounts.length,
        onPress: () => setAccountLimit(limit => Math.min(limit + accountPageSize, matchingAccounts.length)) }}
      createAction={createAccount && !loading ? { label: 'Create account', onPress: () => openForm() } : undefined}
      header={<View style={ui.gap}>
        <Header title="Accounts" onBack={() => navigation.goBack()} />
        <View style={styles.accountFilters}>
          {roles.map(option => {
            const selected = accountFilter === option.value;
            return <Pressable key={option.value} accessibilityRole="button"
              accessibilityState={{ selected }} onPress={() => {
                if (!selected) { setAccountFilter(option.value); setAccountLimit(accountPageSize); }
              }}
              style={({ pressed }) => [styles.accountFilter, selected && styles.selectedFilter, pressed && styles.actionMuted]}>
              <View style={[styles.filterIcon, selected && styles.selectedFilterIcon]}>
                <Feather name={option.icon} size={17} color={colors.primaryDark} />
              </View>
              <Text style={[styles.filterLabel, selected && { color: colors.onPrimary }]}>{option.title}s</Text>
            </Pressable>;
          })}
        </View>
        <Field icon="search" placeholder="Search client, account, or role" accessibilityLabel="Search accounts by client, account, or role"
          value={query} onChangeText={value => { setQuery(value); setAccountLimit(accountPageSize); }}
          returnKeyType="search" autoCapitalize="none" />
        {matchingAccounts.length > accountPageSize && <Text style={ui.small}>
          Showing {Math.min(accountLimit, matchingAccounts.length)} of {matchingAccounts.length} logins
        </Text>}
        {!!actionError && <ErrorMessage message={actionError} />}
      </View>}
      empty={loading ? <ActivityIndicator color={colors.primary} accessibilityLabel="Loading studio accounts" />
        : loadError ? <View style={ui.gap}>
          <ErrorMessage message={loadError} />
          <Button title="Retry" variant="secondary" onPress={() => setLoadVersion(version => version + 1)} />
        </View> : <EmptyState icon="users" title={term ? 'No matching accounts' : accountFilter === 'admin' ? 'No admin accounts yet' : 'No client accounts yet'}
          description={term ? 'Try another client name, username, or role.' : 'Use the plus button to create an admin or client account.'} />}
      renderItem={({ item }) => {
        const loginCount = item.clientId ? clientLoginCounts.get(item.clientId) ?? item.accounts.length : item.accounts.length;
        return <Card style={styles.accountCard}>
        {item.clientName && <View style={styles.groupHeader}>
          <View style={styles.accountIcon}><Feather name="folder" size={20} color={colors.primaryDark} /></View>
          <View style={ui.flex}>
            <Text accessibilityRole="header" style={ui.heading}>{item.clientName}</Text>
            <Text style={ui.small}>Shared gallery access</Text>
          </View>
          <View style={styles.loginCount} accessible
            accessibilityLabel={`${loginCount} ${loginCount === 1 ? 'login' : 'logins'}`}>
            <View style={styles.loginCountNumberBox}>
              <Text style={styles.loginCountNumber}>{loginCount}</Text>
            </View>
            <Text style={styles.loginCountLabel}>{loginCount === 1 ? 'login' : 'logins'}</Text>
          </View>
        </View>}
        {item.clientId && clientNames.has(item.clientId) && <Pressable accessibilityRole="button"
          accessibilityLabel={`Add Drive gallery for ${item.clientName}`}
          onPress={() => navigation.popTo('Main', { screen: 'Photos', params: { addGalleryFor: item.clientId } })}
          style={({ pressed }) => [styles.galleryButton, pressed && styles.actionMuted]}>
          <GoogleDriveIcon size={21} />
          <Text style={styles.galleryButtonText}>Add Drive Link</Text>
        </Pressable>}
        {item.accounts.map(account => <View key={account.username} style={[styles.member, !!item.clientName && styles.groupMember]}>
          <View style={ui.between}>
            <View style={styles.accountIcon}><Feather name={account.role === 'admin' ? 'shield' : 'user'} size={19} color={colors.primaryDark} /></View>
            <View style={ui.flex}>
              <Text style={ui.label}>{account.name}</Text>
              <Text style={ui.small}>@{account.username}</Text>
            </View>
            {!item.clientName && <Badge label={account.role === 'admin' ? 'Admin' : 'Unlinked'} tone={account.role === 'admin' ? 'teal' : 'neutral'} />}
          </View>
          <View style={styles.accountActions}>
            {account.role === 'client' && linkClientAccount && <Pressable accessibilityRole="button"
              accessibilityLabel={`${account.clientId ? 'Change linked client for' : 'Link client to'} ${account.name}`}
              disabled={!!deleting} onPress={() => openLink(account)}
              style={({ pressed }) => [styles.actionTarget, (pressed || deleting) && styles.actionMuted]}>
              <Feather name="link" size={17} color={colors.primaryDark} />
            </Pressable>}
            {updateAccount && <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${account.name}`}
              disabled={!!deleting} onPress={() => openForm(account)}
              style={({ pressed }) => [styles.actionTarget, (pressed || deleting) && styles.actionMuted]}>
              <Feather name="edit-2" size={17} color={colors.primaryDark} />
            </Pressable>}
            {deleteAccount && <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${account.name}`}
              accessibilityState={{ disabled: !!deleting, busy: deleting === account.username }}
              disabled={!!deleting} onPress={() => confirmDelete(account)}
              style={({ pressed }) => [styles.actionTarget, pressed && styles.actionMuted]}>
              {deleting === account.username ? <ActivityIndicator size="small" color={colors.error} />
                : <Feather name="trash-2" size={17} color={colors.error} />}
            </Pressable>}
          </View>
        </View>)}
      </Card>;
      }}
    />
    <Modal visible={formVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeForm}>
      <Screen>
        <Header title={editing ? 'Edit Account' : 'Create Account'} onBack={closeForm} />
        <Card style={ui.gap}>
          <Text style={ui.heading}>Account type</Text>
          {roles.map(option => {
            const selected = role === option.value;
            return <Pressable key={option.value} accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled: saving }}
              disabled={saving} style={({ pressed }) => [styles.typeCard, selected && styles.selected, pressed && styles.actionMuted]}
              onPress={() => { setRole(option.value); setSaveError(''); }}>
              <View style={[styles.accountIcon, selected && styles.selectedRoleIcon]}>
                <Feather name={option.icon} size={21} color={selected ? colors.onPrimary : colors.primaryDark} />
              </View>
              <View style={ui.flex}>
                <Text style={styles.typeTitle}>{option.title}</Text>
                <Text style={ui.small}>{option.description}</Text>
              </View>
              <View style={[styles.radioMarker, selected && styles.selectedRoleIcon]}>
                {selected && <Feather name="check" size={13} color={colors.onPrimary} />}
              </View>
            </Pressable>;
          })}
        </Card>
        <Card style={ui.gap}>
          <Field label="Name" icon="user" value={name} onChangeText={setName} maxLength={100} editable={!saving} />
          <Field label="Username" icon="at-sign" value={username} onChangeText={setUsername}
            autoCapitalize="none" autoCorrect={false} maxLength={40} editable={!saving} />
          <PinField label={editing ? 'New PIN (optional)' : 'Four-digit PIN'} value={pin} onChange={setPin} revealed={false} disabled={saving} />
        </Card>
        {!!saveError && <ErrorMessage message={saveError} />}
        <Button title={editing ? 'Save Changes' : 'Create Account'} icon={editing ? 'check' : 'user-plus'} loading={saving} onPress={() => void save()} />
      </Screen>
    </Modal>
    <Modal visible={linkAccount !== null} animationType="slide" presentationStyle="pageSheet"
      onRequestClose={() => { if (!linkSaving) setLinkAccount(null); }}>
      <Screen>
        <Header title="Link Client" onBack={() => { if (!linkSaving) setLinkAccount(null); }} />
        <Text style={ui.body}>Choose which client record @{linkAccount?.username} can access.</Text>
        {selectedClient && <Text style={ui.label}>Selected client: {selectedClient.name}</Text>}
        <Field icon="search" placeholder="Find a client" accessibilityLabel="Find a client to link"
          value={linkQuery} onChangeText={setLinkQuery} editable={!linkSaving} />
        {!clientTerm && matchingClients.length > 0 && <Text style={ui.small}>Newest clients</Text>}
        {matchingClients.map(client => <Pressable key={client.id} accessibilityRole="radio"
            accessibilityState={{ checked: client.id === linkedClientId, disabled: linkSaving }}
            disabled={linkSaving} style={[styles.roleOption, client.id === linkedClientId && styles.selected]}
            onPress={() => { setLinkedClientId(client.id); setLinkError(''); }}>
            <View style={ui.flex}>
              <Text style={ui.label}>{client.name}</Text>
              {!!(client.phone || client.email) && <Text style={ui.small}>{client.phone || client.email}</Text>}
            </View>
            <Feather name={client.id === linkedClientId ? 'check-circle' : 'circle'} size={19} color={colors.primaryDark} />
          </Pressable>)}
        {!matchingClients.length && <Text style={ui.small}>{clientTerm ? 'No clients match your search.' : 'No active clients to link.'}</Text>}
        {!!linkError && <ErrorMessage message={linkError} />}
        <Button title="Save Client Link" icon="link" loading={linkSaving} disabled={!linkedClientId} onPress={() => void saveLink()} />
      </Screen>
    </Modal>
  </>;
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  accountCard: { padding: 0, overflow: 'hidden' },
  accountFilters: { flexDirection: 'row', gap: 5, padding: 5, borderRadius: 18, borderWidth: 1,
    borderColor: colors.border, backgroundColor: colors.card },
  accountFilter: { flex: 1, minHeight: 47, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 13 },
  selectedFilter: { backgroundColor: colors.primary },
  filterIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mint },
  selectedFilterIcon: { backgroundColor: colors.card },
  filterLabel: { color: colors.text, fontFamily: 'InterBold', fontSize: 14 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, backgroundColor: colors.mint },
  loginCount: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 4, paddingRight: 8,
    borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  loginCountNumberBox: { minWidth: 24, minHeight: 24, paddingHorizontal: 4, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  loginCountNumber: { color: colors.onPrimary, fontFamily: 'InterExtraBold', fontSize: 13, fontVariant: ['tabular-nums'] },
  loginCountLabel: { color: colors.primaryDark, fontFamily: 'InterSemiBold', fontSize: 11 },
  member: { paddingTop: 12, paddingHorizontal: 13 },
  groupMember: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  accountActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 3 },
  actionTarget: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  actionMuted: { opacity: 0.55 },
  galleryButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
    marginHorizontal: 13, marginVertical: 8, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  galleryButtonText: { color: colors.primaryDark, fontFamily: 'InterBold', fontSize: 13 },
  accountIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' },
  roleOption: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 14 },
  typeCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, minHeight: 68,
    borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.card },
  typeTitle: { color: colors.text, fontFamily: 'InterExtraBold', fontSize: 15, marginBottom: 2 },
  radioMarker: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  selectedRoleIcon: { backgroundColor: colors.primary, borderColor: colors.primary },
  selected: { borderColor: colors.primary, backgroundColor: colors.mint },
});
