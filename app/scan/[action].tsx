import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/components/Screen';
import { Alert as Notice, Card } from '@/src/components/Card';
import { Button } from '@/src/components/Button';
import { Dropdown, type DropdownOption } from '@/src/components/Dropdown';
import { EmployeePicker } from '@/src/components/EmployeePicker';
import { LabeledInput } from '@/src/components/LabeledInput';
import { LoadingPlanPanel } from '@/src/components/LoadingPlanPanel';
import { SearchPicker } from '@/src/components/SearchPicker';
import { Spinner } from '@/src/components/Spinner';
import { SkeletonBox } from '@/src/components/Skeleton';
import { ScanField, type ScanFieldHandle } from '@/src/scan/ScanField';
import { focusWhenReady } from '@/src/scan/focus';
import { dispatchPlan, emptySession, getAction, type Outcome, type ScanSession, type Tone } from '@/src/scan/actions';
import { scanApi, type Greenhouse, type LoadingPlan, type OpenOpl, type Variety } from '@/src/services/scan-api';
import { useScanStore } from '@/src/stores/scanStore';
import { useUIStore } from '@/src/stores/uiStore';
import { audio } from '@/src/audio';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';
import { userMessage } from '@/src/services/user-message';

interface HistoryEntry extends Outcome {
  id: number;
  at: Date;
  code: string;
}

const HISTORY_LIMIT = 30;

const TONE: Record<Tone, { bg: string; fg: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = {
  success: { bg: '#F0FDF4', fg: '#166534', icon: 'checkmark-circle' },
  warning: { bg: '#FFFBEB', fg: '#92400E', icon: 'warning' },
  error: { bg: '#FEF2F2', fg: '#991B1B', icon: 'close-circle' },
  info: { bg: '#EEF2FF', fg: '#3730A3', icon: 'information-circle' },
};

interface HarvestLookups {
  loading: boolean;
  error: string | null;
  greenhouses: Greenhouse[];
  varieties: Variety[];
  reasons: string[];
  /** Varieties harvested into the chosen greenhouse lately, most first. */
  recent: string[];
}

const NO_LOOKUPS: HarvestLookups = { loading: false, error: null, greenhouses: [], varieties: [], reasons: [], recent: [] };

export default function ScanScreen() {
  const router = useRouter();
  const { action: actionKey } = useLocalSearchParams<{ action: string }>();
  const action = getAction(actionKey);
  const farm = useScanStore((s) => s.farm);
  const rejectionReasons = useScanStore((s) => s.rejectionReasons);
  const openDrawer = useUIStore((s) => s.openDrawer);

  const [session, setSession] = useState<ScanSession>(() => emptySession(farm));
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [count, setCount] = useState(0);
  const [pending, setPending] = useState(0);
  const [focused, setFocused] = useState(false);

  const scanRef = useRef<ScanFieldHandle>(null);
  const stemsRef = useRef<TextInput>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const nextId = useRef(1);

  const refocus = useCallback(() => focusWhenReady(scanRef), []);

  // Refocus whenever the screen comes back (e.g. from the camera or a picker).
  useFocusEffect(refocus);

  const update = useCallback((patch: Partial<ScanSession>) => {
    // Keep the ref in step immediately so a queued scan sees the new session.
    sessionRef.current = { ...sessionRef.current, ...patch };
    setSession(sessionRef.current);
  }, []);

  const setAndRefocus = (patch: Partial<ScanSession>) => {
    update(patch);
    refocus();
  };

  // The station can be changed from Settings while this screen is open.
  useEffect(() => {
    if (sessionRef.current.farm !== farm) update({ ...emptySession(farm) });
  }, [farm, update]);

  const req = useMemo(() => action?.requirements ?? [], [action]);
  const stemsPerBucket = req.includes('stems');

  // Work is processed one step at a time, in order, so fast trigger pulls
  // queue up instead of being dropped or racing each other.
  const enqueue = useCallback(
    (code: string, work: () => Promise<Outcome>) => {
      setPending((n) => n + 1);
      queue.current = queue.current.then(async () => {
        const outcome = await work();
        if (outcome.tone === 'success' || outcome.tone === 'info') audio.beep();
        else audio.error();
        if (outcome.counts) setCount((n) => n + 1);
        setHistory((h) => [{ ...outcome, id: nextId.current++, at: new Date(), code }, ...h].slice(0, HISTORY_LIMIT));
        setPending((n) => n - 1);
        // Harvesting: each bucket needs its own stem count, so go straight to it.
        if (stemsPerBucket && outcome.counts && !sessionRef.current.stems) stemsRef.current?.focus();
      });
    },
    [stemsPerBucket],
  );

  const onScan = useCallback(
    (code: string) => {
      if (!action) return;
      enqueue(code, () => action.handle(code, sessionRef.current, update));
    },
    [action, enqueue, update],
  );

  // ── Harvesting lookups ──────────────────────────────────────────────────
  const [harvest, setHarvest] = useState<HarvestLookups>(NO_LOOKUPS);
  // Greenhouses and varieties: Harvesting; varieties alone: Graded Rejects.
  const needsHarvestLookups = req.includes('greenhouse') || req.includes('variety');

  const loadHarvest = useCallback(() => {
    if (!needsHarvestLookups || !farm) return;
    setHarvest((h) => ({ ...h, loading: true, error: null }));
    scanApi
      .harvestSetup(farm)
      .then((r) => {
        if (!r.success) throw new Error(r.error || 'Could not load greenhouses');
        setHarvest((h) => ({
          ...h,
          loading: false,
          greenhouses: r.greenhouses ?? [],
          varieties: r.varieties ?? [],
          reasons: r.field_reject_reasons ?? [],
        }));
      })
      .catch((err) =>
        setHarvest((h) => ({ ...h, loading: false, error: userMessage(err, 'Could not load the lists.') })),
      );
  }, [needsHarvestLookups, farm]);

  useEffect(loadHarvest, [loadHarvest]);

  useEffect(() => {
    if (!needsHarvestLookups || !session.greenhouse) return;
    let live = true;
    scanApi
      .recentVarieties(session.greenhouse)
      .then((recent) => live && setHarvest((h) => ({ ...h, recent: recent ?? [] })))
      .catch(() => live && setHarvest((h) => ({ ...h, recent: [] })));
    return () => {
      live = false;
    };
  }, [needsHarvestLookups, session.greenhouse]);

  const greenhouseOptions: DropdownOption[] = harvest.greenhouses.map((g) => ({
    label: g.name,
    value: g.name,
  }));

  const varietyOptions: DropdownOption[] = useMemo(() => {
    const byName = new Map(harvest.varieties.map((v) => [v.name, v]));
    const recent = harvest.recent.filter((n) => byName.has(n));
    const rest = harvest.varieties.filter((v) => !recent.includes(v.name));
    const label = (v: Variety) => (v.item_name || v.name).trim();
    return [
      ...recent.map((n) => ({
        label: label(byName.get(n)!),
        value: n,
        sublabel: 'Recent',
      })),
      ...rest.map((v) => ({ label: label(v), value: v.name })),
    ];
  }, [harvest.varieties, harvest.recent]);

  const selectedVariety = harvest.varieties.find((v) => v.name === session.variety);

  // ── Loading Plan / Dispatch ─────────────────────────────────────────────
  const [dispatching, setDispatching] = useState(false);
  const onDispatch = () => {
    const plan = sessionRef.current.plan;
    if (!plan) return;
    Alert.alert(
      'Dispatch truck?',
      `${plan.vehicle}: ${plan.total_boxes} box(es) to ${plan.customers.length} customer delivery point(s). ` +
        'This creates one Delivery Note per customer and delivery point, and cannot be undone from the app.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Dispatch',
          onPress: () => {
            setDispatching(true);
            enqueue(plan.name, async () => {
              try {
                return await dispatchPlan(sessionRef.current, update);
              } finally {
                setDispatching(false);
                refocus();
              }
            });
          },
        },
      ],
    );
  };

  const refreshPlan = () => {
    const plan = sessionRef.current.plan;
    if (!plan) return;
    scanApi
      .getLoadingPlan(plan.name)
      .then((r) => r.plan && update({ plan: r.plan }))
      .catch(() => {});
  };

  const loadOpls = useCallback(
    async (q: string): Promise<OpenOpl[]> => {
      const r = await scanApi.listOpenOpls(farm, q);
      if (!r.success) throw new Error(r.error || 'Could not load Order Pick Lists');
      return r.opls ?? [];
    },
    [farm],
  );

  const loadPlans = useCallback(
    async (q: string): Promise<LoadingPlan[]> => {
      const r = await scanApi.listOpenLoadingPlans(farm);
      if (!r.success) throw new Error(r.error || 'Could not load trucks');
      const needle = q.trim().toLowerCase();
      const plans = r.plans ?? [];
      return needle
        ? plans.filter((p) => p.vehicle.toLowerCase().includes(needle) || p.name.toLowerCase().includes(needle))
        : plans;
    },
    [farm],
  );

  useEffect(() => {
    if (!action) router.back();
  }, [action, router]);

  if (!action) return null;

  const last = history[0];
  const prompt = action.prompt(session);
  const blocked = action.needsFarm && !farm;

  return (
    <Screen
      title={action.label}
      leftIcon="arrow-back"
      onPressLeft={() => router.back()}
      rightIcon="menu"
      onPressRight={openDrawer}
    >
      <View style={s.metaRow}>
        {action.needsFarm ? (
          <Chip icon="location-outline" label={farm || 'No farm'} onPress={() => router.push('/settings')} />
        ) : null}
        <Chip icon="checkmark-done-outline" label={`${count} scanned`} />
      </View>

      {blocked ? (
        <Card>
          <Notice tone="warn">Choose the farm before scanning.</Notice>
          <Button label="Choose process and farm" iconLeft="options-outline" onPress={() => router.push('/settings')} />
        </Card>
      ) : (
        <>
          {req.length ? (
            <Card style={s.setup}>
              {req.includes('greenhouse') ? (
                <>
                  {harvest.error ? (
                    <Pressable onPress={loadHarvest}>
                      <Notice tone="danger">{`${harvest.error}. Tap to retry.`}</Notice>
                    </Pressable>
                  ) : null}
                  {harvest.loading && !harvest.greenhouses.length ? (
                    <FieldSkeleton />
                  ) : (
                    <Dropdown
                      label="Greenhouse"
                      placeholder={harvest.loading ? 'Loading greenhouses…' : 'Choose the greenhouse'}
                      value={session.greenhouse}
                      options={greenhouseOptions}
                      onChange={(greenhouse) => setAndRefocus({ greenhouse })}
                      emptyText={
                        harvest.loading
                          ? 'Loading…'
                          : `No greenhouses for ${farm}. Set the Greenhouses group in its Warehouse Mapping.`
                      }
                    />
                  )}
                </>
              ) : null}
              {req.includes('variety') ? (
                <Dropdown
                  label="Variety"
                  placeholder={
                    session.greenhouse || !req.includes('greenhouse') ? 'Choose the variety' : 'Choose the greenhouse first'
                  }
                  value={session.variety}
                  options={varietyOptions}
                  onChange={(variety) => setAndRefocus({ variety })}
                  disabled={req.includes('greenhouse') && !session.greenhouse}
                  emptyText={harvest.loading ? 'Loading…' : 'No varieties'}
                />
              ) : null}
              {req.includes('harvester') ? (
                <EmployeePicker
                  label="Harvester"
                  value={session.harvester}
                  placeholder="Select the harvester"
                  onChange={(harvester) => setAndRefocus({ harvester })}
                />
              ) : null}
              {req.includes('fieldRejectReason') ? (
                <Dropdown
                  label="Rejection reason"
                  placeholder="Choose a reason"
                  value={session.rejectionReason}
                  options={harvest.reasons.map((r) => ({ label: r, value: r }))}
                  onChange={(rejectionReason) => setAndRefocus({ rejectionReason })}
                  searchable
                  emptyText={harvest.loading ? 'Loading…' : 'No rejection reasons set up'}
                />
              ) : null}
              {req.includes('stems') ? (
                <View style={s.inputRow}>
                  {req.includes('bed') ? (
                    <View style={{ flex: 1 }}>
                      <LabeledInput
                        label="Bed / bay"
                        value={session.bed}
                        onChangeText={(bed) => update({ bed })}
                        onSubmitEditing={() => stemsRef.current?.focus()}
                        placeholder="e.g. A"
                        autoCapitalize="characters"
                        autoCorrect={false}
                        returnKeyType="next"
                      />
                    </View>
                  ) : null}
                  <View style={{ flex: 1 }}>
                    <LabeledInput
                      ref={stemsRef}
                      label={action?.submit ? 'Stems rejected' : 'Stems in bucket'}
                      value={session.stems}
                      onChangeText={(t) => update({ stems: t.replace(/[^0-9]/g, '') })}
                      onSubmitEditing={action?.submit ? undefined : refocus}
                      placeholder={
                        action?.submit ? 'e.g. 20' : selectedVariety?.max_stems ? `max ${selectedVariety.max_stems}` : 'Stems'
                      }
                      keyboardType="number-pad"
                      returnKeyType="done"
                      maxLength={4}
                    />
                  </View>
                </View>
              ) : null}
              {req.includes('grader') ? (
                <EmployeePicker
                  label="Grader"
                  value={session.grader}
                  placeholder="Select, or scan the grader QR"
                  onChange={(grader) => setAndRefocus({ grader })}
                />
              ) : null}
              {req.includes('graderOptional') ? (
                <EmployeePicker
                  label="Grader"
                  optional
                  value={session.grader}
                  onChange={(grader) => setAndRefocus({ grader })}
                />
              ) : null}
              {req.includes('opl') ? (
                <SearchPicker<OpenOpl>
                  label="Order Pick List"
                  icon="list-outline"
                  value={
                    session.opl
                      ? {
                          title: `${session.opl.opl}${session.opl.customer ? ` · ${session.opl.customer}` : ''}`,
                          sub:
                            [session.opl.sales_order, session.opl.delivery_point].filter(Boolean).join(' · ') ||
                            undefined,
                          right: session.opl.total_stems
                            ? `${session.opl.packed_stems ?? 0}/${session.opl.total_stems}`
                            : undefined,
                        }
                      : null
                  }
                  placeholder="Choose the Order Pick List"
                  load={loadOpls}
                  keyOf={(o) => o.opl}
                  row={(o) => ({
                    title: `${o.opl} · ${o.customer ?? ''}`,
                    sub: [o.sales_order, o.delivery_point, o.date_created].filter(Boolean).join(' · '),
                    right: o.total_stems ? `${o.packed_stems}/${o.total_stems}` : undefined,
                  })}
                  onPick={(o) =>
                    update({
                      opl: {
                        success: true,
                        opl: o.opl,
                        customer: o.customer ?? undefined,
                        sales_order: o.sales_order ?? undefined,
                        total_stems: o.total_stems,
                        packed_stems: o.packed_stems,
                        delivery_point: o.delivery_point,
                      },
                    })
                  }
                  onClear={() => setAndRefocus({ opl: null })}
                  onClose={refocus}
                  searchPlaceholder="Search OPL, customer or sales order"
                  emptyText={`No Order Pick Lists waiting to be packed at ${farm}`}
                />
              ) : null}
              {req.includes('packer') ? (
                <EmployeePicker
                  label="Packer"
                  value={session.packer}
                  placeholder="Select the packer"
                  onChange={(packer) => setAndRefocus({ packer })}
                />
              ) : null}
              {req.includes('truck') ? (
                <SetValue
                  label="Truck"
                  value={session.truck}
                  empty="Scan the Truck Label"
                  onClear={() => setAndRefocus({ truck: null })}
                />
              ) : null}
              {req.includes('plan') ? (
                <SetValue
                  label="Truck"
                  value={session.plan ? `${session.plan.vehicle} · ${session.plan.name} (${session.plan.status})` : null}
                  empty="Scan the Truck Label"
                  onClear={() => setAndRefocus({ plan: null, truck: null, removeFromPlan: false })}
                />
              ) : null}
              {req.includes('truckPick') ? (
                <SearchPicker<LoadingPlan>
                  label="Truck"
                  icon="bus-outline"
                  value={
                    session.plan
                      ? {
                          title: session.plan.vehicle,
                          sub: `${session.plan.name} · ${session.plan.status}`,
                          right: `${session.plan.loaded_boxes}/${session.plan.total_boxes}`,
                        }
                      : null
                  }
                  placeholder="Choose the truck, or scan its label"
                  load={loadPlans}
                  keyOf={(p) => p.name}
                  row={(p) => ({
                    title: p.vehicle,
                    sub: `${p.name} · ${p.status} · ${new Set(p.customers.map((c) => c.customer)).size} customer(s)`,
                    right: `${p.loaded_boxes}/${p.total_boxes}`,
                  })}
                  onPick={(plan) => update({ plan, truck: plan.vehicle })}
                  onClear={() => setAndRefocus({ plan: null, truck: null })}
                  onClose={refocus}
                  searchPlaceholder="Search truck"
                  emptyText="No trucks being loaded. Plan boxes onto a truck in Loading Plan first."
                />
              ) : null}
              {req.includes('undispatchReason') ? (
                <LabeledInput
                  label="Undispatch reason"
                  value={session.undispatchReason}
                  onChangeText={(undispatchReason) => update({ undispatchReason })}
                  onSubmitEditing={refocus}
                  onBlur={refocus}
                  placeholder="Why is this box coming off?"
                  returnKeyType="done"
                />
              ) : null}
              {req.includes('rejectionReason') ? (
                <Dropdown
                  label="Rejection reason"
                  placeholder="Choose a reason"
                  value={session.rejectionReason}
                  options={rejectionReasons.map((r) => ({ label: r, value: r }))}
                  onChange={(rejectionReason) => setAndRefocus({ rejectionReason })}
                  searchable
                  emptyText="No rejection reasons set up"
                />
              ) : null}
            </Card>
          ) : null}

          <Text style={s.prompt}>{prompt}</Text>
          {action.submit ? (
            <Button
              label={pending > 0 ? 'Recording…' : action.submit.label}
              iconLeft={action.submit.icon}
              loading={pending > 0}
              onPress={() => {
                const submit = action.submit!;
                enqueue(submit.label, () => submit.run(sessionRef.current, update));
              }}
            />
          ) : (
            <>
            <ScanField ref={scanRef} onScan={onScan} autoFocus onFocusChange={setFocused} />
            {!focused || pending > 0 ? (
              <Pressable onPress={refocus} style={s.readyRow} hitSlop={8} disabled={focused}>
                {!focused ? <Text style={s.resumeText}>Tap to resume scanning</Text> : <View style={{ flex: 1 }} />}
                {pending > 0 ? <Spinner inline label={pending > 1 ? `${pending} in queue` : 'Processing…'} /> : null}
              </Pressable>
            ) : null}
            </>
          )}
          {last ? <ResultBanner entry={last} /> : null}

          {action.panel && session.plan ? (
            <LoadingPlanPanel
              plan={session.plan}
              mode={action.panel}
              removing={session.removeFromPlan}
              onToggleRemoving={(removeFromPlan) => setAndRefocus({ removeFromPlan })}
              onRefresh={refreshPlan}
              onDispatch={action.panel === 'dispatch' ? onDispatch : undefined}
              dispatching={dispatching}
            />
          ) : null}

          {history.length > 1 ? (
            <>
              <Text style={s.section}>Recent scans</Text>
              <Card style={s.historyCard}>
                {history.slice(1).map((h, i) => (
                  <View key={h.id} style={[s.historyRow, i > 0 && s.historyDivider]}>
                    <Ionicons name={TONE[h.tone].icon} size={20} color={TONE[h.tone].fg} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.historyTitle} numberOfLines={2}>
                        {h.title}
                      </Text>
                      {h.detail ? (
                        <Text style={s.historyDetail} numberOfLines={3}>
                          {h.detail}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={s.historyTime}>{formatTime(h.at)}</Text>
                  </View>
                ))}
              </Card>
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function ResultBanner({ entry }: { entry: HistoryEntry }) {
  const t = TONE[entry.tone];
  return (
    <View style={[s.banner, { backgroundColor: t.bg, borderColor: t.fg }]} accessibilityLiveRegion="polite">
      <Ionicons name={t.icon} size={36} color={t.fg} />
      <View style={{ flex: 1 }}>
        <Text style={[s.bannerTitle, { color: t.fg }]}>{entry.title}</Text>
        {entry.detail ? <Text style={[s.bannerDetail, { color: t.fg }]}>{entry.detail}</Text> : null}
        <Text style={[s.bannerTime, { color: t.fg }]}>{formatTime(entry.at)}</Text>
      </View>
    </View>
  );
}

function SetValue({
  label,
  value,
  empty,
  onClear,
}: {
  label: string;
  value: string | null;
  empty: string;
  onClear: () => void;
}) {
  return (
    <View>
      <Text style={s.setLabel}>{label}</Text>
      {value ? (
        <View style={s.setRow}>
          <Ionicons name="checkmark-circle" size={20} color={colors.success} />
          <Text style={s.setText} numberOfLines={2}>
            {value}
          </Text>
          <Pressable onPress={onClear} hitSlop={12} accessibilityLabel={`Clear ${label}`}>
            <Ionicons name="close-circle" size={24} color={colors.textMuted} />
          </Pressable>
        </View>
      ) : (
        <View style={s.setRow}>
          <Ionicons name="scan-outline" size={20} color={colors.textMuted} />
          <Text style={[s.setText, s.setEmpty]}>{empty}</Text>
        </View>
      )}
    </View>
  );
}

function Chip({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={s.chip} hitSlop={6}>
      <Ionicons name={icon} size={14} color={colors.textSecondary} />
      <Text style={s.chipText}>{label}</Text>
    </Pressable>
  );
}

/** A labelled field's shape while its options load. */
function FieldSkeleton() {
  return (
    <View accessibilityLabel="Loading">
      <SkeletonBox width={96} height={12} radius={6} />
      <SkeletonBox height={48} radius={6} style={{ marginTop: spacing.sm }} />
    </View>
  );
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const s = StyleSheet.create({
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    minHeight: 32,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceAlt,
  },
  chipText: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.textSecondary },
  setup: { gap: spacing.md, marginBottom: spacing.md },
  inputRow: { flexDirection: 'row', gap: spacing.md, marginBottom: -spacing.md },
  setLabel: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text, marginBottom: spacing.sm },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  setText: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.md, color: colors.text },
  setEmpty: { color: colors.textMuted },
  prompt: { fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: colors.text, marginBottom: spacing.sm },
  readyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 40, marginTop: spacing.xs },
  resumeText: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: '#92400E' },
  banner: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    marginTop: spacing.md,
  },
  bannerTitle: { fontFamily: fontFamily.bold, fontSize: fontSize.xl, lineHeight: 28 },
  bannerDetail: { fontFamily: fontFamily.medium, fontSize: fontSize.md, marginTop: 4, lineHeight: 21 },
  bannerTime: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, marginTop: spacing.sm, opacity: 0.7 },
  section: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  historyCard: { paddingVertical: spacing.sm },
  historyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.sm },
  historyDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  historyTitle: { fontFamily: fontFamily.medium, fontSize: fontSize.md, color: colors.text },
  historyDetail: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  historyTime: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
});
