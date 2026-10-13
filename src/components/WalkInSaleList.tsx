import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dialog } from '@/src/components/AppDialog';
import { Button } from '@/src/components/Button';
import { Card } from '@/src/components/Card';
import { loadWalkInData, useWalkInSaleStore } from '@/src/stores/walkInSaleStore';
import { useWalkInOutbox } from '@/src/stores/walkInOutbox';
import { colors, fontFamily, fontSize, spacing } from '@/src/theme';

const kes = (n: number) => `KES ${Math.round(n).toLocaleString()}`;

/** The bunches scanned for a walk-in customer, and the one submit that sells them all for cash. */
export function WalkInSaleList({ onSold }: { onSold?: () => void }) {
  const lines = useWalkInSaleStore((st) => st.lines);
  const hydrate = useWalkInSaleStore((st) => st.hydrate);
  // The bunch the server refused, marked until the list changes.
  const [bad, setBad] = useState<string | null>(null);

  useEffect(() => {
    hydrate();
    // The shop's bunches and prices, so scans are checked and priced on the phone.
    loadWalkInData()
      .then(() => useWalkInSaleStore.getState().reprice())
      .catch(() => undefined);
  }, [hydrate]);

  if (!lines.length) return null;
  const total = lines.reduce((n, l) => n + l.amount, 0);
  const checking = lines.some((l) => l.pending);
  const stems = lines.reduce((n, l) => n + l.stems, 0);

  // The page clears at once for the next customer. The sale is kept on the phone and sent in
  // the background until the server has it (see walkInOutbox); its bunches leave the phone's
  // stock straight away.
  const submit = () => {
    const { lines: all, submission } = useWalkInSaleStore.getState();
    const rows = all.filter((l) => !l.pending);
    if (!rows.length) return;
    setBad(null);
    useWalkInOutbox.getState().add({ submission, lines: rows });
    useWalkInSaleStore.getState().clear();
    onSold?.();
  };

  const confirmSubmit = () => {
    dialog(
      'Submit invoice',
      `Are you sure you want to submit this invoice?\n\n${lines.length} bunch${lines.length === 1 ? '' : 'es'} · ` +
        `${stems.toLocaleString()} stems · ${kes(total)}`,
      [
        { text: 'No', style: 'cancel' },
        { text: 'Yes', onPress: submit },
      ],
    );
  };

  const remove = (bunchId: string) => {
    setBad(null);
    useWalkInSaleStore.getState().remove(bunchId);
  };

  return (
    <Card style={s.card}>
      <View style={s.head}>
        <Text style={s.title}>
          {lines.length} bunch{lines.length === 1 ? '' : 'es'} · {stems.toLocaleString()} stems
        </Text>
        <Text style={s.total}>{kes(total)}</Text>
      </View>
      {lines.map((l) => (
        <View key={l.bunch_id} style={[s.row, bad === l.bunch_id && s.rowBad]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.variety} numberOfLines={1}>
              {l.item_name}
              {l.stem_length ? <Text style={s.bold}>{`  ${l.stem_length}`}</Text> : null}
            </Text>
            <Text style={s.meta} numberOfLines={1}>
              {[l.bunch_size, l.farm, l.bunch_id].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <Text style={[s.amount, (l.pending || !l.amount) && s.pending]}>{l.pending ? 'Checking…' : l.amount ? kes(l.amount) : '—'}</Text>
          <Pressable onPress={() => remove(l.bunch_id)} hitSlop={10} accessibilityLabel={`Remove ${l.item_name}`}>
            <Ionicons name="close-circle" size={20} color={colors.textMuted} />
          </Pressable>
        </View>
      ))}
      <Button
        label={`Submit invoice · ${kes(total)}`}
        iconLeft="checkmark-done-outline"
        disabled={checking}
        onPress={confirmSubmit}
      />
    </Card>
  );
}

const s = StyleSheet.create({
  card: { marginTop: spacing.md, gap: spacing.xs },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  title: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  total: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: colors.text },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rowBad: { backgroundColor: '#FEF2F2' },
  variety: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  bold: { fontFamily: fontFamily.bold },
  meta: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  amount: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  pending: { fontFamily: fontFamily.regular, color: colors.textMuted },
});
