/**
 * Skeleton shimmer, ported from Upande Production (itself from mona-shelve).
 *
 * One shared Animated.Value drives a diagonal light strip across every
 * skeleton box at once, like a single light passing over the screen. It runs
 * on the native thread (useNativeDriver), so it costs the JS thread nothing.
 */

import React, { useEffect } from 'react';
import { Animated, Dimensions, StyleSheet, View, type DimensionValue, type ViewStyle } from 'react-native';
import { borderRadius, colors, spacing } from '@/src/theme';

const { width: SW } = Dimensions.get('window');

const STRIP_W = Math.round(SW * 0.45);
const SWEEP_MS = 1600;

const sweep = new Animated.Value(0);
let sweepRunning = false;

function startSweep() {
  if (sweepRunning) return;
  sweepRunning = true;
  Animated.loop(Animated.timing(sweep, { toValue: 1, duration: SWEEP_MS, useNativeDriver: true })).start();
}

const sharedTranslateX = sweep.interpolate({
  inputRange: [0, 1],
  outputRange: [-(STRIP_W + SW), SW + STRIP_W],
});

export interface SkeletonBoxProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  baseColor?: string;
  shimmerColor?: string;
  style?: ViewStyle;
}

export function SkeletonBox({
  width = '100%',
  height = 16,
  radius = borderRadius.md,
  baseColor = '#E2E2E2',
  shimmerColor = 'rgba(255,255,255,0.82)',
  style,
}: SkeletonBoxProps) {
  useEffect(startSweep, []);
  return (
    <View style={[{ width, height, borderRadius: radius, backgroundColor: baseColor, overflow: 'hidden' }, style]}>
      <Animated.View
        style={{
          position: 'absolute',
          top: -(height * 3),
          bottom: -(height * 3),
          width: STRIP_W,
          backgroundColor: shimmerColor,
          transform: [{ skewX: '-18deg' }, { translateX: sharedTranslateX }],
        }}
      />
    </View>
  );
}

// The figures tiles' own dark shades, so the skeleton crossfades into them.
const D = {
  hero: '#052E16',
  tileA: '#171717',
  tileB: '#1C1917',
  shimmer: 'rgba(255,255,255,0.10)',
};

/** Placeholder for a process's figures: the hero tile and the two tiles under it. */
export function ProcessOverviewSkeleton() {
  return (
    <View accessibilityLabel="Loading today's figures">
      <SkeletonBox height={140} radius={24} baseColor={D.hero} shimmerColor={D.shimmer} style={st.gap} />
      <View style={st.row}>
        <SkeletonBox width="48.5%" height={110} radius={20} baseColor={D.tileA} shimmerColor={D.shimmer} />
        <SkeletonBox width="48.5%" height={110} radius={20} baseColor={D.tileB} shimmerColor={D.shimmer} />
      </View>
    </View>
  );
}

/** Placeholder rows for a list that is loading (pickers). */
/** Placeholder rows shaped like picker rows (56px, hairline between), so a list keeps its height while it loads. */
export function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <View accessibilityLabel="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={[st.listRow, i > 0 && st.listDivider]}>
          <SkeletonBox width="62%" height={14} radius={6} />
          <SkeletonBox width="40%" height={10} radius={5} style={{ marginTop: spacing.sm }} />
        </View>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  gap: { marginBottom: spacing.sm },
  listRow: { minHeight: 56, justifyContent: 'center', paddingVertical: spacing.md },
  listDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
