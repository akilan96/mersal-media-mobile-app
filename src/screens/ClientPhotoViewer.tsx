import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import Svg, { Path } from 'react-native-svg';
import { StatusBar } from 'expo-status-bar';
import { useAudioPlayer } from 'expo-audio';
import type { DrivePhoto } from '../domain/types';
import { useStudio } from '../state/StudioProvider';
import { ErrorMessage } from '../components/ui';
import { useStudioTheme } from '../theme';

type ViewerProps = {
  galleryId: string; photos: DrivePhoto[]; startIndex: number; favourites: boolean;
  total?: number;
  hasMore: boolean; loading: boolean; pageError: string;
  onLoadMore: () => void; onClose: () => void;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const heartParticles = [
  [-0.39, -0.38], [-0.24, -0.29], [-0.07, -0.45], [0.12, -0.33], [0.31, -0.43], [0.42, -0.24],
  [-0.41, -0.07], [-0.20, -0.13], [0.22, -0.09], [0.40, 0.02],
  [-0.38, 0.20], [-0.19, 0.11], [0.16, 0.14], [0.33, 0.23],
  [-0.31, 0.40], [-0.08, 0.33], [0.12, 0.41], [0.40, 0.43],
];
const heartReds = ['#E11D48', '#BE123C', '#FDA4AF', '#FB5274'];

export function ClientPhotoViewer({ galleryId, photos, startIndex, favourites, total, hasMore, loading, pageError, onLoadMore, onClose }: ViewerProps) {
  const { setGalleryFavourite } = useStudio();
  const { colors, dark } = useStudioTheme();
  const likeSound = useAudioPlayer(require('../../assets/audio/like-pop.wav'));
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
    Animated.timing(heart, { toValue: 1, duration: 890, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
      if (finished) setHeartPhoto(current => current === id ? undefined : current);
    });
    void likeSound.seekTo(0).then(() => likeSound.play()).catch(() => {});
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
      setHeartPhoto(undefined);
      setError(cause instanceof Error ? cause.message : 'Could not update this favourite.');
    } finally {
      inFlight.current = false;
      setPending(undefined);
    }
  }

  return <Modal animationType="fade" onRequestClose={onClose}>
    <SafeAreaView style={[styles.viewer, { backgroundColor: colors.background }]}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <View style={styles.header}>
        <View style={styles.bar}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close photo"
            style={[styles.backButton, { backgroundColor: colors.mint }]} onPress={onClose}>
            <Feather name="arrow-left" color={colors.primaryDark} size={22} />
          </Pressable>
          <View style={styles.headerText}>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>{favourites ? 'Favourites' : 'Photos'}</Text>
            <View style={styles.subtitle}>
              <Text style={[styles.subtitleText, { color: colors.muted }]}>{favourites ? 'Selected photos' : 'All photos'}</Text>
            </View>
          </View>
          <View style={[styles.position, { backgroundColor: colors.mint, borderColor: colors.border }]} accessible
            accessibilityLabel={displayedTotal === undefined ? `Photo ${index + 1}` : `Photo ${index + 1} of ${displayedTotal}`}
            accessibilityActions={[
              ...(index > 0 ? [{ name: 'decrement', label: 'Previous photo' }] : []),
              ...(!atEnd || hasMore ? [{ name: 'increment', label: 'Next photo' }] : []),
            ]}
            onAccessibilityAction={({ nativeEvent }) => stepRef.current(nativeEvent.actionName === 'increment' ? 1 : -1)}>
            <Feather name="image" color={colors.primaryDark} size={15} />
            <Text style={[styles.positionText, { color: colors.primaryDark }]}>{displayedTotal === undefined ? `Photo ${index + 1}` : `${index + 1} / ${displayedTotal}`}</Text>
          </View>
        </View>
      </View>
      <View style={[styles.pager, { backgroundColor: colors.input, borderColor: colors.border }]} {...photoGestures.panHandlers} onLayout={event => {
        viewport.current = event.nativeEvent.layout;
      }}>
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX: slideX }, { translateY: slideY }] }]}>
          <PhotoPage key={photo.id} galleryId={galleryId} photo={photo} onDoubleTap={() => void updateFavourite(photo, true)}
            zoom={{ zoomScale, zoomX, zoomY }}
            burst={heartPhoto === photo.id ? { progress: heart, ...viewport.current } : undefined} />
        </Animated.View>
        {!!(error || pageError) && <View style={styles.error}>
          <ErrorMessage message={error || pageError} />
          {!!pageError && !loading && <Pressable accessibilityRole="button" style={[styles.retry, { backgroundColor: colors.card }]} onPress={onLoadMore}>
            <Text style={[styles.retryText, { color: colors.primaryDark }]}>Retry loading photos</Text>
          </Pressable>}
        </View>}
        {atEnd && loading && <ActivityIndicator style={styles.pageLoading} color={colors.primary} accessibilityLabel="Loading more photos" />}
      </View>
      <View style={styles.footer}>
        <Pressable accessibilityRole="button" accessibilityLabel={saved ? 'Remove from favourites' : 'Add to favourites'}
          accessibilityState={{ selected: saved, busy: pending === photo.id, disabled: !!pending }}
          disabled={!!pending} style={({ pressed }) => [styles.favouriteButton,
            { backgroundColor: saved ? colors.errorBg : colors.card, borderColor: saved ? colors.error : colors.border }, pressed && styles.pressed]}
          onPress={() => void updateFavourite(photo)}>
          <HeartIcon size={25} filled={saved} color={colors.error} />
        </Pressable>
      </View>
    </SafeAreaView>
  </Modal>;
}

type Burst = { progress: Animated.Value; width: number; height: number };

function PhotoPage({ galleryId, photo, burst, zoom, onDoubleTap }: {
  galleryId: string; photo: DrivePhoto;
  burst?: Burst; onDoubleTap: () => void;
  zoom?: { zoomScale: Animated.Value; zoomX: Animated.Value; zoomY: Animated.Value };
}) {
  const { galleryThumbnail } = useStudio();
  const { colors } = useStudioTheme();
  const small = galleryThumbnail?.(galleryId, photo.id, false, photo.name);
  const large = galleryThumbnail?.(galleryId, photo.id, true, photo.name);
  const [smallStatus, setSmallStatus] = useState<'loading' | 'loaded' | 'failed'>('loading');
  const [largeStatus, setLargeStatus] = useState<'loading' | 'loaded' | 'failed'>('loading');
  const [loadLarge, setLoadLarge] = useState(false);
  const [showDetailLoader, setShowDetailLoader] = useState(false);
  const [landscape, setLandscape] = useState(false);
  const lastTap = useRef(0);
  const loadingDetail = !!large && smallStatus === 'loaded' && largeStatus === 'loading';
  const loadingInitial = !!small && largeStatus !== 'loaded' && (smallStatus === 'loading' || largeStatus === 'loading');

  useEffect(() => {
    if (smallStatus !== 'loading') setLoadLarge(true);
  }, [smallStatus]);

  useEffect(() => {
    if (!loadingDetail) return;
    const delay = setTimeout(() => setShowDetailLoader(true), 250);
    return () => clearTimeout(delay);
  }, [loadingDetail]);

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
      {small && smallStatus !== 'failed' && <Image source={small} cachePolicy="memory-disk" contentFit={landscape ? 'contain' : 'cover'}
        style={StyleSheet.absoluteFill} priority="high"
        onLoad={({ source }) => { setLandscape(source.width > source.height); setSmallStatus('loaded'); }}
        onError={() => setSmallStatus('failed')} />}
      {loadLarge && large && largeStatus !== 'failed' && <Image source={large} cachePolicy="disk" contentFit={landscape ? 'contain' : 'cover'}
        style={StyleSheet.absoluteFill} transition={150}
        onLoad={({ source }) => { setLandscape(source.width > source.height); setLargeStatus('loaded'); }}
        onError={() => setLargeStatus('failed')} />}
    </Animated.View>
    {smallStatus !== 'loaded' && largeStatus !== 'loaded' && (
      !small || (smallStatus === 'failed' && largeStatus === 'failed')
        ? <Text style={[styles.subtitleText, { color: colors.muted }]}>Preview unavailable</Text>
        : null
    )}
    {(smallStatus === 'loaded' ? loadingDetail && showDetailLoader : loadingInitial) && (
      <View pointerEvents="none" accessibilityLiveRegion="polite" style={[
        styles.photoLoader,
        { backgroundColor: colors.card, borderColor: colors.border },
        smallStatus === 'loaded' && styles.detailLoader,
      ]}>
        <View style={[styles.loaderIcon, { backgroundColor: colors.mint }]}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
        <Text style={[styles.loaderText, { color: colors.text }]}>
          {smallStatus === 'loaded' ? 'Loading HD image' : 'Loading photo'}
        </Text>
      </View>
    )}
    {burst && <HeartBurst {...burst} />}
  </Pressable>;
}

function HeartBurst({ progress, width, height }: Burst) {
  const opacity = progress.interpolate({ inputRange: [0, 0.13, 0.72, 1], outputRange: [0, 1, 1, 0], extrapolate: 'clamp' });
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.heartOverlay, { opacity }]}>
    {heartParticles.map(([x, y], index) => (
      <Animated.View key={index} style={{
        position: 'absolute',
        transform: [
          { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, width * x] }) },
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, height * y] }) },
          { rotate: `${x * 70}deg` },
          { scale: progress.interpolate({ inputRange: [0, 0.27, 1], outputRange: [0.25, 1.16, 0.85] }) },
        ],
      }}>
        <HeartIcon size={17 + (index % 5) * 6} filled color={heartReds[index % heartReds.length]} />
      </Animated.View>
    ))}
    <Animated.View style={{ transform: [{
      scale: progress.interpolate({ inputRange: [0, 0.31, 0.66, 1], outputRange: [0.35, 1.15, 0.95, 0.7] }),
    }] }}><HeartIcon size={82} filled color="#E11D48" /></Animated.View>
  </Animated.View>;
}

export function HeartIcon({ size, filled, color = filled ? '#FB5274' : '#FDA4AF' }: { size: number; filled: boolean; color?: string }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
    <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z"
      fill={filled ? color : 'none'} stroke={color} strokeWidth={1.75} strokeLinejoin="round" />
  </Svg>;
}

const styles = StyleSheet.create({
  viewer: { flex: 1 },
  header: { paddingBottom: 8 },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, gap: 10 },
  backButton: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, gap: 2 },
  title: { fontSize: 22, fontFamily: 'InterExtraBold', letterSpacing: -0.5 },
  subtitle: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  subtitleText: { fontSize: 12, fontFamily: 'InterMedium' },
  position: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 36, borderWidth: 1, borderRadius: 13, paddingHorizontal: 10 },
  positionText: { fontFamily: 'InterBold', fontSize: 13, fontVariant: ['tabular-nums'] },
  pager: { flex: 1, marginHorizontal: 10, borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  photo: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  photoLoader: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, borderWidth: 1, padding: 5, paddingRight: 12 },
  detailLoader: { position: 'absolute', right: 10, bottom: 10 },
  loaderIcon: { width: 29, height: 29, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  loaderText: { fontFamily: 'InterSemiBold', fontSize: 12 },
  footer: { paddingTop: 9, paddingBottom: 6, alignItems: 'center' },
  favouriteButton: { width: 53, height: 53, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.85, transform: [{ scale: 0.96 }] },
  heartOverlay: { alignItems: 'center', justifyContent: 'center' },
  error: { position: 'absolute', top: 12, left: 12, right: 12 },
  retry: { alignSelf: 'flex-start', marginTop: 8, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10 },
  retryText: { fontFamily: 'InterSemiBold' },
  pageLoading: { position: 'absolute', top: 14, right: 14 },
});
