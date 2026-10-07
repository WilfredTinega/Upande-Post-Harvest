import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

/** Shared by the Production and Packhouse home summaries. */

export const num = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : Math.round(v).toLocaleString();

export function Tab({ label, count, active, onPress }: { label: string; count: number; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[summaryStyles.tab, active && summaryStyles.tabActive]}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
    >
      <Text style={[summaryStyles.tabText, active && summaryStyles.tabTextActive]}>
        {label} <Text style={summaryStyles.tabCount}>{count}</Text>
      </Text>
    </Pressable>
  );
}

export /** A variety, with the stem length it was harvested at when there is one. */
function VarietyName({ name, stemLength }: { name: string; stemLength?: string | null }) {
  return (
    <Text style={summaryStyles.varietyName} numberOfLines={1}>
      {name}
      {stemLength ? <Text style={summaryStyles.stemLength}>{`  ${stemLength}`}</Text> : null}
    </Text>
  );
}

export const summaryStyles = StyleSheet.create({
  wrap: { marginTop: spacing.md },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  sectionLabel: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: colors.textMuted, letterSpacing: 1.4 },
  hidden: { display: 'none' },
  tabs: {
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.xs,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceAlt,
    marginBottom: spacing.md,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 40, borderRadius: borderRadius.sm },
  tabActive: { backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  tabText: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.textSecondary },
  tabTextActive: { fontFamily: fontFamily.semiBold, color: colors.text },
  tabCount: { fontFamily: fontFamily.bold },
  sectionMeta: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textMuted },
  empty: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textMuted, paddingVertical: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm + 2,
    paddingBottom: spacing.sm,
    marginBottom: spacing.xs + 2,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 40 },
  title: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text },
  meta: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: 1 },
  pair: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pairNum: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: colors.text },
  bar: { height: 4, borderRadius: 2, backgroundColor: colors.surfaceAlt, marginTop: spacing.sm, overflow: 'hidden' },
  barFill: { height: 4, borderRadius: 2 },
  variety: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginTop: 6,
  },
  varietyName: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.text },
  stemLength: { fontFamily: fontFamily.bold, color: colors.text },
  varietyNums: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  rank: {
    width: 24,
    height: 24,
    borderRadius: 12,
    textAlign: 'center',
    lineHeight: 24,
    backgroundColor: colors.surfaceAlt,
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.xs,
    color: colors.text,
    overflow: 'hidden',
  },
  kpis: { flexDirection: 'row', gap: spacing.md, marginTop: 4, paddingLeft: 32 },
  kpi: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textSecondary },
  errorBox: { padding: spacing.md, borderRadius: 12, backgroundColor: '#FEF2F2', marginTop: spacing.md },
  errorText: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: '#991B1B' },
  retry: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: '#991B1B', marginTop: 4 },
});
