import { apiClient, mapAxiosError } from './api';
import { API_MODULE } from './api-module';

/**
 * Wrappers for the scan endpoints in upande_postharvest/mobile_api.
 *
 * Most endpoints answer HTTP 200 with `{success: false, error}` for domain
 * rejections ("already graded", "Order full!"). `receiving` instead raises
 * (`frappe.throw`), which surfaces here as an HttpError carrying the message.
 */

const BASE = API_MODULE;

/** POST a whitelisted method and return its `message`. Throws HttpError on transport/server errors. */
export async function callMethod<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
  try {
    const res = await apiClient().post(`/api/method/${BASE}.${method}`, args);
    return (res.data?.message ?? res.data) as T;
  } catch (err) {
    throw mapAxiosError(err);
  }
}

/** GET a whitelisted method (for methods the server only accepts over GET). */
export async function getMethod<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  try {
    const res = await apiClient().get(`/api/method/${BASE}.${method}`, { params });
    return (res.data?.message ?? res.data) as T;
  } catch (err) {
    throw mapAxiosError(err);
  }
}

/** Shape shared by every scan endpoint that reports success/failure in the body. */
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
}

export interface Employee {
  name: string;
  employee_name: string;
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

/** An Order Pick List the farm still has to pack (the OPL picker's rows). */
export interface OpenOpl {
  opl: string;
  customer?: string | null;
  sales_order?: string | null;
  delivery_point?: string | null;
  total_stems: number;
  packed_stems: number;
  date_created?: string | null;
}

export interface Greenhouse {
  name: string;
}

export interface Variety {
  name: string;
  item_name?: string | null;
  item_group?: string | null;
  /** Most stems a bucket of this variety holds (Production Settings). */
  max_stems?: number;
}

export interface HarvestSetup extends ScanReply {
  greenhouses?: Greenhouse[];
  varieties?: Variety[];
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
    cold_store_stems: number | null;
    packhouse_stems: number | null;
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
  item_name: string;
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
  status: 'Planning' | 'Loading' | 'Loaded' | 'Dispatched' | 'Cancelled';
  docstatus: number;
  total_boxes: number;
  loaded_boxes: number;
  customers: LoadingPlanCustomer[];
}

export interface PlanReply extends ScanReply {
  plan?: LoadingPlan;
}

export const scanApi = {
  setup: () => callMethod<ScanSetup>('setup.get_scan_setup'),
  overview: (farm: string) => callMethod<Overview>('setup.get_overview', { farm }),
  searchEmployees: (txt: string) => callMethod<Employee[]>('setup.search_employees', { txt }),
  getEmployee: (employee: string) => callMethod<ScanReply & Partial<Employee>>('setup.get_employee', { employee }),
  validateOpl: (opl_data: string, farm: string) =>
    callMethod<OplInfo>('setup.validate_order_pick_list', { opl_data, farm }),
  listOpenOpls: (farm: string, txt?: string) =>
    callMethod<ScanReply & { opls?: OpenOpl[] }>('setup.list_open_order_pick_lists', { farm, txt }),

  productionSummary: (farm: string, date?: string) =>
    callMethod<ProductionSummary>('harvesting.get_production_summary', { farm, date }),
  harvestSetup: (farm: string) => callMethod<HarvestSetup>('harvesting.get_harvest_setup', { farm }),
  recentVarieties: (greenhouse: string) => callMethod<string[]>('harvesting.get_recent_varieties', { greenhouse }),
  harvest: (args: HarvestArgs) => callMethod<ScanReply>('harvesting.harvest', { ...args }),
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
  gradedRejects: (farm: string, item_code: string, stems: number, graded_by?: string) =>
    callMethod<ScanReply>('graded_rejects.graded_rejects', { farm, item_code, stems, graded_by }),

  stockTake: (scan_data: string, farm: string) => callMethod<ScanReply>('stock_take.stock_take', { scan_data, farm }),
  vase: (scan_data: string, farm: string) => callMethod<ScanReply>('vase.vase', { scan_data, farm }),

  packing: (opl_name: string, bunch_label_data: string, farm: string, packer: string) =>
    callMethod<ScanReply>('packing.fast_packing', { opl_name, bunch_label_data, farm, packer }),
  packingReject: (scan_data: string, farm: string, rejection_reason: string, graded_by?: string) =>
    callMethod<ScanReply>('bunch_actions.packing_reject', { scan_data, farm, rejection_reason, graded_by }),

  dispatch: (vehicle: string, box_name: string, farm: string) =>
    callMethod<ScanReply>('dispatch_form.create_dispatch_form', { vehicle, box_name, farm }),
  undispatch: (box: string, reason: string) => callMethod<ScanReply>('undispatch_box.undispatch_box', { box, reason }),
  delivery: (box_name: string, farm: string) => callMethod<ScanReply>('delivery_form.delivery_form', { box_name, farm }),

  // Packing -> Dispatch: staging, loading plan, loading, dispatch
  stageBox: (box: string) => callMethod<ScanReply>('dispatch_flow.stage_box', { box }),
  openLoadingPlan: (vehicle: string, farm: string, create: boolean) =>
    callMethod<PlanReply>('dispatch_flow.open_loading_plan', { vehicle, farm, create: create ? 1 : 0 }),
  listOpenLoadingPlans: (farm: string) =>
    callMethod<ScanReply & { plans?: LoadingPlan[] }>('dispatch_flow.list_open_loading_plans', { farm }),
  getLoadingPlan: (plan: string) => callMethod<PlanReply>('dispatch_flow.get_loading_plan', { plan }),
  planBox: (plan: string, box: string) => callMethod<PlanReply>('dispatch_flow.plan_box', { plan, box }),
  unplanBox: (plan: string, box: string) => callMethod<PlanReply>('dispatch_flow.unplan_box', { plan, box }),
  loadBox: (plan: string, box: string) => callMethod<PlanReply>('dispatch_flow.load_box', { plan, box }),
  dispatchLoadingPlan: (plan: string) => callMethod<PlanReply>('dispatch_flow.dispatch_loading_plan', { plan }),
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
