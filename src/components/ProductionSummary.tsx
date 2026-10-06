import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SkeletonBox } from '@/src/components/Skeleton';
import { scanApi, type GreenhouseTotals, type HarvesterKpi, type ProductionSummary as Summary } from '@/src/services/scan-api';
import { colors, fontFamily, fontSize, spacing } from '@/src/theme';
import { userMessage } from '@/src/services/user-message';

const num = (v: number | null | undefined) => (v === null || v === undefined ? '—' : Math.round(v).toLocaleString());

/**
 * Production's detail under the figures tiles: harvested vs received per
 * greenhouse (tap a greenhouse for each variant) and the harvester KPIs, for
 * today. Reloads when the screen comes back into view.
 */
export function ProductionSummary({ farm }: { farm: string }) {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!farm) return;
    setLoading(true);
    try {
      const r = await scanApi.productionSummary(farm);
      if (!r.success) throw new Error(r.error || 'Could not load the harvest summary');
      setData(r);
      setError(null);
    } catch (err) {
      setError(userMessage(err, 'Could not load the harvest summary'));
    } finally {
      setLoading(false);
    }
  }, [farm]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!data) {
    if (error) {
      return (
        <Pressable onPress={load} style={s.errorBox}>
          <Text style={s.errorText}>{error}</Text>
          <Text style={s.retry}>Tap to retry</Text>
        </Pressable>
      );
    }
    return (
      <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
        <SkeletonBox height={14} width={140} radius={6} />
        <SkeletonBox height={64} radius={12} />
        <SkeletonBox height={64} radius={12} />
      </View>
    );
  }

  const greenhouses = data.greenhouses ?? [];
  const harvesters = data.harvesters ?? [];

  return (
    <View style={s.wrap}>
      <View style={s.sectionHead}>
        <Text style={s.sectionLabel}>BY GREENHOUSE · HARVESTED → RECEIVED</Text>
        {loading ? <Text style={s.sectionMeta}>Updating…</Text> : null}
      </View>
      {greenhouses.length ? (
        greenhouses.map((g) => <GreenhouseRow key={g.greenhouse} g={g} />)
      ) : (
        <Text style={s.empty}>Nothing harvested or received yet today.</Text>
      )}

      <View style={[s.sectionHead, { marginTop: spacing.lg }]}>
        <Text style={s.sectionLabel}>HARVESTERS</Text>
        <Text style={s.sectionMeta}>{harvesters.length} today</Text>
      </View>
      {harvesters.length ? (
        harvesters.map((h, i) => <HarvesterRow key={h.harvester} h={h} rank={i + 1} />)
      ) : (
        <Text style={s.empty}>No harvests recorded yet today.</Text>
      )}
    </View>
  );
}

function Bar({ ratio }: { ratio: number }) {
  const pct = Math.max(0, Math.min(1, ratio));
  return (
    <View style={s.bar}>
      <View style={[s.barFill, { width: `${pct * 100}%`, backgroundColor: pct >= 1 ? colors.success : colors.warning }]} />
    </View>
  );
}

function GreenhouseRow({ g }: { g: GreenhouseTotals }) {
  const [open, setOpen] = useState(false);
  const ratio = g.harvested_stems > 0 ? g.received_stems / g.harvested_stems : g.received_stems > 0 ? 1 : 0;
  return (
    <View style={s.card}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={s.cardHead}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${g.greenhouse}: ${g.harvested_stems} stems harvested, ${g.received_stems} received`}
      >
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{g.greenhouse}</Text>
          <Text style={s.meta}>
            {num(g.harvested_buckets)} buckets harvested · {num(g.received_buckets)} received
          </Text>
        </View>
        <View style={s.pair}>
          <Text style={s.pairNum}>{num(g.harvested_stems)}</Text>
          <Ionicons name="arrow-forward" size={14} color={colors.textMuted} />
          <Text style={s.pairNum}>{num(g.received_stems)}</Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
      </Pressable>
      <Bar ratio={ratio} />
      {open
        ? g.varieties.map((v) => (
            <View key={v.item_code} style={s.variety}>
              <Text style={s.varietyName} numberOfLines={1}>
                {v.item_name}
              </Text>
              <Text style={s.varietyNums}>
                {num(v.harvested_stems)} → {num(v.received_stems)}
              </Text>
            </View>
          ))
        : null}
    </View>
  );
}

function HarvesterRow({ h, rank }: { h: HarvesterKpi; rank: number }) {
  const receivedPct = h.buckets ? Math.round((h.received_buckets / h.buckets) * 100) : 0;
  return (
    <View style={s.card}>
      <View style={s.cardHead}>
        <Text style={s.rank}>{rank}</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.title} numberOfLines={1}>
            {h.employee_name}
          </Text>
          <Text style={s.meta}>
            {num(h.buckets)} buckets · {h.avg_stems_per_bucket} stems/bucket · {h.varieties} varieties
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.pairNum}>{num(h.stems)}</Text>
          <Text style={s.meta}>stems</Text>
        </View>
      </View>
      <View style={s.kpis}>
        <Text style={s.kpi}>{h.stems_per_hour === null ? '—' : `${num(h.stems_per_hour)}/h`}</Text>
        <Text style={s.kpi}>{`${receivedPct}% received`}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: spacing.md },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  sectionLabel: { fontFamily: fontFamily.semiBold, fontSize: 10, color: colors.textMuted, letterSpacing: 1.4 },
  sectionMeta: { fontFamily: fontFamily.medium, fontSize: 10, color: colors.textMuted },
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
