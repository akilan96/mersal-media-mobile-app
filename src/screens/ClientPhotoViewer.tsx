import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import type { DrivePhoto } from '../domain/types';
import { useStudio } from '../state/StudioProvider';
import { ErrorMessage } from '../components/ui';

type ViewerProps = {
  galleryId: string; photos: DrivePhoto[]; startIndex: number; favourites: boolean;
  hasMore: boolean; loading: boolean; pageError: string;
  onLoadMore: () => void; onClose: () => void;
};

export function ClientPhotoViewer({ galleryId, photos, startIndex, favourites, hasMore, loading, pageError, onLoadMore, onClose }: ViewerProps) {
  const { setGalleryFavourite } = useStudio();
  const [index, setIndex] = useState(startIndex);
  const [height, setHeight] = useState(0);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const lastPrefetch = useRef(-1);
  const heart = useRef(new Animated.Value(0)).current;
  const [heartPhoto, setHeartPhoto] = useState<string>();
  const list = useRef<FlatList<DrivePhoto>>(null);
  const photo = photos[index];
  const saved = selected[photo.id] ?? favourites;

  useEffect(() => {
    if (index < photos.length - 1 || !hasMore || loading || pageError || lastPrefetch.current === index) return;
    lastPrefetch.current = index;
    onLoadMore();
  }, [hasMore, index, loading, onLoadMore, pageError, photos.length]);

  function animateHeart(id: string) {
    setHeartPhoto(id);
    heart.stopAnimation();
    heart.setValue(0);
    Animated.sequence([
      Animated.spring(heart, { toValue: 1, speed: 26, bounciness: 12, useNativeDriver: true }),
      Animated.delay(300),
      Animated.timing(heart, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start();
  }

  async function updateFavourite(item: DrivePhoto, addOnly = false) {
    const previous = selected[item.id] ?? favourites;
    if (addOnly && previous) {
      animateHeart(item.id);
      return;
    }
    if (inFlight.current || !setGalleryFavourite) return;
    const next = !previous;
    inFlight.current = true;
    setPending(item.id);
    setError('');
    setSelected(value => ({ ...value, [item.id]: next }));
    if (next) animateHeart(item.id);
    try {
      await setGalleryFavourite(galleryId, item.id, next);
    } catch (cause) {
      setSelected(value => ({ ...value, [item.id]: previous }));
      heart.stopAnimation();
      heart.setValue(0);
      setError(cause instanceof Error ? cause.message : 'Could not update this favourite.');
    } finally {
      inFlight.current = false;
      setPending(undefined);
    }
  }

  const viewability = useRef({
    config: { itemVisiblePercentThreshold: 65 },
    update: ({ viewableItems }: { viewableItems: { index?: number | null }[] }) => {
      const next = viewableItems[0]?.index;
      if (next != null) {
        setIndex(next);
        setError('');
      }
    },
  }).current;

  return <Modal animationType="fade" onRequestClose={onClose}>
    <SafeAreaView style={styles.viewer}>
      <View style={styles.bar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close photo" style={styles.button} onPress={onClose}>
          <Feather name="x" color="white" size={25} />
        </Pressable>
        <Text numberOfLines={1} style={styles.title}>{photo.name}</Text>
        <Text style={styles.position}>{index + 1} / {photos.length}{hasMore ? '+' : ''}</Text>
      </View>
      <View style={styles.pager} onLayout={event => setHeight(event.nativeEvent.layout.height)}>
        {height > 0 && <FlatList
          key={height} ref={list} data={photos} keyExtractor={item => item.id}
          initialScrollIndex={index} initialNumToRender={2} windowSize={3} maxToRenderPerBatch={2}
          getItemLayout={(_, itemIndex) => ({ length: height, offset: height * itemIndex, index: itemIndex })}
          pagingEnabled showsVerticalScrollIndicator={false}
          viewabilityConfig={viewability.config} onViewableItemsChanged={viewability.update}
          renderItem={({ item, index: itemIndex }) => <PhotoPage galleryId={galleryId} photo={item} height={height}
            active={itemIndex === index} onDoubleTap={() => void updateFavourite(item, true)}
            heart={heartPhoto === item.id ? heart : undefined} />}
        />}
        <View pointerEvents="box-none" style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel={saved ? 'Remove from favourites' : 'Add to favourites'}
            accessibilityState={{ selected: saved, busy: pending === photo.id, disabled: !!pending }}
            disabled={!!pending} style={styles.favouriteButton} onPress={() => void updateFavourite(photo)}>
            <Text style={[styles.heartIcon, saved && styles.selected]}>{saved ? '♥' : '♡'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Next photo"
            disabled={index === photos.length - 1 && (!hasMore || loading)} style={styles.button}
            onPress={() => {
              if (index < photos.length - 1) list.current?.scrollToIndex({ index: index + 1 });
              else onLoadMore();
            }}>
            {loading && index === photos.length - 1 ? <ActivityIndicator color="white" /> : <Feather name="chevron-down" color="white" size={24} />}
          </Pressable>
        </View>
        {!!(error || pageError) && <View style={styles.error}><ErrorMessage message={error || pageError} /></View>}
      </View>
    </SafeAreaView>
  </Modal>;
}

function PhotoPage({ galleryId, photo, height, active, heart, onDoubleTap }: {
  galleryId: string; photo: DrivePhoto; height: number; active: boolean;
  heart?: Animated.Value; onDoubleTap: () => void;
}) {
  const { galleryThumbnail } = useStudio();
  const small = galleryThumbnail?.(galleryId, photo.id, false, photo.name);
  const large = galleryThumbnail?.(galleryId, photo.id, true, photo.name);
  const [smallStatus, setSmallStatus] = useState<'loading' | 'loaded' | 'failed'>('loading');
  const [largeStatus, setLargeStatus] = useState<'loading' | 'loaded' | 'failed'>('loading');
  const [loadLarge, setLoadLarge] = useState(false);
  const lastTap = useRef(0);

  useEffect(() => {
    if (active && smallStatus !== 'loading') setLoadLarge(true);
  }, [active, smallStatus]);

  return <Pressable accessible={false} style={[styles.photo, { height }]} onPress={() => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      lastTap.current = 0;
      onDoubleTap();
    } else lastTap.current = now;
  }}>
    {small && smallStatus !== 'failed' && <Image source={small} cachePolicy="memory-disk" contentFit="contain"
      style={StyleSheet.absoluteFill} priority={active ? 'high' : 'normal'}
      onLoad={() => setSmallStatus('loaded')} onError={() => setSmallStatus('failed')} />}
    {loadLarge && large && largeStatus !== 'failed' && <Image source={large} cachePolicy="disk" contentFit="contain"
      style={StyleSheet.absoluteFill} transition={150}
      onLoad={() => setLargeStatus('loaded')} onError={() => setLargeStatus('failed')} />}
    {smallStatus !== 'loaded' && largeStatus !== 'loaded' && (
      !small || (smallStatus === 'failed' && largeStatus === 'failed')
        ? <Text style={styles.title}>Preview unavailable</Text>
        : <ActivityIndicator color="white" accessibilityLabel="Loading photo" />
    )}
    {heart && <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.heartOverlay, {
      opacity: heart.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' }),
      transform: [{ scale: heart }],
    }]}><Text style={styles.bigHeart}>♥</Text></Animated.View>}
  </Pressable>;
}

const styles = StyleSheet.create({
  viewer: { flex: 1, backgroundColor: '#101316' },
  bar: { flexDirection: 'row', alignItems: 'center', paddingRight: 16, gap: 8 },
  button: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, color: 'white', fontSize: 16, textAlign: 'center' },
  position: { color: '#d8dadd', fontSize: 13 },
  pager: { flex: 1 },
  photo: { justifyContent: 'center', alignItems: 'center' },
  actions: { position: 'absolute', right: 14, bottom: 18, alignItems: 'center', gap: 4 },
  favouriteButton: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#15181bd9', alignItems: 'center', justifyContent: 'center' },
  heartIcon: { fontSize: 36, color: 'white', includeFontPadding: false },
  selected: { color: '#ff527a' },
  heartOverlay: { alignItems: 'center', justifyContent: 'center' },
  bigHeart: { color: '#ff527a', fontSize: 115, textShadowColor: '#15181b88', textShadowRadius: 16 },
  error: { position: 'absolute', top: 12, left: 12, right: 12 },
});
