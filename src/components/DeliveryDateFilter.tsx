import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { deliveryDate, useDeliveryDate } from '@/src/stores/deliveryDateStore';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

/** "2026-10-07" → "Tue, 7 Oct". */
function prettyDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const day = d.toLocaleDateString('en-GB', { weekday: 'short' });
  const rest = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `${day}, ${rest}`;
}

/** Delivery-date stepper, as in the Quality app: ‹ Today › with its date below, a day at a time. */
export function DeliveryDateFilter({ onChange }: { onChange?: () => void }) {
  const offset = useDeliveryDate((s) => s.offset);
  const step = useDeliveryDate((s) => s.step);
  const go = (days: number) => {
    step(days);
    onChange?.();
  };
  // Today by name with its date below; any other day by its date.
  const date = deliveryDate(offset);
  const today = offset === 0;
  return (
    <View style={s.card}>
      <Text style={s.label}>Delivering</Text>
      <View style={s.row}>
        <View style={s.stepper}>
          <Pressable onPress={() => go(-1)} hitSlop={8} style={s.btn} accessibilityLabel="Previous day">
            <Ionicons name="chevron-back" size={28} color={colors.text} />
          </Pressable>
          <View style={s.center}>
            <Text style={s.value}>{today ? 'Today' : prettyDate(date)}</Text>
            {today ? <Text style={s.date}>{prettyDate(date)}</Text> : null}
          </View>
          <Pressable onPress={() => go(1)} hitSlop={8} style={s.btn} accessibilityLabel="Next day">
            <Ionicons name="chevron-forward" size={28} color={colors.text} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs },
  // ‹ and › at the two ends, the Tomorrow button right after ›.
  stepper: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  btn: { width: 40, height: 52, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center', minWidth: 96, minHeight: 52 },
  label: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  value: { fontFamily: fontFamily.bold, fontSize: fontSize.xl, color: colors.text },
  date: { fontFamily: fontFamily.medium, fontSize: fontSize.md, color: colors.textMuted, marginTop: 1 },
});
