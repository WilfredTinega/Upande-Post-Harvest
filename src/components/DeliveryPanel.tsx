import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/src/components/Card';
import { ListSkeleton } from '@/src/components/Skeleton';
import { scanApi, type DeliveryBox } from '@/src/services/scan-api';
import { colors, fontFamily, fontSize, spacing } from '@/src/theme';

interface Props {
  /** The delivery date the page is filtered to. */
  date: string;
  /** Bumped by the screen after each delivered box, to reload the list. */
  version: number;
}

/**
 * The boxes loaded from Burguret for Nairobi on the day (every farm), delivery point by
 * delivery point, then customer, ticked as delivered.
 */
export function DeliveryPanel({ date, version }: Props) {
  const [boxes, setBoxes] = useState<DeliveryBox[] | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await scanApi.loadedBoxes(date);
      if (r.success) setBoxes(r.boxes ?? []);
    } catch {
      // The list stays as it was; the next scan reloads it.
    }
  }, [date]);

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

  const points = new Map<string, Map<string, DeliveryBox[]>>();
  for (const b of boxes) {
    const point = b.delivery_point ?? '';
    const customers = points.get(point) ?? new Map<string, DeliveryBox[]>();
    customers.set(b.customer, [...(customers.get(b.customer) ?? []), b]);
    points.set(point, customers);
  }
  const delivered = boxes.filter((b) => b.delivered).length;
  const share = boxes.length ? delivered / boxes.length : 0;

  return (
    <View style={s.wrap}>
      <Card style={s.summary}>
        <Text style={s.label}>LOADED FOR NAIROBI</Text>
        <View style={s.stats}>
          <Stat value={delivered} label="Delivered" tone="good" />
          <Stat value={boxes.length - delivered} label="On the truck" tone="warn" />
          <Stat value={boxes.length} label="Boxes" />
        </View>
        <View style={s.bar}>
          <View style={[s.barFill, { width: `${Math.round(share * 100)}%` }]} />
        </View>
        {boxes.length === 0 ? <Text style={s.empty}>No boxes loaded for this day.</Text> : null}
      </Card>

      {[...points.entries()].map(([point, customers]) => {
        const rows = [...customers.values()].flat();
        const done = rows.filter((r) => r.delivered).length;
        const complete = done === rows.length;
        return (
          <Card key={point} style={s.point}>
            <View style={s.pointHead}>
              <Ionicons name="navigate" size={16} color={complete ? colors.success : colors.text} />
              <Text style={s.pointName} numberOfLines={1}>
                {point || 'No delivery point'}
              </Text>
              <View style={[s.pill, complete && s.pillDone]}>
                <Text style={[s.pillText, complete && s.pillTextDone]}>
                  {done}/{rows.length}
                </Text>
              </View>
            </View>
            {[...customers.entries()].map(([customer, list]) => (
              <View key={customer} style={s.customer}>
                <View style={s.customerHead}>
                  <Text style={s.customerName} numberOfLines={1}>
                    {customer}
                  </Text>
                  <Text style={s.count}>
                    {list.filter((r) => r.delivered).length}/{list.length}
                  </Text>
                </View>
                {list.map((b) => (
                  <View key={b.box} style={s.row}>
                    <Ionicons
                      name={b.delivered ? 'checkmark-circle' : 'bus-outline'}
                      size={18}
                      color={b.delivered ? colors.success : colors.warning}
                    />
                    <Text style={[s.box, !!b.delivered && s.boxDone]} numberOfLines={1}>
                      {b.box}
                    </Text>
                    {b.consignee ? (
                      <Text style={s.consignee} numberOfLines={1}>
                        {b.consignee}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            ))}
          </Card>
        );
      })}
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
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: colors.success },
  empty: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textMuted },
  point: { gap: spacing.xs },
  pointHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingBottom: spacing.xs },
  pointName: { flex: 1, fontFamily: fontFamily.bold, fontSize: fontSize.md, color: colors.text },
  pill: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.surfaceAlt },
  pillDone: { backgroundColor: '#DCFCE7' },
  pillText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: colors.textSecondary },
  pillTextDone: { color: colors.success },
  customer: {
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  customerHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  customerName: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.textSecondary },
  count: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textMuted },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4, paddingLeft: spacing.xs },
  box: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  boxDone: { color: colors.textMuted },
  consignee: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, textAlign: 'right' },
});
