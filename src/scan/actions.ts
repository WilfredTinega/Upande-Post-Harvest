import type { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useFieldRejectsStore } from '@/src/stores/fieldRejectsStore';
import { scanApi, type Employee, type FieldRejectLine, type HarvestedBucket, type LoadingPlan, type OplInfo, type PlanReply, type ScanReply } from '@/src/services/scan-api';
import { isBoxLabel, isOplUrl, parseBucketId, parseBunch, parseEmployee, parseGraderQr, parseTruck } from './parse';
import { PROCESSES, type ProcessKey } from './processes';
import { humanText, userMessage } from '@/src/services/user-message';
import { useScanStore } from '@/src/stores/scanStore';

/**
 * Every scan the packhouse does, mirroring the Scan form's
 * "Honeywell v2" client script: what must be set up first, what to scan
 * next, which endpoint handles it and how the reply is shown.
 */

export type Tone = 'success' | 'warning' | 'error' | 'info';

export interface Outcome {
  tone: Tone;
  title: string;
  detail?: string;
  /** Counts toward the session's successful-scan tally. */
  counts?: boolean;
  /** No beep. */
  silent?: boolean;
  /** A warning or error closes itself after this long instead of waiting to be closed. */
  dismissAfterMs?: number;
}

export interface ScanSession {
  farm: string;
  grader: Employee | null;
  packer: Employee | null;
  opl: OplInfo | null;
  truck: string | null;
  undispatchReason: string;
  rejectionReason: string;
  /** The truck's Loading Plan (Loading Plan / Loading / Dispatch). */
  plan: LoadingPlan | null;
  /** Loading Plan: scans take boxes off the plan instead of adding them. */
  removeFromPlan: boolean;
  /** Harvesting: where, what and who stay set; stems are entered per bucket. */
  greenhouse: string;
  variety: string;
  /** Harvesting by stem length (Settings): the length of the next buckets, e.g. '63CM'. */
  stemLength: string;
  harvester: Employee | null;
  bed: string;
  stems: string;
  /** Graded Rejects: stems of the chosen variety on the packhouse floor. */
  varietyBalance: number | null;
  /** Graded Rejects: bumped after each line is added, so the day's log reloads. */
  rejectsVersion: number;
  /** Delivery: the delivery point being delivered to ('' = boxes without one). */
  deliveryPoint: string | null;
  /** Delivery: bumped after each delivered box, so its list reloads. */
  deliveryVersion: number;
  /** Edit Harvest: the scanned bucket's harvest entry, as loaded. */
  harvestEdit: HarvestedBucket | null;
}

export const emptySession = (farm: string): ScanSession => ({
  farm,
  grader: null,
  packer: null,
  opl: null,
  truck: null,
  undispatchReason: '',
  rejectionReason: '',
  plan: null,
  removeFromPlan: false,
  greenhouse: '',
  variety: '',
  stemLength: '',
  harvester: null,
  bed: '',
  stems: '',
  varietyBalance: null,
  rejectsVersion: 0,
  deliveryPoint: null,
  deliveryVersion: 0,
  harvestEdit: null,
});

/** Session inputs shown above the scan field. */
export type Requirement =
  | 'grader' // picked, or scanned (grader QR) as the first code
  | 'graderOptional' // picked, optional
  | 'packer' // picked, required
  | 'opl' // picked from the farm's open Order Pick Lists (scanning the OPL QR also works)
  | 'truck' // scanned as the first code
  | 'undispatchReason'
  | 'rejectionReason'
  | 'fieldRejectReason' // picked from the Rejection Reasons (field and graded rejects)
  | 'plan' // truck label scanned first, opens the truck's Loading Plan
  | 'truckPick' // like 'plan', or picked from the open Loading Plans
  | 'deliveryPoint' // Delivery: picked from the points with boxes on their way
  | 'greenhouse' // Harvesting: picked from the farm's greenhouses
  | 'variety' // Harvesting: picked, the greenhouse's recent varieties first
  | 'stemLength' // Harvesting: picked, only when harvesting by stem length (Settings)
  | 'harvester' // Harvesting: picked from the list
  | 'bed' // Harvesting: typed, optional
  | 'floorVariety' // Graded Rejects: picked from what is on the packhouse floor, with its balance
  | 'stems'; // Harvesting: typed per bucket

export type ActionKey =
  | 'harvesting'
  | 'field-rejects'
  | 'edit-harvest'
  | 'receiving'
  | 'receiving-quarantined'
  | 'receiving-out'
  | 'ungraded-discard'
  | 'grading'
  | 'grading-check'
  | 'graded-rejects'
  | 'graded-discard'
  | 'local-sale'
  | 'walk-in-shop'
  | 'ungrade'
  | 'stock-take'
  | 'vase'
  | 'packing'
  | 'packing-reject'
  | 'loading'
  | 'new-loading-plan'
  | 'undispatch'
  | 'delivery';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Processes, in the order stock moves from the greenhouse to the truck. */
const PRODUCTION: ProcessKey = 'production';
const PACKHOUSE: ProcessKey = 'packhouse';
const DISPATCH: ProcessKey = 'dispatch';
const DELIVERY: ProcessKey = 'delivery';
const SHOP: ProcessKey = 'shop';
const QUALITY: ProcessKey = 'quality';

export const ACTION_GROUPS = PROCESSES;
export type ActionGroup = ProcessKey;

type Update = (patch: Partial<ScanSession>) => void;

export interface ActionDef {
  key: ActionKey;
  label: string;
  description: string;
  group: ActionGroup;
  icon: IconName;
  /** False when the server resolves the farm itself. */
  needsFarm: boolean;
  requirements: Requirement[];
  /** Opens on the truck list to start a loading plan (New Loading Plan). */
  startsPlan?: boolean;
  /** The variety picker lists only what was harvested into the greenhouse today. */
  harvestedVarietiesOnly?: boolean;
  /** A scan that may go out alongside the ones before it instead of waiting its turn, as the
   *  desk scan form does. Only scans that don't depend on an earlier one finishing. */
  parallel?: (code: string, s: ScanSession) => boolean;
  /** Scan first: the fields and the submit button show once the scan has loaded a record. */
  formAfterScan?: boolean;
  /** Always pick the stem length, whatever the Harvest by stem length setting. */
  alwaysStemLength?: boolean;
  /** Label of the stems field. */
  stemsLabel?: string;
  /** Scan with the phone camera only (no field for a hardware scanner or typing): the button's label. */
  cameraOnly?: string;
  /** Loading Plan panel under the scan field: build the plan, load the truck, or dispatch it. */
  panel?: 'plan' | 'load' | 'dispatch' | 'rejects' | 'delivery' | 'field-rejects';
  /** What the operator should scan next, given the session so far. */
  prompt: (s: ScanSession) => string;
  /** Form-style actions (nothing to scan): a button that records the setup instead of a scan field. */
  submit?: {
    label: string;
    icon: IconName;
    /** False while a field is still empty: the button shows greyed out. */
    ready?: (s: ScanSession) => boolean;
    /** Asked (Yes/No) before running; nothing is asked when it returns null. */
    confirm?: (s: ScanSession) => string | null;
    run: (s: ScanSession, update: Update) => Promise<Outcome>;
  };
  handle: (code: string, s: ScanSession, update: Update) => Promise<Outcome>;
}

// ── helpers ───────────────────────────────────────────────────────────────

const ok = (title: string, detail?: string): Outcome => ({ tone: 'success', title, detail, counts: true });
const warn = (title: string, detail?: string): Outcome => ({ tone: 'warning', title, detail });
const fail = (title: string, detail?: string): Outcome => ({ tone: 'error', title, detail });
const info = (title: string, detail?: string): Outcome => ({ tone: 'info', title, detail });

const errorOf = (err: unknown): string => userMessage(err, 'Scan failed. Try again.');

/** How long an "already scanned" warning stays up before it closes itself. */
const ALREADY_SCANNED_MS = 1000;

/** Map a `{success:false, error}` reply to an outcome, using rules [substring, tone, title?]. */
function rejected(reply: ScanReply, rules: [string, Tone, string?][] = []): Outcome {
  const raw = reply.error || '';
  const error = humanText(raw) ?? 'Scan failed';
  const lower = raw.toLowerCase();
  for (const [needle, tone, title] of rules) {
    if (lower.includes(needle.toLowerCase())) {
      return { tone, title: title ?? error, detail: title ? error : undefined };
    }
  }
  return fail(error);
}

async function run(fn: () => Promise<Outcome>): Promise<Outcome> {
  try {
    return await fn();
  } catch (err) {
    return fail(errorOf(err));
  }
}

/** Graders are recorded by payroll number; the id only when they have none. */
function graderId(grader: Employee | null): string | undefined {
  return grader ? grader.employee_number || grader.name : undefined;
}

// ── harvesting ────────────────────────────────────────────────────────────

/** The stems typed for the next bucket, or 0 when not a positive whole number. */
export function stemCount(s: ScanSession): number {
  const n = Number(s.stems.trim());
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** Harvesting asks for the stem length (scanner setting). */
export function harvestByStemLength(): boolean {
  return useScanStore.getState().harvestByStemLength;
}

/** What Harvesting still needs before a bucket can be scanned, or null. */
export function harvestMissing(s: ScanSession): string | null {
  if (!s.greenhouse) return 'Select the greenhouse';
  if (!s.variety) return 'Select the variety';
  if (harvestByStemLength() && !s.stemLength) return 'Select the stem length';
  if (!s.harvester) return 'Select the harvester';
  if (!stemCount(s)) return 'Enter the number of stems';
  return null;
}

// ── receiving ─────────────────────────────────────────────────────────────

const RECEIVING_LABEL: Record<string, string> = {
  Receiving: 'received',
  'Receiving Quarantined': 'quarantined',
  'Receiving Out': 'to packhouse',
};

function receivingAction(
  key: ActionKey,
  action: string,
  label: string,
  description: string,
  icon: IconName,
  group: ActionGroup,
): ActionDef {
  return {
    key,
    label,
    description,
    group,
    icon,
    needsFarm: true,
    requirements: [],
    prompt: () => 'Scan a bucket QR',
    handle: async (code, s) => {
      const bucketId = parseBucketId(code);
      if (!bucketId) return warn('Please scan a valid Bucket QR Code');
      try {
        const r = await scanApi.receiving(bucketId, s.farm, action);
        if (r.status === 'available') return info(`${bucketId} is available`, 'No harvest entry exists');
        if (r.status !== 'success') return fail('Unexpected response from server');
        return ok(`${bucketId} ${RECEIVING_LABEL[action]}`, `${r.variety} (${r.qty} stems)`);
      } catch (err) {
        return receivingError(bucketId, errorOf(err));
      }
    },
  };
}

function receivingError(bucketId: string, msg: string): Outcome {
  const lower = msg.toLowerCase();
  if (msg.includes('__available__')) return info(`${bucketId} is available`, 'Harvest it before receiving');
  if (msg.includes('__not_found__')) return fail(`${bucketId} has no Harvest Entry`);
  if (lower.includes('already scanned out')) return warn(`${bucketId} already scanned out!`);
  if (lower.includes('already received') || lower.includes('already scanned')) return warn(`${bucketId} already received!`);
  if (lower.includes('no receiving record') || lower.includes('must be received')) {
    return fail(`${bucketId} must be received first`, msg);
  }
  if (lower.includes('last entry is')) return warn(`${bucketId} already processed`, msg);
  if (lower.includes('needed in warehouse') || lower.includes('insufficient stock')) {
    const m = msg.match(/([\d.]+)\s+units of Item\s+[^:]+:\s+(.+?)\s+needed in Warehouse\s+(.+?)\s+to complete/i);
    return fail(
      'Insufficient stock',
      m ? `Item: ${m[2].trim()} · Needed: ${m[1]} · Warehouse: ${m[3].trim()}` : msg,
    );
  }
  return fail(msg);
}

// ── bunch actions ─────────────────────────────────────────────────────────

/** Bunch JSON re-serialised after the mojibake fix, as the server expects. */
function bunchPayload(code: string) {
  const bunch = parseBunch(code);
  return bunch ? { bunch, json: JSON.stringify(bunch) } : null;
}

// ── loading plan ──────────────────────────────────────────────────────────

/** First scan of Loading Plan / Loading / Dispatch: the truck label opens that truck's plan. */
async function openPlan(code: string, s: ScanSession, update: Update, create: boolean): Promise<Outcome> {
  const truck = parseTruck(code);
  if (!truck) return warn('Please scan the Truck Label first');
  const r = await scanApi.openLoadingPlan(truck, s.farm, create);
  if (!r.success || !r.plan) return fail(r.error || 'Could not open the Loading Plan');
  update({ plan: r.plan, truck });
  return info(
    `Truck ${truck} · ${r.plan.name}`,
    `${r.plan.total_boxes} box(es) planned for ${r.plan.customers.length} customer(s)`,
  );
}

/** Create a truck's loading plan for a farm and delivery date (or open the one it already has). */
export function startLoadingPlan(
  plan: { vehicle: string; farm: string; deliveryDate: string },
  update: Update,
): Promise<Outcome> {
  return run(async () => {
    const r = await scanApi.openLoadingPlan(plan.vehicle, plan.farm, true, plan.deliveryDate);
    if (!r.success || !r.plan) return fail(r.error || 'Could not create the Loading Plan');
    update({ plan: r.plan, truck: plan.vehicle });
    return info(
      `${r.plan.name} · truck ${plan.vehicle}`,
      `${plan.farm} · delivering ${plan.deliveryDate}` +
        (r.plan.total_boxes ? ` · ${r.plan.total_boxes} box(es) planned` : ' · tap Fetch orders'),
    );
  });
}

const allLoaded = (plan: LoadingPlan) => plan.total_boxes > 0 && plan.loaded_boxes >= plan.total_boxes;

/** Dispatch the truck: submits the plan, creating one Delivery Note per customer. */
export async function dispatchPlan(s: ScanSession, update: Update): Promise<Outcome> {
  if (!s.plan) return warn('Choose or scan the truck first');
  return run(async () => {
    const r: PlanReply = await scanApi.dispatchLoadingPlan(s.plan!.name);
    if (!r.success || !r.plan) return fail(r.error || 'Dispatch failed');
    update({ plan: r.plan });
    const notes = r.plan.customers.map((c) => c.delivery_note).filter(Boolean);
    const invoices = r.plan.customers.map((c) => c.sales_invoice).filter(Boolean);
    return ok(
      `Truck ${r.plan.vehicle} dispatched`,
      `${notes.length} Delivery Note(s), one per customer and delivery point` +
        (invoices.length ? ` · ${invoices.length} draft Sales Invoice(s)` : ''),
    );
  });
}

// ── definitions ───────────────────────────────────────────────────────────

export const ACTIONS: ActionDef[] = [
  // Production: harvesting → field rejects → edit harvest
  {
    key: 'harvesting',
    label: 'Harvesting',
    description: 'Greenhouse → bucket (creates the harvest entry)',
    group: PRODUCTION,
    icon: 'cut-outline',
    needsFarm: true,
    requirements: ['greenhouse', 'variety', 'stemLength', 'harvester', 'bed', 'stems'],
    cameraOnly: 'Scan the bucket QR',
    prompt: (s) => {
      const missing = harvestMissing(s);
      if (missing) return `${missing} first`;
      return `Scan the bucket QR · ${stemCount(s)} stems${harvestByStemLength() ? ` · ${s.stemLength}` : ''}`;
    },
    handle: (code, s, update) =>
      run(async () => {
        const bucketId = parseBucketId(code);
        if (!bucketId) return warn('Please scan a valid Bucket QR Code', 'Select the harvester from the list');
        const missing = harvestMissing(s);
        if (missing) return warn(`${missing} first`, `Bucket ${bucketId} was not harvested`);
        const r = await scanApi.harvest({
          farm: s.farm,
          greenhouse: s.greenhouse,
          item_code: s.variety,
          harvester: s.harvester!.name,
          quantity: stemCount(s),
          bay: s.bed.trim(),
          bucket_id: bucketId,
          ...(harvestByStemLength() ? { stem_length: s.stemLength } : {}),
        });
        if (r.success) {
          // The next bucket needs its own count.
          update({ stems: '' });
          return ok(
            `${r.bucket_id} harvested`,
            [
              // A plain item keeps its name, so show the length; a variant's name already has it.
              `${r.variety}${r.stem_length && !String(r.variety).endsWith(r.stem_length) ? ` ${r.stem_length}` : ''}` +
                ` · ${r.qty} ${String(r.uom || 'stems').toLowerCase()}`,
              `${r.greenhouse}${r.bay ? ` · bed ${r.bay}` : ''}`,
              r.harvester_name || r.harvester,
            ]
              .filter(Boolean)
              .join('\n'),
          );
        }
        return rejected(r, [
          ['in use', 'warning', `${bucketId} is already in use`],
          ['cannot hold more', 'warning', 'Too many stems for one bucket'],
          ['not a greenhouse', 'error'],
          ['has no', 'error'],
          ['stem length', 'warning'],
          ['not found', 'error'],
        ]);
      }),
  },
  {
    key: 'field-rejects',
    label: 'Field Rejects',
    description: 'Stems rejected in the greenhouse, with the bed/bay and reason',
    group: PRODUCTION,
    icon: 'alert-circle-outline',
    needsFarm: true,
    requirements: ['greenhouse', 'variety', 'fieldRejectReason', 'bed', 'stems'],
    harvestedVarietiesOnly: true,
    panel: 'field-rejects',
    prompt: (s) =>
      !s.greenhouse
        ? 'Select the greenhouse'
        : !s.variety
          ? 'Select the variety'
          : !s.rejectionReason
            ? 'Choose the rejection reason'
            : !s.bed.trim()
              ? 'Enter the bed / bay'
              : !stemCount(s)
                ? 'Enter the stems rejected'
                : `Add ${stemCount(s)} rejected stems to the list`,
    handle: async () => warn('Nothing to scan here', 'Fill in the reject and tap Add to list'),
    submit: {
      label: 'Add to list',
      icon: 'add-circle-outline',
      ready: (s) => !!(s.greenhouse && s.variety && s.rejectionReason && s.bed.trim() && stemCount(s)),
      run: async (s, update) => {
        if (!s.greenhouse) return warn('Select the greenhouse first');
        if (!s.variety) return warn('Select the variety first');
        if (!s.rejectionReason) return warn('Choose the rejection reason first');
        if (!s.bed.trim()) return warn('Enter the bed / bay first');
        if (!stemCount(s)) return warn('Enter the number of stems rejected');
        const line: FieldRejectLine = {
          greenhouse: s.greenhouse,
          item_code: s.variety,
          reason: s.rejectionReason,
          bed: s.bed.trim(),
          stems: stemCount(s),
        };
        // Greenhouse and variety stay set; bed, reason and stems are entered afresh.
        useFieldRejectsStore.getState().add(s.farm, line);
        update({ stems: '', bed: '', rejectionReason: '' });
        return info(`${line.stems} stems added`, `${line.item_code} · bed ${line.bed}\n${line.reason}`);
      },
    },
  },

  {
    key: 'edit-harvest',
    label: 'Edit Harvest',
    description: 'Correct a harvested bucket before it is received',
    group: PRODUCTION,
    icon: 'create-outline',
    needsFarm: true,
    requirements: ['greenhouse', 'variety', 'stemLength', 'bed', 'stems'],
    formAfterScan: true,
    alwaysStemLength: true,
    stemsLabel: 'Stems in bucket',
    prompt: (s) => (s.harvestEdit ? `Change ${s.harvestEdit.bucket_id} and tap Save changes` : 'Scan the bucket QR'),
    handle: (code, s, update) =>
      run(async () => {
        const bucketId = parseBucketId(code);
        if (!bucketId) return warn('Please scan a valid Bucket QR Code');
        const r = await scanApi.harvestedBucket(s.farm, bucketId);
        if (!r.success || !r.stock_entry) {
          return rejected(r, [
            ['past harvesting', 'warning', `${bucketId} is already received`],
            ['not harvested', 'warning', `${bucketId} is not harvested`],
            ['harvested at', 'warning'],
            ['not found', 'error'],
          ]);
        }
        const entry = r as HarvestedBucket;
        update({
          harvestEdit: entry,
          greenhouse: entry.greenhouse,
          variety: entry.variety,
          stemLength: entry.stem_length || '',
          bed: entry.bay || '',
          stems: String(entry.qty),
        });
        return info(`${bucketId} loaded`, `${entry.variety_name}${entry.stem_length ? ` ${entry.stem_length}` : ''} · ${entry.qty} stems\n${entry.greenhouse}`);
      }),
    submit: {
      label: 'Save changes',
      icon: 'save-outline',
      ready: (s) => !!(s.harvestEdit && s.greenhouse && s.variety && stemCount(s)),
      confirm: (s) => {
        const e = s.harvestEdit;
        if (!e) return null;
        const changes = [
          e.greenhouse !== s.greenhouse ? `Greenhouse: ${e.greenhouse} → ${s.greenhouse}` : '',
          e.variety !== s.variety ? `Variety: ${e.variety_name} → ${s.variety}` : '',
          (e.stem_length || '') !== s.stemLength ? `Stem length: ${e.stem_length || '-'} → ${s.stemLength || '-'}` : '',
          (e.bay || '') !== s.bed.trim() ? `Bed: ${e.bay || '-'} → ${s.bed.trim() || '-'}` : '',
          e.qty !== stemCount(s) ? `Stems: ${e.qty} → ${stemCount(s)}` : '',
        ].filter(Boolean);
        return changes.length ? `${e.bucket_id}\n${changes.join('\n')}` : null;
      },
      run: async (s, update) =>
        run(async () => {
          const e = s.harvestEdit;
          if (!e) return warn('Scan the bucket QR first');
          if (!s.greenhouse) return warn('Select the greenhouse first');
          if (!s.variety) return warn('Select the variety first');
          if (!stemCount(s)) return warn('Enter the number of stems');
          const r = await scanApi.editHarvestedBucket({
            farm: s.farm,
            bucket_id: e.bucket_id,
            stock_entry: e.stock_entry,
            greenhouse: s.greenhouse,
            item_code: s.variety,
            stem_length: s.stemLength,
            bay: s.bed.trim(),
            quantity: stemCount(s),
          });
          if (!r.success) {
            return rejected(r, [
              ['changed since it was scanned', 'warning', 'Scan the bucket again'],
              ['past harvesting', 'warning', `${e.bucket_id} is already received`],
              ['needed in warehouse', 'error', `Stems already issued from ${e.greenhouse}`],
              ['cannot hold more', 'warning', 'Too many stems for one bucket'],
              ['stem length', 'warning'],
              ['has no', 'error'],
            ]);
          }
          update({ harvestEdit: null, greenhouse: '', variety: '', stemLength: '', bed: '', stems: '' });
          if (r.unchanged) return info('Nothing changed', e.bucket_id);
          return ok(
            `${e.bucket_id} updated`,
            `${r.variety_name ?? r.variety}${r.stem_length ? ` ${r.stem_length}` : ''} · ${r.qty} stems\n${r.greenhouse}${r.bay ? ` · bed ${r.bay}` : ''}\n${r.stock_entry}`,
          );
        }),
    },
  },

  // Packhouse: receiving → receiving quarantined → receiving out → ungraded discard → grading → packing → move to shop
  receivingAction('receiving', 'Receiving', 'Receiving', 'Harvest → receiving cold store', 'enter-outline', PACKHOUSE),
  receivingAction(
    'receiving-quarantined',
    'Receiving Quarantined',
    'Receiving Quarantined',
    'Harvest → quarantine store',
    'shield-outline',
    PACKHOUSE,
  ),
  receivingAction('receiving-out', 'Receiving Out', 'Receiving Out', 'Cold store → packhouse store', 'exit-outline', PACKHOUSE),
  {
    key: 'ungraded-discard',
    label: 'Ungraded Discard',
    description: 'Discard a received bucket before grading',
    group: PACKHOUSE,
    icon: 'trash-outline',
    needsFarm: true,
    requirements: [],
    prompt: () => 'Scan a bucket QR',
    handle: (code, s) =>
      run(async () => {
        const bucketId = parseBucketId(code);
        if (!bucketId) return warn('Please scan a valid Bucket QR Code');
        const r = await scanApi.ungradedDiscard(bucketId, s.farm);
        if (r.success) return ok(`${bucketId} discarded`, `${r.item_count} item(s) · bucket now available`);
        return rejected(r, [
          ['already been discarded', 'warning', 'Bucket already discarded!'],
          ['already discarded', 'warning', 'Bucket already discarded!'],
          ['not received', 'error', 'Bucket must be received first'],
        ]);
      }),
  },
  {
    key: 'grading',
    label: 'Grading',
    description: 'Packhouse store → available for sale',
    group: PACKHOUSE,
    icon: 'ribbon-outline',
    needsFarm: true,
    requirements: ['grader'],
    // Bunches go out as fast as they are scanned once the grader is set; a grader badge
    // still waits its turn, so the bunches after it are graded by that grader.
    parallel: (code, s) => !!s.grader && !parseGraderQr(code) && !!parseBunch(code),
    prompt: (s) => (s.grader ? 'Scan a bunch QR' : 'Scan the grader QR'),
    handle: (code, s, update) =>
      run(async () => {
        // A grader badge sets the grader, and mid-session switches to that grader.
        const badge = parseGraderQr(code);
        if (!s.grader || badge) {
          if (parseBunch(code)) return warn('Select or scan the grader first', 'That was a bunch QR');
          const id = badge ?? parseEmployee(code);
          if (!id) return warn('Invalid grader QR code');
          const emp = await scanApi.getEmployee(id);
          if (!emp.success || !emp.name) return fail(emp.error || `Grader ${id} not found`);
          update({
            grader: { name: emp.name, employee_name: emp.employee_name ?? emp.name, employee_number: emp.employee_number },
          });
          // Setting the grader is not a graded bunch: no beep.
          return { ...info(`Grader: ${emp.employee_name ?? emp.name}`, 'Now scan bunches'), silent: true };
        }
        const p = bunchPayload(code);
        if (!p) return fail('Invalid QR');
        const r = await scanApi.grading(p.json, s.farm, s.grader.employee_number || s.grader.name);
        if (r.success) {
          return ok(
            `${r.bunch_id} graded`,
            `${r.variety} · ${r.stem_length} · ${r.bunch_size}${r.held ? ' · held (same-day harvest)' : ''}`,
          );
        }
        if ((r.error || '').toLowerCase().includes('already graded')) {
          return { ...warn('Already graded', humanText(r.error || '') ?? undefined), dismissAfterMs: ALREADY_SCANNED_MS };
        }
        return rejected(r, [
          ['insufficient stock', 'error'],
          ['not found', 'warning', 'Item/UOM not found'],
          ['does not exist', 'warning', 'Item/UOM not found'],
          ['invalid', 'error', 'Invalid QR'],
          ['missing', 'error', 'Invalid QR'],
        ]);
      }),
  },
  {
    key: 'ungrade',
    label: 'Ungrade',
    description: 'Return a graded bunch to the packhouse store',
    group: PACKHOUSE,
    icon: 'arrow-undo-outline',
    needsFarm: true,
    requirements: ['graderOptional'],
    prompt: () => 'Scan a bunch QR',
    handle: (code, s) =>
      run(async () => {
        const p = bunchPayload(code);
        if (!p) return warn('Invalid Bunch QR Code');
        const r = await scanApi.ungrade(p.json, p.bunch.farm || s.farm, graderId(s.grader));
        if (r.success) return ok(`${p.bunch.variety} ungraded`, `${r.stems ?? ''} stems returned to packhouse`);
        return rejected(r);
      }),
  },
  {
    key: 'stock-take',
    label: 'Stock Take',
    description: 'Count buckets and bunches in store',
    group: PACKHOUSE,
    icon: 'clipboard-outline',
    needsFarm: true,
    requirements: [],
    prompt: () => 'Scan a bucket or bunch QR',
    handle: (code, s) =>
      run(async () => {
        const r = await scanApi.stockTake(code, s.farm);
        if (r.success) return ok(`${r.reference_id} recorded`, `${r.item_code} · ${r.qty} ${r.uom}`);
        return rejected(r, [
          ['already stock taken', 'warning'],
          ['not found', 'warning'],
        ]);
      }),
  },

  // Packhouse (cont.): packing → move to shop
  {
    key: 'packing',
    label: 'Packing',
    description: 'Pack bunches into boxes for an Order Pick List',
    group: PACKHOUSE,
    icon: 'cube-outline',
    needsFarm: true,
    requirements: ['packer', 'opl'],
    prompt: (s) => (!s.opl ? 'Choose the Order Pick List' : !s.packer ? 'Select the packer' : 'Scan a bunch QR'),
    handle: (code, s, update) =>
      run(async () => {
        if (!s.opl) {
          if (!isOplUrl(code)) return warn('Choose the Order Pick List first', 'Or scan its QR code');
          const r = await scanApi.validateOpl(code, s.farm);
          if (!r.success) return fail(r.error || 'Failed to validate Order Pick List');
          update({ opl: r });
          return r.warning ? warn(`OPL ${r.opl} set`, r.warning) : info(`OPL ${r.opl} set`, r.customer);
        }
        if (isOplUrl(code)) return warn('OPL already set', 'Scan a bunch, or clear the OPL to start a new one');
        if (!s.packer) return warn('Select the packer first');
        const p = bunchPayload(code);
        if (!p) return fail('Please scan a valid Bunch QR Code');
        const r = await scanApi.packing(s.opl.opl, p.json, s.farm, s.packer.name);
        if (r.success) {
          update({ opl: { ...s.opl, packed_stems: r.scanned_stems, total_stems: r.total_stems || s.opl.total_stems } });
          return ok(
            `${r.variety} → ${r.box_label || `Box ${r.box_id}`}`,
            `${r.spec_progress} · order ${r.scanned_stems}/${r.total_stems} stems (${r.completion}%)`,
          );
        }
        return rejected(r, [
          ['not graded', 'warning', 'Not Yet Graded!'],
          ['already packed', 'error', 'Bunch Already Scanned!'],
          ['pack older', 'warning', 'Pack older bunches first'],
          ['expected:', 'warning'],
          ['order full', 'info', 'Order Full!'],
          ['packed!', 'info'],
          ['unknown bunch size', 'warning'],
          ['farm pack list already submitted', 'warning', 'Pack List Already Submitted!'],
          ['walk in shop', 'warning'],
        ]);
      }),
  },
  {
    key: 'local-sale',
    label: 'Move to Shop',
    description: 'Move day 4+ bunches to the shop',
    group: PACKHOUSE,
    icon: 'storefront-outline',
    needsFarm: true,
    requirements: [],
    prompt: () => 'Scan a bunch QR',
    handle: (code, s) =>
      run(async () => {
        const p = bunchPayload(code);
        if (!p) return warn('Invalid Bunch QR Code');
        const r = await scanApi.localSale(p.json, s.farm);
        if (r.success) return ok(r.already_in_shop ? `${p.bunch.variety} already in the shop` : `${p.bunch.variety} → shop (day ${r.age_days})`, r.message || r.bunch_id);
        return rejected(r, [
          ['already moved', 'warning'],
          ['not yet day', 'warning', 'Too fresh for the shop'],
          ['already packed', 'error', 'Bunch already packed'],
          ['no graded entry', 'error', 'Bunch not graded'],
          ['insufficient stock', 'error'],
        ]);
      }),
  },
  // Dispatch: load & dispatch (plan, load and send one truck) → delivery
  {
    key: 'loading',
    label: 'Load & Dispatch',
    description: 'Plan a truck, scan its boxes on in order and send it',
    group: DISPATCH,
    icon: 'paper-plane-outline',
    needsFarm: true,
    requirements: ['truckPick'],
    panel: 'dispatch',
    prompt: (s) =>
      !s.plan
        ? 'Choose the truck, or scan its label'
        : s.plan.docstatus === 1
          ? 'Truck dispatched'
          : allLoaded(s.plan)
            ? 'All boxes loaded — tap Dispatch truck'
            : 'Scan each box as it goes onto the truck',
    handle: (code, s, update) =>
      run(async () => {
        // A truck with no open plan for this farm gets one.
        if (!s.plan) return openPlan(code, s, update, true);
        if (s.plan.docstatus === 1) return warn('Truck already dispatched', 'Clear the truck to load another one');
        if (parseTruck(code)) return warn('Truck already set', 'Clear the truck to load another one');
        if (!isBoxLabel(code)) return warn('Invalid Box Label!');
        const box = code.trim();
        const r = await scanApi.loadBox(s.plan.name, box);
        if (r.plan) update({ plan: r.plan });
        if (!r.success) {
          return rejected(r, [
            ['already loaded', 'warning', 'Box already loaded'],
            ['not on loading plan', 'error', 'Box is not on this truck’s plan'],
          ]);
        }
        const plan = r.plan!;
        const c = plan.customers.find(
          (x) => x.customer === r.customer && (x.delivery_point ?? null) === (r.delivery_point ?? null),
        );
        return ok(
          `Loaded ${box}`,
          `${r.customer}${r.delivery_point ? ` → ${r.delivery_point}` : ''}${c ? ` ${c.loaded}/${c.planned}` : ''}` +
            ` · truck ${plan.loaded_boxes}/${plan.total_boxes}`,
        );
      }),
  },
  {
    key: 'delivery',
    label: 'Delivery',
    description: 'Deliver the boxes of a delivery point, customer by customer',
    group: DELIVERY,
    icon: 'checkmark-done-outline',
    needsFarm: true,
    requirements: ['deliveryPoint'],
    panel: 'delivery',
    prompt: (s) => (s.deliveryPoint === null ? 'Choose the delivery point' : 'Scan each box as it is delivered'),
    handle: (code, s, update) =>
      run(async () => {
        if (s.deliveryPoint === null) return warn('Choose the delivery point first');
        if (!isBoxLabel(code)) return warn('Invalid Box Label!');
        const r = await scanApi.delivery(code.trim(), s.farm);
        if (r.success) {
          update({ deliveryVersion: s.deliveryVersion + 1 });
          return ok(`Delivered: ${r.progress}`, `${r.box_name} · ${r.delivery_form}`);
        }
        return rejected(r, [['already delivered', 'warning']]);
      }),
  },
  {
    key: 'undispatch',
    label: 'Undispatch',
    description: 'Take a box off an open Dispatch Form',
    group: DISPATCH,
    icon: 'return-down-back-outline',
    needsFarm: false,
    requirements: ['undispatchReason'],
    prompt: (s) => (s.undispatchReason.trim() ? 'Scan a box label' : 'Fill in the undispatch reason first'),
    handle: (code, s) =>
      run(async () => {
        if (!s.undispatchReason.trim()) return warn('Fill in Undispatch Reason first');
        const r = await scanApi.undispatch(code.trim(), s.undispatchReason.trim());
        if (r.success) return ok(r.message || `Box ${code} undispatched`, r.dispatch_form);
        return rejected(r);
      }),
  },

  // Shop: shop → walk-in shop / vase; shop discard
  {
    key: 'walk-in-shop',
    label: 'Walk In Shop',
    description: 'Move shop bunches into the walk-in shop',
    group: SHOP,
    icon: 'enter-outline',
    needsFarm: true,
    requirements: [],
    prompt: () => 'Scan a bunch QR',
    handle: (code, s) =>
      run(async () => {
        const p = bunchPayload(code);
        if (!p) return warn('Invalid Bunch QR Code');
        const r = await scanApi.walkInShopTransfer(p.json, s.farm);
        if (r.success) return ok(r.already_in_walk_in_shop ? `${p.bunch.variety} already in the walk-in shop` : `${p.bunch.variety} → walk-in shop`, r.message || r.bunch_id);
        return rejected(r, [
          ['already moved', 'warning'],
          ['moved to the shop first', 'warning', 'Move it to the shop first'],
          ['not yet day', 'warning', 'Too fresh for the shop'],
          ['insufficient stock', 'error'],
        ]);
      }),
  },
  {
    key: 'vase',
    label: 'Vase',
    description: 'Vase a bunch from the walk-in shop',
    group: SHOP,
    icon: 'flower-outline',
    needsFarm: false,
    requirements: [],
    prompt: () => 'Scan a bunch QR',
    handle: (code, s) =>
      run(async () => {
        const p = bunchPayload(code);
        if (!p) return warn('Invalid Bunch QR Code');
        const r = await scanApi.vase(p.json, s.farm);
        if (r.success) return ok(r.message || 'Vased successfully!', r.bunch_id);
        return rejected(r, [['already', 'warning']]);
      }),
  },
  {
    key: 'graded-discard',
    label: 'Shop Discard',
    description: 'Discard a bunch from the shop store',
    group: SHOP,
    icon: 'close-circle-outline',
    needsFarm: true,
    requirements: ['graderOptional'],
    prompt: () => 'Scan a bunch QR',
    handle: (code, s) =>
      run(async () => {
        const p = bunchPayload(code);
        if (!p) return warn('Invalid Bunch QR Code');
        const r = await scanApi.gradedDiscard(p.json, s.farm, graderId(s.grader));
        if (r.success) return ok(r.message || `${p.bunch.variety} discarded`, r.bunch_id);
        return rejected(r, [
          ['not graded', 'warning'],
          ['already discarded', 'warning'],
          ['not a stock item', 'error', `${p.bunch.variety} is not a valid stock item`],
        ]);
      }),
  },

  // Quality
  {
    key: 'grading-check',
    label: 'Grading Check',
    description: 'Check whether a bunch has been graded',
    group: QUALITY,
    icon: 'search-outline',
    needsFarm: false,
    requirements: [],
    prompt: () => 'Scan a bunch QR',
    handle: (code) =>
      run(async () => {
        const r = await scanApi.gradingCheck(code);
        if (!r.success) return fail(r.error || 'Invalid QR Code');
        if (r.status === 'BUCKET') return info('Bucket detected');
        return r.status === 'GRADED' ? ok('GRADED', r.bunch_id) : warn('NOT GRADED', r.bunch_id);
      }),
  },
  {
    key: 'graded-rejects',
    label: 'Graded Rejects',
    description: 'Stems rejected at grading, out of the packhouse store',
    group: PACKHOUSE,
    icon: 'remove-circle-outline',
    needsFarm: true,
    requirements: ['floorVariety', 'fieldRejectReason', 'stems'],
    panel: 'rejects',
    prompt: (s) =>
      !s.variety
        ? 'Select the variety'
        : !s.rejectionReason
          ? 'Choose the rejection reason'
          : !stemCount(s)
            ? 'Enter the stems rejected'
            : `Add ${stemCount(s)} rejected stems`,
    handle: async () => warn('Nothing to scan here', 'Choose the variety, enter the stems and tap Add to rejects'),
    submit: {
      label: 'Add to rejects',
      icon: 'add-circle-outline',
      ready: (s) => !!(s.variety && s.rejectionReason && stemCount(s)),
      confirm: (s) =>
        s.variety && s.rejectionReason && stemCount(s)
          ? `Add ${stemCount(s)} stems of ${s.variety} (${s.rejectionReason}) to today's rejects?`
          : null,
      // Saved on today's draft entry; the panel below submits the day's rejects in one go.
      run: (s, update) =>
        run(async () => {
          if (!s.variety) return warn('Select the variety first');
          if (!s.rejectionReason) return warn('Choose the rejection reason first');
          if (!stemCount(s)) return warn('Enter the number of stems rejected');
          if (s.varietyBalance !== null && stemCount(s) > s.varietyBalance) {
            return warn(`Only ${s.varietyBalance} stems on the floor`, 'Enter no more than the balance');
          }
          const r = await scanApi.addReject(s.farm, s.variety, stemCount(s), s.rejectionReason);
          if (r.success) {
            update({
              stems: '',
              rejectionReason: '',
              varietyBalance: s.varietyBalance === null ? null : Math.max(s.varietyBalance - (r.qty ?? 0), 0),
              rejectsVersion: s.rejectsVersion + 1,
            });
            return ok(`${r.qty} stems added to rejects`, `${r.variety} · ${r.reason || s.rejectionReason} · not yet submitted`);
          }
          return rejected(r, [['left on the floor', 'error', 'Not enough stems on the floor']]);
        }),
    },
  },
  {
    key: 'packing-reject',
    label: 'Packing Reject',
    description: 'Reject a bunch at packing',
    group: QUALITY,
    icon: 'thumbs-down-outline',
    needsFarm: true,
    requirements: ['rejectionReason', 'graderOptional'],
    prompt: (s) => (s.rejectionReason ? 'Scan a bunch QR' : 'Choose a rejection reason first'),
    handle: (code, s) =>
      run(async () => {
        if (!s.rejectionReason) return warn('Fill rejection reason');
        const p = bunchPayload(code);
        if (!p) return warn('Invalid Bunch QR Code');
        const r = await scanApi.packingReject(p.json, s.farm, s.rejectionReason, graderId(s.grader));
        if (r.success) return ok('Rejected successfully!', `${p.bunch.variety} · ${r.bunch_id}`);
        return rejected(r, [
          ['already rejected', 'warning'],
          ['not graded', 'error'],
        ]);
      }),
  },
];

// New Loading Plan: Load & Dispatch opening on the truck list, its own tile on the Dispatch home.
{
  const loading = ACTIONS.find((a) => a.key === 'loading')!;
  ACTIONS.splice(ACTIONS.indexOf(loading), 0, {
    ...loading,
    key: 'new-loading-plan',
    label: 'New Loading Plan',
    description: 'Start a truck’s loading plan for this farm',
    icon: 'add-circle-outline',
    startsPlan: true,
  });
}

export function getAction(key: string | undefined): ActionDef | undefined {
  return ACTIONS.find((a) => a.key === key);
}

/** The actions of the given processes. */
export function actionsFor(processes: ProcessKey[]): ActionDef[] {
  return ACTIONS.filter((a) => processes.includes(a.group));
}
