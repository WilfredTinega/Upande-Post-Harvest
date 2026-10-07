import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SkeletonBox } from '@/src/components/Skeleton';
import { num, summaryStyles as s, Tab, VarietyName } from '@/src/components/SummaryParts';
import { scanApi, type PackhouseSummary as Summary, type PersonKpi } from '@/src/services/scan-api';
import { colors, spacing } from '@/src/theme';
import { userMessage } from '@/src/services/user-message';

/**
 * Packhouse's detail under the figures tiles: what each grader graded and each
 * packer packed today, per variety and stem length. Reloads when the screen
 * comes back into view.
 */
export function PackhouseSummary({ farm }: { farm: string }) {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One list at a time keeps the home screen short.
  const [view, setView] = useState<'graders' | 'packers'>('graders');

  const load = useCallback(async () => {
    if (!farm) return;
    setLoading(true);
    try {
      const r = await scanApi.packhouseSummary(farm);
      if (!r.success) throw new Error(r.error || 'Could not load the packhouse summary');
      setData(r);
      setError(null);
    } catch (err) {
      setError(userMessage(err, 'Could not load the packhouse summary'));
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
        <SkeletonBox height={40} radius={12} />
        <SkeletonBox height={64} radius={12} />
        <SkeletonBox height={64} radius={12} />
      </View>
    );
  }

  const graders = data.graders ?? [];
  const packers = data.packers ?? [];

  return (
    <View style={s.wrap}>
      <View style={s.tabs} accessibilityRole="tablist">
        <Tab label="Graders" count={graders.length} active={view === 'graders'} onPress={() => setView('graders')} />
        <Tab label="Packers" count={packers.length} active={view === 'packers'} onPress={() => setView('packers')} />
      </View>
      <View style={s.sectionHead}>
        <Text style={s.sectionLabel}>TODAY, MOST STEMS FIRST</Text>
        {loading ? <Text style={s.sectionMeta}>Updating…</Text> : null}
      </View>
      {/* Both lists stay built and the toggle only hides one, so switching is instant. */}
      <View style={view === 'graders' ? null : s.hidden}>
        {graders.length ? (
          graders.map((p, i) => <PersonRow key={p.person} p={p} rank={i + 1} />)
        ) : (
          <Text style={s.empty}>Nothing graded yet today.</Text>
        )}
      </View>
      <View style={view === 'packers' ? null : s.hidden}>
        {packers.length ? (
          packers.map((p, i) => <PersonRow key={p.person} p={p} rank={i + 1} />)
        ) : (
          <Text style={s.empty}>Nothing packed yet today.</Text>
        )}
      </View>
    </View>
  );
}

// Memoised: a card redraws only when its own figures change.
const PersonRow = React.memo(function PersonRow({ p, rank }: { p: PersonKpi; rank: number }) {
  const [open, setOpen] = useState(false);
  const picked = p.picked ?? [];
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
            {p.employee_name}
            {p.employee_number ? <Text style={s.stemLength}>{`  ${p.employee_number}`}</Text> : null}
          </Text>
          <Text style={s.meta}>
            {num(p.bunches)} bunches
            {p.boxes !== undefined ? ` · ${num(p.boxes)} ${p.boxes === 1 ? 'box' : 'boxes'}` : ''} · {picked.length}{' '}
            {picked.length === 1 ? 'variety' : 'varieties'}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.pairNum}>{num(p.stems)}</Text>
          <Text style={s.meta}>stems</Text>
        </View>
        {picked.length ? (
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
        ) : null}
      </Pressable>
      {open
        ? picked.map((v) => (
            <View key={`${v.item_code}|${v.stem_length ?? ''}`} style={s.variety}>
              <VarietyName name={v.item_name} stemLength={v.stem_length} />
              <Text style={s.varietyNums}>
                {num(v.stems)} · {num(v.bunches)} {v.bunches === 1 ? 'bunch' : 'bunches'}
              </Text>
            </View>
          ))
        : null}
    </View>
  );
});
