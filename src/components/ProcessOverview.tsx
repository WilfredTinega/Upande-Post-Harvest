import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Overview } from '@/src/services/scan-api';
import { ProcessOverviewSkeleton } from '@/src/components/Skeleton';
import type { ProcessKey } from '@/src/scan/processes';
import { fontFamily, fontSize, spacing } from '@/src/theme';

/**
 * A process's figures for today, styled like the Upande Production home
 * dashboard: a dark hero tile for the headline number and two dark bento
 * tiles under it. The darks are the literal shades that app uses, the same
 * for every process (no per-process accent).
 */

const HERO_BG = '#052E16';
const HERO_ACCENT = '#0A4A22';
const DARK_A = '#171717';
const DARK_B = '#1C1917';

interface Figure {
  chip: string;
  value: number | null | undefined;
  unit: string;
}

interface Figures {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  hero: Figure;
  tiles: [Figure, Figure];
}

const num = (v: number | null | undefined): string =>
  v === null || v === undefined ? '—' : Math.round(v).toLocaleString();

function figuresFor(process: ProcessKey, o: Overview | null): Figures | null {
  if (process === 'production') {
    const p = o?.production;
    if (!p) return null;
    return {
      icon: 'leaf',
      hero: { chip: 'HARVESTED TODAY', value: p.harvested_stems, unit: `stems · ${num(p.harvested_buckets)} buckets` },
      tiles: [
        { chip: 'RECEIVED', value: p.received_stems, unit: `stems · ${num(p.received_buckets)} buckets` },
        { chip: 'AWAITING RECEIVING', value: p.awaiting_receiving, unit: 'buckets' },
      ],
    };
  }
  if (process === 'packhouse') {
    const p = o?.packhouse;
    if (!p) return null;
    const d = o?.dispatch;
    return {
      icon: 'ribbon',
      hero: { chip: 'GRADED TODAY', value: p.graded_stems, unit: `stems · ${num(p.graded_bunches)} bunches` },
      tiles: [
        {
          chip: 'LEFT TO PACK',
          value: d?.stems_to_pack,
          unit: `stems · ${num(d?.opls_to_pack)} open OPLs`,
        },
        { chip: 'IN COLD STORE', value: p.cold_store_stems, unit: `stems · ${num(p.packhouse_stems)} in packhouse` },
      ],
    };
  }
  if (process === 'shop') {
    const p = o?.shop;
    if (!p) return null;
    const inStock =
      p.shop_stems === null && p.walk_in_stems === null ? null : (p.shop_stems ?? 0) + (p.walk_in_stems ?? 0);
    return {
      icon: 'storefront',
      hero: {
        chip: 'STEMS IN SHOP',
        value: inStock,
        unit: `stems · ${num(p.walk_in_stems)} in walk-in shop · ${num(p.moved_to_shop_stems)} moved in today`,
      },
      tiles: [
        { chip: 'SOLD TODAY', value: p.sold_stems, unit: `stems · ${num(p.sales_invoices)} invoices` },
        { chip: 'SALES TODAY', value: p.sales_amount, unit: `${p.currency || ''} · ${num(p.discarded_stems)} stems discarded`.trim() },
      ],
    };
  }
  if (process === 'quality') {
    const q = o?.quality;
    if (!q) return null;
    return {
      icon: 'shield-checkmark',
      hero: {
        chip: 'GRADED REJECTS TODAY',
        value: q.graded_rejects_stems,
        unit: `stems · ${q.reject_rate}% of stems graded`,
      },
      tiles: [
        { chip: 'PACKING REJECTS', value: q.packing_rejects, unit: 'bunches' },
        { chip: 'UNGRADED DISCARDS', value: q.ungraded_discard_stems, unit: `stems · ${num(q.ungraded_discards)} buckets` },
      ],
    };
  }
  const d = o?.dispatch;
  if (!d) return null;
  return {
    icon: 'bus',
    hero: {
      chip: 'BOXES LOADED',
      value: d.boxes_loaded,
      unit: `of ${num(d.boxes_planned)} planned · ${num(d.trucks_loading)} trucks loading`,
    },
    tiles: [
      { chip: 'STAGED', value: d.staged_boxes, unit: 'boxes not on a truck yet' },
      { chip: 'DISPATCHED', value: d.trucks_dispatched, unit: 'trucks today' },
    ],
  };
}

interface Props {
  process: ProcessKey;
  overview: Overview | null;
  loading: boolean;
  /** Why the figures couldn't be loaded; shown with a retry when there are none to show. */
  error?: string | null;
  onRetry?: () => void;
}

export function ProcessOverview({ process, overview, loading, error, onRetry }: Props) {
  const f = figuresFor(process, overview);
  // First load (nothing to show yet): shimmering tiles in the figures' own shape.
  if (!f && !overview && (loading || !error)) return <ProcessOverviewSkeleton />;
  if (!f) {
    return (
      <Pressable
        style={[s.hero, s.heroEmpty]}
        onPress={onRetry}
        disabled={loading || !onRetry}
        accessibilityRole="button"
        accessibilityLabel="Reload today's figures"
      >
        <Text style={s.heroChip}>TODAY</Text>
        <Text style={s.emptyText}>
          {error || 'No figures for this process.'}
        </Text>
        {!loading && error && onRetry ? <Text style={s.retry}>Tap to retry</Text> : null}
      </Pressable>
    );
  }
  return (
    <View>
      <View style={s.hero}>
        <View style={s.heroBubble} />
        <Text style={s.heroChip}>{f.hero.chip}</Text>
        <Text style={s.heroNumber} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
          {num(f.hero.value)}
        </Text>
        <Text style={s.heroUnit} numberOfLines={1}>
          {f.hero.unit}
        </Text>
        <Ionicons name={f.icon} size={64} color="rgba(255,255,255,0.06)" style={s.heroIcon} />
      </View>
      <View style={s.row}>
        {f.tiles.map((t, i) => (
          <View key={t.chip} style={[s.tile, { backgroundColor: i === 0 ? DARK_A : DARK_B }]}>
            <Text style={s.tileChip} numberOfLines={1}>
              {t.chip}
            </Text>
            <Text style={s.tileNumber} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
              {num(t.value)}
            </Text>
            <Text style={s.tileUnit} numberOfLines={2}>
              {t.unit}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  hero: {
    backgroundColor: HERO_BG,
    borderRadius: 24,
    padding: spacing.xl,
    marginBottom: spacing.sm,
    overflow: 'hidden',
    minHeight: 140,
  },
  heroEmpty: { minHeight: 90, justifyContent: 'center' },
  heroBubble: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: HERO_ACCENT,
    bottom: -70,
    right: -40,
  },
  heroChip: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 1.2,
    marginBottom: spacing.sm,
  },
  heroNumber: { fontFamily: fontFamily.bold, fontSize: 48, color: '#FFFFFF', lineHeight: 54 },
  heroUnit: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: 'rgba(255,255,255,0.6)', marginTop: 4 },
  heroIcon: { position: 'absolute', bottom: spacing.lg, right: spacing.xl },
  retry: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: '#FFFFFF', marginTop: spacing.sm },
  emptyText: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: 'rgba(255,255,255,0.6)' },
  row: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  tile: { flex: 1, borderRadius: 20, padding: spacing.lg, minHeight: 110, justifyContent: 'flex-end' },
  tileChip: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  tileNumber: { fontFamily: fontFamily.bold, fontSize: 32, color: '#FFFFFF', lineHeight: 36 },
  tileUnit: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
});
