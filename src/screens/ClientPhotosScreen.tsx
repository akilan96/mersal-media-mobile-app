import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Button, Card, EmptyState, ErrorMessage, Header, Screen } from '../components/ui';
import { drivePhotoPageSize, type ClientGallery, type ClientGalleryList, type DrivePhoto } from '../domain/types';
import { formatDate } from '../domain/helpers';
import { useStudio } from '../state/StudioProvider';
import { useStudioTheme } from '../theme';
import { ClientPhotoViewer, HeartIcon } from './ClientPhotoViewer';

type CachedGallery = { photos: DrivePhoto[]; shown: number; nextPage?: string };

function needsFirstPage(entry?: CachedGallery) {
  return !entry || (entry.shown < drivePhotoPageSize && (entry.shown < entry.photos.length || !!entry.nextPage));
}

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
  const galleryLinks = useRef(new Map<string, string>());
  const title = favourites ? 'Favourites' : 'Photos';

  useEffect(() => {
    if (galleryChange) galleryCache.delete(galleryChange.id);
  }, [galleryCache, galleryChange]);

  useFocusEffect(useCallback(() => {
    let active = true;
    if (!galleryLinks.current.size) setLoading(true);
    setError('');
    if (!loadClientGalleries) {
      setLoading(false);
      setError('Your galleries could not be loaded.');
      return;
    }
    void loadClientGalleries().then(result => {
      if (!active) return;
      const links = new Map(result.galleries.map(gallery => [gallery.id, gallery.driveLink]));
      for (const id of galleryCache.keys()) {
        if (!links.has(id) || links.get(id) !== galleryLinks.current.get(id)) galleryCache.delete(id);
      }
      galleryLinks.current = links;
      setList(result);
      setSelectedId(previous => result.galleries.some(gallery => gallery.id === previous) ? previous
        : result.galleries.length === 1 ? result.galleries[0].id : null);
    }).catch(() => {
      if (active) { galleryCache.clear(); setList(null); setSelectedId(null); setError('Your galleries could not be loaded. Please try again.'); }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [galleryCache, loadClientGalleries, retry]));

  const selected = !loading && list?.galleries.find(gallery => gallery.id === selectedId);
  if (selected && list) return <GalleryPreview key={JSON.stringify([selected.id, selected.driveLink, retry])} gallery={selected}
    cache={galleryCache} favourites={favourites} previewsEnabled={list.previewsEnabled} onBack={() => setSelectedId(null)}
    onRefresh={() => { galleryCache.delete(selected.id); setLoading(true); setRetry(value => value + 1); }} />;

  return <Screen refreshing={loading && list !== null} onRefresh={() => { galleryCache.clear(); setLoading(true); setRetry(value => value + 1); }}>
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
  const { loadGalleryPhotos, loadGalleryPhotoCount, galleryChange, setGalleryFavourite } = useStudio();
  const { colors, ui } = useStudioTheme();
  const [cached, setCached] = useState(() => cache.get(gallery.id));
  const [requestedCount, setRequestedCount] = useState<number | null>(() =>
    previewsEnabled && needsFirstPage(cache.get(gallery.id)) ? drivePhotoPageSize : null);
  const [error, setError] = useState('');
  const [linkError, setLinkError] = useState('');
  const [likeError, setLikeError] = useState('');
  const [optimisticLikes, setOptimisticLikes] = useState<Record<string, boolean>>({});
  const likePending = useRef(new Set<string>());
  const failedTarget = useRef(drivePhotoPageSize);
  const [viewer, setViewer] = useState<{ photos: DrivePhoto[]; startIndex: number }>();
  const [total, setTotal] = useState<number>();
  const lastChange = useRef(galleryChange);
  const loading = requestedCount !== null;
  const shown = cached?.shown ?? 0;
  const photos = cached?.photos.slice(0, shown) ?? [];
  const hasMore = !!cached && (shown < cached.photos.length || !!cached.nextPage);

  useEffect(() => {
    if (previewsEnabled && needsFirstPage(cache.get(gallery.id))) {
      setRequestedCount(current => current ?? drivePhotoPageSize);
    }
  }, [cache, gallery.id, previewsEnabled, drivePhotoPageSize]);

  useEffect(() => {
    if (!previewsEnabled || !loadGalleryPhotoCount) return;
    const controller = new AbortController();
    void loadGalleryPhotoCount(gallery.id, favourites, controller.signal).then(count => {
      if (!controller.signal.aborted) setTotal(count);
    }).catch(() => {});
    return () => controller.abort();
  }, [favourites, gallery.id, galleryChange, loadGalleryPhotoCount, previewsEnabled]);

  useEffect(() => {
    if (!cached) return;
    const available = new Set(cached.photos.map(photo => photo.id));
    setOptimisticLikes(current => {
      const entries = Object.entries(current);
      const remaining = entries.filter(([id]) => available.has(id) || likePending.current.has(id));
      return remaining.length === entries.length ? current : Object.fromEntries(remaining);
    });
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
    setRequestedCount(Math.max(shown, drivePhotoPageSize));
  }, [cache, gallery.id, galleryChange, previewsEnabled, shown]);

  useEffect(() => {
    if (!previewsEnabled || !loadGalleryPhotos || requestedCount === null) return;
    let active = true;
    const target = requestedCount;
    failedTarget.current = target;
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
        const repeatedToken = !!page.nextPageToken && page.nextPageToken === nextPage;
        nextPage = page.nextPageToken;
        if (!active) return;
        const result = { photos: [...items], shown: Math.min(target, items.length), nextPage };
        cache.set(gallery.id, result);
        setCached(result);
        if (repeatedToken) {
          if (items.length < target) throw new Error('Could not load the next set of photos. Please retry.');
          break;
        }
      }
      if (!active) return;
      if (nextPage && items.length < target) throw new Error('Could not finish loading this set of photos. Please retry.');
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

  async function toggleLike(photoId: string) {
    if (likePending.current.has(photoId) || !setGalleryFavourite) return;
    const next = !(optimisticLikes[photoId] ?? favourites);
    likePending.current.add(photoId);
    setLikeError('');
    setOptimisticLikes(current => ({ ...current, [photoId]: next }));
    try {
      await setGalleryFavourite(gallery.id, photoId, next);
    } catch (cause) {
      setOptimisticLikes(current => ({ ...current, [photoId]: !next }));
      setLikeError(cause instanceof Error ? cause.message : 'Could not update this favourite.');
    } finally {
      likePending.current.delete(photoId);
    }
  }

  return <Screen refreshing={false} onRefresh={onRefresh}>
    <Header title={favourites ? 'Favourites' : 'Gallery'} onBack={onBack} right={
      <Pressable accessibilityRole="button" accessibilityLabel="Open in Google Drive" onPress={openDrive}
        style={({ pressed }) => [styles.driveAction, { backgroundColor: colors.mint, borderColor: colors.border }, pressed && styles.pressed]}>
        <MaterialCommunityIcons name="google-drive" size={23} color={colors.primaryDark} />
      </Pressable>
    } />
    {!!linkError && <ErrorMessage message={linkError} />}
    {!!likeError && <ErrorMessage message={likeError} />}
    {!previewsEnabled && <Text style={ui.body}>Open this gallery in Drive to view your photos.</Text>}
    {!!error && <View style={ui.gap}><ErrorMessage message={error} />
      <Button title="Retry previews" variant="ghost" onPress={() => setRequestedCount(failedTarget.current)} />
    </View>}
    {previewsEnabled && !loading && !error && !photos.length && <EmptyState icon={favourites ? 'heart' : 'image'}
      title={favourites ? 'No favourites yet' : 'No photo previews'}
      description={favourites ? 'Open a photo and tap the heart to select it.' : 'Open the gallery in Google Drive to check its contents.'} />}
    <View style={styles.grid}>
      {loading && !photos.length && Array.from({ length: drivePhotoPageSize }, (_, index) => (
        <View key={index} style={[styles.tile, styles.skeleton, { backgroundColor: colors.mint, borderColor: colors.border }]} />
      ))}
      {photos.map((photo, index) => <View key={photo.id} style={[styles.tile, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Open photo ${index + 1}`}
          style={({ pressed }) => [styles.openPhoto, pressed && styles.pressed]}
          onPress={() => setViewer({ photos, startIndex: index })}>
          <PhotoTile galleryId={gallery.id} photo={photo} />
        </Pressable>
        {setGalleryFavourite && <Pressable accessibilityRole="button"
          accessibilityLabel={`${favourites ? 'Remove from favourites' : 'Like'} photo ${index + 1}`}
          accessibilityState={{ selected: optimisticLikes[photo.id] ?? favourites, busy: likePending.current.has(photo.id) }}
          style={styles.likeButton} onPress={() => void toggleLike(photo.id)}>
          <HeartIcon size={19} filled={optimisticLikes[photo.id] ?? favourites} />
        </Pressable>}
      </View>)}
    </View>
    {loading ? <ActivityIndicator color={colors.primary} accessibilityLabel="Loading Drive photos" />
      : hasMore && !error ? <Button title="Load more" icon="chevron-down" variant="ghost" onPress={() => setRequestedCount(shown + drivePhotoPageSize)} /> : null}
    {viewer && <ClientPhotoViewer galleryId={gallery.id} photos={viewer.photos} startIndex={viewer.startIndex}
      favourites={favourites} total={total} hasMore={hasMore} loading={loading} pageError={error}
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
    {source && !failed && <Image source={source} cachePolicy="memory-disk" contentFit="cover" transition={180}
      onError={() => setFailed(true)} style={StyleSheet.absoluteFill} />}
  </View>;
}

const styles = StyleSheet.create({
  driveAction: { width: 46, height: 46, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  tile: { width: '48.5%', aspectRatio: 4 / 5, borderRadius: 19, borderWidth: 1, overflow: 'hidden' },
  skeleton: { opacity: 0.7 },
  openPhoto: { flex: 1 },
  pressed: { opacity: 0.8 },
  preview: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  likeButton: { position: 'absolute', right: 6, bottom: 6, width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#10171BCF', borderColor: '#FFFFFF50', borderWidth: 1 },
});
