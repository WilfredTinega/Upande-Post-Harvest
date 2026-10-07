import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ProcessOverview } from '@/src/components/ProcessOverview';
import { DeliveryDateFilter } from '@/src/components/DeliveryDateFilter';
import { PackhouseSummary } from '@/src/components/PackhouseSummary';
import { ProductionSummary } from '@/src/components/ProductionSummary';
import { ACTIONS, type ActionDef } from '@/src/scan/actions';
import { PROCESSES, type ProcessKey } from '@/src/scan/processes';
import type { Overview } from '@/src/services/scan-api';
import { colors, fontFamily, fontSize, shadow, spacing } from '@/src/theme';

interface Props {
  process: ProcessKey;
  farm: string;
  overview: Overview | null;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  /** Section label above the figures; hidden when the screen title already names the process. */
  showLabel: boolean;
  onOpen: (action: ActionDef) => void;
}

/** The same landing for every process: today's figures, then its action tiles. */
export function ProcessLanding({ process, farm, overview, loading, error, onRetry, showLabel, onOpen }: Props) {
  const label = PROCESSES.find((p) => p.key === process)?.label ?? process;
  const actions = ACTIONS.filter((a) => a.group === process);
  // One or two shortcuts take the full width.
  const wide = actions.length <= 2;

  return (
    <View style={s.section}>
      {showLabel ? <Text style={s.label}>{label.toUpperCase()}</Text> : null}
      {process === 'delivery' ? <DeliveryDateFilter /> : null}
      {farm ? <ProcessOverview process={process} overview={overview} loading={loading} error={error} onRetry={onRetry} /> : null}
      <View style={s.grid}>
        {actions.map((a) => {
          const blocked = a.needsFarm && !farm;
          const count = farm ? todayCount(a.key, overview) : null;
          return (
            <Pressable
              key={a.key}
              onPress={() => onOpen(a)}
              style={({ pressed }) => [s.tile, wide && s.wide, blocked && s.blocked, pressed && s.pressed]}
              accessibilityRole="button"
              accessibilityLabel={a.label}
              accessibilityHint={a.description}
            >
              <View style={s.tileHead}>
                <View style={s.icon}>
                  <Ionicons name={a.icon} size={18} color={colors.text} />
                </View>
                <Text style={s.tileLabel} numberOfLines={2}>
                  {a.label}
                  {count?.progress !== undefined ? ` (${Math.round(count.progress * 100)}%)` : ''}
                </Text>
              </View>
              {count ? (
                <Text style={s.count} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                  <Text style={s.countNum}>{count.value}</Text> {count.unit}
                  {count.stems ? (
                    <>
                      {' · '}
                      <Text style={s.countNum}>{count.stems}</Text> stems
                    </>
                  ) : null}
                  {count.boxes ? (
                    <>
                      {' · '}
                      <Text style={s.countNum}>{count.boxes}</Text> boxes
                    </>
                  ) : null}
                </Text>
              ) : null}
              {count?.progress !== undefined ? (
                <View style={s.track} accessibilityLabel={`${Math.round(count.progress * 100)}% complete`}>
                  <View
                    style={[
                      s.fill,
                      { width: `${count.progress * 100}%`, backgroundColor: count.progress >= 1 ? colors.success : colors.warning },
                    ]}
                  />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      {process === 'production' && farm ? <ProductionSummary farm={farm} /> : null}
      {process === 'packhouse' && farm ? <PackhouseSummary farm={farm} /> : null}
    </View>
  );
}

/** Today's figure on an action's card, where the overview has one. */
/** 950 → "950", 1200 → "1.2k", 14500 → "14.5k": short enough for half a card. */
function short(v: number): string {
  if (v < 1000) return String(Math.round(v));
  const k = v / 1000;
  return `${k >= 100 ? Math.round(k) : Number(k.toFixed(1))}k`;
}

function todayCount(
  key: string,
  overview: Overview | null,
): { value: string; unit: string; stems?: string; boxes?: string; progress?: number } | null {
  const p = overview?.packhouse;
  if (!p) return null;
  const n = (v: number | undefined | null) => (v === undefined || v === null ? null : short(v));
  const done = p.opls_total ? Math.min(1, (p.opls_packed ?? 0) / p.opls_total) : 0;
  const counts: Record<string, { value: string | null; unit: string; stems?: string; boxes?: string; progress?: number }> = {
    'receiving-out': { value: n(p.received_out_buckets), unit: 'bkt', stems: n(p.received_out_stems) ?? '0' },
    grading: { value: n(p.graded_bunches), unit: 'bunches', stems: n(p.graded_stems) ?? '0' },
    'ungraded-discard': { value: n(p.ungraded_discard_buckets), unit: 'bkt', stems: n(p.ungraded_discard_stems) ?? '0' },
    packing: {
      value: p.opls_total === undefined ? null : `${n(p.opls_packed) ?? 0} / ${n(p.opls_total)}`,
      unit: 'OPLs',
      // Boxes only when the server reports them, so a missing figure never reads as 0.
      boxes:
        p.packed_boxes === undefined
          ? undefined
          : `${n(p.packed_boxes)}${p.boxes_total ? ` / ${n(p.boxes_total)}` : ''}`,
      progress: done,
    },
  };
  const c = counts[key];
  return c && c.value !== null
    ? { value: c.value, unit: c.unit, stems: c.stems, boxes: c.boxes, progress: c.progress }
    : null;
}

const s = StyleSheet.create({
  section: { marginTop: spacing.sm },
  label: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    letterSpacing: 1.4,
    marginBottom: spacing.sm,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  tile: {
    width: '48.5%',
    // Compact: icon and label side by side.
    minHeight: 56,
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...shadow.sm,
  },
  wide: { width: '100%' },
  blocked: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  // Today's figure, on its own line under the label.
  count: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
  countNum: { fontFamily: fontFamily.bold, fontSize: fontSize.sm, color: colors.text },
});
