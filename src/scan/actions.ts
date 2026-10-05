import type { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { HttpError } from '@/src/services/api';
import { scanApi, type Employee, type LoadingPlan, type OplInfo, type PlanReply, type ScanReply } from '@/src/services/scan-api';
import { isBoxLabel, isOplUrl, parseBucketId, parseBunch, parseEmployee, parseTruck } from './parse';
import { PROCESSES, type ProcessKey } from './processes';

/**
 * Every scan the Tambuzi packhouse does, mirroring the Scan form's
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
  harvester: Employee | null;
  bed: string;
  stems: string;
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
  harvester: null,
  bed: '',
  stems: '',
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
  | 'fieldRejectReason' // picked from the Rejection Reasons (field rejects)
  | 'plan' // truck label scanned first, opens the truck's Loading Plan
  | 'truckPick' // like 'plan', or picked from the open Loading Plans
  | 'greenhouse' // Harvesting: picked from the farm's greenhouses
  | 'variety' // Harvesting: picked, the greenhouse's recent varieties first
  | 'harvester' // Harvesting: picked from the list
  | 'bed' // Harvesting: typed, optional
  | 'stems'; // Harvesting: typed per bucket

export type ActionKey =
  | 'harvesting'
  | 'field-rejects'
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
  | 'staging'
  | 'loading-plan'
  | 'loading'
  | 'dispatch'
  | 'dispatch-form'
  | 'undispatch'
  | 'delivery';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Processes, in the order stock moves from the greenhouse to the truck. */
const PRODUCTION: ProcessKey = 'production';
const PACKHOUSE: ProcessKey = 'packhouse';
const DISPATCH: ProcessKey = 'dispatch';
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
  /** Loading Plan panel under the scan field: build the plan, load the truck, or dispatch it. */
  panel?: 'plan' | 'load' | 'dispatch';
  /** What the operator should scan next, given the session so far. */
  prompt: (s: ScanSession) => string;
  /** Form-style actions (nothing to scan): a button that records the setup instead of a scan field. */
  submit?: { label: string; icon: IconName; run: (s: ScanSession, update: Update) => Promise<Outcome> };
  handle: (code: string, s: ScanSession, update: Update) => Promise<Outcome>;
}

// ── helpers ───────────────────────────────────────────────────────────────

const ok = (title: string, detail?: string): Outcome => ({ tone: 'success', title, detail, counts: true });
const warn = (title: string, detail?: string): Outcome => ({ tone: 'warning', title, detail });
const fail = (title: string, detail?: string): Outcome => ({ tone: 'error', title, detail });
const info = (title: string, detail?: string): Outcome => ({ tone: 'info', title, detail });

const errorOf = (err: unknown): string =>
  err instanceof HttpError || err instanceof Error ? err.message : String(err);

/** Map a `{success:false, error}` reply to an outcome, using rules [substring, tone, title?]. */
function rejected(reply: ScanReply, rules: [string, Tone, string?][] = []): Outcome {
  const error = reply.error || 'Scan failed';
  const lower = error.toLowerCase();
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

// ── harvesting ────────────────────────────────────────────────────────────

/** The stems typed for the next bucket, or 0 when not a positive whole number. */
export function stemCount(s: ScanSession): number {
  const n = Number(s.stems.trim());
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** What Harvesting still needs before a bucket can be scanned, or null. */
export function harvestMissing(s: ScanSession): string | null {
  if (!s.greenhouse) return 'Select the greenhouse';
  if (!s.variety) return 'Select the variety';
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
  // Production: harvesting → receiving cold store
  {
    key: 'harvesting',
    label: 'Harvesting',
    description: 'Greenhouse → bucket (creates the harvest entry)',
    group: PRODUCTION,
    icon: 'cut-outline',
    needsFarm: true,
    requirements: ['greenhouse', 'variety', 'harvester', 'bed', 'stems'],
    prompt: (s) => {
      const missing = harvestMissing(s);
      return missing ? `${missing} first` : `Scan the bucket QR · ${stemCount(s)} stems`;
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
        });
        if (r.success) {
          // The next bucket needs its own count.
          update({ stems: '' });
          return ok(
            `${r.bucket_id} harvested`,
            [
              `${r.variety} · ${r.qty} ${String(r.uom || 'stems').toLowerCase()}`,
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
          ['not found', 'error'],
        ]);
      }),
  },
  {
    key: 'field-rejects',
    label: 'Field Rejects',
    description: 'Stems rejected in the greenhouse, with the reason',
    group: PRODUCTION,
    icon: 'alert-circle-outline',
    needsFarm: true,
    requirements: ['greenhouse', 'variety', 'fieldRejectReason', 'stems'],
    prompt: (s) =>
      !s.greenhouse
        ? 'Select the greenhouse'
        : !s.variety
          ? 'Select the variety'
          : !s.rejectionReason
            ? 'Choose the rejection reason'
            : !stemCount(s)
              ? 'Enter the stems rejected'
              : `Record ${stemCount(s)} rejected stems`,
    handle: async () => warn('Nothing to scan here', 'Fill in the rejects and tap Record field rejects'),
    submit: {
      label: 'Record field rejects',
      icon: 'checkmark-circle-outline',
      run: (s, update) =>
        run(async () => {
          if (!s.greenhouse) return warn('Select the greenhouse first');
          if (!s.variety) return warn('Select the variety first');
          if (!s.rejectionReason) return warn('Choose the rejection reason first');
          if (!stemCount(s)) return warn('Enter the number of stems rejected');
          const r = await scanApi.fieldRejects(s.farm, s.greenhouse, s.variety, stemCount(s), s.rejectionReason);
          if (r.success) {
            update({ stems: '' });
            return ok(`${r.qty} stems rejected`, `${r.variety} · ${r.greenhouse}\n${r.reason}`);
          }
          return rejected(r, [['not a greenhouse', 'error'], ['not found', 'error']]);
        }),
    },
  },
  receivingAction('receiving', 'Receiving', 'Receiving', 'Harvest → receiving cold store', 'enter-outline', PRODUCTION),
  receivingAction(
    'receiving-quarantined',
    'Receiving Quarantined',
    'Receiving Quarantined',
    'Harvest → quarantine store',
    'shield-outline',
    PRODUCTION,
  ),
  {
    key: 'ungraded-discard',
    label: 'Ungraded Discard',
    description: 'Discard a received bucket before grading',
    group: PRODUCTION,
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

  // Packhouse: receiving out → grading → packing
  receivingAction('receiving-out', 'Receiving Out', 'Receiving Out', 'Cold store → packhouse store', 'exit-outline', PACKHOUSE),
  {
    key: 'grading',
    label: 'Grading',
    description: 'Packhouse store → available for sale',
    group: PACKHOUSE,
    icon: 'ribbon-outline',
    needsFarm: true,
    requirements: ['grader'],
    prompt: (s) => (s.grader ? 'Scan a bunch QR' : 'Select or scan the grader first'),
    handle: (code, s, update) =>
      run(async () => {
        if (!s.grader) {
          if (parseBunch(code)) return warn('Select or scan the grader first', 'That was a bunch QR');
          const id = parseEmployee(code);
          if (!id) return warn('Invalid grader QR code');
          const emp = await scanApi.getEmployee(id);
          if (!emp.success || !emp.name) return fail(emp.error || `Grader ${id} not found`);
          update({ grader: { name: emp.name, employee_name: emp.employee_name ?? emp.name } });
          return info(`Grader: ${emp.employee_name ?? emp.name}`, 'Now scan bunches');
        }
        const p = bunchPayload(code);
        if (!p) return fail('Invalid QR');
        const r = await scanApi.grading(p.json, s.farm, s.grader.name);
        if (r.success) {
          return ok(
            `${r.bunch_id} graded`,
            `${r.variety} · ${r.stem_length} · ${r.bunch_size}${r.held ? ' · held (same-day harvest)' : ''}`,
          );
        }
        return rejected(r, [
          ['already graded', 'warning', 'Already graded'],
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
        const r = await scanApi.ungrade(p.json, p.bunch.farm || s.farm, s.grader?.name);
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

  // Packhouse (cont.): packing → packing reject
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
  // Dispatch: staging → loading plan → loading → dispatch
  {
    key: 'staging',
    label: 'Staging',
    description: 'Scan packed boxes into the dispatch bay',
    group: DISPATCH,
    icon: 'albums-outline',
    needsFarm: false,
    requirements: [],
    prompt: () => 'Scan a packed box label',
    handle: (code) =>
      run(async () => {
        if (!isBoxLabel(code)) return warn('Invalid Box Label!');
        const r = await scanApi.stageBox(code.trim());
        if (r.success) return ok(`Box ${r.box} staged`, [r.customer, r.delivery_point].filter(Boolean).join(' · '));
        return rejected(r, [
          ['already staged', 'warning'],
          ['already dispatched', 'warning'],
          ['not submitted', 'warning'],
        ]);
      }),
  },
  {
    key: 'loading-plan',
    label: 'Loading Plan',
    description: 'Plan staged boxes onto a truck, per customer',
    group: DISPATCH,
    icon: 'git-network-outline',
    needsFarm: true,
    requirements: ['plan'],
    panel: 'plan',
    prompt: (s) =>
      !s.plan
        ? 'Scan the Truck Label'
        : s.removeFromPlan
          ? 'Scan a box to take it off the plan'
          : 'Scan a staged box to plan it',
    handle: (code, s, update) =>
      run(async () => {
        if (!s.plan) return openPlan(code, s, update, true);
        if (parseTruck(code)) return warn('Truck already set', 'Clear the truck to plan another one');
        if (!isBoxLabel(code)) return warn('Invalid Box Label!');
        const box = code.trim();
        const r = s.removeFromPlan
          ? await scanApi.unplanBox(s.plan.name, box)
          : await scanApi.planBox(s.plan.name, box);
        if (r.plan) update({ plan: r.plan });
        if (!r.success) {
          return rejected(r, [
            ['already on this', 'warning'],
            ['already on loading plan', 'warning'],
            ['not been staged', 'warning', 'Box not staged'],
            ['not on this', 'warning'],
            ['already dispatched', 'warning'],
          ]);
        }
        const plan = r.plan!;
        return s.removeFromPlan
          ? ok(`Box ${box} taken off the plan`, `${plan.total_boxes} box(es) planned`)
          : ok(
              `Box ${box} → ${r.customer}${r.delivery_point ? ` · ${r.delivery_point}` : ''}`,
              `${plan.total_boxes} box(es) · ${new Set(plan.customers.map((x) => x.customer)).size} customer(s), ` +
                `${plan.customers.length} delivery point(s)`,
            );
      }),
  },
  {
    key: 'loading',
    label: 'Loading',
    description: 'Scan boxes onto the truck against its plan',
    group: DISPATCH,
    icon: 'arrow-forward-circle-outline',
    needsFarm: true,
    requirements: ['plan'],
    panel: 'load',
    prompt: (s) =>
      !s.plan
        ? 'Scan the Truck Label'
        : s.plan.docstatus === 1
          ? 'Truck already dispatched'
          : allLoaded(s.plan)
            ? 'All boxes loaded — open Dispatch to send the truck'
            : 'Scan each box as it goes onto the truck',
    handle: (code, s, update) =>
      run(async () => {
        if (!s.plan) return openPlan(code, s, update, false);
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
    key: 'dispatch',
    label: 'Dispatch',
    description: 'Send a loaded truck: Delivery Notes per customer and delivery point',
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
            : `Still loading: ${s.plan.loaded_boxes}/${s.plan.total_boxes} boxes on the truck`,
    handle: (code, s, update) =>
      run(async () => {
        if (!s.plan) return openPlan(code, s, update, false);
        if (parseTruck(code)) return warn('Truck already set', 'Clear the truck to dispatch another one');
        if (isBoxLabel(code)) return warn('Load boxes in Loading', 'Dispatch only sends a truck that is fully loaded');
        return warn('Scan the Truck Label');
      }),
  },
  {
    key: 'delivery',
    label: 'Delivery',
    description: 'Deliver boxes at the destination',
    group: DISPATCH,
    icon: 'checkmark-done-outline',
    needsFarm: true,
    requirements: [],
    prompt: () => 'Scan a box label',
    handle: (code, s) =>
      run(async () => {
        if (!isBoxLabel(code)) return warn('Invalid Box Label!');
        const r = await scanApi.delivery(code.trim(), s.farm);
        if (r.success) return ok(`Delivered: ${r.progress}`, `${r.box_name} · ${r.delivery_form}`);
        return rejected(r, [['already delivered', 'warning']]);
      }),
  },
  {
    key: 'dispatch-form',
    label: 'Dispatch Form',
    description: 'Farm transfer / trip Dispatch Form',
    group: DISPATCH,
    icon: 'bus-outline',
    needsFarm: true,
    requirements: ['truck'],
    prompt: (s) => (s.truck ? 'Scan a box label' : 'Scan the Truck Label first'),
    handle: (code, s, update) =>
      run(async () => {
        if (!s.truck) {
          const truck = parseTruck(code);
          if (!truck) return warn('Please scan the Truck Label first');
          update({ truck });
          return info(`Truck ${truck}`, 'Now scan box labels');
        }
        const r = await scanApi.dispatch(s.truck, code.trim(), s.farm);
        if (r.success) return ok(`Dispatched: ${r.progress}`, `${r.dispatch_type} · ${r.dispatch_form}`);
        return rejected(r, [
          ['already dispatched', 'warning', 'Box already loaded to Nairobi'],
          ['already loaded', 'warning', 'Box already loaded'],
        ]);
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

  // Shop: day 4 flowers → shop → walk-in shop / vase; shop discard
  {
    key: 'local-sale',
    label: 'Local Sale',
    description: 'Move day 4 flowers to the shop',
    group: SHOP,
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
        const r = await scanApi.gradedDiscard(p.json, s.farm, s.grader?.name);
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
    group: QUALITY,
    icon: 'remove-circle-outline',
    needsFarm: true,
    requirements: ['variety', 'stems', 'graderOptional'],
    prompt: (s) =>
      !s.variety ? 'Select the variety' : !stemCount(s) ? 'Enter the stems rejected' : `Record ${stemCount(s)} rejected stems`,
    handle: async () => warn('Nothing to scan here', 'Choose the variety, enter the stems and tap Record rejects'),
    submit: {
      label: 'Record rejects',
      icon: 'checkmark-circle-outline',
      run: (s, update) =>
        run(async () => {
          if (!s.variety) return warn('Select the variety first');
          if (!stemCount(s)) return warn('Enter the number of stems rejected');
          const r = await scanApi.gradedRejects(s.farm, s.variety, stemCount(s), s.grader?.name);
          if (r.success) {
            update({ stems: '' });
            return ok(`${r.qty} stems rejected`, `${r.variety} · ${r.warehouse}`);
          }
          return rejected(r, [['insufficient stock', 'error', 'Not enough stems in the packhouse store']]);
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
        const r = await scanApi.packingReject(p.json, s.farm, s.rejectionReason, s.grader?.name);
        if (r.success) return ok('Rejected successfully!', `${p.bunch.variety} · ${r.bunch_id}`);
        return rejected(r, [
          ['already rejected', 'warning'],
          ['not graded', 'error'],
        ]);
      }),
  },
];

export function getAction(key: string | undefined): ActionDef | undefined {
  return ACTIONS.find((a) => a.key === key);
}

/** The actions of the given processes (all of them when none is chosen). */
export function actionsFor(processes: ProcessKey[]): ActionDef[] {
  return processes.length ? ACTIONS.filter((a) => processes.includes(a.group)) : ACTIONS;
}
