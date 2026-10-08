import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/src/components/Button';
import { Dropdown } from '@/src/components/Dropdown';
import { SearchPicker } from '@/src/components/SearchPicker';
import { scanApi, type LoadingPlan, type VehicleOption } from '@/src/services/scan-api';
import { useScanStore } from '@/src/stores/scanStore';
import { deliveryDate } from '@/src/stores/deliveryDateStore';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

export interface NewPlan {
  vehicle: string;
  farm: string;
  /** yyyy-mm-dd: the day the truck delivers; the plan is named after it. */
  deliveryDate: string;
}

interface Props {
  /** The station's farm, chosen until another is picked. */
  farm: string;
  /** Creates the plan; the button shows Creating… until it settles. */
  onCreate: (plan: NewPlan) => Promise<void>;
  /** Open one of the delivery date's plans instead of creating one. */
  onOpen: (plan: LoadingPlan) => void;
  onCancel?: () => void;
}

/** "2026-10-07" → "Tue, 7 Oct 2026". */
export function prettyDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

/** Truck, farm and delivery date for a new loading plan, created with one button. */
export function NewLoadingPlanForm({ farm, onCreate, onOpen, onCancel }: Props) {
  const farms = useScanStore((s) => s.farms);
  const [vehicle, setVehicle] = useState<VehicleOption | null>(null);
  const [creating, setCreating] = useState(false);
  // Why Create can't go yet, shown when it is tapped too early.
  const [missing, setMissing] = useState<string | null>(null);
  const [planFarm, setPlanFarm] = useState(farm);
  // Trucks are planned the day before they deliver.
  const [offset, setOffset] = useState(1);
  const date = deliveryDate(offset);

  // The plans already delivering that day for the farm (null while that day's list loads).
  const listKey = `${planFarm}|${date}`;
  const [loaded, setLoaded] = useState<{ key: string; plans: LoadingPlan[] } | null>(null);
  const dayPlans = loaded?.key === listKey ? loaded.plans : null;
  useEffect(() => {
    let live = true;
    scanApi
      .listOpenLoadingPlans(planFarm, date)
      .then((r) => live && setLoaded({ key: `${planFarm}|${date}`, plans: r.success ? (r.plans ?? []) : [] }))
      .catch(() => live && setLoaded({ key: `${planFarm}|${date}`, plans: [] }));
    return () => {
      live = false;
    };
  }, [planFarm, date]);

  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <Text style={s.title}>New loading plan</Text>
        {onCancel ? (
          <Pressable onPress={onCancel} hitSlop={10} accessibilityLabel="Cancel new loading plan">
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      <SearchPicker<VehicleOption>
        label="Truck"
        icon="bus-outline"
        value={vehicle ? { title: vehicle.vehicle, sub: vehicle.description || undefined } : null}
        placeholder="Choose the truck"
        load={async (query) => {
          const r = await scanApi.listVehicles(planFarm, query);
          if (!r.success) throw new Error(r.error || 'Could not load the trucks');
          return r.vehicles ?? [];
        }}
        keyOf={(v) => v.vehicle}
        row={(v) => ({ title: v.vehicle, sub: v.description || undefined })}
        onPick={(v) => {
          setVehicle(v);
          setMissing(null);
        }}
        onClear={() => setVehicle(null)}
        searchPlaceholder="Search truck"
        emptyText="No trucks set up"
      />

      <Dropdown
        label="Farm"
        value={planFarm}
        options={(farms.length ? farms : [farm]).map((f) => ({ label: f, value: f }))}
        onChange={setPlanFarm}
      />

      <View>
        <Text style={s.label}>Delivery date</Text>
        <View style={s.stepper}>
          <Pressable onPress={() => setOffset((o) => o - 1)} hitSlop={8} style={s.stepBtn} accessibilityLabel="Previous day">
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
          <View style={s.center}>
            <Text style={s.dateValue}>{date}</Text>
            <Text style={s.dateSub}>{prettyDate(date)}</Text>
          </View>
          <Pressable onPress={() => setOffset((o) => o + 1)} hitSlop={8} style={s.stepBtn} accessibilityLabel="Next day">
            <Ionicons name="chevron-forward" size={24} color={colors.text} />
          </Pressable>
        </View>
      </View>

      {missing ? <Text style={s.missing}>{missing}</Text> : null}
      <Button
        label={creating ? 'Creating…' : 'Create loading plan'}
        iconLeft="add-circle-outline"
        loading={creating}
        onPress={async () => {
          if (!vehicle) return setMissing('Choose the truck first');
          if (!planFarm) return setMissing('Choose the farm first');
          setMissing(null);
          // The truck already has a plan for that farm and day: open it rather than make another.
          const existing = dayPlans?.find(
            (p) => p.vehicle === vehicle.vehicle && (p.farm ?? '') === planFarm && p.docstatus === 0,
          );
          if (existing) return onOpen(existing);
          setCreating(true);
          try {
            await onCreate({ vehicle: vehicle.vehicle, farm: planFarm, deliveryDate: date });
          } finally {
            setCreating(false);
          }
        }}
      />

      <View>
        <Text style={s.label}>Loading plans delivering {date}</Text>
        {dayPlans === null ? (
          <Text style={s.none}>Loading…</Text>
        ) : dayPlans.length ? (
          <View style={s.plans}>
            {dayPlans.map((p) => (
              <Pressable
                key={p.name}
                onPress={() => onOpen(p)}
                style={({ pressed }) => [s.plan, pressed && s.planPressed]}
                accessibilityRole="button"
                accessibilityLabel={`Open ${p.name}`}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.planName}>{p.name}</Text>
                  <Text style={s.planSub} numberOfLines={1}>
                    {[p.vehicle, p.farm, p.status].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Text style={s.planBoxes}>
                  {p.docstatus === 1 ? `${p.total_boxes} boxes` : `${p.loaded_boxes}/${p.total_boxes}`}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={s.none}>No loading plans for {date} yet</Text>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: colors.text },
  label: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text, marginBottom: spacing.sm },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    minHeight: 56,
  },
  stepBtn: { width: 48, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center' },
  dateValue: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: colors.text },
  none: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textMuted },
  plans: { borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.sm, overflow: 'hidden' },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  planPressed: { backgroundColor: colors.surfaceAlt },
  planName: { fontFamily: fontFamily.bold, fontSize: fontSize.sm, color: colors.text },
  planSub: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  planBoxes: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  missing: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.error },
  dateSub: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
});
