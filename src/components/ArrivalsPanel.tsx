import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/src/components/Button';
import { Card } from '@/src/components/Card';
import { dialog } from '@/src/components/AppDialog';
import { useToast } from '@/src/components/Toast';
import { HUB_FARM } from '@/src/scan/actions';
import { scanApi, type IncomingTruck } from '@/src/services/scan-api';
import { userMessage } from '@/src/services/user-message';
import { colors, fontFamily, fontSize, spacing } from '@/src/theme';

interface Props {
  /** Bumped by the screen to reload the trucks. */
  version?: number;
}

/**
 * The farm trucks on their way to Burguret (their Dispatch Forms to Burguret). Confirming one
 * records its arrival; its boxes are then scanned onto the Nairobi or Wells Fargo truck.
 */
export function ArrivalsPanel({ version }: Props) {
  const { notify } = useToast();
  const [trucks, setTrucks] = useState<IncomingTruck[] | null>(null);
  const [arriving, setArriving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await scanApi.incomingTrucks();
      if (!r.success) throw new Error(r.error || 'Could not load the trucks');
      setError(null);
      setTrucks(r.trucks ?? []);
    } catch (err) {
      setError(userMessage(err, 'Could not load the trucks'));
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load, version]);

  const arrive = async (truck: IncomingTruck) => {
    setArriving(truck.name);
    try {
      const r = await scanApi.arriveAtHub(truck.name, '');
      notify(
        r.success ? r.message || `${truck.vehicle} arrived` : r.error || 'Could not confirm the arrival',
        r.success ? 'success' : 'error',
        2500,
        'center',
      );
    } catch (err) {
      notify(userMessage(err, 'Could not confirm the arrival'), 'error', 2500, 'center');
    } finally {
      setArriving(null);
      load();
    }
  };

  const confirm = (truck: IncomingTruck) => {
    dialog(
      'Confirm arrival',
      `Are you sure ${truck.vehicle} from ${truck.farm} has arrived at ${HUB_FARM}?\n\n` +
        `${truck.total_boxes} box${truck.total_boxes === 1 ? '' : 'es'} on ${truck.name}`,
      [
        { text: 'No', style: 'cancel' },
        { text: 'Yes', onPress: () => arrive(truck) },
      ],
      { cancelable: true },
    );
  };

  return (
    <Card style={s.card}>
      <Text style={s.title}>ON THE WAY TO {HUB_FARM.toUpperCase()}</Text>
      {error && !trucks ? (
        <Button label="Try again" iconLeft="refresh" variant="outline" onPress={load} />
      ) : null}
      {error ? <Text style={s.empty}>{error}</Text> : null}
      {trucks === null && !error ? <Text style={s.empty}>Loading…</Text> : null}
      {trucks && !trucks.length ? (
        <Text style={s.empty}>No farm trucks on the way</Text>
      ) : null}
      {(trucks ?? []).map((t) => (
        <View key={t.name} style={s.row}>
          <Ionicons name="bus-outline" size={18} color={colors.textSecondary} />
          <View style={{ flex: 1 }}>
            <Text style={s.truck} numberOfLines={1}>
              {t.vehicle} · {t.farm}
            </Text>
            <Text style={s.meta}>
              {t.name} · {t.total_boxes} boxes
            </Text>
          </View>
          <Button
            label="Arrived"
            iconLeft="checkmark-done-outline"
            variant="outline"
            onPress={() => confirm(t)}
            loading={arriving === t.name}
            disabled={!!arriving}
          />
        </View>
      ))}
    </Card>
  );
}

const s = StyleSheet.create({
  card: { marginTop: spacing.md, gap: spacing.xs },
  title: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: colors.textMuted, letterSpacing: 0.5 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  truck: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  empty: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textMuted, paddingVertical: spacing.xs },
  meta: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
});
