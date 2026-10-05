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
}

/** A truck's Loading Plan: the loading sheet per customer, plus the plan/dispatch controls. */
export function LoadingPlanPanel({ plan, mode, removing, onToggleRemoving, onRefresh, onDispatch, dispatching }: Props) {
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
            {mode !== 'plan'
              ? `${plan.loaded_boxes}/${plan.total_boxes} boxes loaded`
              : `${plan.total_boxes} box(es) for ${plan.customers.length} customer(s)`}
          </Text>
        </View>
        {onRefresh ? (
          <Pressable onPress={onRefresh} hitSlop={10} accessibilityLabel="Refresh plan">
            <Ionicons name="refresh" size={20} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      {plan.customers.length === 0 ? (
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

const s = StyleSheet.create({
  card: { marginTop: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  title: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text },
  sub: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
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
