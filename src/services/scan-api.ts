import { apiClient, mapAxiosError } from './api';
import { endpoint } from './api-module';

/**
 * Wrappers for the scan endpoints (Server Scripts routed by `endpoint`).
 *
 * Most endpoints answer HTTP 200 with `{success: false, error}` for domain
 * rejections ("already graded", "Order full!"). `receiving` instead raises
 * (`frappe.throw`), which surfaces here as an HttpError carrying the message.
 */

/** POST a whitelisted method and return its `message`. Throws HttpError on transport/server errors. */
export async function callMethod<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
  try {
    const { path, args: route } = endpoint(method);
    const res = await apiClient().post(path, { ...args, ...route });
    return (res.data?.message ?? res.data) as T;
  } catch (err) {
    throw mapAxiosError(err);
  }
}

/** GET a whitelisted method (for methods the server only accepts over GET). */
export async function getMethod<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  try {
    const { path, args: route } = endpoint(method);
    const res = await apiClient().get(path, { params: { ...params, ...route } });
    return (res.data?.message ?? res.data) as T;
  } catch (err) {
    throw mapAxiosError(err);
  }
}

/** Shape shared by every scan endpoint that reports success/failure in the body. */
/** A harvested bucket's entry, as Edit Harvest shows and edits it. */
export interface HarvestedBucket {
  bucket_id: string;
  stock_entry: string;
  amended_from?: string | null;
  posting_date: string;
  posting_time: string;
  farm: string;
  greenhouse: string;
  item_code: string;
  /** The variety as picked: a stem-length variant shows as its template. */
  variety: string;
  variety_name: string;
  stem_length: string;
  bay: string;
  qty: number;
  uom?: string;
  harvester?: string | null;
  harvester_name?: string | null;
}

export type HarvestedBucketReply = ScanReply &
  Partial<HarvestedBucket> & { unchanged?: boolean; previous?: string };

export interface EditHarvestArgs {
  farm: string;
  bucket_id: string;
  stock_entry: string;
  greenhouse: string;
  item_code: string;
  stem_length: string;
  bay: string;
  quantity: number;
}

export interface ScanReply {
  success: boolean;
  error?: string;
  message?: string;
  [key: string]: any;
}

export interface ScanSetup {
  user: string;
  full_name: string;
  farms: string[];
  rejection_reasons: string[];
  /** Whether this account may open the device register (System Manager). */
  can_view_devices?: boolean;
  /** The site's logo path (e.g. /private/files/x.jpeg), shown behind the home greeting. */
  logo?: string | null;
  /** The processes this user may use (Post Harvest Settings: Users); Production when none is ticked. */
  processes?: string[];
  /** Post Harvest Settings: harvesting asks for each bucket's stem length. */
  harvest_by_stem_length?: boolean;
  /** Post Harvest Settings' Log Out Devices for this device: it signs out when this changes. */
  logout_mark?: string;
}

export interface Employee {
  name: string;
  employee_name: string;
  /** Payroll number; `name` is the HR-EMP id the server links records to. */
  employee_number?: string | null;
  /** Harvested at the farm lately (search with a farm); listed first. */
  recent?: 0 | 1;
  designation?: string;
}

export interface OplInfo extends ScanReply {
  opl: string;
  customer?: string;
  sales_order?: string;
  total_stems?: number;
  warning?: string | null;
  delivery_point?: string | null;
  /** Stems packed so far on the farm's draft Farm Pack List. */
  packed_stems?: number;
}

/** A truck to start a loading plan for. */
export interface VehicleOption {
  vehicle: string;
  description: string;
  /** This farm's open plan for the truck: choosing it opens that plan. */
  open_plan: string | null;
}

/** A harvested bucket not received yet (Awaiting Receiving). */
export interface AwaitingBucket {
  bucket: string;
  variety: string;
  item_name: string;
  stem_length: string | null;
  stems: number;
  greenhouse: string | null;
  bed: string | null;
  harvester: string | null;
  harvested_at: string | null;
}

/** A field reject waiting in the list until the whole list is submitted. */
export interface FieldRejectLine {
  greenhouse: string;
  item_code: string;
  reason: string;
  bed: string;
  stems: number;
}

/** One spec to pack on an OPL: a packing scan must match its variety, bunch size and stem length. */
export interface OplLine {
  variety: string;
  item_name: string;
  bunch_uom: string;
  stem_length: string;
  bunches: number;
  stems: number;
  packed_bunches: number;
  packed_stems: number;
}

/** An Order Pick List the farm still has to pack (the OPL picker's rows). */
export interface OpenOpl {
  opl: string;
  customer?: string | null;
  sales_order?: string | null;
  delivery_point?: string | null;
  total_stems: number;
  packed_stems: number;
  date_created?: string | null;
  /** With `with_stock`: how far it is packed, and stems Available for Sale is short to finish it (0 = enough). */
  pack_pct?: number;
  short_stems?: number;
  /** What it holds per variety, stem length and bunch size, most stems first. */
  varieties?: {
    item_name: string;
    stem_length: string | null;
    bunch_uom: string;
    bunches: number;
    stems: number;
    /** Packed so far on the farm's Farm Pack List. */
    packed_stems?: number;
  }[];
}

export interface Greenhouse {
  name: string;
  /** Harvested into lately; listed first. */
  recent?: 0 | 1;
}

export interface Variety {
  name: string;
  item_name?: string | null;
  item_group?: string | null;
  /** A stem-length template: harvested as its variant for the chosen length. */
  has_variants?: 0 | 1;
  /** Harvested into the chosen greenhouse lately (search_varieties). */
  recent?: 0 | 1;
  /** Most stems a bucket of this variety holds (Production Settings). */
  max_stems?: number;
  /** harvested_varieties: what was harvested of it today in the greenhouse. */
  buckets?: number;
  stems?: number;
}

export interface HarvestSetup extends ScanReply {
  greenhouses?: Greenhouse[];
  varieties?: Variety[];
  /** Stem Length records to pick from, shortest first (harvesting by stem length). */
  stem_lengths?: string[];
  max_stems?: number;
}

/** Today's figures per process for the home screen; a section is null when its lookup failed. */
export interface Overview extends ScanReply {
  date?: string;
  production?: {
    harvested_buckets: number;
    harvested_stems: number;
    received_buckets: number;
    received_stems: number;
    awaiting_receiving: number;
  } | null;
  packhouse?: {
    received_out_buckets: number;
    received_out_stems: number;
    graded_bunches: number;
    graded_stems: number;
    ungraded_discard_buckets?: number;
    ungraded_discard_stems?: number;
    packed_bunches?: number;
    /** Boxes packed into today. */
    packed_boxes?: number;
    /** OPLs whose Farm Pack List was submitted today, out of those plus the ones still to pack. */
    opls_packed?: number;
    opls_total?: number;
    /** Boxes those OPLs need: one per Box ID on the farm's lines. */
    boxes_total?: number;
    cold_store_stems: number | null;
    packhouse_stems: number | null;
  } | null;
  /** Today's deliveries (all farms): boxes whose Sales Order delivers today. */
  delivery?: {
    due: number;
    delivered: number;
    on_the_way: number;
    points: number;
    points_done: number;
  } | null;
  dispatch?: {
    opls_to_pack: number;
    stems_to_pack: number;
    staged_boxes: number | null;
    trucks_loading: number;
    boxes_planned: number;
    boxes_loaded: number;
    trucks_dispatched: number;
  } | null;
  shop?: ShopOverview | null;
  quality?: QualityOverview | null;
}

export interface ShopOverview {
  moved_to_shop_bunches: number;
  moved_to_shop_stems: number;
  walk_in_bunches: number;
  vased_bunches: number;
  discarded_bunches: number;
  discarded_stems: number;
  shop_stems: number | null;
  walk_in_stems: number | null;
  sold_stems: number;
  sales_amount: number;
  sales_invoices: number;
  currency?: string | null;
}

export interface QualityOverview {
  graded_rejects_stems: number;
  reject_rate: number;
  packing_rejects: number;
  ungraded_discards: number;
  ungraded_discard_stems: number;
}

export interface VarietyTotals {
  item_code: string;
  /** The variety's name; for a stem-length variant, its template's ("Jasmine"). */
  item_name: string;
  /** Set when harvested by stem length, e.g. "63CM". */
  stem_length?: string | null;
  harvested_buckets: number;
  harvested_stems: number;
  received_buckets: number;
  received_stems: number;
}

export interface GreenhouseTotals extends Omit<VarietyTotals, 'item_code' | 'item_name'> {
  greenhouse: string;
  varieties: VarietyTotals[];
}

export interface HarvesterKpi {
  harvester: string;
  employee_name: string;
  buckets: number;
  stems: number;
  avg_stems_per_bucket: number;
  stems_per_hour: number | null;
  varieties: number;
  received_buckets: number;
  first_at?: string | null;
  last_at?: string | null;
  /** What they picked per variety (and stem length), most stems first. */
  picked?: HarvesterPick[];
}

/** Today's graded rejects at a farm, and what came into the packhouse and was graded. */
export interface RejectsDay extends ScanReply {
  received_stems: number;
  graded_stems: number;
  /** Submitted plus still on today's draft. */
  rejected_stems: number;
  draft: string | null;
  lines: {
    row: string;
    item_code: string;
    item_name: string;
    stem_length?: string | null;
    stems: number;
    reason?: string | null;
    submitted: boolean;
  }[];
}

/** A variety on the packhouse floor and how many stems of it are there. */
export interface FloorVariety {
  name: string;
  item_name: string;
  stem_length?: string | null;
  balance: number;
}

export interface DeliveryPointSummary {
  delivery_point: string | null;
  pending: number;
  delivered: number;
  customers: number;
}

export interface DeliveryBox {
  box: string;
  customer: string;
  consignee: string | null;
  delivered: 0 | 1;
  status?: 'delivered' | 'on_truck' | 'not_loaded';
}

/** Whose recent work lists them first in an employee picker. */
export type EmployeeRole = 'harvester' | 'grader' | 'packer';

/** A grader's or packer's day: what they handled per variety (and stem length). */
export interface PersonKpi {
  /** As recorded: an employee id, or a payroll number. */
  person: string;
  employee: string | null;
  employee_name: string;
  employee_number: string | null;
  bunches: number;
  stems: number;
  /** Packers only: boxes packed into. */
  boxes?: number;
  picked: HarvesterPick[];
}

export interface PackhouseSummary extends ScanReply {
  date?: string;
  graders?: PersonKpi[];
  packers?: PersonKpi[];
}

export interface HarvesterPick {
  item_code: string;
  item_name: string;
  stem_length?: string | null;
  /** Harvesters' picks count buckets; graders' and packers' count bunches. */
  buckets?: number;
  bunches?: number;
  stems: number;
}

export interface ProductionSummary extends ScanReply {
  date?: string;
  greenhouses?: GreenhouseTotals[];
  harvesters?: HarvesterKpi[];
}

export interface HarvestArgs {
  farm: string;
  greenhouse: string;
  item_code: string;
  harvester: string;
  quantity: number;
  bay: string;
  bucket_id: string;
  /** Harvesting by stem length, e.g. '63CM'. */
  stem_length?: string;
}

export interface ReceivingReply {
  status: 'success' | 'available' | 'error';
  stock_entry?: string;
  variety?: string;
  qty?: number;
  harvester?: string;
  bucket_id?: string;
  message?: string;
}

/** One loading sheet line: a customer's boxes to one delivery point (one Delivery Note). */
export interface LoadingPlanCustomer {
  customer: string;
  delivery_point?: string | null;
  planned: number;
  loaded: number;
  stems: number;
  delivery_note?: string | null;
  sales_invoice?: string | null;
}

/** A truck's Loading Plan: boxes grouped per customer and delivery point (the loading sheet). */
export interface LoadingPlan {
  name: string;
  vehicle: string;
  farm?: string | null;
  /** yyyy-mm-dd the truck delivers: the day after it was planned. */
  delivery_date?: string | null;
  status: 'Planning' | 'Loading' | 'Loaded' | 'Dispatched' | 'Cancelled';
  docstatus: number;
  /** Boxes the day's orders need (a box several farms pack counts once). */
  required_boxes?: number;
  total_boxes: number;
  loaded_boxes: number;
  /** Boxes on the plan that are Consolidated Box Labels (one box packed by several farms). */
  consolidated_boxes?: number;
  /** Boxes on the plan already delivered. */
  delivered_boxes?: number;
  customers: LoadingPlanCustomer[];
  /** The loading sheet: delivery point → customer → consignee, each with its boxes, in loading order. */
  sheet?: {
    delivery_point: string | null;
    customer: string;
    consignee: string | null;
    planned: number;
    loaded: number;
    /** Boxes the orders need that are not on this truck yet (in `boxes` with `pending`). */
    pending?: number;
    boxes: {
      box: string;
      loaded: 0 | 1;
      /** Not on the truck's plan yet: not packed, or packed and waiting for Fetch. */
      pending?: 'unpacked' | 'packed';
      /** Farms whose piece of this box is not packed yet. */
      waiting?: number;
      /** A Consolidated Box Label: its farms ("Burguret / Turaco"), or 1. */
      combined?: string | 1;
      /** Delivered at its delivery point. */
      delivered?: 1;
    }[];
  }[];
  /** Every box on the plan, with its Sales Order's delivery date. */
  boxes?: { box: string; customer: string; delivery_point?: string | null; loaded: 0 | 1; delivery_date: string }[];
}

export interface PlanReply extends ScanReply {
  plan?: LoadingPlan;
}

export const scanApi = {
  setup: (install_id?: string | null) =>
    callMethod<ScanSetup>('setup.get_scan_setup', install_id ? { install_id } : {}),
  /** Today's figures per process; Delivery's for `deliveryDate` (default today). */
  overview: (farm: string, deliveryDate?: string) =>
    callMethod<Overview>('setup.get_overview', deliveryDate ? { farm, delivery_date: deliveryDate } : { farm }),
  /** The first 20 active employees, matching `txt` when given; with `farm`, its recent harvesters first. */
  searchEmployees: (txt: string, farm?: string, role: EmployeeRole = 'harvester') =>
    callMethod<Employee[]>('setup.search_employees', farm ? { txt, farm, role } : { txt }),
  getEmployee: (employee: string) => callMethod<ScanReply & Partial<Employee>>('setup.get_employee', { employee }),
  validateOpl: (opl_data: string, farm: string) =>
    callMethod<OplInfo>('setup.validate_order_pick_list', { opl_data, farm }),
  oplLines: (opl: string, farm: string) =>
    callMethod<ScanReply & { lines?: OplLine[] }>('setup.order_pick_list_lines', { opl, farm }),
  /** The farm's harvested buckets not received yet, oldest first. */
  awaitingReceiving: (farm: string) =>
    callMethod<ScanReply & { buckets?: AwaitingBucket[]; stems?: number }>('setup.awaiting_receiving', { farm }),
  listOpenOpls: (farm: string, txt?: string) =>
    callMethod<ScanReply & { opls?: OpenOpl[] }>('setup.list_open_order_pick_lists', { farm, txt, with_stock: 1 }),

  packhouseSummary: (farm: string, date?: string) =>
    callMethod<PackhouseSummary>('packhouse.get_summary', { farm, date }),
  productionSummary: (farm: string, date?: string) =>
    callMethod<ProductionSummary>('harvesting.get_production_summary', { farm, date }),
  harvestSetup: (farm: string, byStemLength = false) =>
    callMethod<HarvestSetup>('harvesting.get_harvest_setup', { farm, by_stem_length: byStemLength ? 1 : 0 }),
  /** The first 20 varieties, matching `txt`; the greenhouse's recent harvests come first, flagged `recent`. */
  /** Varieties harvested into the greenhouse today, most stems first (field rejects). */
  harvestedVarieties: (farm: string, greenhouse: string, txt: string) =>
    callMethod<Variety[]>('harvesting.harvested_varieties', { farm, greenhouse, txt }),
  searchVarieties: (txt: string, greenhouse: string, byStemLength = false) =>
    callMethod<Variety[]>('harvesting.search_varieties', {
      txt,
      greenhouse,
      by_stem_length: byStemLength ? 1 : 0,
    }),
  recentVarieties: (greenhouse: string, byStemLength = false) =>
    callMethod<string[]>('harvesting.get_recent_varieties', { greenhouse, by_stem_length: byStemLength ? 1 : 0 }),
  harvest: (args: HarvestArgs) => callMethod<ScanReply>('harvesting.harvest', { ...args }),
  /** A harvested bucket that is not yet received: what its harvest entry holds (Edit Harvest). */
  harvestedBucket: (farm: string, bucket_id: string) =>
    callMethod<HarvestedBucketReply>('harvesting.get_harvested_bucket', { farm, bucket_id }),
  /** Replace the bucket's harvest entry with an amendment holding these values. */
  editHarvestedBucket: (args: EditHarvestArgs) =>
    callMethod<HarvestedBucketReply>('harvesting.edit_harvested_bucket', { ...args }),
  /** The Field Rejects list, recorded together: all of it or, on an error, none. */
  submitFieldRejects: (farm: string, rows: FieldRejectLine[]) =>
    callMethod<ScanReply & { entries?: number; stems?: number; row?: number }>('harvesting.submit_field_rejects', {
      farm,
      rows: JSON.stringify(rows),
    }),
  fieldRejects: (farm: string, greenhouse: string, item_code: string, stems: number, reason: string) =>
    callMethod<ScanReply>('harvesting.field_rejects', { farm, greenhouse, item_code, stems, reason }),

  receiving: (bucket_id: string, farm: string, action: string) =>
    callMethod<ReceivingReply>('receiving.receiving', { bucket_id, farm, action }),
  ungradedDiscard: (bucket_id: string, farm: string) =>
    callMethod<ScanReply>('ungraded_discard.create_ungraded_discard', { bucket_id, farm }),

  grading: (scan_data: string, farm: string, graded_by: string) =>
    callMethod<ScanReply>('grading.fast_grading', { scan_data, farm, graded_by }),
  gradingCheck: (scan_data: string) => callMethod<ScanReply>('bunch_actions.grading_check', { scan_data }),
  gradedDiscard: (scan_data: string, farm: string, graded_by?: string) =>
    callMethod<ScanReply>('bunch_actions.graded_discard', { scan_data, farm, graded_by }),
  ungrade: (scan_data: string, farm: string, graded_by?: string) =>
    callMethod<ScanReply>('ungrade_bunch.ungrade_bunch', { scan_data, farm, graded_by }),

  // Shop: day 4 flowers to the shop, walk-in shop; Packhouse: graded rejects
  localSale: (scan_data: string, farm: string) => callMethod<ScanReply>('shop.local_sale', { scan_data, farm }),
  walkInShopTransfer: (scan_data: string, farm: string) =>
    callMethod<ScanReply>('shop.walk_in_shop_transfer', { scan_data, farm }),
  /** Varieties with stems in the farm's Packhouse Store, largest balance first (Graded Rejects). */
  packhouseBalances: (farm: string, txt = '') =>
    callMethod<FloorVariety[]>('graded_rejects.packhouse_balances', { farm, txt }),
  /** Add a line to today's draft Graded Rejects entry (saved, not submitted). */
  addReject: (farm: string, item_code: string, stems: number, reason: string) =>
    callMethod<ScanReply & { qty?: number; variety?: string; reason?: string }>('graded_rejects.add_reject', {
      farm,
      item_code,
      stems,
      reason,
    }),
  removeReject: (farm: string, row: string) => callMethod<ScanReply>('graded_rejects.remove_reject', { farm, row }),
  submitRejects: (farm: string) => callMethod<ScanReply & { qty?: number }>('graded_rejects.submit_rejects', { farm }),
  getRejects: (farm: string) => callMethod<RejectsDay>('graded_rejects.get_rejects', { farm }),
  gradedRejects: (farm: string, item_code: string, stems: number, graded_by?: string) =>
    callMethod<ScanReply>('graded_rejects.graded_rejects', { farm, item_code, stems, graded_by }),

  stockTake: (scan_data: string, farm: string) => callMethod<ScanReply>('stock_take.stock_take', { scan_data, farm }),
  vase: (scan_data: string, farm: string) => callMethod<ScanReply>('vase.vase', { scan_data, farm }),

  /** Send the OPL's Farm Pack List for under-pack approval (not enough stems to finish it). */
  underPack: (opl_name: string, farm: string, reason: string) =>
    callMethod<ScanReply & { fpl?: string; state?: string }>('packing.under_pack', { opl_name, farm, reason }),
  packing: (opl_name: string, bunch_label_data: string, farm: string, packer: string) =>
    callMethod<ScanReply>('packing.fast_packing', { opl_name, bunch_label_data, farm, packer }),
  packingReject: (scan_data: string, farm: string, rejection_reason: string, graded_by?: string) =>
    callMethod<ScanReply>('bunch_actions.packing_reject', { scan_data, farm, rejection_reason, graded_by }),

  undispatch: (box: string, reason: string) => callMethod<ScanReply>('undispatch_box.undispatch_box', { box, reason }),
  delivery: (box_name: string, farm: string) => callMethod<ScanReply>('delivery_form.delivery_form', { box_name, farm }),
  /** Delivery points with boxes on their way (all farms), most still to deliver first. */
  deliveryPoints: (date: string) =>
    callMethod<ScanReply & { points?: DeliveryPointSummary[] }>('delivery_form.delivery_points', { date }),
  /** The boxes going to a delivery point (all farms), customer by customer. */
  pointBoxes: (delivery_point: string, date: string) =>
    callMethod<ScanReply & { boxes?: DeliveryBox[] }>('delivery_form.point_boxes', { delivery_point, date }),

  // Packing -> Dispatch: staging, loading plan, loading, dispatch
  /** The truck's open plan for the farm; with `deliveryDate`, the one delivering that day (created as LP-<date>-<nn>). */
  openLoadingPlan: (vehicle: string, farm: string, create: boolean, deliveryDate?: string) =>
    callMethod<PlanReply>('dispatch_flow.open_loading_plan', {
      vehicle,
      farm,
      create: create ? 1 : 0,
      ...(deliveryDate ? { delivery_date: deliveryDate } : {}),
    }),
  /** Trucks a loading plan can be started for, with this farm's open plan for each if any. */
  listVehicles: (farm: string, txt: string) =>
    callMethod<ScanReply & { vehicles?: VehicleOption[] }>('dispatch_flow.list_vehicles', { farm, txt }),
  /** Open plans for the farm; with `deliveryDate`, every plan delivering that day (dispatched too). */
  listOpenLoadingPlans: (farm: string, deliveryDate?: string) =>
    callMethod<ScanReply & { plans?: LoadingPlan[] }>('dispatch_flow.list_open_loading_plans', {
      farm,
      ...(deliveryDate ? { delivery_date: deliveryDate } : {}),
    }),
  getLoadingPlan: (plan: string) => callMethod<PlanReply>('dispatch_flow.get_loading_plan', { plan }),
  planBox: (plan: string, box: string) => callMethod<PlanReply>('dispatch_flow.plan_box', { plan, box }),
  unplanBox: (plan: string, box: string) => callMethod<PlanReply>('dispatch_flow.unplan_box', { plan, box }),
  loadBox: (plan: string, box: string) => callMethod<PlanReply>('dispatch_flow.load_box', { plan, box }),
  dispatchLoadingPlan: (plan: string) => callMethod<PlanReply>('dispatch_flow.dispatch_loading_plan', { plan }),
  /** Plan every packed box of tomorrow's orders for the plan's farm onto the truck. */
  fetchOrders: (plan: string) =>
    callMethod<PlanReply & { added?: number; opls?: number }>('dispatch_flow.fetch_orders', { plan }),
};

/* ── Device register ─────────────────────────────────────────────────────── */

export interface InstallFacts {
  platform: string;
  device_brand: string | null;
  device_model: string | null;
  device_name: string | null;
  os_version: string | null;
  app_version: string | null;
  runtime_version: string | null;
  is_physical_device: 0 | 1;
}

export interface InstallRow {
  install_id: string;
  user: string;
  full_name: string;
  platform: string;
  device_brand: string;
  device_model: string;
  device_name: string;
  os_version: string;
  app_version: string;
  previous_app_version: string;
  version_changed_at: string | null;
  upgrades: number;
  runtime_version: string;
  is_physical_device: boolean;
  ip_address: string;
  first_ip: string;
  first_seen: string | null;
  last_seen: string | null;
  launches: number;
}

export interface InstallUser {
  user: string;
  full_name: string;
  app_version: string;
  device_model: string;
  platform: string;
  last_seen: string | null;
  devices: number;
  logins: number;
}

export interface InstallsReply {
  rows: InstallRow[];
  total: number;
  start: number;
  page_length: number;
  summary: {
    total_installs: number;
    last_install_at: string | null;
    devices: number;
    users: number;
    physical_devices: number;
    active_7d: number;
    active_30d: number;
    by_user: InstallUser[];
    by_model: { device_model: string; count: number }[];
    by_app_version: { app_version: string; count: number }[];
    by_platform: { platform: string; count: number }[];
  };
  server_time: string;
}

export const deviceApi = {
  /** POST: a write over GET is rolled back by Frappe. */
  registerInstall: (install_id: string, reason: 'login' | 'launch', facts: InstallFacts) =>
    callMethod<{ install_id: string; tracked: boolean }>('devices.register_install', {
      install_id,
      reason,
      ...facts,
    }),
  installs: (args: { start?: number; page_length?: number; since_days?: number; search?: string } = {}) =>
    getMethod<InstallsReply>('devices.installs', args),
};
