import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/src/components/Button';
import { Card } from '@/src/components/Card';
import { dialog } from '@/src/components/AppDialog';
import { useToast } from '@/src/components/Toast';
import { audio } from '@/src/audio';
import { scanApi, type HubForm } from '@/src/services/scan-api';
import { userMessage } from '@/src/services/user-message';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

const TRIPS = ['Nairobi', 'Wells Fargo'] as const;

interface Props {
  truck: string;
  /** '' until picked. */
  trip: string;
  onTrip: (trip: string) => void;
  /** Bumped after each box loaded, to reload the form. */
  version: number;
  /** The truck left: the screen starts again with the next truck. */
  onDispatched: () => void;
}

/** Burguret's truck: its trip, what is on its Dispatch Form so far, and the button that sends it. */
export function HubDispatchPanel({ truck, trip, onTrip, version, onDispatched }: Props) {
  const { notify } = useToast();
  const [form, setForm] = useState<HubForm | null>(null);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!trip) {
      setForm(null);
      return;
    }
    try {
      const r = await scanApi.hubForm(truck, trip);
      if (r.success) setForm(r.form ?? null);
    } catch {
      // The form stays as it was; the next box reloads it.
    }
  }, [truck, trip]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load, version]);

  const send = async () => {
    setSending(true);
    try {
      const r = await scanApi.hubSend(truck, trip);
      if (!r.success) throw new Error(r.error || 'Could not dispatch the truck');
      audio.beep();
      notify(r.message || `${truck} dispatched to ${trip}`, 'success', 3000, 'center');
      onDispatched();
    } catch (err) {
      notify(userMessage(err, 'Could not dispatch the truck'), 'error', 3000, 'center');
    } finally {
      setSending(false);
    }
  };

  const confirmSend = () =>
    dialog(
      'Dispatch truck',
      `Are you sure ${truck} is loaded and leaving for ${trip}?\n\n${form?.boxes ?? 0} box${form?.boxes === 1 ? '' : 'es'} on ${form?.name}`,
      [
        { text: 'No', style: 'cancel' },
        { text: 'Yes', onPress: send },
      ],
    );

  return (
    <Card style={s.card}>
      <Text style={s.label}>TRIP</Text>
      <View style={s.trips}>
        {TRIPS.map((t) => {
          const on = trip === t;
          return (
            <Pressable
              key={t}
              onPress={() => onTrip(t)}
              style={({ pressed }) => [s.trip, on && s.tripOn, pressed && s.pressed]}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
            >
              {on ? <Ionicons name="checkmark" size={16} color={colors.textOnPrimary} /> : null}
              <Text style={[s.tripText, on && s.tripTextOn]}>{t}</Text>
            </Pressable>
          );
        })}
      </View>

      {trip && form ? (
        <>
          <View style={s.head}>
            <Text style={s.formName}>{form.name}</Text>
            <Text style={s.count}>
              <Text style={s.num}>{form.boxes}</Text> box{form.boxes === 1 ? '' : 'es'}
            </Text>
          </View>
          {form.customers.map((c) => (
            <View key={`${c.delivery_point}|${c.customer}`} style={s.row}>
              <Text style={s.customer} numberOfLines={1}>
                {c.customer}
                {c.delivery_point ? <Text style={s.point}>{`  · ${c.delivery_point}`}</Text> : null}
              </Text>
              <Text style={s.boxes}>{c.boxes}</Text>
            </View>
          ))}
          <Button
            label={sending ? 'Dispatching…' : `Dispatch truck · ${form.boxes} boxes`}
            iconLeft="paper-plane-outline"
            loading={sending}
            disabled={!form.boxes}
            onPress={confirmSend}
          />
        </>
      ) : trip ? (
        <Text style={s.empty}>Nothing loaded yet</Text>
      ) : null}
    </Card>
  );
}

const s = StyleSheet.create({
  card: { marginTop: spacing.md, gap: spacing.sm },
  label: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: colors.textMuted, letterSpacing: 1.2 },
  trips: { flexDirection: 'row', gap: spacing.sm },
  trip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 44,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tripOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tripText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text },
  tripTextOn: { color: colors.textOnPrimary },
  pressed: { opacity: 0.75 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xs },
  formName: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: colors.text },
  count: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textMuted },
  num: { fontFamily: fontFamily.bold, color: colors.text },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  customer: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  point: { fontFamily: fontFamily.regular, color: colors.textMuted },
  boxes: { fontFamily: fontFamily.bold, fontSize: fontSize.sm, color: colors.text },
  empty: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textMuted },
});
