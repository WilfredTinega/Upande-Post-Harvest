import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';
import { audio } from '@/src/audio';
import { humanText } from '@/src/services/user-message';

export type ToastTone = 'success' | 'error' | 'info';
/** Where the toast sits: the top edge, or the middle of the screen (scan results). */
export type ToastPlacement = 'top' | 'center';

const DEFAULT_DURATION_MS = 2600;

interface ToastState {
  visible: boolean;
  message: string;
  tone: ToastTone;
  placement: ToastPlacement;
}

interface ToastContextValue {
  showSuccess: (msg: string) => void;
  showError: (msg: string) => void;
  showInfo: (msg: string) => void;
  /** Show a toast without a sound (the caller already gave feedback), for `durationMs`. */
  notify: (msg: string, tone: ToastTone, durationMs?: number, placement?: ToastPlacement) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ToastState>({ visible: false, message: '', tone: 'info', placement: 'top' });
  const [anim] = useState(() => new Animated.Value(0));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (message: string, tone: ToastTone, durationMs: number = DEFAULT_DURATION_MS, placement: ToastPlacement = 'top') => {
      setState({ visible: true, message, tone, placement });
      if (timer.current) clearTimeout(timer.current);
      Animated.timing(anim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
          setState((p) => ({ ...p, visible: false }));
        });
      }, durationMs);
    },
    [anim],
  );

  const value = {
    showSuccess: (m: string) => { audio.submit(); show(m, 'success'); },
    showError: (m: string) => { audio.error(); show(humanText(m) ?? 'Something went wrong. Try again.', 'error'); },
    showInfo: (m: string) => show(m, 'info'),
    notify: (m: string, tone: ToastTone, durationMs?: number, placement?: ToastPlacement) =>
      show(m, tone, durationMs, placement),
  };

  const iconName: React.ComponentProps<typeof Ionicons>['name'] =
    state.tone === 'success' ? 'checkmark-circle' : state.tone === 'error' ? 'alert-circle' : 'information-circle';
  const tint =
    state.tone === 'success' ? colors.success : state.tone === 'error' ? colors.error : colors.primary;

  return (
    <ToastContext.Provider value={value}>
      {children}
      {state.visible && state.placement === 'center' ? (
        <View pointerEvents="none" style={s.centerWrap}>
          <Animated.View
            style={[s.centerToast, { opacity: anim, transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] }]}
          >
            <Ionicons name={iconName} size={32} color={tint} />
            <Text style={s.centerText}>{state.message}</Text>
          </Animated.View>
        </View>
      ) : state.visible ? (
        <SafeAreaView pointerEvents="none" style={s.wrap} edges={['top']}>
          <Animated.View
            style={[
              s.toast,
              { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }] },
            ]}
          >
            <Ionicons name={iconName} size={18} color={tint} />
            <Text style={s.text}>{state.message}</Text>
          </Animated.View>
        </SafeAreaView>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', zIndex: 9999 },
  centerWrap: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', zIndex: 9999 },
  centerToast: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
    maxWidth: '85%',
  },
  centerText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text, textAlign: 'center' },
  toast: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    maxWidth: '90%',
  },
  text: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.text,
    flexShrink: 1,
  },
});
