import React, { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUpdateStore } from '@/src/stores/updateStore';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

/**
 * Shown for the couple of seconds between a JS update finishing its download
 * and the app restarting into it, so the restart reads as an update and not a
 * crash. `pointerEvents="none"`: it must never swallow a scan-screen tap.
 */
export function OtaToast() {
  const insets = useSafeAreaInsets();
  const otaReady = useUpdateStore((s) => s.otaReady);
  /** Kept mounted through the fade-out; only set from animation callbacks. */
  const [lingering, setLingering] = useState(false);
  const [anim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(anim, {
      toValue: otaReady ? 1 : 0,
      duration: otaReady ? 180 : 140,
      easing: otaReady ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setLingering(otaReady);
    });
  }, [otaReady, anim]);

  if (!otaReady && !lingering) return null;

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });

  return (
    <Animated.View
      pointerEvents="none"
      style={[s.wrap, { bottom: insets.bottom + spacing.xxl, opacity: anim, transform: [{ translateY }] }]}
    >
      <View style={s.toast}>
        <Ionicons name="cloud-download-outline" size={20} color={colors.text} />
        <Text style={s.text}>Updating to the latest version…</Text>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.lg, right: spacing.lg },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  text: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
});
