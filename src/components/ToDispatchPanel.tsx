import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/src/components/Card';
import { Pill } from '@/src/components/Pill';
import { ListSkeleton } from '@/src/components/Skeleton';
import { scanApi, type ToDispatchBox } from '@/src/services/scan-api';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

const HUB_FARM = 'Burguret';

interface Props {
  farm: string;
  /** The delivery date the page is filtered to. */
  date: string;
  /** Bumped by the screen after each box loaded, to reload the list. */
  version: number;
}

type Filter = 'open' | 'loaded' | 'all';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'open', label: 'Not loaded' },
  { key: 'loaded', label: 'Loaded' },
  { key: 'all', label: 'All' },
];

const STATE: Record<ToDispatchBox['state'], { icon: React.ComponentProps<typeof Ionicons>['name']; color: string; text?: string }> = {
  ready: { icon: 'cube-outline', color: colors.success },
  farm: { icon: 'time-outline', color: colors.warning, text: 'At farm' },
  unpacked: { icon: 'ellipse-outline', color: colors.textMuted, text: 'Not packed' },
  loaded: { icon: 'checkmark-circle', color: colors.success, text: 'Loaded' },
};

/** The day label for a delivery date: Today, Tomorrow, else the date. */
function dayLabel(date: string): string {
  const d = new Date();
  const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  if (date === iso(d)) return 'Today';
  d.setDate(d.getDate() + 1);
  if (date === iso(d)) return 'Tomorrow';
  return date;
}

/** Where a box packed in pieces is combined: the farms, and at Burguret how many are in. */
function combinedText(b: ToDispatchBox, farm: string): string | null {
  if (!b.farms?.length) return null;
  if (farm !== HUB_FARM) {
    const others = b.farms.filter((f) => f !== farm);
    return `Combined at ${HUB_FARM}${others.length ? ` with ${others.join(', ')}` : ''}`;
  }
  return `Combined: ${b.farms.join(' + ')}`;
}

/**
 * The farm's boxes for the orders delivering on the date, delivery point by delivery
 * point: not loaded yet (packed ones to scan, the rest marked), or loaded.
 */
export function ToDispatchPanel({ farm, date, version }: Props) {
  const [boxes, setBoxes] = useState<ToDispatchBox[] | null>(null);
  const [filter, setFilter] = useState<Filter>('open');

  const load = useCallback(async () => {
    try {
      const r = await scanApi.toDispatch(farm, date);
      if (r.success) setBoxes(r.boxes ?? []);
    } catch {
      // The list stays as it was; the next box reloads it.
    }
  }, [farm, date]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load, version]);

  if (!boxes) {
    return (
      <Card style={s.card}>
        <ListSkeleton rows={4} />
      </Card>
    );
  }

  const loaded = boxes.filter((b) => b.state === 'loaded').length;
  const ready = boxes.filter((b) => b.state === 'ready').length;
  const open = boxes.length - loaded;
  const counts: Record<Filter, number> = { open, loaded, all: boxes.length };
  const shown = boxes.filter((b) => filter === 'all' || (filter === 'loaded') === (b.state === 'loaded'));

  const days = new Map<string, Map<string, ToDispatchBox[]>>();
  for (const b of shown) {
    const points = days.get(b.delivery_date) ?? new Map<string, ToDispatchBox[]>();
    const point = b.delivery_point || '';
    points.set(point, [...(points.get(point) ?? []), b]);
    days.set(b.delivery_date, points);
  }

  return (
    <View style={s.wrap}>
      <Card style={s.summary}>
        <Text style={s.label}>TO DISPATCH</Text>
        <View style={s.stats}>
          <Stat value={loaded} label="Loaded" tone="good" />
          <Stat value={ready} label="Ready" />
          <Stat value={open - ready} label="Not ready" tone="warn" />
        </View>
        <View style={s.filters}>
          {FILTERS.map((f) => {
            const on = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={({ pressed }) => [s.filter, on && s.filterOn, pressed && s.pressed]}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
              >
                <Text style={[s.filterText, on && s.filterTextOn]}>
                  {f.label} · {counts[f.key]}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {shown.length === 0 ? (
          <Text style={s.empty}>{filter === 'loaded' ? 'Nothing loaded yet.' : filter === 'open' ? 'Every box is on a truck.' : 'No boxes.'}</Text>
        ) : null}
      </Card>

      {[...days.entries()].map(([day, points]) => (
        <View key={day} style={s.day}>
          <Text style={s.dayName}>{dayLabel(day)}</Text>
          {[...points.entries()].map(([point, list]) => {
            const done = list.filter((b) => b.state === 'loaded' || b.state === 'ready').length;
            return (
              <Card key={point} style={s.point}>
                <View style={s.pointHead}>
                  <Ionicons name="navigate" size={16} color={colors.text} />
                  <Text style={s.pointName} numberOfLines={1}>
                    {point || 'No delivery point'}
                  </Text>
                  <View style={s.pill}>
                    <Text style={s.pillText}>
                      {done}/{list.length}
                    </Text>
                  </View>
                </View>
                {list.map((b) => {
                  const st = STATE[b.state];
                  const combined = combinedText(b, farm);
                  const arrived = farm === HUB_FARM && b.farms?.length && b.state !== 'loaded' ? (b.here ?? []).length : null;
                  return (
                    <View key={b.box} style={s.row}>
                      <Ionicons name={st.icon} size={18} color={st.color} />
                      <View style={s.rowText}>
                        <Text style={[s.box, b.state !== 'ready' && s.boxMuted]} numberOfLines={1}>
                          {b.box}
                        </Text>
                        <Text style={s.customer} numberOfLines={1}>
                          {b.customer}
                          {b.consignee && b.consignee !== b.customer ? ` · ${b.consignee}` : ''}
                        </Text>
                        {combined ? (
                          <View style={s.combined}>
                            <Ionicons name="git-merge-outline" size={13} color={colors.primary} />
                            <Text style={s.combinedText} numberOfLines={1}>
                              {combined}
                            </Text>
                            {arrived !== null ? (
                              <Pill
                                value={`${arrived}/${b.farms!.length} here`}
                                tone={arrived >= b.farms!.length ? 'success' : 'warn'}
                              />
                            ) : null}
                          </View>
                        ) : null}
                      </View>
                      {st.text ? <Text style={[s.state, { color: st.color }]}>{st.text}</Text> : null}
                    </View>
                  );
                })}
              </Card>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone?: 'good' | 'warn' }) {
  return (
    <View style={s.stat}>
      <Text style={[s.statValue, tone === 'good' && { color: colors.success }, tone === 'warn' && { color: colors.warning }]}>
        {value.toLocaleString()}
      </Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: spacing.md, gap: spacing.sm },
  card: { marginTop: spacing.md },
  summary: { gap: spacing.sm },
  label: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: colors.textMuted, letterSpacing: 1.2 },
  stats: { flexDirection: 'row', gap: spacing.sm },
  stat: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: 10, backgroundColor: colors.surfaceAlt },
  statValue: { fontFamily: fontFamily.bold, fontSize: fontSize.xl, color: colors.text },
  statLabel: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  filters: { flexDirection: 'row', gap: spacing.sm },
  filter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  filterTextOn: { color: colors.textOnPrimary },
  pressed: { opacity: 0.75 },
  empty: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textMuted },
  day: { gap: spacing.sm },
  dayName: { fontFamily: fontFamily.bold, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.xs },
  point: { gap: spacing.xs },
  pointHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingBottom: spacing.xs },
  pointName: { flex: 1, fontFamily: fontFamily.bold, fontSize: fontSize.md, color: colors.text },
  pill: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.surfaceAlt },
  pillText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: colors.textSecondary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rowText: { flex: 1 },
  box: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  boxMuted: { color: colors.textMuted },
  customer: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
  combined: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  combinedText: { flexShrink: 1, fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.primary },
  state: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs },
});
