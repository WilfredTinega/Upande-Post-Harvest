import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';
import { useNetworkStore } from '@/src/stores/networkStore';

/**
 * Sticky banner shown at the top of every screen when the device or server
 * is unreachable. Sits below the status bar, sliding in/out smoothly.
 * Mounted once at the root so it covers all screens without per-page wiring.
 */
export function OfflineBanner() {
  const online = useNetworkStore((s) => s.online);
  const insets = useSafeAreaInsets();
  const [anim] = useState(() => new Animated.Value(0)); // 0 hidden, 1 visible

  useEffect(() => {
    Animated.timing(anim, {
      toValue: online ? 0 : 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [online, anim]);

  // Always render so the slide-out animation can play on going back online.
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        s.wrap,
        {
          paddingTop: insets.top + 4,
          transform: [
            {
              translateY: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [-(insets.top + 56), 0],
              }),
            },
          ],
          opacity: anim,
        },
      ]}
    >
      <View style={s.banner}>
        <Ionicons name="cloud-offline-outline" size={16} color={colors.textOnPrimary} />
        <Text style={s.text} numberOfLines={1}>
          You&apos;re offline — check your network connection
        </Text>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 5000,
    elevation: 16,
    alignItems: 'center',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: '#1F2937',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    maxWidth: '90%',
  },
  text: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.xs,
    color: colors.textOnPrimary,
    flexShrink: 1,
  },
});
