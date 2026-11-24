import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/src/components/Card';
import { ListSkeleton } from '@/src/components/Skeleton';
import { scanApi, type ToDispatchBox } from '@/src/services/scan-api';
import { colors, fontFamily, fontSize, spacing } from '@/src/theme';

interface Props {
  farm: string;
  /** Bumped by the screen after each box loaded, to reload the list. */
  version: number;
}

const STATE: Record<ToDispatchBox['state'], { icon: React.ComponentProps<typeof Ionicons>['name']; color: string; text?: string }> = {
  ready: { icon: 'cube-outline', color: colors.success },
  farm: { icon: 'time-outline', color: colors.warning, text: 'At farm' },
  unpacked: { icon: 'ellipse-outline', color: colors.textMuted, text: 'Not packed' },
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

/**
 * The farm's boxes still to go on a truck for today's and tomorrow's orders, day by day,
 * delivery point by delivery point: packed ones first to scan, the rest marked.
 */
export function ToDispatchPanel({ farm, version }: Props) {
  const [boxes, setBoxes] = useState<ToDispatchBox[] | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await scanApi.toDispatch(farm);
      if (r.success) setBoxes(r.boxes ?? []);
    } catch {
      // The list stays as it was; the next box reloads it.
    }
  }, [farm]);

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

  const ready = boxes.filter((b) => b.state === 'ready').length;
  const days = new Map<string, Map<string, ToDispatchBox[]>>();
  for (const b of boxes) {
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
          <Stat value={ready} label="Ready" tone="good" />
          <Stat value={boxes.length - ready} label="Not ready" tone="warn" />
          <Stat value={boxes.length} label="Boxes" />
        </View>
        {boxes.length === 0 ? <Text style={s.empty}>Every box is on a truck.</Text> : null}
      </Card>

      {[...days.entries()].map(([day, points]) => (
        <View key={day} style={s.day}>
          <Text style={s.dayName}>{dayLabel(day)}</Text>
          {[...points.entries()].map(([point, list]) => {
            const here = list.filter((b) => b.state === 'ready').length;
            return (
              <Card key={point} style={s.point}>
                <View style={s.pointHead}>
                  <Ionicons name="navigate" size={16} color={colors.text} />
                  <Text style={s.pointName} numberOfLines={1}>
                    {point || 'No delivery point'}
                  </Text>
                  <View style={s.pill}>
                    <Text style={s.pillText}>
                      {here}/{list.length}
                    </Text>
                  </View>
                </View>
                {list.map((b) => {
                  const st = STATE[b.state];
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
  state: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs },
});
