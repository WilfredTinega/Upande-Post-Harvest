import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/src/components/Card';
import { ListSkeleton } from '@/src/components/Skeleton';
import { scanApi, type DeliveryBox } from '@/src/services/scan-api';
import { colors, fontFamily, fontSize, spacing } from '@/src/theme';

interface Props {
  /** The delivery point ('' = boxes without one). */
  point: string;
  /** The delivery date the page is filtered to. */
  date: string;
  /** Bumped by the screen after each delivered box, to reload the list. */
  version: number;
}

/** A delivery point's boxes from every farm, customer by customer, ticked as delivered. */
export function DeliveryPanel({ point, date, version }: Props) {
  const [boxes, setBoxes] = useState<DeliveryBox[] | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await scanApi.pointBoxes(point, date);
      if (r.success) setBoxes(r.boxes ?? []);
    } catch {
      // The list stays as it was; the next scan reloads it.
    }
  }, [point, date]);

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

  const customers = new Map<string, DeliveryBox[]>();
  for (const b of boxes) customers.set(b.customer, [...(customers.get(b.customer) ?? []), b]);
  const delivered = boxes.filter((b) => b.delivered).length;

  return (
    <Card style={s.card}>
      <View style={s.head}>
        <Text style={s.title} numberOfLines={1}>
          {point || 'No delivery point'}
        </Text>
        <Text style={s.count}>
          <Text style={s.num}>{delivered}</Text>/{boxes.length} delivered
        </Text>
      </View>
      {boxes.length === 0 ? <Text style={s.empty}>No boxes due here on this day.</Text> : null}
      {[...customers.entries()].map(([customer, rows]) => (
        <View key={customer} style={s.group}>
          <View style={s.head}>
            <Text style={s.customer} numberOfLines={1}>
              {customer}
            </Text>
            <Text style={s.count}>
              <Text style={s.num}>{rows.filter((r) => r.delivered).length}</Text>/{rows.length}
            </Text>
          </View>
          {rows.map((b) => (
            <View key={b.box} style={s.row}>
              <Ionicons
                name={b.delivered ? 'checkmark-circle' : b.status === 'on_truck' ? 'bus' : 'ellipse-outline'}
                size={16}
                color={b.delivered ? colors.success : b.status === 'on_truck' ? colors.warning : colors.textMuted}
              />
              <View style={{ flex: 1 }}>
                <Text style={[s.box, s.num]} numberOfLines={1}>
                  {b.box}
                  {b.status === 'not_loaded' ? <Text style={s.notLoaded}> · not loaded</Text> : null}
                </Text>
                <Text style={s.box} numberOfLines={1}>
                  {b.customer}
                  {b.consignee ? ` · ${b.consignee}` : ''}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ))}
    </Card>
  );
}

const s = StyleSheet.create({
  card: { marginTop: spacing.md, gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { flex: 1, fontFamily: fontFamily.bold, fontSize: fontSize.md, color: colors.text },
  customer: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.textSecondary },
  count: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
  num: { fontFamily: fontFamily.bold, color: colors.text },
  group: {
    gap: 2,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 3, paddingLeft: spacing.sm },
  box: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary },
  notLoaded: { fontFamily: fontFamily.regular, color: colors.textMuted, fontStyle: 'italic' },
  empty: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textMuted },
});
