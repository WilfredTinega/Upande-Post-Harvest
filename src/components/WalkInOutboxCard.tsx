import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/src/components/Button';
import { Card } from '@/src/components/Card';
import { useToast } from '@/src/components/Toast';
import { audio } from '@/src/audio';
import { onOutboxResult, useWalkInOutbox, type OutboxSale } from '@/src/stores/walkInOutbox';
import { useWalkInSaleStore } from '@/src/stores/walkInSaleStore';
import { colors, fontFamily, fontSize, spacing } from '@/src/theme';

const kes = (n: number) => `KES ${Math.round(n).toLocaleString()}`;

/** Walk-in sales on their way to the server, and the ones it refused, each with what to do. */
export function WalkInOutboxCard() {
  const sales = useWalkInOutbox((st) => st.sales);
  const hydrate = useWalkInOutbox((st) => st.hydrate);
  const { notify } = useToast();

  useEffect(() => {
    hydrate();
    return onOutboxResult((r) => {
      if (r.ok) {
        audio.beep();
        notify(
          `${r.customer ?? 'Walk-in customer'}${r.number ? ` #${r.number}` : ''} · ${kes(r.total ?? r.sale.total)} paid\n${r.invoice ?? ''}`,
          'success',
          3000,
          'center',
        );
      } else {
        notify(r.error || 'Could not submit the invoice', 'error', 3000, 'center');
      }
    });
  }, [hydrate, notify]);

  if (!sales.length) return null;

  // Back on the page as it was, to fix and submit again.
  const backToPage = (sale: OutboxSale) => {
    useWalkInSaleStore.getState().restore(sale.lines, sale.submission);
    useWalkInOutbox.getState().drop(sale.submission);
  };

  return (
    <Card style={s.card}>
      <Text style={s.title}>SENDING TO THE SERVER</Text>
      {sales.map((sale) => (
        <View key={sale.submission} style={s.sale}>
          <View style={s.row}>
            <Ionicons
              name={sale.state === 'failed' ? 'alert-circle' : sale.state === 'sending' ? 'cloud-upload-outline' : 'time-outline'}
              size={18}
              color={sale.state === 'failed' ? colors.error : colors.warning}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.amount}>
                {kes(sale.total)} · {sale.lines.length} bunch{sale.lines.length === 1 ? '' : 'es'}
              </Text>
              <Text style={[s.status, sale.state === 'failed' && s.failed]} numberOfLines={2}>
                {sale.state === 'sending'
                  ? 'Sending…'
                  : sale.state === 'failed'
                    ? sale.error
                    : `Waiting to send again${sale.attempts ? ` (try ${sale.attempts + 1})` : ''}`}
              </Text>
            </View>
          </View>
          {sale.state === 'failed' ? (
            <View style={s.buttons}>
              <Button label="Try again" iconLeft="refresh" variant="outline" onPress={() => useWalkInOutbox.getState().retry(sale.submission)} style={{ flex: 1 }} />
              <Button label="Back to page" iconLeft="return-up-back-outline" variant="outline" onPress={() => backToPage(sale)} style={{ flex: 1 }} />
              <Button
                label="Remove"
                iconLeft="trash-outline"
                variant="outline"
                color={colors.error}
                onPress={() => useWalkInOutbox.getState().drop(sale.submission)}
                style={{ flex: 1 }}
              />
            </View>
          ) : null}
        </View>
      ))}
    </Card>
  );
}

const s = StyleSheet.create({
  card: { marginTop: spacing.md, gap: spacing.xs },
  title: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: colors.textMuted, letterSpacing: 1.2 },
  sale: {
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  amount: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  status: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  failed: { color: colors.error },
  buttons: { flexDirection: 'row', gap: spacing.sm },
});
