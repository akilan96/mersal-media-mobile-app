import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useAudioPlayer } from 'expo-audio';
import { useStudioTheme } from '../theme';

type ToastOptions = { sound?: boolean };
const ToastContext = createContext<(message: string, options?: ToastOptions) => void>(() => {});

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { colors, dark } = useStudioTheme();
  const { top, left, right } = useSafeAreaInsets();
  const player = useAudioPlayer(require('../../assets/audio/event-success.wav'));
  const [toast, setToast] = useState<{ message: string } | null>(null);
  const [reduceMotion, setReduceMotion] = useState(true);
  const progress = useRef(new Animated.Value(0)).current;

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
    const entry = Animated.timing(progress, {
      toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    });
    if (!reduceMotion) entry.start();
    const exit = Animated.timing(progress, {
      toValue: 0, duration: 140, easing: Easing.in(Easing.cubic), useNativeDriver: true,
    });
    const dismiss = () => setToast(current => current === toast ? null : current);
    const timer = setTimeout(() => {
      if (reduceMotion) dismiss();
      else exit.start(({ finished }) => { if (finished) dismiss(); });
    }, 3500);
    return () => { clearTimeout(timer); entry.stop(); exit.stop(); };
  }, [toast, progress, reduceMotion]);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {toast && (
        <View pointerEvents="box-none"
          style={[styles.overlay, { top: top + 12, left: left + 16, right: right + 16 }]}>
          <Animated.View style={[
            styles.toast,
            { backgroundColor: dark ? '#171717' : colors.card, borderColor: colors.border, borderLeftColor: colors.success },
            { opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }] },
          ]}>
            <View style={[styles.successIcon, { backgroundColor: colors.successBg }]}>
              <Feather name="check" size={16} color={colors.success} />
            </View>
            <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.message, { color: colors.text }]}>
              {toast.message}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Dismiss confirmation" hitSlop={7}
              onPress={() => setToast(null)} style={styles.dismiss}>
              <Feather name="x" size={15} color={colors.muted} />
            </Pressable>
          </Animated.View>
        </View>
      )}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', alignItems: 'flex-end', zIndex: 100, elevation: 12 },
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: 340,
    borderRadius: 13, borderWidth: 1, borderLeftWidth: 4, paddingHorizontal: 12, paddingVertical: 8,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 5,
  },
  successIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  message: { flexShrink: 1, fontSize: 14, fontFamily: 'InterSemiBold' },
  dismiss: { width: 30, height: 34, alignItems: 'center', justifyContent: 'center' },
});
