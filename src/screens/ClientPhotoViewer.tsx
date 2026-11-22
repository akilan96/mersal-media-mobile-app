import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Modal, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import Svg, { Path } from 'react-native-svg';
import type { DrivePhoto } from '../domain/types';
import { useStudio } from '../state/StudioProvider';
import { ErrorMessage } from '../components/ui';

type ViewerProps = {
  galleryId: string; photos: DrivePhoto[]; startIndex: number; favourites: boolean;
  total?: number;
  hasMore: boolean; loading: boolean; pageError: string;
  onLoadMore: () => void; onClose: () => void;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function ClientPhotoViewer({ galleryId, photos, startIndex, favourites, total, hasMore, loading, pageError, onLoadMore, onClose }: ViewerProps) {
  const { setGalleryFavourite } = useStudio();
  const [index, setIndex] = useState(startIndex);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const lastPrefetch = useRef(-1);
  const heart = useRef(new Animated.Value(0)).current;
  const [heartPhoto, setHeartPhoto] = useState<string>();
  const photo = photos[index];
  const saved = selected[photo.id] ?? favourites;
  const atEnd = index === photos.length - 1;
  const displayedTotal = total === undefined && (hasMore || loading) ? undefined : Math.max(photos.length, total ?? 0);
  const advanceFrom = useRef<{ index: number; axis: 'x' | 'y' } | undefined>(undefined);
  const viewport = useRef({ width: 0, height: 0 });
  const zoom = useRef({ scale: 1, x: 0, y: 0 });
  const gesture = useRef({ pinched: false, distance: 0, startScale: 1, x: 0, y: 0 });
  const [zoomScale] = useState(() => new Animated.Value(1));
  const [zoomX] = useState(() => new Animated.Value(0));
  const [zoomY] = useState(() => new Animated.Value(0));
  const [slideX] = useState(() => new Animated.Value(0));
  const [slideY] = useState(() => new Animated.Value(0));

  function settleSlide() {
    Animated.parallel([slideX, slideY].map(value =>
      Animated.timing(value, { toValue: 0, duration: 150, useNativeDriver: true }),
    )).start();
  }

  function applyZoom(scale: number, x: number, y: number) {
    const maxX = viewport.current.width * (scale - 1) / 2;
    const maxY = viewport.current.height * (scale - 1) / 2;
    zoom.current = { scale, x: clamp(x, -maxX, maxX), y: clamp(y, -maxY, maxY) };
    zoomScale.setValue(scale);
    zoomX.setValue(zoom.current.x);
    zoomY.setValue(zoom.current.y);
  }

  const stepRef = useRef<(direction: number, axis?: 'x' | 'y') => void>(() => {});
  stepRef.current = (direction, axis = 'x') => {
    const next = index + direction;
    advanceFrom.current = undefined;
    if (next >= 0 && next < photos.length) {
      applyZoom(1, 0, 0);
      slideX.stopAnimation();
      slideY.stopAnimation();
      slideX.setValue(axis === 'x' ? direction * 65 : 0);
      slideY.setValue(axis === 'y' ? direction * 65 : 0);
      setIndex(next);
      setError('');
      Animated.timing(axis === 'x' ? slideX : slideY, { toValue: 0, duration: 190, useNativeDriver: true }).start();
    } else {
      settleSlide();
      if (direction > 0 && (hasMore || loading)) {
        advanceFrom.current = { index, axis };
        if (!loading) onLoadMore();
      }
    }
  };
  const [photoGestures] = useState(() => PanResponder.create({
    onStartShouldSetPanResponderCapture: event => event.nativeEvent.touches.length > 1,
    onMoveShouldSetPanResponderCapture: (_, { dx, dy, numberActiveTouches }) =>
      numberActiveTouches > 1 || Math.max(Math.abs(dx), Math.abs(dy)) > 12,
    onPanResponderGrant: event => {
      slideX.stopAnimation();
      slideY.stopAnimation();
      slideX.setValue(0);
      slideY.setValue(0);
      const [first, second] = event.nativeEvent.touches;
      gesture.current = {
        pinched: !!second,
        distance: second ? Math.hypot(first.pageX - second.pageX, first.pageY - second.pageY) : 0,
        startScale: zoom.current.scale, x: zoom.current.x, y: zoom.current.y,
      };
    },
    onPanResponderMove: (event, { dx, dy }) => {
      const [first, second] = event.nativeEvent.touches;
      const state = gesture.current;
      if (second) {
        const distance = Math.hypot(first.pageX - second.pageX, first.pageY - second.pageY);
        if (!state.distance) {
          state.distance = distance;
          state.startScale = zoom.current.scale;
          state.x = zoom.current.x;
          state.y = zoom.current.y;
          slideX.setValue(0);
          slideY.setValue(0);
        }
        state.pinched = true;
        if (state.distance > 0) applyZoom(clamp(state.startScale * distance / state.distance, 1, 4), state.x, state.y);
      } else if (!state.pinched && zoom.current.scale > 1) {
        applyZoom(zoom.current.scale, state.x + dx, state.y + dy);
      } else if (!state.pinched) {
        const horizontal = Math.abs(dx) > Math.abs(dy);
        slideX.setValue(horizontal ? clamp(dx * 0.35, -65, 65) : 0);
        slideY.setValue(horizontal ? 0 : clamp(dy * 0.35, -65, 65));
      }
    },
    onPanResponderRelease: (_, { dx, dy, vx, vy }) => {
      if (gesture.current.pinched || zoom.current.scale > 1) return;
      const horizontal = Math.abs(dx) > Math.abs(dy);
      const distance = horizontal ? dx : dy;
      const velocity = horizontal ? vx : vy;
      if (Math.abs(distance) >= 45 || (Math.abs(distance) >= 22 && Math.abs(velocity) >= 0.5)) {
        stepRef.current(distance < 0 ? 1 : -1, horizontal ? 'x' : 'y');
      } else settleSlide();
    },
    onPanResponderTerminate: settleSlide,
  }));

  useEffect(() => {
    const waiting = advanceFrom.current;
    if (waiting?.index === index && index < photos.length - 1) stepRef.current(1, waiting.axis);
  }, [index, photos.length]);

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

  return <Modal animationType="fade" onRequestClose={onClose}>
    <SafeAreaView style={styles.viewer}>
      <View style={styles.bar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close photo" style={styles.button} onPress={onClose}>
          <Feather name="arrow-left" color="#F3F8FA" size={23} />
        </Pressable>
        <View style={styles.galleryIcon}><Feather name="camera" color="#A8EEE0" size={17} /></View>
        <Text numberOfLines={1} style={styles.title}>{favourites ? 'Favourites' : 'Photos'}</Text>
      </View>
      <View style={styles.pager} {...photoGestures.panHandlers} onLayout={event => {
        viewport.current = event.nativeEvent.layout;
      }}>
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX: slideX }, { translateY: slideY }] }]}>
          <PhotoPage key={photo.id} galleryId={galleryId} photo={photo} onDoubleTap={() => void updateFavourite(photo, true)}
            zoom={{ zoomScale, zoomX, zoomY }} heart={heartPhoto === photo.id ? heart : undefined} />
        </Animated.View>
        <View pointerEvents="none" style={styles.position} accessible
          accessibilityLabel={displayedTotal === undefined ? `Photo ${index + 1}` : `Photo ${index + 1} of ${displayedTotal}`}>
          <Text style={styles.positionText}>{displayedTotal === undefined ? `Photo ${index + 1}` : `${index + 1} / ${displayedTotal}`}</Text>
        </View>
        {!!(error || pageError) && <View style={styles.error}><ErrorMessage message={error || pageError} /></View>}
      </View>
      <View style={styles.toolbar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous photo" disabled={index === 0}
          style={[styles.button, index === 0 && styles.disabled]} onPress={() => stepRef.current(-1)}>
          <Feather name="arrow-left" color="#F3F8FA" size={21} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={saved ? 'Remove from favourites' : 'Add to favourites'}
          accessibilityState={{ selected: saved, busy: pending === photo.id, disabled: !!pending }}
          disabled={!!pending} style={[styles.favouriteButton, saved && styles.favouriteSaved]} onPress={() => void updateFavourite(photo)}>
          <HeartIcon size={21} filled={saved} />
          <Text style={[styles.favouriteLabel, saved && styles.selected]}>{saved ? 'Favourited' : 'Favourite'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Next photo"
          disabled={atEnd && (!hasMore || loading)} style={[styles.button, atEnd && !hasMore && !loading && styles.disabled]}
          onPress={() => stepRef.current(1)}>
          {atEnd && loading ? <ActivityIndicator color="#A8EEE0" /> : <Feather name="arrow-right" color="#F3F8FA" size={21} />}
        </Pressable>
      </View>
    </SafeAreaView>
  </Modal>;
}

function PhotoPage({ galleryId, photo, heart, zoom, onDoubleTap }: {
  galleryId: string; photo: DrivePhoto;
  heart?: Animated.Value; onDoubleTap: () => void;
  zoom?: { zoomScale: Animated.Value; zoomX: Animated.Value; zoomY: Animated.Value };
}) {
  const { galleryThumbnail } = useStudio();
  const small = galleryThumbnail?.(galleryId, photo.id, false, photo.name);
  const large = galleryThumbnail?.(galleryId, photo.id, true, photo.name);
  const [smallStatus, setSmallStatus] = useState<'loading' | 'loaded' | 'failed'>('loading');
  const [largeStatus, setLargeStatus] = useState<'loading' | 'loaded' | 'failed'>('loading');
  const [loadLarge, setLoadLarge] = useState(false);
  const lastTap = useRef(0);

  useEffect(() => {
    if (smallStatus !== 'loading') setLoadLarge(true);
  }, [smallStatus]);

  return <Pressable accessible={false} style={styles.photo} onPress={() => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      lastTap.current = 0;
      onDoubleTap();
    } else lastTap.current = now;
  }}>
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, zoom && {
      transform: [{ translateX: zoom.zoomX }, { translateY: zoom.zoomY }, { scale: zoom.zoomScale }],
    }]}>
      {small && smallStatus !== 'failed' && <Image source={small} cachePolicy="memory-disk" contentFit="contain"
        style={StyleSheet.absoluteFill} priority="high"
        onLoad={() => setSmallStatus('loaded')} onError={() => setSmallStatus('failed')} />}
      {loadLarge && large && largeStatus !== 'failed' && <Image source={large} cachePolicy="disk" contentFit="contain"
        style={StyleSheet.absoluteFill} transition={150}
        onLoad={() => setLargeStatus('loaded')} onError={() => setLargeStatus('failed')} />}
    </Animated.View>
    {smallStatus !== 'loaded' && largeStatus !== 'loaded' && (
      !small || (smallStatus === 'failed' && largeStatus === 'failed')
        ? <Text style={styles.title}>Preview unavailable</Text>
        : <ActivityIndicator color="white" accessibilityLabel="Loading photo" />
    )}
    {heart && <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.heartOverlay, {
      opacity: heart.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' }),
      transform: [{ scale: heart }],
    }]}><HeartIcon size={105} filled /></Animated.View>}
  </Pressable>;
}

export function HeartIcon({ size, filled }: { size: number; filled: boolean }) {
  const color = filled ? '#FF527A' : '#A8EEE0';
  return <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
    <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z"
      fill={filled ? color : 'none'} stroke={color} strokeWidth={1.75} strokeLinejoin="round" />
  </Svg>;
}

const styles = StyleSheet.create({
  viewer: { flex: 1, backgroundColor: '#10171B' },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 12 },
  button: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#1E2B31', alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.34 },
  title: { flex: 1, color: '#F3F8FA', fontSize: 15, fontWeight: '600' },
  galleryIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1A302F', borderColor: '#38615D', borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  position: { position: 'absolute', top: 14, right: 14, backgroundColor: '#080C0ED9', borderColor: '#FFFFFF35', borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 6 },
  positionText: { color: '#F3FFFC', fontWeight: '700', fontSize: 13, fontVariant: ['tabular-nums'] },
  pager: { flex: 1, backgroundColor: '#080C0E', overflow: 'hidden' },
  photo: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, gap: 12 },
  favouriteButton: { flexDirection: 'row', minHeight: 48, paddingHorizontal: 18, gap: 8, borderRadius: 24, backgroundColor: '#1A302F', alignItems: 'center', justifyContent: 'center' },
  favouriteSaved: { backgroundColor: '#38242F' },
  favouriteLabel: { color: '#A8EEE0', fontSize: 14, fontWeight: '600' },
  selected: { color: '#ff527a' },
  heartOverlay: { alignItems: 'center', justifyContent: 'center' },
  error: { position: 'absolute', top: 12, left: 12, right: 12 },
});
