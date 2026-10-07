/** The server app module the OTA manifest and device endpoints live under. */
export const API_MODULE = 'upande_postharvest.mobile_api';

/**
 * Every scan endpoint is a Server Script on the site. Each script hosts several
 * endpoints and picks one by `ph_method`, so `harvesting.harvest` is
 * `/api/method/mobile_harvest` with `ph_method: 'harvesting.harvest'`.
 */
const SCRIPT_FOR: Record<string, string> = {
  harvesting: 'mobile_harvest',
  receiving: 'mobile_receiving',
  grading: 'mobile_grading',
  ungrade_bunch: 'mobile_grading',
  graded_rejects: 'mobile_grading',
  packhouse: 'mobile_grading',
  'bunch_actions.grading_check': 'mobile_grading_check',
  'bunch_actions.graded_discard': 'mobile_graded_discard',
  'bunch_actions.packing_reject': 'mobile_packing_reject',
  ungraded_discard: 'mobile_ungraded_discard',
  stock_take: 'mobile_stock_take',
  vase: 'mobile_vase_scan',
  shop: 'mobile_vase_scan',
  packing: 'mobile_packing',
  dispatch_form: 'mobile_dispatch',
  undispatch_box: 'mobile_dispatch',
  dispatch_flow: 'mobile_dispatch',
  delivery_form: 'mobile_delivery',
  setup: 'mobile_link_search',
  auth: 'mobile_link_search',
};

/** `/api/method/...` path and the routing arg for `module.function`. */
export function endpoint(method: string): { path: string; args: Record<string, string> } {
  const script = SCRIPT_FOR[method] ?? SCRIPT_FOR[method.split('.')[0]];
  if (!script) return { path: `/api/method/${API_MODULE}.${method}`, args: {} };
  return { path: `/api/method/${script}`, args: { ph_method: method } };
}
