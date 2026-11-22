import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import { Button, Card, EmptyState, ErrorMessage, Header, Screen } from '../components/ui';
import { drivePhotoPageSize, type ClientGallery, type ClientGalleryList, type DrivePhoto } from '../domain/types';
import { formatDate } from '../domain/helpers';
import { useStudio } from '../state/StudioProvider';
import { useStudioTheme } from '../theme';
import { ClientPhotoViewer } from './ClientPhotoViewer';

type CachedGallery = { photos: DrivePhoto[]; shown: number; nextPage?: string };

export function ClientPhotosScreen() {
  return <ClientGalleryScreen />;
}

export function ClientGalleryScreen({ favourites = false }: { favourites?: boolean }) {
  const { loadClientGalleries, galleryChange } = useStudio();
  const { colors, ui } = useStudioTheme();
  const [list, setList] = useState<ClientGalleryList | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [galleryCache] = useState(() => new Map<string, CachedGallery>());
  const title = favourites ? 'Favourites' : 'Photos';

  useEffect(() => {
    if (galleryChange) galleryCache.delete(galleryChange.id);
  }, [galleryCache, galleryChange]);

  useEffect(() => {
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
      for (const id of galleryCache.keys()) {
        if (!result.galleries.some(gallery => gallery.id === id)) galleryCache.delete(id);
      }
      setList(result);
      setSelectedId(previous => result.galleries.some(gallery => gallery.id === previous) ? previous
        : result.galleries.length === 1 ? result.galleries[0].id : null);
    }).catch(() => {
      if (active) { galleryCache.clear(); setList(null); setSelectedId(null); setError('Your galleries could not be loaded. Please try again.'); }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [galleryCache, loadClientGalleries, retry]);

  const selected = !loading && list?.galleries.find(gallery => gallery.id === selectedId);
  if (selected && list) return <GalleryPreview key={selected.id} gallery={selected}
    cache={galleryCache} favourites={favourites} previewsEnabled={list.previewsEnabled} onBack={() => setSelectedId(null)}
    onRefresh={() => { galleryCache.delete(selected.id); setRetry(value => value + 1); }} />;

  return <Screen refreshing={loading && list !== null} onRefresh={() => { galleryCache.clear(); setRetry(value => value + 1); }}>
    <Header title={title} />
    {loading ? <ActivityIndicator color={colors.primary} accessibilityLabel="Loading your galleries" />
      : error ? <View style={ui.gap}><ErrorMessage message={error} /><Button title="Retry" variant="secondary" onPress={() => setRetry(value => value + 1)} /></View>
        : !list?.galleries.length ? <EmptyState icon="image" title="No galleries available" description="Galleries shared by your studio will appear here." />
          : list.galleries.map(gallery => <Card key={gallery.id} style={ui.gap}>
            <View style={ui.row}><Feather name="image" color={colors.primaryDark} size={24} /><Text style={ui.heading}>Gallery · {formatDate(gallery.createdAt)}</Text></View>
            <Button title="View Gallery" icon="arrow-right" variant="secondary" onPress={() => setSelectedId(gallery.id)} />
          </Card>)}
  </Screen>;
}

function GalleryPreview({ gallery, favourites, previewsEnabled, onBack, onRefresh, cache }: {
  gallery: ClientGallery; favourites: boolean; previewsEnabled: boolean; onBack: () => void; onRefresh: () => void; cache: Map<string, CachedGallery>;
}) {
  const { loadGalleryPhotos, galleryChange } = useStudio();
  const { colors, ui } = useStudioTheme();
  const [cached, setCached] = useState(() => cache.get(gallery.id));
  const [requestedCount, setRequestedCount] = useState<number | null>(() => previewsEnabled && !cache.has(gallery.id) ? drivePhotoPageSize : null);
  const [error, setError] = useState('');
  const [linkError, setLinkError] = useState('');
  const [viewer, setViewer] = useState<{ photos: DrivePhoto[]; startIndex: number }>();
  const lastChange = useRef(galleryChange);
  const loading = requestedCount !== null;
  const shown = cached?.shown ?? 0;
  const photos = cached?.photos.slice(0, shown) ?? [];
  const hasMore = !!cached && (shown < cached.photos.length || !!cached.nextPage);

  useEffect(() => {
    if (!cached) return;
    setViewer(current => {
      if (!current) return current;
      const known = new Set(current.photos.map(photo => photo.id));
      const next = cached.photos.slice(0, cached.shown).filter(photo => !known.has(photo.id));
      return next.length ? { ...current, photos: [...current.photos, ...next] } : current;
    });
  }, [cached]);

  useEffect(() => {
    if (galleryChange === lastChange.current) return;
    lastChange.current = galleryChange;
    if (galleryChange?.id !== gallery.id || !previewsEnabled) return;
    cache.delete(gallery.id);
    setCached(undefined);
    setRequestedCount(Math.max(shown, drivePhotoPageSize));
  }, [cache, gallery.id, galleryChange, previewsEnabled, shown]);

  useEffect(() => {
    if (!previewsEnabled || !loadGalleryPhotos || requestedCount === null) return;
    let active = true;
    const target = requestedCount;
    const load = loadGalleryPhotos;
    setError('');
    void (async () => {
      const saved = cache.get(gallery.id);
      const items = [...(saved?.photos ?? [])];
      const ids = new Set(items.map(photo => photo.id));
      let nextPage = saved?.nextPage;
      // Drive can return a short page with a continuation token.
      for (let attempt = 0; active && items.length < target && attempt < Math.ceil(target / drivePhotoPageSize) + drivePhotoPageSize; attempt++) {
        if (!nextPage && (saved || attempt > 0)) break;
        const page = await load(gallery.id, nextPage, favourites);
        for (const photo of page.photos) {
          if (!ids.has(photo.id)) {
            ids.add(photo.id);
            items.push(photo);
          }
        }
        if (page.nextPageToken === nextPage) { nextPage = undefined; break; }
        nextPage = page.nextPageToken;
      }
      if (!active) return;
      const result = { photos: items, shown: Math.min(target, items.length), nextPage };
      cache.set(gallery.id, result);
      setCached(result);
    })().catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : 'Could not load photo previews.');
    }).finally(() => { if (active) setRequestedCount(null); });
    return () => { active = false; };
  }, [cache, gallery.id, favourites, previewsEnabled, loadGalleryPhotos, requestedCount, galleryChange]);

  function openDrive() {
    setLinkError('');
    void Linking.openURL(gallery.driveLink).catch(() => setLinkError('Could not open the Google Drive gallery.'));
  }

  return <Screen refreshing={false} onRefresh={onRefresh}>
    <Header title={favourites ? 'Favourites' : 'Gallery'} onBack={onBack} />
    <Button title="Open in Google Drive" icon="external-link" variant="secondary" onPress={openDrive} />
    {!!linkError && <ErrorMessage message={linkError} />}
    {!previewsEnabled && <Text style={ui.body}>Open this gallery in Drive to view your photos.</Text>}
    {!!error && <View style={ui.gap}><ErrorMessage message={error} />
      <Button title="Retry previews" variant="ghost" onPress={() => setRequestedCount(shown + drivePhotoPageSize)} />
    </View>}
    {previewsEnabled && !loading && !error && !photos.length && <EmptyState icon={favourites ? 'heart' : 'image'}
      title={favourites ? 'No favourites yet' : 'No photo previews'}
      description={favourites ? 'Open a photo and tap the heart to select it.' : 'Open the gallery in Google Drive to check its contents.'} />}
    <View style={styles.grid}>
      {photos.map((photo, index) => <Card key={photo.id} style={styles.tile}>
        <Pressable accessibilityRole="button" accessibilityLabel={'View ' + photo.name} onPress={() => setViewer({ photos, startIndex: index })}>
          <PhotoTile galleryId={gallery.id} photo={photo} />
          <Text numberOfLines={2} style={ui.label}>{photo.name}</Text>
        </Pressable>
      </Card>)}
    </View>
    {loading ? <ActivityIndicator color={colors.primary} accessibilityLabel="Loading Drive photos" />
      : hasMore && !error ? <Button title="Load more" icon="chevron-down" variant="ghost" onPress={() => setRequestedCount(shown + drivePhotoPageSize)} /> : null}
    {viewer && <ClientPhotoViewer galleryId={gallery.id} photos={viewer.photos} startIndex={viewer.startIndex}
      favourites={favourites} hasMore={hasMore} loading={loading} pageError={error}
      onLoadMore={() => setRequestedCount(shown + drivePhotoPageSize)} onClose={() => setViewer(undefined)} />}
  </Screen>;
}

function PhotoTile({ galleryId, photo }: { galleryId: string; photo: DrivePhoto }) {
  const { galleryThumbnail } = useStudio();
  const { colors } = useStudioTheme();
  const [failed, setFailed] = useState(false);
  const source = galleryThumbnail?.(galleryId, photo.id, false, photo.name);
  return <View style={[styles.preview, { backgroundColor: colors.mint }]}>
    <Feather name={failed ? 'image' : 'camera'} size={25} color={colors.primaryDark} />
    {source && !failed && <Image source={source} cachePolicy="memory-disk" contentFit="cover"
      onError={() => setFailed(true)} style={StyleSheet.absoluteFill} />}
  </View>;
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '48%', padding: 8, gap: 7 },
  preview: { aspectRatio: 1, borderRadius: 12, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
});
