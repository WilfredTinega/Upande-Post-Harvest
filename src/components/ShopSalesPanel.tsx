import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/src/components/Card';
import { Button } from '@/src/components/Button';
import { dialog } from '@/src/components/AppDialog';
import { useToast } from '@/src/components/Toast';
import { audio } from '@/src/audio';
import { loadWalkInData } from '@/src/stores/walkInSaleStore';
import { ListSkeleton } from '@/src/components/Skeleton';
import { Tab, summaryStyles } from '@/src/components/SummaryParts';
import { scanApi, type ShopSale, type ShopSaleDetail } from '@/src/services/scan-api';
import { userMessage } from '@/src/services/user-message';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

const kes = (n: number) => `KES ${Math.round(n).toLocaleString()}`;

interface Props {
  /** Changes when the home screen reloads its figures, to reload the sales too. */
  version?: unknown;
}

type Kind = 'si' | 'so';
type Status = 'submitted' | 'draft' | 'cancelled';

const statusOf = (r: ShopSale): Status => (r.status === 'Draft' ? 'draft' : r.status === 'Cancelled' ? 'cancelled' : 'submitted');

/** Today's shop sales (every farm): the invoices and the orders, newest first; a tap shows one line by line. */
export function ShopSalesPanel({ version }: Props) {
  const [data, setData] = useState<{ orders: ShopSale[]; invoices: ShopSale[]; amount: number; stems: number; count: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Kind>('si');
  const [status, setStatus] = useState<Status>('submitted');
  const [open, setOpen] = useState<{ kind: Kind; name: string; label: string } | null>(null);
  // Sales being cancelled in the background, marked on the list until it reloads.
  const [cancelling, setCancelling] = useState<Record<string, true>>({});
  const { notify } = useToast();

  const load = useCallback(async () => {
    try {
      const r = await scanApi.shopSales();
      if (!r.success) throw new Error(r.error || 'Could not load the sales');
      setError(null);
      setData({ orders: r.orders ?? [], invoices: r.invoices ?? [], amount: r.amount ?? 0, stems: r.stems ?? 0, count: r.count ?? 0 });
    } catch (err) {
      setError(userMessage(err, 'Could not load the sales'));
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load, version]);

  // Runs whether or not the sheet stays open: the list and the sheet show the sale as cancelling.
  async function cancelInBackground(kind: Kind, name: string, label: string, reason: string): Promise<boolean> {
    setCancelling((c) => ({ ...c, [name]: true }));
    let ok = false;
    try {
      const r = await scanApi.shopCancelSale(kind, name, reason);
      if (!r.success) throw new Error(r.error || 'Could not cancel the sale');
      notify(`${label} cancelled · ${r.released ?? 0} bunch(es) back in the shop`, 'success', 3000, 'center');
      // The bunches can be sold again: the walk-in sale's local stock reloads.
      loadWalkInData().catch(() => undefined);
      ok = true;
    } catch (err) {
      notify(userMessage(err, `Could not cancel ${label}`), 'error', 3000, 'center');
    } finally {
      await load();
      setCancelling((c) => {
        const next = { ...c };
        delete next[name];
        return next;
      });
    }
    return ok;
  }

  if (!data) {
    return (
      <Card style={s.card}>
        {error ? <Text style={s.empty}>{error}</Text> : <ListSkeleton rows={3} />}
      </Card>
    );
  }

  const kindRows = tab === 'si' ? data.invoices : data.orders;
  const rows = kindRows.filter((r) => statusOf(r) === status);
  const count = (st: Status) => kindRows.filter((r) => statusOf(r) === st).length;
  const shown = rows.reduce((n, r) => n + r.amount, 0);
  const shownStems = rows.reduce((n, r) => n + r.stems, 0);
  const what = tab === 'si' ? 'invoices' : 'orders';

  return (
    <Card style={s.card}>
      <View style={s.head}>
        <Text style={summaryStyles.sectionLabel}>SALES TODAY</Text>
        <Text style={s.total}>
          {kes(data.amount)} · {data.stems.toLocaleString()} stems
        </Text>
      </View>
      <View style={summaryStyles.tabs}>
        <Tab label="Invoices" count={data.invoices.length} active={tab === 'si'} onPress={() => setTab('si')} />
        <Tab label="Orders" count={data.orders.length} active={tab === 'so'} onPress={() => setTab('so')} />
      </View>
      <View style={summaryStyles.tabs}>
        <Tab label="Submitted" count={count('submitted')} active={status === 'submitted'} onPress={() => setStatus('submitted')} />
        <Tab label="Drafts" count={count('draft')} active={status === 'draft'} onPress={() => setStatus('draft')} />
        <Tab label="Cancelled" count={count('cancelled')} active={status === 'cancelled'} onPress={() => setStatus('cancelled')} />
      </View>
      {rows.length ? (
        <View style={s.subtotal}>
          <Text style={s.subtotalText}>
            {rows.length} {status === 'draft' ? 'draft' : status} {what}
          </Text>
          <Text style={[s.subtotalAmount, status === 'cancelled' && s.cancelledAmount]}>
            {kes(shown)} · {shownStems.toLocaleString()} stems
          </Text>
        </View>
      ) : (
        <Text style={s.empty}>No {status === 'draft' ? 'draft' : status} {what} today</Text>
      )}
      {rows.map((r) => (
        <Pressable
          key={r.name}
          onPress={() => setOpen({ kind: tab, name: r.name, label: `${r.customer} #${r.number}` })}
          style={({ pressed }) => [s.row, pressed && s.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`${r.name}, ${kes(r.amount)}`}
        >
          <Text style={s.time}>{r.time}</Text>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.name} numberOfLines={1}>
              {r.customer} #{r.number}
              {r.status === 'Draft' ? <Text style={s.draft}>  Draft</Text> : null}
              {cancelling[r.name] ? <Text style={s.draft}>  Cancelling…</Text> : null}
            </Text>
            <Text style={s.meta} numberOfLines={1}>
              {r.name} · {r.bunches} bunch{r.bunches === 1 ? '' : 'es'} · {r.stems.toLocaleString()} stems · {r.by}
            </Text>
          </View>
          <Text style={[s.amount, statusOf(r) === 'cancelled' && s.cancelledAmount]}>{kes(r.amount)}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>
      ))}
      <SaleSheet
        sale={open}
        onClose={() => setOpen(null)}
        onSubmitted={load}
        onCancel={cancelInBackground}
        cancellingNow={!!open && !!cancelling[open.name]}
      />
    </Card>
  );
}

function SaleSheet({
  sale,
  onClose,
  onSubmitted,
  onCancel,
  cancellingNow,
}: {
  sale: { kind: Kind; name: string; label: string } | null;
  onClose: () => void;
  onSubmitted: () => void;
  onCancel: (kind: Kind, name: string, label: string, reason: string) => Promise<boolean>;
  /** The sale is being cancelled (started here, or before the sheet was opened again). */
  cancellingNow: boolean;
}) {
  const { notify } = useToast();
  const [submitting, setSubmitting] = useState(false);
  // Cancelling: the reason box is open, and the reason typed.
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [detail, setDetail] = useState<{ key: string; data?: ShopSaleDetail; error?: string } | null>(null);
  const key = sale ? `${sale.kind}|${sale.name}` : '';

  useEffect(() => {
    if (!sale) return;
    let live = true;
    scanApi
      .shopSaleDetail(sale.kind, sale.name)
      .then((r) => {
        if (!live) return;
        if (!r.success) throw new Error(r.error || 'Could not load the sale');
        setDetail({ key, data: r });
      })
      .catch((err) => live && setDetail({ key, error: userMessage(err, 'Could not load the sale') }));
    return () => {
      live = false;
    };
  }, [sale, key]);

  const d = detail?.key === key ? detail.data : undefined;
  const failed = detail?.key === key ? detail.error : undefined;
  const what = sale?.kind === 'si' ? 'invoice' : 'order';

  const submit = async () => {
    if (!sale) return;
    setSubmitting(true);
    try {
      const r = await scanApi.shopSubmitDraft(sale.kind, sale.name);
      if (!r.success) throw new Error(r.error || `Could not submit the ${what}`);
      audio.beep();
      notify(`${r.name} submitted${r.status ? ` · ${r.status}` : ''}`, 'success', 2500, 'center');
      setDetail(null);
      onSubmitted();
      onClose();
    } catch (err) {
      notify(userMessage(err, `Could not submit the ${what}`), 'error', 3000, 'center');
    } finally {
      setSubmitting(false);
    }
  };

  const close = () => {
    setCancelling(false);
    setReason('');
    onClose();
  };

  // The sheet stays open showing "Cancelling…", then the sale as Cancelled; closing it meanwhile is fine.
  const cancelSale = async () => {
    if (!sale) return;
    const current = sale;
    setCancelling(false);
    const ok = await onCancel(current.kind, current.name, current.label, reason.trim());
    setReason('');
    if (ok) {
      const r = await scanApi.shopSaleDetail(current.kind, current.name).catch(() => null);
      if (r?.success) setDetail({ key: `${current.kind}|${current.name}`, data: r });
    }
  };

  const confirmCancel = () =>
    dialog(
      'Cancel sale',
      `Are you sure you want to cancel ${sale?.label}?\n\nIts invoice and order are cancelled and the flowers go back to the shop.\n\nReason: ${reason.trim()}`,
      [
        { text: 'No', style: 'cancel' },
        { text: 'Yes', onPress: cancelSale },
      ],
    );

  const confirmSubmit = () =>
    dialog(`Submit ${what}`, `Are you sure you want to submit this ${what}?\n\n${sale?.name} · ${kes(d?.amount ?? 0)}`, [
      { text: 'No', style: 'cancel' },
      { text: 'Yes', onPress: submit },
    ]);

  return (
    <Modal visible={!!sale} transparent animationType="slide" onRequestClose={close}>
      <View style={s.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" />
        <View style={s.sheet}>
          <View style={s.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={s.sheetTitle} numberOfLines={1}>
                {sale?.label}
              </Text>
              <Text style={s.meta} numberOfLines={1}>
                {[sale?.name, d?.time, d?.status].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <Pressable onPress={close} style={s.closeBtn} accessibilityLabel="Close">
              <Ionicons name="close" size={20} color={colors.text} />
            </Pressable>
          </View>
          {cancellingNow ? (
            <View style={[s.banner, s.bannerBusy]}>
              <Ionicons name="hourglass-outline" size={18} color={colors.warning} />
              <Text style={s.bannerText}>Cancelling… the flowers are going back to the shop</Text>
            </View>
          ) : d?.status === 'Cancelled' ? (
            <View style={[s.banner, s.bannerDone]}>
              <Ionicons name="close-circle" size={18} color={colors.error} />
              <Text style={s.bannerText}>Cancelled · the flowers are back in the shop</Text>
            </View>
          ) : null}
          {failed ? <Text style={s.empty}>{failed}</Text> : null}
          {!d && !failed ? <ListSkeleton rows={3} /> : null}
          {d ? (
            <>
              <View style={s.stats}>
                <Stat label="Amount" value={kes(d.amount)} />
                <Stat label="Stems" value={d.stems.toLocaleString()} />
                <Stat label="Bunches" value={d.bunches.toLocaleString()} />
              </View>
              <ScrollView style={{ maxHeight: 360 }}>
                {d.lines.map((l, i) => (
                  <View key={i} style={s.row}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.name} numberOfLines={1}>
                        {l.variety}
                        {l.stem_length ? <Text style={s.bold}>{`  ${l.stem_length}`}</Text> : null}
                      </Text>
                      <Text style={s.meta} numberOfLines={1}>
                        {l.bunches} × {l.bunch_size} · {l.stems} stems · {l.store}
                      </Text>
                    </View>
                    <Text style={s.amount}>{kes(l.amount)}</Text>
                  </View>
                ))}
              </ScrollView>
              {d.tax ? <Text style={s.meta}>Includes VAT {kes(d.tax)}</Text> : null}
              {d.status === 'Draft' ? (
                <Button
                  label={submitting ? 'Submitting…' : `Submit ${what} · ${kes(d.amount)}`}
                  iconLeft="checkmark-done-outline"
                  loading={submitting}
                  onPress={confirmSubmit}
                />
              ) : null}
              {d.status !== 'Draft' && d.status !== 'Cancelled' && !cancelling && !cancellingNow ? (
                <Button label="Cancel sale" iconLeft="close-circle-outline" variant="outline" color={colors.error} onPress={() => setCancelling(true)} />
              ) : null}
              {cancelling ? (
                <View style={s.cancelBox}>
                  <Text style={s.cancelLabel}>Reason for cancelling</Text>
                  <TextInput
                    value={reason}
                    onChangeText={setReason}
                    placeholder="e.g. Customer returned the flowers"
                    placeholderTextColor={colors.textMuted}
                    style={s.input}
                    autoFocus
                  />
                  <View style={s.cancelButtons}>
                    <Button label="Back" variant="outline" onPress={() => setCancelling(false)} style={{ flex: 1 }} />
                    <Button
                      label="Cancel sale"
                      iconLeft="close-circle-outline"
                      color={colors.error}
                      disabled={!reason.trim()}
                      onPress={confirmCancel}
                      style={{ flex: 1 }}
                    />
                  </View>
                </View>
              ) : null}
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { marginTop: spacing.md, gap: spacing.xs },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  total: { fontFamily: fontFamily.bold, fontSize: fontSize.sm, color: colors.text },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  pressed: { backgroundColor: colors.surfaceAlt },
  time: { width: 44, fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.textSecondary },
  name: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  bold: { fontFamily: fontFamily.bold },
  draft: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.warning },
  subtotal: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.xs },
  subtotalText: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textSecondary },
  subtotalAmount: { fontFamily: fontFamily.bold, fontSize: fontSize.sm, color: colors.text },
  cancelledAmount: { color: colors.textMuted, textDecorationLine: 'line-through' },
  meta: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  amount: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  empty: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textMuted, paddingVertical: spacing.sm },
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sheetTitle: { fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: colors.text },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stats: { flexDirection: 'row', gap: spacing.sm },
  cancelBox: { gap: spacing.sm },
  banner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: 10 },
  bannerBusy: { backgroundColor: '#FFFBEB' },
  bannerDone: { backgroundColor: '#FEF2F2' },
  bannerText: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  cancelLabel: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  input: {
    minHeight: 48,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.text,
  },
  cancelButtons: { flexDirection: 'row', gap: spacing.sm },
  stat: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: 10, backgroundColor: colors.surfaceAlt },
  statValue: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: colors.text },
  statLabel: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textSecondary },
});
