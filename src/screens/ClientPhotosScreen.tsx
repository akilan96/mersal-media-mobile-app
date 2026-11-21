import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import { Button, Card, EmptyState, ErrorMessage, Header, Screen } from '../components/ui';
import type { ClientGallery, ClientGalleryList, DrivePhoto } from '../domain/types';
import { formatDate } from '../domain/helpers';
import { useStudio } from '../state/StudioProvider';
import { useStudioTheme } from '../theme';

export function ClientPhotosScreen() {
  const { loadClientGalleries } = useStudio();
  const { colors, ui } = useStudioTheme();
  const [list, setList] = useState<ClientGalleryList | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setError('');
    if (!loadClientGalleries) {
      setLoading(false);
      setError('Your galleries could not be loaded.');
      return;
    }
    void loadClientGalleries().then(result => {
      if (!active) return;
      setList(result);
      setSelectedId(previous => result.galleries.some(gallery => gallery.id === previous) ? previous
        : result.galleries.length === 1 ? result.galleries[0].id : null);
    }).catch(() => {
      if (active) { setList(null); setSelectedId(null); setError('Your galleries could not be loaded. Please try again.'); }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [loadClientGalleries, retry]));

  const selected = !loading && list?.galleries.find(gallery => gallery.id === selectedId);
  if (selected && list) return <GalleryPreview key={selected.id} gallery={selected}
    previewsEnabled={list.previewsEnabled} onBack={() => setSelectedId(null)} />;

  return <Screen>
    <Header title="Photos" />
    {loading ? <ActivityIndicator color={colors.primary} accessibilityLabel="Loading your galleries" />
      : error ? <View style={ui.gap}><ErrorMessage message={error} /><Button title="Retry" variant="secondary" onPress={() => setRetry(value => value + 1)} /></View>
        : !list?.galleries.length ? <EmptyState icon="image" title="No galleries available" description="Galleries shared by your studio will appear here." />
          : list.galleries.map(gallery => <Card key={gallery.id} style={ui.gap}>
            <View style={ui.row}><Feather name="image" color={colors.primaryDark} size={24} /><Text style={ui.heading}>Gallery · {formatDate(gallery.createdAt)}</Text></View>
            <Button title="View Gallery" icon="arrow-right" variant="secondary" onPress={() => setSelectedId(gallery.id)} />
          </Card>)}
  </Screen>;
}

function GalleryPreview({ gallery, previewsEnabled, onBack }: { gallery: ClientGallery; previewsEnabled: boolean; onBack: () => void }) {
  const { loadGalleryPhotos, galleryThumbnail } = useStudio();
  const { colors, ui } = useStudioTheme();
  const [photos, setPhotos] = useState<DrivePhoto[]>([]);
  const [nextPage, setNextPage] = useState<string>();
  const [pageRequest, setPageRequest] = useState<{ token?: string }>({});
  const [loading, setLoading] = useState(previewsEnabled);
  const [error, setError] = useState('');
  const [linkError, setLinkError] = useState('');

  useEffect(() => {
    if (!previewsEnabled || !loadGalleryPhotos) return;
    let active = true;
    setLoading(true); setError('');
    void loadGalleryPhotos(gallery.id, pageRequest.token).then(page => {
      if (!active) return;
      setPhotos(previous => pageRequest.token
        ? [...previous, ...page.photos.filter(photo => !previous.some(saved => saved.id === photo.id))]
        : page.photos);
      setNextPage(page.nextPageToken);
    }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : 'Could not load photo previews.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [gallery.id, previewsEnabled, loadGalleryPhotos, pageRequest]);

  function openDrive() {
    setLinkError('');
    void Linking.openURL(gallery.driveLink).catch(() => setLinkError('Could not open the Google Drive gallery.'));
  }

  return <Screen>
    <Header title="Gallery" onBack={onBack} />
    <Button title="Open in Google Drive" icon="external-link" variant="secondary" onPress={openDrive} />
    {!!linkError && <ErrorMessage message={linkError} />}
    {!previewsEnabled && <Text style={ui.body}>Open this gallery in Drive to view your photos.</Text>}
    {!!error && <View style={ui.gap}><ErrorMessage message={error} />
      <Button title="Retry previews" variant="ghost" onPress={() => setPageRequest(request => ({ ...request }))} />
    </View>}
    {previewsEnabled && !loading && !error && !photos.length && <EmptyState icon="image" title="No photo previews" description="Open the gallery in Google Drive to check its contents." />}
    <View style={styles.grid}>
      {photos.map(photo => {
        const source = photo.hasThumbnail ? galleryThumbnail?.(gallery.id, photo.id) : undefined;
        return <Card key={photo.id} style={styles.tile}>
          <View style={[styles.preview, { backgroundColor: colors.mint }]}>
            <Feather name="image" size={25} color={colors.primaryDark} />
            {source && <Image source={source} cachePolicy="none" contentFit="cover" accessibilityLabel={photo.name}
              style={StyleSheet.absoluteFill} />}
          </View>
          <Text numberOfLines={2} style={ui.label}>{photo.name}</Text>
        </Card>;
      })}
    </View>
    {loading ? <ActivityIndicator color={colors.primary} accessibilityLabel="Loading Drive photos" />
      : nextPage && !error ? <Button title="Load more" icon="chevron-down" variant="ghost" onPress={() => setPageRequest({ token: nextPage })} /> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '48%', padding: 8, gap: 7 },
  preview: { aspectRatio: 1, borderRadius: 12, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
});
