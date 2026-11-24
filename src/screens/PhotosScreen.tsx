import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { PagedList } from '../components/PagedList';
import { Button, Card, Chip, EmptyState, ErrorMessage, Field, Header, IconButton } from '../components/ui';
import { GoogleDriveIcon } from '../components/GoogleDriveIcon';
import { useToast } from '../components/Toast';
import { useConfirmation } from '../components/ConfirmationDialog';
import { formatDate } from '../domain/helpers';
import { isGoogleDriveLink } from '../domain/validation';
import { useStudio } from '../state/StudioProvider';
import { ApiRequestError } from '../services/cloudApi';
import { useStudioTheme, type Palette } from '../theme';
import { maxGalleryLinksPerClient, type MainTabParamList, type PhotoGallery } from '../domain/types';

const sortChoices = ['Newest', 'Oldest', 'Client'] as const;
type GallerySort = typeof sortChoices[number];

function galleryError(error: unknown, fallback: string) {
  if (error instanceof ApiRequestError && error.status === 404 && /^endpoint not found\.?$/i.test(error.message)) {
    return 'This action requires the updated studio API. Deploy the latest backend to Vercel and try again.';
  }
  return error instanceof Error ? error.message : fallback;
}

export function PhotosScreen({ route, navigation }: BottomTabScreenProps<MainTabParamList, 'Photos'>) {
  const confirm = useConfirmation();
  const { data, savePhotoGallery, savePhotoGalleries, removePhotoGallery } = useStudio();
  const { colors, ui } = useStudioTheme();
  const styles = makeStyles(colors);
  const showToast = useToast();

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<GallerySort>('Newest');
  const [formVisible, setFormVisible] = useState(false);
  const [editingId, setEditingId] = useState<string>();
  const [removingId, setRemovingId] = useState<string>();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [clientQuery, setClientQuery] = useState('');
  const [clientSearchOpen, setClientSearchOpen] = useState(false);
  const [clientId, setClientId] = useState('');
  const [driveLinks, setDriveLinks] = useState(['']);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [listError, setListError] = useState('');

  const galleries = useMemo(() => {
    const names = new Map(data.clients.map(client => [client.id, client.name]));
    const term = query.trim().toLowerCase();
    return (data.photoGalleries ?? []).map(gallery => ({ ...gallery, clientName: names.get(gallery.clientId) ?? '' }))
      .filter(gallery => gallery.clientName.toLowerCase().includes(term) || gallery.driveLink.toLowerCase().includes(term))
      .sort((a, b) => {
        const newestFirst = Date.parse(b.createdAt) - Date.parse(a.createdAt);
        if (sort === 'Client') return a.clientName.localeCompare(b.clientName) || newestFirst;
        return sort === 'Oldest' ? -newestFirst : newestFirst;
      });
  }, [data.photoGalleries, data.clients, query, sort]);

  const selectedClient = data.clients.find(client => client.id === clientId);
  const savedLinks = (data.photoGalleries ?? []).filter(gallery => gallery.clientId === clientId && gallery.id !== editingId);
  const editingCurrentClient = !!editingId && data.photoGalleries?.some(gallery => gallery.id === editingId && gallery.clientId === clientId);
  const draftLimit = Math.max(editingCurrentClient ? 1 : 0, maxGalleryLinksPerClient - savedLinks.length);
  const draftCount = driveLinks.filter(link => link.trim()).length;
  const showDrafts = draftLimit > 0 || draftCount > 0;
  const clientTerm = clientQuery.trim().toLowerCase();
  const activeClients = data.clients.filter(client => !client.inactive).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const matchingClients = clientTerm ? activeClients.filter(client =>
    `${client.name} ${client.phone} ${client.email}`.toLowerCase().includes(clientTerm)) : activeClients.slice(0, 5);

  const openForm = useCallback((gallery?: PhotoGallery, preselectedClientId = '') => {
    setEditingId(gallery?.id);
    setClientId(gallery?.clientId ?? preselectedClientId); setClientQuery(''); setDriveLinks([gallery?.driveLink ?? '']); setFormError(''); setPickerOpen(false);
    setClientSearchOpen(false);
    setFormVisible(true);
  }, []);

  const addGalleryFor = route.params?.addGalleryFor;
  useEffect(() => {
    if (!addGalleryFor) return;
    openForm(undefined, addGalleryFor);
    navigation.setParams({ addGalleryFor: undefined });
  }, [addGalleryFor, navigation, openForm]);

  async function save() {
    if (saving) return;
    setFormError('');
    const links = driveLinks.map(link => link.trim());
    if (!selectedClient) {
      setFormError('Choose an existing client.');
      return;
    }
    if (links.length > draftLimit) {
      setFormError(`This client can have up to ${maxGalleryLinksPerClient} Google Drive links.`);
      return;
    }
    const invalidIndex = links.findIndex(link => !isGoogleDriveLink(link));
    if (invalidIndex !== -1) {
      setFormError(`Enter a valid Google Drive link for field ${invalidIndex + 1}.`);
      return;
    }
    if (new Set(links).size !== links.length) {
      setFormError('Each Drive link must be different.');
      return;
    }
    const originalLink = data.photoGalleries?.find(gallery => gallery.id === editingId && gallery.clientId === clientId)?.driveLink;
    if (links.some((link, index) => (index > 0 || link !== originalLink) && savedLinks.some(gallery => gallery.driveLink === link))) {
      setFormError('This Drive link is already saved for the selected client.');
      return;
    }
    setSaving(true);
    try {
      if (links.length === 1) await savePhotoGallery(selectedClient.id, links[0], editingId);
      else await savePhotoGalleries(selectedClient.id, links, editingId);
      setFormVisible(false);
      showToast(editingId ? (links.length === 1 ? 'Photo gallery updated' : 'Gallery updated and new links added')
        : links.length === 1 ? 'Photo gallery created' : `${links.length} photo galleries created`);
    } catch (error) {
      setFormError(galleryError(error, 'Could not save the gallery.'));
    } finally { setSaving(false); }
  }

  function confirmRemove(gallery: PhotoGallery) {
    confirm({ title: 'Remove gallery?', message: 'This removes the gallery link from the app. The photos remain in Google Drive.',
      icon: 'trash-2', confirmLabel: 'Remove', destructive: true, onConfirm: async () => {
        setRemovingId(gallery.id);
        setListError('');
        try {
          await removePhotoGallery(gallery.id);
          showToast('Photo gallery removed');
        } catch (error) {
          setListError(galleryError(error, 'Could not remove the gallery.'));
        } finally { setRemovingId(undefined); }
      } });
  }

  function openDrive(link: string) {
    setListError('');
    void Linking.openURL(link).catch(() => setListError('Could not open the Google Drive link.'));
  }

  return <>
    <PagedList items={galleries} scope={JSON.stringify([query, sort])}
      createAction={{ label: 'Create photo gallery', onPress: () => openForm() }}
      header={<View style={ui.gap}>
        <Header title="Photos" />
        <Field icon="search" accessibilityLabel="Search photo galleries" placeholder="Search client or Drive link"
          value={query} onChangeText={setQuery} returnKeyType="search" />
        <View style={styles.sortRow}>
          <Text style={ui.small}>Sort:</Text>
          {sortChoices.map(choice => <Chip key={choice} label={choice} selected={choice === sort} onPress={() => setSort(choice)} />)}
        </View>
        <Text style={ui.label}>{galleries.length} {galleries.length === 1 ? 'gallery' : 'galleries'}</Text>
        {!!listError && <ErrorMessage message={listError} />}
      </View>}
      empty={<EmptyState icon="image" title={query.trim() ? 'No matching galleries' : 'No photo galleries yet'}
        description={query.trim() ? 'Try another client name or link.' : 'Use the plus button to add a client’s Drive link.'} />}
      renderItem={({ item }) => <Card style={styles.galleryCard}>
        <Pressable accessibilityRole="link" accessibilityLabel={`Open Drive gallery for ${item.clientName}`}
          onPress={() => openDrive(item.driveLink)} style={({ pressed }) => [styles.galleryRow, pressed && { opacity: 0.7 }]}>
          <View style={styles.galleryIcon}><GoogleDriveIcon size={24} /></View>
          <View style={styles.galleryDetails}>
            <Text style={ui.heading}>{item.clientName}</Text>
            <Text style={ui.small} numberOfLines={1}>{item.driveLink}</Text>
            <Text style={ui.small}>Added {formatDate(item.createdAt)}</Text>
          </View>
          <Feather name="external-link" size={19} color={colors.primaryDark} />
        </Pressable>
        <View style={styles.galleryActions}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Edit gallery for ${item.clientName}`}
            disabled={!!removingId} onPress={() => openForm(item)}
            style={({ pressed }) => [styles.galleryAction, (pressed || removingId) && styles.actionMuted]}>
            <Feather name="edit-2" size={17} color={colors.primaryDark} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Remove gallery for ${item.clientName}`}
            accessibilityState={{ busy: removingId === item.id, disabled: !!removingId }} disabled={!!removingId}
            onPress={() => confirmRemove(item)} style={({ pressed }) => [styles.galleryAction, pressed && styles.actionMuted]}>
            {removingId === item.id ? <ActivityIndicator size="small" color={colors.error} /> : <Feather name="trash-2" size={17} color={colors.error} />}
          </Pressable>
        </View>
      </Card>}
    />
    <Modal visible={formVisible} animationType="slide" presentationStyle="pageSheet"
      onRequestClose={() => { if (!saving) setFormVisible(false); }}>
      <SafeAreaView style={styles.modal} edges={['top', 'bottom', 'left', 'right']}>
        <KeyboardAvoidingView style={ui.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
            <Header title={editingId ? 'Edit Photo Gallery' : 'Create Photo Gallery'} onBack={() => { if (!saving) setFormVisible(false); }} />
            <Card style={ui.gap}>
              <View style={styles.clientField}>
                <Text style={ui.label}>Client name</Text>
                <Pressable accessibilityRole="button" accessibilityState={{ expanded: pickerOpen }} disabled={saving}
                  style={styles.clientPicker} onPress={() => { setPickerOpen(open => !open); setClientQuery(''); setClientSearchOpen(false); }}>
                  <Feather name="user" size={18} color={colors.primaryDark} />
                  <Text style={[ui.body, ui.flex]}>{selectedClient?.name ?? 'Choose an existing client'}</Text>
                  <Feather name={pickerOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.primaryDark} />
                </Pressable>
                {pickerOpen && <View style={styles.options}>
                  <View style={ui.between}>
                    <Text style={ui.label}>{clientTerm ? 'Search results' : 'Newest clients'}</Text>
                    {!!activeClients.length && <IconButton name={clientSearchOpen ? 'x' : 'search'}
                      label={clientSearchOpen ? 'Close client search' : 'Search clients'}
                      onPress={() => { setClientSearchOpen(open => !open); setClientQuery(''); }} />}
                  </View>
                  {clientSearchOpen && <Field icon="search" accessibilityLabel="Find an existing client"
                    placeholder="Search name, phone, or email" value={clientQuery} onChangeText={setClientQuery}
                    autoFocus autoCapitalize="none" returnKeyType="search" />}
                  {!matchingClients.length && <Text style={ui.small}>{clientTerm ? 'No matching clients.' : 'No active clients to select.'}</Text>}
                  {matchingClients.map(client => <Pressable key={client.id} accessibilityRole="radio"
                    accessibilityState={{ checked: client.id === clientId }} style={styles.option} onPress={() => {
                      setClientId(client.id); setPickerOpen(false); setFormError('');
                    }}>
                    <Text style={[ui.label, ui.flex]}>{client.name}</Text>
                    <Feather name={client.id === clientId ? 'check-circle' : 'circle'} size={17} color={colors.primaryDark} />
                  </Pressable>)}
                </View>}
              </View>
              {selectedClient && <View style={styles.savedLinks}>
                <View style={ui.between}>
                  <Text style={ui.label}>Saved Drive links</Text>
                  <Text style={ui.small}>{savedLinks.length + draftCount} / {maxGalleryLinksPerClient} links</Text>
                </View>
                {savedLinks.map(gallery => <Pressable key={gallery.id} accessibilityRole="link"
                  accessibilityLabel={`Open saved Drive link for ${selectedClient.name}`}
                  style={styles.savedLink} onPress={() => {
                    void Linking.openURL(gallery.driveLink).catch(() => setFormError('Could not open the saved Google Drive link.'));
                  }}>
                  <GoogleDriveIcon size={18} />
                  <Text style={[ui.small, ui.flex]}>{gallery.driveLink}</Text>
                  <Feather name="external-link" size={15} color={colors.primaryDark} />
                </Pressable>)}
                {!savedLinks.length && <Text style={ui.small}>{editingId ? 'No other links saved.' : 'No links saved yet.'}</Text>}
              </View>}
              {showDrafts && driveLinks.map((link, index) => <View key={index}>
                <Field label={driveLinks.length === 1 ? 'Google Drive link' : `Google Drive link ${index + 1}`}
                  icon={<GoogleDriveIcon size={21} />} placeholder="https://drive.google.com/…" value={link}
                  onChangeText={value => {
                    setDriveLinks(current => current.map((item, position) => position === index ? value : item));
                    setFormError('');
                  }} keyboardType="url" autoCapitalize="none" autoCorrect={false} maxLength={2048} editable={!saving} />
                {driveLinks.length > 1 && (!editingId || index > 0) && <Button title={`Remove link ${index + 1}`} icon="x" variant="ghost" disabled={saving}
                  onPress={() => {
                    setDriveLinks(current => current.filter((_, position) => position !== index));
                    setFormError('');
                  }} />}
              </View>)}
              <Button title="Add New Drive Link" icon="plus" variant="secondary"
                disabled={saving || !selectedClient || driveLinks.length >= draftLimit}
                onPress={() => setDriveLinks(current => current.length < draftLimit ? [...current, ''] : current)} />
              {selectedClient && driveLinks.length > draftLimit && <Text style={ui.small}>
                {draftLimit === 0 ? 'This client has reached the 10-link limit.'
                  : `Only ${draftLimit} link ${draftLimit === 1 ? 'slot is' : 'slots are'} available for this client.`}
              </Text>}
              {!!formError && <ErrorMessage message={formError} />}
              <Button title={editingId ? 'Save Changes' : driveLinks.length > 1 ? 'Create Galleries' : 'Create Gallery'}
                icon="check" loading={saving} disabled={!!selectedClient && driveLinks.length > draftLimit} onPress={() => void save()} />
            </Card>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  </>;
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  sortRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  galleryCard: { padding: 0, borderRadius: 18 },
  galleryRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12, minHeight: 72 },
  galleryIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.mint, justifyContent: 'center', alignItems: 'center' },
  galleryDetails: { flex: 1, minWidth: 0, gap: 3 },
  galleryActions: { flexDirection: 'row', justifyContent: 'flex-end', borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 12 },
  galleryAction: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  actionMuted: { opacity: 0.55 },
  modal: { flex: 1, backgroundColor: colors.background },
  form: { paddingHorizontal: 16, paddingVertical: 14, gap: 14 },
  clientField: { gap: 8 },
  savedLinks: { gap: 8 },
  savedLink: { minHeight: 44, padding: 9, flexDirection: 'row', alignItems: 'center', gap: 9,
    borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.input },
  clientPicker: { minHeight: 50, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: colors.input },
  options: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 10, gap: 5 },
  option: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
});
