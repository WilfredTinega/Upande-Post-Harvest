import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { dialog } from '@/src/components/AppDialog';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/components/Screen';
import { Card } from '@/src/components/Card';
import { Button } from '@/src/components/Button';
import { Dropdown, type DropdownOption } from '@/src/components/Dropdown';
import { EmployeePicker } from '@/src/components/EmployeePicker';
import { LabeledInput } from '@/src/components/LabeledInput';
import { LoadingPlanPanel } from '@/src/components/LoadingPlanPanel';
import { SearchPicker } from '@/src/components/SearchPicker';
import { Spinner } from '@/src/components/Spinner';
import { SkeletonBox } from '@/src/components/Skeleton';
import { BlockerModal, type BlockerTone } from '@/src/components/BlockerModal';
import { useToast } from '@/src/components/Toast';
import { GradedRejectsPanel } from '@/src/components/GradedRejectsPanel';
import { FieldRejectsList } from '@/src/components/FieldRejectsList';
import { NewLoadingPlanForm } from '@/src/components/NewLoadingPlanForm';
import { DeliveryPanel } from '@/src/components/DeliveryPanel';
import { DeliveryDateFilter } from '@/src/components/DeliveryDateFilter';
import { deliveryDate, useDeliveryDate } from '@/src/stores/deliveryDateStore';
import { ScanField, type ScanFieldHandle } from '@/src/scan/ScanField';
import { focusWhenReady } from '@/src/scan/focus';
import { dispatchPlan, emptySession, getAction, startLoadingPlan, type Outcome, type ScanSession } from '@/src/scan/actions';
import {
  cachedList,
  employeesKey,
  fetchList,
  harvestSetupKey,
  prefetchList,
  varietiesKey,
} from '@/src/services/list-cache';
import { scanApi, type Greenhouse, type DeliveryPointSummary, type FloorVariety, type HarvestSetup, type LoadingPlan, type OplInfo, type OplLine, type OpenOpl, type Variety } from '@/src/services/scan-api';
import { useScanStore } from '@/src/stores/scanStore';
import { useUIStore } from '@/src/stores/uiStore';
import { audio } from '@/src/audio';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';
import { userMessage } from '@/src/services/user-message';

/** Picked once for the whole session, in the row beside the farm. */
const TOP_FIELDS: string[] = ['greenhouse', 'grader', 'packer'];

/** A successful scan's toast stays up this long. */
const SUCCESS_TOAST_MS = 1000;

interface HarvestLookups {
  loading: boolean;
  error: string | null;
  greenhouses: Greenhouse[];
  varieties: Variety[];
  /** Harvesting by stem length: the lengths to pick from. */
  stemLengths: string[];
  reasons: string[];
}

const NO_LOOKUPS: HarvestLookups = {
  loading: false,
  error: null,
  greenhouses: [],
  varieties: [],
  stemLengths: [],
  reasons: [],
};

export default function ScanScreen() {
  const router = useRouter();
  const { action: actionKey } = useLocalSearchParams<{ action: string }>();
  const action = getAction(actionKey);
  const farm = useScanStore((s) => s.farm);
  const rejectionReasons = useScanStore((s) => s.rejectionReasons);
  const openDrawer = useUIStore((s) => s.openDrawer);

  const [session, setSession] = useState<ScanSession>(() => emptySession(farm));
  const sessionRef = useRef(session);
  useLayoutEffect(() => {
    sessionRef.current = session;
  });

  // A scan (or lookup) that didn't go through, shown in a dialog until the operator dismisses it.
  const [blocker, setBlocker] = useState<{
    tone: BlockerTone;
    title: string;
    detail?: string;
    retry?: () => void;
  } | null>(null);
  const { notify } = useToast();
  const [count, setCount] = useState(0);
  const [pending, setPending] = useState(0);

  const scanRef = useRef<ScanFieldHandle>(null);
  const stemsRef = useRef<TextInput>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());

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
  // New Loading Plan opens on the form; Load & Dispatch shows it from its button.
  const [showNewPlan, setShowNewPlan] = useState(!!action?.startsPlan);
  // While the new plan form is open there is nothing to scan.
  const creatingPlan = req.includes('truckPick') && showNewPlan;
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
        if (outcome.tone === 'success' || outcome.tone === 'info') {
          const text = outcome.detail ? `${outcome.title}\n${outcome.detail}` : outcome.title;
          notify(text, outcome.tone, SUCCESS_TOAST_MS, 'center');
        } else {
          setBlocker({ tone: outcome.tone, title: outcome.title, detail: outcome.detail });
        }
        setPending((n) => n - 1);
        // Harvesting: each bucket needs its own stem count, so go straight to it.
        if (stemsPerBucket && outcome.counts && !sessionRef.current.stems) stemsRef.current?.focus();
      });
    },
    [stemsPerBucket, notify],
  );

  const closeBlocker = () => {
    setBlocker(null);
    refocus();
  };

  const onScan = useCallback(
    (code: string) => {
      if (!action) return;
      enqueue(code, () => action.handle(code, sessionRef.current, update));
    },
    [action, enqueue, update],
  );

  // ── Harvesting lookups ──────────────────────────────────────────────────
  const [harvest, setHarvest] = useState<HarvestLookups>(NO_LOOKUPS);
  // Bumped by "Try again" on a failed lookup, to load the lists again.
  const [lookupRetries, setLookupRetries] = useState(0);
  // Greenhouses and varieties: Harvesting; varieties alone: Graded Rejects.
  const needsHarvestLookups = req.includes('greenhouse') || req.includes('variety');
  // Who or where the whole session is for (greenhouse, grader, packer) is picked once in
  // the top row, and those screens show the scan count in place of the prompt.
  const topFields = req.filter((r) => TOP_FIELDS.includes(r));
  const countAtBottom = topFields.length > 0;
  // Grading starts with the grader's QR: until one is set, ask for it where the count goes.
  const awaitingGrader = req.includes('grader') && !session.grader;
  // Harvesting by stem length (Settings): varieties are listed once each, plus a length to pick.
  const harvestByStemLength = useScanStore((st) => st.harvestByStemLength);
  const stemMode = harvestByStemLength && req.includes('stemLength');

  const loadHarvest = useCallback(() => {
    if (!needsHarvestLookups || !farm) return;
    const show = (r: HarvestSetup) =>
      setHarvest((h) => ({
        ...h,
        loading: false,
        error: null,
        greenhouses: r.greenhouses ?? [],
        varieties: r.varieties ?? [],
        stemLengths: r.stem_lengths ?? [],
        reasons: r.field_reject_reasons ?? [],
      }));
    // The setup warmed when the app opened shows at once; it refreshes quietly.
    const key = harvestSetupKey(farm, stemMode);
    const held = cachedList<HarvestSetup>(key);
    if (held?.success) show(held);
    else setHarvest((h) => ({ ...h, loading: true, error: null }));
    fetchList(key, () => scanApi.harvestSetup(farm, stemMode))
      .then((r) => {
        if (!r.success) throw new Error(r.error || 'Could not load greenhouses');
        show(r);
      })
      .catch((err) => {
        if (held?.success) return;
        const error = userMessage(err, 'Could not load the lists.');
        setHarvest((h) => ({ ...h, loading: false, error }));
        setBlocker({ tone: 'error', title: 'Could not load the lists', detail: error, retry: () => setLookupRetries((n) => n + 1) });
      });
  }, [needsHarvestLookups, farm, stemMode]);

  useEffect(() => {
    const t = setTimeout(loadHarvest, 0);
    return () => clearTimeout(t);
  }, [loadHarvest, lookupRetries]);

  // The variety list differs between the two modes, so a picked variety may not exist in the other.
  useEffect(() => {
    if (sessionRef.current.variety || sessionRef.current.stemLength) update({ variety: '', stemLength: '' });
  }, [stemMode, update]);

  const greenhouseOptions: DropdownOption[] = harvest.greenhouses.map((g) => ({
    label: g.name,
    value: g.name,
    sublabel: g.recent ? 'Recent' : undefined,
  }));

  // The first 20 varieties, the greenhouse's recent harvests on top; the rest are found by search.
  const [pickedVariety, setPickedVariety] = useState<Variety | null>(null);
  const harvestedOnly = !!action?.harvestedVarietiesOnly;
  const loadVarieties = useCallback(
    (query: string) =>
      harvestedOnly
        ? scanApi.harvestedVarieties(farm, session.greenhouse, query)
        : scanApi.searchVarieties(query, session.greenhouse, stemMode),
    [harvestedOnly, farm, session.greenhouse, stemMode],
  );
  // Warm the lists the pickers will open on, so they show at once.
  useEffect(() => {
    if (!needsHarvestLookups || !session.greenhouse || harvestedOnly) return;
    prefetchList(`${varietiesKey(session.greenhouse, stemMode)}|`, () =>
      scanApi.searchVarieties('', session.greenhouse, stemMode),
    );
  }, [needsHarvestLookups, session.greenhouse, stemMode, harvestedOnly]);
  useEffect(() => {
    if (!req.includes('harvester') || !farm) return;
    prefetchList(employeesKey(farm, 'harvester'), () => scanApi.searchEmployees('', farm, 'harvester'));
  }, [req, farm]);
  useEffect(() => {
    if (!farm) return;
    if (req.includes('grader')) prefetchList(employeesKey(farm, 'grader'), () => scanApi.searchEmployees('', farm, 'grader'));
    if (req.includes('packer')) prefetchList(employeesKey(farm, 'packer'), () => scanApi.searchEmployees('', farm, 'packer'));
  }, [req, farm]);
  const selectedVariety =
    pickedVariety?.name === session.variety
      ? pickedVariety
      : harvest.varieties.find((v) => v.name === session.variety);

  // ── Loading Plan / Dispatch ─────────────────────────────────────────────
  const [dispatching, setDispatching] = useState(false);
  const onDispatch = () => {
    const plan = sessionRef.current.plan;
    if (!plan) return;
    dialog(
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
      { cancelable: true },
    );
  };

  // Delivery: the date the page is filtered to (shared with the Delivery home figures).
  const deliveryOffset = useDeliveryDate((st) => st.offset);
  const deliveryDay = deliveryDate(deliveryOffset);

  // Delivery goes point by point in the loading plan's order: open on the first point with
  // boxes left, and once a point is fully delivered move on to the next one with boxes left.
  // Picked once per day, so clearing the point by hand leaves it cleared.
  const autoPickedDay = useRef<string | null>(null);
  const needsPoint = req.includes('deliveryPoint');
  useEffect(() => {
    if (!needsPoint) return;
    let live = true;
    scanApi
      .deliveryPoints(deliveryDay)
      .then((r) => {
        if (!live || !r.success) return;
        const points = r.points ?? [];
        const current = sessionRef.current.deliveryPoint;
        const firstDay = autoPickedDay.current !== deliveryDay;
        if (current === null && !firstDay) return;
        const at = current === null ? -1 : points.findIndex((p) => (p.delivery_point ?? '') === current);
        if (at >= 0 && points[at].pending > 0) return;
        autoPickedDay.current = deliveryDay;
        const next = [...points.slice(at + 1), ...points.slice(0, Math.max(at, 0))].find((p) => p.pending > 0);
        if (next) update({ deliveryPoint: next.delivery_point ?? '' });
      })
      .catch(() => {
        // The point stays as it is; it can still be chosen from the list.
      });
    return () => {
      live = false;
    };
  }, [needsPoint, deliveryDay, session.deliveryVersion, update]);

  const [fetching, setFetching] = useState(false);
  const onFetch = async () => {
    const plan = sessionRef.current.plan;
    if (!plan) return;
    setFetching(true);
    try {
      const r = await scanApi.fetchOrders(plan.name);
      if (r.success && r.plan) update({ plan: r.plan });
      notify(r.success ? `${r.added ?? 0} boxes from ${r.opls ?? 0} orders planned` : r.error || 'Could not fetch the orders', r.success ? 'success' : 'error', 2000, 'center');
    } catch (err) {
      notify(userMessage(err, 'Could not fetch the orders'), 'error', 2000, 'center');
    } finally {
      setFetching(false);
    }
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

  const prompt = action.prompt(session);
  const blocked = action.needsFarm && !farm;

  return (
    <Screen
      // A truck's screen is titled by its plan once one is open: "LP-2026-10-09-01".
      title={req.includes('truckPick') && session.plan && !showNewPlan ? session.plan.name : action.label}
      leftIcon="arrow-back"
      onPressLeft={() => router.back()}
      rightIcon="menu"
      onPressRight={openDrawer}
    >
      <View style={s.metaRow}>
        {/* Delivery covers every farm's boxes, so no farm over its date. */}
        {action.needsFarm && !req.includes('deliveryPoint') ? (
          <Chip icon="location-outline" label={farm || 'No farm'} onPress={() => router.push('/settings')} bold />
        ) : null}
        {!blocked && req.includes('greenhouse') ? (
          <View style={s.greenhouse}>
            {harvest.loading && !harvest.greenhouses.length ? (
              <SkeletonBox height={46} radius={borderRadius.sm} />
            ) : (
              <Dropdown
                inline
                label="Greenhouse"
                placeholder={harvest.loading ? 'Loading greenhouses…' : 'Choose the greenhouse'}
                value={session.greenhouse}
                options={greenhouseOptions}
                // Harvested-today varieties differ per greenhouse, so a new one needs its variety again.
                onChange={(greenhouse) => setAndRefocus(harvestedOnly ? { greenhouse, variety: '' } : { greenhouse })}
                emptyText={
                  harvest.loading
                    ? 'Loading…'
                    : `No greenhouses for ${farm}. Set the Greenhouses group in its Warehouse Mapping.`
                }
              />
            )}
          </View>
        ) : null}
        {!blocked && req.includes('grader') ? (
          <View style={s.greenhouse}>
            <EmployeePicker
              inline
              label="Grader"
              value={session.grader}
              placeholder="Grader, or scan their QR"
              recentAtFarm={farm}
              role="grader"
              onChange={(grader) => setAndRefocus({ grader })}
            />
          </View>
        ) : null}
        {!blocked && req.includes('packer') ? (
          <View style={s.greenhouse}>
            <EmployeePicker
              inline
              label="Packer"
              value={session.packer}
              placeholder="Choose the packer"
              recentAtFarm={farm}
              role="packer"
              onChange={(packer) => setAndRefocus({ packer })}
            />
          </View>
        ) : null}
      </View>

      {blocked ? (
        <Card>
          <Button label="Choose process and farm" iconLeft="options-outline" onPress={() => router.push('/settings')} />
        </Card>
      ) : (
        <>
          {req.some((r) => !TOP_FIELDS.includes(r)) ? (
            <Card style={s.setup}>
              {req.includes('floorVariety') ? (
                <SearchPicker<FloorVariety>
                  label="Variety on the floor"
                  icon="flower-outline"
                  value={
                    session.variety
                      ? { title: session.variety, right: session.varietyBalance === null ? undefined : `${session.varietyBalance}` }
                      : null
                  }
                  placeholder="Choose a variety in the packhouse store"
                  load={(query) => scanApi.packhouseBalances(farm, query)}
                  keyOf={(v) => v.name}
                  row={(v) => ({
                    title: `${v.item_name.trim()}${v.stem_length ? `  ${v.stem_length}` : ''}`,
                    sub: v.name,
                    right: `${v.balance} stems`,
                  })}
                  onPick={(v) => update({ variety: v.name, varietyBalance: v.balance })}
                  onClear={() => setAndRefocus({ variety: '', varietyBalance: null })}
                  onClose={refocus}
                  searchPlaceholder="Search variety"
                  emptyText={`Nothing in ${farm}'s packhouse store`}
                />
              ) : null}
              {req.includes('variety') ? (
                <SearchPicker<Variety>
                  label="Variety"
                  icon="flower-outline"
                  value={
                    session.variety
                      ? { title: (selectedVariety?.item_name || session.variety).trim() }
                      : null
                  }
                  placeholder={
                    session.greenhouse || !req.includes('greenhouse') ? 'Choose the variety' : 'Choose the greenhouse first'
                  }
                  load={loadVarieties}
                  cacheKey={harvestedOnly ? `harvested|${farm}|${session.greenhouse}` : varietiesKey(session.greenhouse, stemMode)}
                  keyOf={(v) => v.name}
                  row={(v) =>
                    harvestedOnly
                      ? { title: (v.item_name || v.name).trim(), right: `${(v.stems ?? 0).toLocaleString()} stems` }
                      : { title: (v.item_name || v.name).trim(), sub: v.recent ? 'Recent' : undefined }
                  }
                  onPick={(v) => {
                    setPickedVariety(v);
                    update({ variety: v.name });
                  }}
                  onClose={refocus}
                  disabled={req.includes('greenhouse') && !session.greenhouse}
                  searchPlaceholder="Search variety"
                  emptyText={harvestedOnly ? `Nothing harvested in ${session.greenhouse} today` : 'No varieties'}
                />
              ) : null}
              {stemMode ? (
                <Dropdown
                  label="Stem length"
                  placeholder={session.variety ? 'Choose the stem length' : 'Choose the variety first'}
                  value={session.stemLength}
                  options={harvest.stemLengths.map((l) => ({ label: l, value: l }))}
                  onChange={(stemLength) => setAndRefocus({ stemLength })}
                  disabled={!session.variety}
                  emptyText={harvest.loading ? 'Loading…' : 'No stem lengths set up'}
                />
              ) : null}
              {req.includes('harvester') ? (
                <EmployeePicker
                  label="Harvester"
                  value={session.harvester}
                  placeholder="Select the harvester"
                  recentAtFarm={farm}
                  role="harvester"
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
                        session.varietyBalance !== null && req.includes('floorVariety')
                          ? `max ${session.varietyBalance}`
                          : action?.submit
                            ? 'e.g. 20'
                            : selectedVariety?.max_stems
                              ? `max ${selectedVariety.max_stems}`
                              : 'Stems'
                      }
                      keyboardType="number-pad"
                      returnKeyType="done"
                      maxLength={4}
                    />
                  </View>
                </View>
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
                          title: oplTitle(session.opl.opl, session.opl.customer),
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
                    title: oplTitle(o.opl, o.customer),
                    lead: o.total_stems ? `${o.packed_stems.toLocaleString()} / ${o.total_stems.toLocaleString()} stems` : undefined,
                    sub: [o.sales_order, o.delivery_point].filter(Boolean).join(' · '),
                    right: `${o.pack_pct ?? (o.total_stems ? Math.round((o.packed_stems * 100) / o.total_stems) : 0)}% packed`,
                    // Green: Available for Sale holds enough to finish it; red: it is short.
                    stripe: o.short_stems === undefined ? undefined : o.short_stems > 0 ? 'bad' : 'good',
                    alert: o.short_stems ? `Grade ${o.short_stems.toLocaleString()} stems to complete this order` : undefined,
                    table: o.varieties?.length
                      ? {
                          columns: ['Variety', 'Length', 'Bunches', 'Stems'],
                          rows: o.varieties.map((v) => [
                            v.item_name,
                            v.stem_length ?? '-',
                            `${v.bunches} × ${bunchSize(v.bunch_uom)}`,
                            `${(v.packed_stems ?? 0).toLocaleString()}/${v.stems.toLocaleString()}`,
                          ]),
                        }
                      : undefined,
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
              {req.includes('deliveryPoint') ? (
                <DeliveryDateFilter onChange={() => update({ deliveryPoint: null })} />
              ) : null}
              {req.includes('deliveryPoint') ? (
                <SearchPicker<DeliveryPointSummary>
                  cacheKey={`delivery-points|${deliveryDay}`}
                  label="Delivery point"
                  icon="navigate-outline"
                  value={
                    session.deliveryPoint === null
                      ? null
                      : { title: session.deliveryPoint || 'No delivery point' }
                  }
                  placeholder="Choose the delivery point"
                  load={async (query) => {
                    const r = await scanApi.deliveryPoints(deliveryDay);
                    if (!r.success) throw new Error(r.error || 'Could not load the delivery points');
                    const q = query.trim().toLowerCase();
                    return (r.points ?? []).filter((p) => !q || (p.delivery_point ?? '').toLowerCase().includes(q));
                  }}
                  keyOf={(p) => p.delivery_point ?? ''}
                  row={(p) => ({
                    title: p.delivery_point || 'No delivery point',
                    sub: `${p.customers} customer${p.customers === 1 ? '' : 's'}`,
                    lead: p.pending ? `${p.pending} to deliver` : undefined,
                    right: p.delivered ? `${p.delivered} done` : undefined,
                    stripe: p.pending ? undefined : 'good',
                  })}
                  onPick={(p) => update({ deliveryPoint: p.delivery_point ?? '' })}
                  onClear={() => setAndRefocus({ deliveryPoint: null })}
                  onClose={refocus}
                  searchPlaceholder="Search delivery point"
                  emptyText="No boxes on their way"
                />
              ) : null}
              {req.includes('truckPick') && showNewPlan ? (
                <NewLoadingPlanForm
                  farm={farm}
                  onCreate={(plan) =>
                    new Promise<void>((done) =>
                      enqueue(plan.vehicle, async () => {
                        const outcome = await startLoadingPlan(plan, update);
                        if (outcome.tone === 'success' || outcome.tone === 'info') setShowNewPlan(false);
                        done();
                        return outcome;
                      }),
                    )
                  }
                  onOpen={(plan) => {
                    update({ plan, truck: plan.vehicle });
                    setShowNewPlan(false);
                  }}
                  onCancel={() => setShowNewPlan(false)}
                />
              ) : null}
              {req.includes('truckPick') && !showNewPlan ? (
                <SearchPicker<LoadingPlan>
                  label="Truck"
                  icon="bus-outline"
                  value={
                    session.plan
                      ? {
                          title: session.plan.vehicle,
                          sub: planLine(session.plan),
                          right: `${session.plan.loaded_boxes}/${session.plan.total_boxes}`,
                        }
                      : null
                  }
                  placeholder="Choose the truck, or scan its label"
                  load={loadPlans}
                  keyOf={(p) => p.name}
                  row={(p) => ({
                    title: p.vehicle,
                    sub: `${planLine(p)} · ${new Set(p.customers.map((c) => c.customer)).size} customer(s)`,
                    right: `${p.loaded_boxes}/${p.total_boxes}`,
                  })}
                  onPick={(plan) => update({ plan, truck: plan.vehicle })}
                  onClear={() => setAndRefocus({ plan: null, truck: null })}
                  onClose={refocus}
                  searchPlaceholder="Search truck"
                  emptyText="No trucks being loaded yet"
                />
              ) : null}
              {req.includes('truckPick') && !showNewPlan ? (
                <Button label="New loading plan" iconLeft="add-circle-outline" variant="outline" onPress={() => setShowNewPlan(true)} />
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

          {/* Form-style actions (nothing scanned) show no scan count. */}
          {creatingPlan ? null : countAtBottom && !awaitingGrader ? (
            action.submit ? null : (
              <View style={s.countRow}>
                <Chip icon="checkmark-done-outline" label={`${count} scanned`} />
              </View>
            )
          ) : (
            <Text style={s.prompt}>{prompt}</Text>
          )}
          {creatingPlan ? null : action.submit ? (
            <Button
              label={pending > 0 ? 'Recording…' : action.submit.label}
              iconLeft={action.submit.icon}
              loading={pending > 0}
              disabled={action.submit.ready ? !action.submit.ready(session) : false}
              onPress={() => {
                const submit = action.submit!;
                const go = () => enqueue(submit.label, () => submit.run(sessionRef.current, update));
                const question = submit.confirm?.(sessionRef.current);
                if (!question) return go();
                dialog(submit.label, question, [
                  { text: 'No', style: 'cancel' },
                  { text: 'Yes', onPress: go },
                ]);
              }}
            />
          ) : (
            <>
            <ScanField
              ref={scanRef}
              onScan={onScan}
              autoFocus
              cameraOnly={action.cameraOnly}
            />
            {pending > 0 ? (
              <View style={s.readyRow}>
                <View style={{ flex: 1 }} />
                <Spinner inline label={pending > 1 ? `${pending} in queue` : 'Processing…'} />
              </View>
            ) : null}
            </>
          )}

          {req.includes('opl') && session.opl ? (
            <Card style={s.oplCard}>
              <OplProgress opl={session.opl} farm={farm} onUnderPacked={() => setAndRefocus({ opl: null })} />
            </Card>
          ) : null}
          {action.panel === 'rejects' && farm ? <GradedRejectsPanel farm={farm} version={session.rejectsVersion} /> : null}
          {action.panel === 'field-rejects' && farm ? (
            <FieldRejectsList farm={farm} />
          ) : null}
          {action.panel === 'delivery' && session.deliveryPoint !== null ? (
            <DeliveryPanel point={session.deliveryPoint} date={deliveryDay} version={session.deliveryVersion} />
          ) : null}
          {action.panel && action.panel !== 'rejects' && action.panel !== 'delivery' && action.panel !== 'field-rejects' && session.plan ? (
            <LoadingPlanPanel
              plan={session.plan}
              mode={action.panel as 'plan' | 'load' | 'dispatch'}
              removing={session.removeFromPlan}
              onToggleRemoving={(removeFromPlan) => setAndRefocus({ removeFromPlan })}
              onRefresh={refreshPlan}
              onFetch={action.panel === 'plan' || action.panel === 'dispatch' ? onFetch : undefined}
              fetching={fetching}
              onDispatch={action.panel === 'dispatch' ? onDispatch : undefined}
              dispatching={dispatching}
            />
          ) : null}
        </>
      )}
      <BlockerModal blocker={blocker} onClose={closeBlocker} />
    </Screen>
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

/** Under the chosen OPL: who it is for, and its stems packed and still to pack (updates with each scan). */
/** Why an OPL is closed short. */
const UNDER_PACK_REASONS = ['Not enough stock', 'Poor quality', 'Order changed by customer', 'Other'];

/** A plan's name, farm, delivery date and status: "LP-2026-10-10-01 · Turaco · delivers 2026-10-10 · Planning". */
function planLine(p: LoadingPlan): string {
  return [p.name, p.farm, p.delivery_date ? `delivers ${p.delivery_date}` : null, p.status].filter(Boolean).join(' · ');
}

/** An order as packers know it: "FLORAMONDO - OPL-2026-26033". */
function oplTitle(opl: string, customer?: string | null): string {
  return customer ? `${customer} - ${opl}` : opl;
}

/** "Bunch (12)" → "12"; anything else as it is. */
function bunchSize(uom: string): string {
  return uom.match(/\((\d+)\)/)?.[1] ?? uom;
}

function OplProgress({ opl, farm, onUnderPacked }: { opl: OplInfo; farm: string; onUnderPacked: () => void }) {
  const { notify } = useToast();
  const [sending, setSending] = useState(false);
  const total = opl.total_stems ?? 0;
  const packed = opl.packed_stems ?? 0;
  const left = Math.max(total - packed, 0);
  // Started but not finished: it can be closed short, for a Sales Manager to approve.
  const canUnderPack = packed > 0 && left > 0;

  // What to pack: reloaded after every packed bunch (packed_stems moves on each scan).
  const [lines, setLines] = useState<OplLine[] | null>(null);
  useEffect(() => {
    let live = true;
    scanApi
      .oplLines(opl.opl, farm)
      .then((r) => live && r.success && setLines(r.lines ?? []))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [opl.opl, opl.packed_stems, farm]);

  const send = (reason: string) =>
    dialog('Under-pack', `Close ${opl.opl} with ${left.toLocaleString()} stems unpacked (${reason})?`, [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes',
        onPress: async () => {
          setSending(true);
          try {
            const r = await scanApi.underPack(opl.opl, farm, reason);
            notify(r.success ? 'Sent for under-pack approval' : r.error || 'Could not send it', r.success ? 'success' : 'error', 2000, 'center');
            if (r.success) onUnderPacked();
          } catch (err) {
            notify(userMessage(err, 'Could not send it'), 'error', 2000, 'center');
          } finally {
            setSending(false);
          }
        },
      },
    ]);

  return (
    <View style={s.oplInfo}>
      {opl.customer ? (
        <Text style={s.oplCustomer} numberOfLines={1}>
          {opl.customer}
        </Text>
      ) : null}
      {total ? (
        <Text style={s.oplStems}>
          Packed <Text style={s.oplNum}>{packed.toLocaleString()}</Text> · Remaining{' '}
          <Text style={[s.oplNum, left === 0 && { color: colors.success }]}>
            {left ? left.toLocaleString() : 'none'}
          </Text>{' '}
          of {total.toLocaleString()} stems
        </Text>
      ) : null}
      {lines === null ? (
        <SkeletonBox height={64} style={s.oplLines} />
      ) : lines.length ? (
        <View style={s.oplLines}>
          <View style={[s.oplLine, s.oplLineHead]}>
            <Text style={[s.oplLineHeadText, s.oplLineVariety]}>Variety</Text>
            <Text style={[s.oplLineHeadText, s.oplLineLength]}>Length</Text>
            <Text style={[s.oplLineHeadText, s.oplLineQty]}>Bunches</Text>
          </View>
          {lines.map((l) => {
            const done = l.packed_bunches >= l.bunches;
            return (
              <View key={`${l.variety}|${l.bunch_uom}|${l.stem_length}`} style={s.oplLine}>
                <View style={s.oplLineVariety}>
                  <Text style={[s.oplLineName, done && s.oplLineDone]} numberOfLines={1}>
                    {l.item_name}
                  </Text>
                  <Text style={s.oplLineSub} numberOfLines={1}>
                    {l.bunch_uom} · {l.stems.toLocaleString()} stems
                  </Text>
                </View>
                <Text style={[s.oplLineLengthText, s.oplLineLength]}>{l.stem_length || '-'}</Text>
                <Text style={[s.oplLineQtyText, s.oplLineQty, done && { color: colors.success }]}>
                  {l.packed_bunches}/{l.bunches}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
      {canUnderPack ? (
        <View style={s.underPack}>
          <Dropdown
            label="Under-pack reason"
            placeholder={sending ? 'Sending…' : 'Under-pack: not enough to finish?'}
            value=""
            options={UNDER_PACK_REASONS.map((r) => ({ label: r, value: r }))}
            onChange={send}
            searchable={false}
            disabled={sending}
          />
        </View>
      ) : null}
    </View>
  );
}

function Chip({
  icon,
  label,
  onPress,
  bold,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress?: () => void;
  bold?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={s.chip} hitSlop={6}>
      <Ionicons name={icon} size={14} color={colors.textSecondary} />
      <Text style={[s.chipText, bold && s.chipTextBold]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  greenhouse: { flex: 1, minWidth: 160 },
  oplCard: { marginTop: spacing.md },
  oplInfo: { gap: 2 },
  underPack: { marginTop: spacing.sm },
  oplCustomer: { fontFamily: fontFamily.bold, fontSize: fontSize.sm, color: colors.text },
  oplStems: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textSecondary },
  oplNum: { fontFamily: fontFamily.bold, color: colors.text },
  oplLines: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  oplLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  oplLineHead: { borderTopWidth: 0, backgroundColor: colors.surfaceAlt },
  oplLineHeadText: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textSecondary },
  oplLineVariety: { flex: 1, minWidth: 0 },
  oplLineLength: { width: 56, textAlign: 'center' },
  oplLineQty: { width: 64, textAlign: 'right' },
  oplLineName: { fontFamily: fontFamily.bold, fontSize: fontSize.sm, color: colors.text },
  oplLineDone: { color: colors.textMuted, textDecorationLine: 'line-through' },
  oplLineSub: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textSecondary },
  oplLineLengthText: { fontFamily: fontFamily.bold, fontSize: fontSize.sm, color: colors.text },
  oplLineQtyText: { fontFamily: fontFamily.bold, fontSize: fontSize.sm, color: colors.text },
  countRow: { flexDirection: 'row', marginBottom: spacing.md },
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
  chipTextBold: { fontFamily: fontFamily.bold, color: colors.text },
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
});
