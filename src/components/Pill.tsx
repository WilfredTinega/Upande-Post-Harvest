import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

interface PillProps {
  label?: string;
  value: string;
  tone?: 'neutral' | 'success' | 'warn' | 'danger';
}

const TONE_BG: Record<NonNullable<PillProps['tone']>, string> = {
  neutral: colors.surfaceAlt,
  success: '#DCFCE7',
  warn: '#FEF3C7',
  danger: '#FEE2E2',
};
const TONE_FG: Record<NonNullable<PillProps['tone']>, string> = {
  neutral: colors.text,
  success: '#166534',
  warn: '#92400E',
  danger: '#991B1B',
};

export function Pill({ label, value, tone = 'neutral' }: PillProps) {
  return (
    <View style={[s.pill, { backgroundColor: TONE_BG[tone] }]}>
      {label ? <Text style={[s.label, { color: TONE_FG[tone] }]}>{label}</Text> : null}
      <Text style={[s.value, { color: TONE_FG[tone] }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  label: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  value: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.xs,
  },
});
