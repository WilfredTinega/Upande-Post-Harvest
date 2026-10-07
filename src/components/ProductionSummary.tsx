import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SkeletonBox } from '@/src/components/Skeleton';
import { scanApi, type GreenhouseTotals, type HarvesterKpi, type ProductionSummary as Summary } from '@/src/services/scan-api';
import { colors, spacing } from '@/src/theme';
import { userMessage } from '@/src/services/user-message';
import { num, summaryStyles as s, Tab, VarietyName } from '@/src/components/SummaryParts';


/**
 * Production's detail under the figures tiles: harvested vs received per
 * greenhouse (tap a greenhouse for each variant) and the harvester KPIs, for
 * today. Reloads when the screen comes back into view.
 */
export function ProductionSummary({ farm }: { farm: string }) {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One list at a time keeps the home screen short.
  const [view, setView] = useState<'greenhouses' | 'harvesters'>('greenhouses');

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
      <View style={s.tabs} accessibilityRole="tablist">
        <Tab label="Greenhouses" count={greenhouses.length} active={view === 'greenhouses'} onPress={() => setView('greenhouses')} />
        <Tab label="Harvesters" count={harvesters.length} active={view === 'harvesters'} onPress={() => setView('harvesters')} />
      </View>
      <View style={s.sectionHead}>
        <Text style={s.sectionLabel}>
          {view === 'greenhouses' ? 'HARVESTED → RECEIVED' : 'TODAY, MOST STEMS FIRST'}
        </Text>
        {loading ? <Text style={s.sectionMeta}>Updating…</Text> : null}
      </View>
      {/* Both lists stay built and the toggle only hides one, so switching is instant. */}
      <View style={view === 'greenhouses' ? null : s.hidden}>
        {greenhouses.length ? (
          greenhouses.map((g) => <GreenhouseRow key={g.greenhouse} g={g} />)
        ) : (
          <Text style={s.empty}>Nothing harvested or received yet today.</Text>
        )}
      </View>
      <View style={view === 'harvesters' ? null : s.hidden}>
        {harvesters.length ? (
          harvesters.map((h, i) => <HarvesterRow key={h.harvester} h={h} rank={i + 1} />)
        ) : (
          <Text style={s.empty}>No harvests recorded yet today.</Text>
        )}
      </View>
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

// Memoised: a card redraws only when its own figures change.
const GreenhouseRow = React.memo(function GreenhouseRow({ g }: { g: GreenhouseTotals }) {
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
            <View key={`${v.item_code}|${v.stem_length ?? ''}`} style={s.variety}>
              <VarietyName name={v.item_name} stemLength={v.stem_length} />
              <Text style={s.varietyNums}>
                {num(v.harvested_stems)} → {num(v.received_stems)}
              </Text>
            </View>
          ))
        : null}
    </View>
  );
});

const HarvesterRow = React.memo(function HarvesterRow({ h, rank }: { h: HarvesterKpi; rank: number }) {
  const [open, setOpen] = useState(false);
  const receivedPct = h.buckets ? Math.round((h.received_buckets / h.buckets) * 100) : 0;
  const picked = h.picked ?? [];
  return (
    <View style={s.card}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={s.cardHead}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
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
        {picked.length ? (
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
        ) : null}
      </Pressable>
      <View style={s.kpis}>
        <Text style={s.kpi}>{h.stems_per_hour === null ? '—' : `${num(h.stems_per_hour)}/h`}</Text>
        <Text style={s.kpi}>{`${receivedPct}% received`}</Text>
      </View>
      {open
        ? picked.map((p) => (
            <View key={`${p.item_code}|${p.stem_length ?? ''}`} style={s.variety}>
              <VarietyName name={p.item_name} stemLength={p.stem_length} />
              <Text style={s.varietyNums}>
                {num(p.stems)} · {num(p.buckets)} {p.buckets === 1 ? 'bucket' : 'buckets'}
              </Text>
            </View>
          ))
        : null}
    </View>
  );
});
