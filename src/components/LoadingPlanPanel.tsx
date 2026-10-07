import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/src/components/Button';
import { Card } from '@/src/components/Card';
import type { LoadingPlan, LoadingPlanCustomer } from '@/src/services/scan-api';
import { colors, fontFamily, fontSize, spacing } from '@/src/theme';

interface Props {
  plan: LoadingPlan;
  /** plan: build the plan; load: scan boxes onto the truck; dispatch: send the loaded truck. */
  mode: 'plan' | 'load' | 'dispatch';
  removing?: boolean;
  onToggleRemoving?: (on: boolean) => void;
  onRefresh?: () => void;
  onDispatch?: () => void;
  dispatching?: boolean;
  /** Plan tomorrow's orders' packed boxes onto the truck in one go. */
  onFetch?: () => void;
  fetching?: boolean;
}

/** A truck's Loading Plan: the loading sheet per customer, plus the plan/dispatch controls. */
export function LoadingPlanPanel({
  plan,
  mode,
  removing,
  onToggleRemoving,
  onRefresh,
  onDispatch,
  dispatching,
  onFetch,
  fetching,
}: Props) {
  const dispatched = plan.docstatus === 1;
  const allLoaded = plan.total_boxes > 0 && plan.loaded_boxes >= plan.total_boxes;

  return (
    <Card style={s.card}>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>
            {plan.name} · {plan.status}
          </Text>
          <Text style={s.sub}>
            {plan.farm ? `${plan.farm} · ` : ''}
            {plan.required_boxes ? (
              <>
                Required <Text style={s.num}>{plan.required_boxes}</Text> ·{' '}
              </>
            ) : null}
            Planned <Text style={s.num}>{plan.total_boxes}</Text> · Loaded{' '}
            <Text style={s.num}>{plan.loaded_boxes}</Text>
            {plan.consolidated_boxes ? (
              <>
                {' '}· Consolidated <Text style={s.num}>{plan.consolidated_boxes}</Text>
              </>
            ) : null}
            {plan.delivered_boxes ? (
              <>
                {' '}· Delivered <Text style={s.num}>{plan.delivered_boxes}</Text>
              </>
            ) : null}{' '}
            boxes
          </Text>
        </View>
        {onRefresh ? (
          <Pressable onPress={onRefresh} hitSlop={10} accessibilityLabel="Refresh plan">
            <Ionicons name="refresh" size={20} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      {plan.sheet ? (
        plan.sheet.length ? (
          <LoadingSheet sheet={plan.sheet} showLoaded={mode !== 'plan' || dispatched} />
        ) : (
          <Text style={s.empty}>No boxes on this truck yet.</Text>
        )
      ) : plan.customers.length === 0 ? (
        <Text style={s.empty}>No boxes on this truck yet.</Text>
      ) : (
        groupByCustomer(plan.customers).map((g, gi) => (
          <View key={g.customer} style={[s.group, gi > 0 && s.divider]}>
            <View style={s.groupHead}>
              <Text style={s.customer} numberOfLines={1}>
                {g.customer}
              </Text>
              <Text style={s.groupCount}>
                {mode !== 'plan' || dispatched ? `${g.loaded}/${g.planned}` : g.planned} boxes
              </Text>
            </View>
            {g.points.map((c) => {
              const done = c.planned > 0 && c.loaded >= c.planned;
              return (
                <View key={`${c.customer}|${c.delivery_point ?? ''}`} style={s.row}>
                  <Ionicons
                    name={dispatched ? 'document-text-outline' : done ? 'checkmark-circle' : 'ellipse-outline'}
                    size={18}
                    color={done || dispatched ? colors.success : colors.textMuted}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={s.point} numberOfLines={1}>
                      {c.delivery_point || 'No delivery point'}
                    </Text>
                    <Text style={s.meta}>
                      {c.stems} stems
                      {dispatched && c.delivery_note ? ` · ${c.delivery_note}` : ''}
                      {dispatched && c.sales_invoice ? ` · ${c.sales_invoice}` : ''}
                    </Text>
                  </View>
                  <Text style={s.count}>
                    {mode !== 'plan' || dispatched ? `${c.loaded}/${c.planned}` : c.planned}
                  </Text>
                </View>
              );
            })}
          </View>
        ))
      )}

      {!dispatched && onFetch ? (
        <Button
          label={fetching ? 'Fetching orders…' : "Fetch tomorrow's orders"}
          iconLeft="download-outline"
          variant="outline"
          onPress={onFetch}
          loading={fetching}
          style={{ marginTop: spacing.sm }}
        />
      ) : null}

      {mode === 'plan' && !dispatched && onToggleRemoving ? (
        <View style={[s.row, s.divider]}>
          <Text style={[s.customer, { flex: 1 }]}>Take boxes off the plan</Text>
          <Switch value={!!removing} onValueChange={onToggleRemoving} />
        </View>
      ) : null}

      {mode === 'dispatch' && !dispatched && onDispatch ? (
        <Button
          label={
            allLoaded
              ? 'Dispatch truck'
              : `Load every box first (${plan.loaded_boxes}/${plan.total_boxes} loaded)`
          }
          onPress={onDispatch}
          disabled={!allLoaded}
          loading={dispatching}
          iconLeft="paper-plane-outline"
          style={{ marginTop: spacing.md }}
        />
      ) : null}

      {mode === 'dispatch' && plan.boxes?.length ? <BoxesByDate boxes={plan.boxes} /> : null}

      {dispatched ? (
        <Text style={s.done}>
          Dispatched. Delivery Notes and draft Sales Invoices are listed per customer and delivery point above.
        </Text>
      ) : null}
    </Card>
  );
}

interface CustomerGroup {
  customer: string;
  planned: number;
  loaded: number;
  points: LoadingPlanCustomer[];
}

/** The loading sheet: boxes per customer, then per delivery point. */
function groupByCustomer(rows: LoadingPlanCustomer[]): CustomerGroup[] {
  const groups = new Map<string, CustomerGroup>();
  for (const r of rows) {
    const g = groups.get(r.customer) ?? { customer: r.customer, planned: 0, loaded: 0, points: [] };
    g.planned += r.planned;
    g.loaded += r.loaded;
    g.points.push(r);
    groups.set(r.customer, g);
  }
  return [...groups.values()];
}

type Sheet = NonNullable<LoadingPlan['sheet']>;

/**
 * The loading sheet: each delivery point's boxes together, customer by customer, then
 * consignee by consignee, in the order they should go on the truck. Tap a consignee
 * for its boxes.
 */
function LoadingSheet({ sheet, showLoaded }: { sheet: Sheet; showLoaded: boolean }) {
  // Consignees are open by default so every box shows with its loading position.
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  // Loading position: the box's place in the sheet order, from 1.
  const position = new Map<string, number>();
  sheet.forEach((r) => r.boxes.forEach((b) => position.set(b.box, position.size + 1)));
  const points: { point: string; rows: Sheet }[] = [];
  for (const row of sheet) {
    const point = row.delivery_point || 'No delivery point';
    const last = points[points.length - 1];
    if (last && last.point === point) last.rows.push(row);
    else points.push({ point, rows: [row] });
  }
  // A group's boxes: those planned plus those still to come (not packed or not fetched yet).
  const all = (r: Sheet[number]) => r.planned + (r.pending ?? 0);
  const count = (rows: Sheet, key: 'all' | 'loaded') =>
    rows.reduce((n, r) => n + (key === 'all' ? all(r) : r.loaded), 0);
  return (
    <View>
      {points.map((p, pi) => (
        <View key={p.point} style={[s.group, pi > 0 && s.divider]}>
          <View style={s.groupHead}>
            <Text style={s.customer} numberOfLines={1}>
              {p.point}
            </Text>
            <Text style={s.groupCount}>
              {showLoaded ? (
                <>
                  <Text style={s.num}>{count(p.rows, 'loaded')}</Text>/{count(p.rows, 'all')}
                </>
              ) : (
                <Text style={s.num}>{count(p.rows, 'all')}</Text>
              )}{' '}
              boxes
            </Text>
          </View>
          {p.rows.map((r, ri) => {
            const key = `${p.point}|${r.customer}|${r.consignee ?? ''}`;
            const newCustomer = ri === 0 || p.rows[ri - 1].customer !== r.customer;
            const done = all(r) > 0 && r.loaded >= all(r);
            return (
              <View key={key}>
                {newCustomer ? (
                  <Text style={s.sheetCustomer} numberOfLines={1}>
                    {r.customer}
                  </Text>
                ) : null}
                <Pressable onPress={() => toggle(key)} style={s.row}>
                  <Ionicons
                    name={done ? 'checkmark-circle' : 'ellipse-outline'}
                    size={18}
                    color={done ? colors.success : colors.textMuted}
                  />
                  <Text style={[s.point, { flex: 1 }]} numberOfLines={1}>
                    {r.consignee || 'No consignee'}
                  </Text>
                  <Text style={s.count}>{showLoaded ? `${r.loaded}/${all(r)}` : all(r)}</Text>
                  <Ionicons name={closed.has(key) ? 'chevron-down' : 'chevron-up'} size={16} color={colors.textMuted} />
                </Pressable>
                {closed.has(key)
                  ? null
                  : r.boxes.map((b) => (
                      <View key={b.box} style={s.sheetBox}>
                        <Text style={[s.position, b.pending && s.pendingText]}>{position.get(b.box)}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={[s.meta, b.pending && s.pendingText]} numberOfLines={1}>
                            {b.box}
                          </Text>
                          {b.pending ? (
                            <Text style={s.pendingNote}>
                              {b.pending === 'unpacked' ? 'not packed yet' : 'packed · fetch to plan it'}
                            </Text>
                          ) : null}
                          {b.combined ? (
                            <Text style={s.combinedNote}>
                              {typeof b.combined === 'string' ? `consolidated · ${b.combined}` : 'consolidated'}
                            </Text>
                          ) : null}
                          {b.waiting ? (
                            <Text style={s.waitingNote}>
                              {`waiting for ${b.waiting} farm${b.waiting === 1 ? '' : 's'}`}
                            </Text>
                          ) : null}
                        </View>
                        <Ionicons
                          name={
                            b.delivered
                              ? 'checkmark-done-circle'
                              : b.loaded
                                ? 'checkmark-circle'
                                : b.pending
                                  ? 'cube-outline'
                                  : 'ellipse-outline'
                          }
                          size={16}
                          color={b.delivered || b.loaded ? colors.success : colors.textMuted}
                          accessibilityLabel={b.delivered ? 'Delivered' : b.loaded ? 'Loaded' : undefined}
                        />
                      </View>
                    ))}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** The truck's boxes grouped by delivery date (earliest first), each with its customer and whether it is loaded. */
function BoxesByDate({ boxes }: { boxes: NonNullable<LoadingPlan['boxes']> }) {
  const groups = new Map<string, NonNullable<LoadingPlan['boxes']>>();
  for (const b of boxes) {
    const key = b.delivery_date || '';
    groups.set(key, [...(groups.get(key) ?? []), b]);
  }
  const dates = [...groups.keys()].sort((a, b) => (a || '9999').localeCompare(b || '9999'));
  return (
    <View style={[s.byDate, s.divider]}>
      <Text style={s.byDateTitle}>BOXES BY DELIVERY DATE</Text>
      {dates.map((date) => {
        const rows = groups.get(date) ?? [];
        const loaded = rows.filter((r) => r.loaded).length;
        return (
          <View key={date || 'none'} style={s.dateGroup}>
            <View style={s.groupHead}>
              <Text style={s.customer}>{date ? formatDate(date) : 'No delivery date'}</Text>
              <Text style={s.groupCount}>
                <Text style={s.num}>{loaded}</Text>/{rows.length} loaded
              </Text>
            </View>
            {rows.map((r) => (
              <View key={r.box} style={s.row}>
                <Ionicons
                  name={r.loaded ? 'checkmark-circle' : 'ellipse-outline'}
                  size={16}
                  color={r.loaded ? colors.success : colors.textMuted}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[s.point, s.num]} numberOfLines={1}>
                    {r.box}
                  </Text>
                  <Text style={s.point} numberOfLines={1}>
                    {r.customer}
                    {r.delivery_point ? ` · ${r.delivery_point}` : ''}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

/** "2026-10-08" → "Thu 8 Oct". */
function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

const s = StyleSheet.create({
  card: { marginTop: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  title: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text },
  sub: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  num: { fontFamily: fontFamily.bold, color: colors.text },
  sheetCustomer: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.sm },
  sheetBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingLeft: spacing.xl, paddingVertical: 3 },
  pendingText: { color: colors.textMuted, fontStyle: 'italic' },
  pendingNote: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, fontStyle: 'italic' },
  combinedNote: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textSecondary },
  waitingNote: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.warning },
  position: { width: 28, fontFamily: fontFamily.bold, fontSize: fontSize.sm, color: colors.text, textAlign: 'right' },
  byDate: { marginTop: spacing.md, paddingTop: spacing.md, gap: spacing.sm },
  byDateTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: colors.textMuted, letterSpacing: 1.4 },
  dateGroup: { gap: 2 },
  empty: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textMuted, paddingVertical: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  group: { paddingTop: spacing.sm },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  groupCount: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textSecondary },
  point: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.text },
  customer: { flex: 1, fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.text },
  meta: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  done: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: '#166534', marginTop: spacing.md },
  count: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text },
});
