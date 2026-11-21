import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useAudioPlayer } from 'expo-audio';
type ToastOptions = { sound?: boolean };
const ToastContext = createContext<(message: string, options?: ToastOptions) => void>(() => {});

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { top, left, right } = useSafeAreaInsets();
  const player = useAudioPlayer(require('../../assets/audio/mersal_notification.mp3'));
  const [toast, setToast] = useState<{ message: string } | null>(null);
  const [reduceMotion, setReduceMotion] = useState(true);
  const progress = useRef(new Animated.Value(0)).current;
  const countdown = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(enabled => {
      if (active) setReduceMotion(enabled);
    }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { active = false; subscription.remove(); };
  }, []);

  const showToast = useCallback((message: string, options?: ToastOptions) => {
    setToast({ message });
    if (options?.sound) {
      // Playback failure should never hide a successful save confirmation.
      void player.seekTo(0).then(() => player.play()).catch(() => {});
    }
  }, [player]);

  useEffect(() => {
    if (!toast) return;
    progress.setValue(reduceMotion ? 1 : 0);
    countdown.setValue(1);
    const entry = Animated.timing(progress, {
      toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    });
    const timeRemaining = Animated.timing(countdown, {
      toValue: 0, duration: 3500, easing: Easing.linear, useNativeDriver: true,
    });
    if (!reduceMotion) {
      entry.start();
      timeRemaining.start();
    }
    const exit = Animated.timing(progress, {
      toValue: 0, duration: 140, easing: Easing.in(Easing.cubic), useNativeDriver: true,
    });
    const dismiss = () => setToast(current => current === toast ? null : current);
    const timer = setTimeout(() => {
      if (reduceMotion) dismiss();
      else exit.start(({ finished }) => { if (finished) dismiss(); });
    }, 3500);
    return () => { clearTimeout(timer); entry.stop(); exit.stop(); timeRemaining.stop(); };
  }, [toast, progress, countdown, reduceMotion]);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {toast && (
        <View pointerEvents="box-none"
          style={[styles.overlay, { top: top + 12, left: left + 16, right: right + 16 }]}>
          <Animated.View style={[
            styles.toast,
            { opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }] },
          ]}>
            <View style={styles.banner}>
              <View style={styles.row}>
                <Feather name="check-circle" size={32} color="#225023" />
                <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.message}>
                  {toast.message}
                </Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Dismiss confirmation" hitSlop={7}
                  onPress={() => setToast(null)} style={styles.dismiss}>
                  <Feather name="x" size={18} color="#225023" />
                </Pressable>
              </View>
              {!reduceMotion && <Animated.View pointerEvents="none" style={[styles.countdown, { transform: [{ scaleX: countdown }] }]} />}
            </View>
          </Animated.View>
        </View>
      )}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', alignItems: 'center', zIndex: 100, elevation: 12 },
  toast: {
    width: '100%', maxWidth: 420, borderRadius: 12, backgroundColor: '#A7D985',
    shadowColor: '#193B24', shadowOpacity: 0.24, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 5,
  },
  banner: { borderRadius: 12, overflow: 'hidden' },
  row: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  message: { flex: 1, fontSize: 16, lineHeight: 22, color: '#173719', fontFamily: 'InterSemiBold' },
  dismiss: { width: 30, height: 34, alignItems: 'center', justifyContent: 'center' },
  countdown: { height: 4, backgroundColor: '#51853C', transformOrigin: 'left center' },
});
