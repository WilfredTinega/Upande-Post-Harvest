/**
 * Lists the pickers open on, held in memory for the session so they show at
 * once instead of waiting on the server. They are warmed when the app opens
 * (see warmHarvestLists); a picker shows what is held and refreshes it quietly.
 */
import { scanApi, type EmployeeRole } from './scan-api';

const held = new Map<string, unknown>();
const inFlight = new Map<string, Promise<unknown>>();

/** The value last loaded under `key`, if any. */
export function cachedList<T>(key: string): T | undefined {
  return held.get(key) as T | undefined;
}

/** Load the value under `key` and hold it; concurrent calls for one key share a request. */
export function fetchList<T>(key: string, load: () => Promise<T>): Promise<T> {
  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;
  const request = load()
    .then((value) => {
      held.set(key, value);
      return value;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}

/** Warm the value under `key`; failures are left for whoever opens it to show. */
export function prefetchList<T>(key: string, load: () => Promise<T>): void {
  fetchList(key, load).catch(() => undefined);
}

/** Key for the employee list a picker shows (`farm`'s recent people in `role` first). */
export function employeesKey(farm: string | undefined, role: EmployeeRole = 'harvester', query = ''): string {
  return `employees|${farm ?? ''}|${role}|${query.trim()}`;
}

/** Base key for the variety list of a greenhouse; pickers add the search text. */
export function varietiesKey(greenhouse: string, byStemLength: boolean): string {
  return `varieties|${greenhouse}|${byStemLength ? 1 : 0}`;
}

/** Key for a farm's harvest setup (greenhouses, stem lengths, reasons). */
export function harvestSetupKey(farm: string, byStemLength: boolean): string {
  return `harvest-setup|${farm}|${byStemLength ? 1 : 0}`;
}

/**
 * Load what the harvesting screens open on, in the background: the farm's
 * greenhouses, its recent harvesters, and the varieties of its most recently
 * harvested greenhouse.
 */
export function warmHarvestLists(farm: string, byStemLength: boolean): void {
  if (!farm) return;
  fetchList(harvestSetupKey(farm, byStemLength), () => scanApi.harvestSetup(farm, byStemLength))
    .then((setup) => {
      const greenhouse = setup.success ? setup.greenhouses?.[0]?.name : undefined;
      if (greenhouse) {
        prefetchList(`${varietiesKey(greenhouse, byStemLength)}|`, () =>
          scanApi.searchVarieties('', greenhouse, byStemLength),
        );
      }
    })
    .catch(() => undefined);
  prefetchList(employeesKey(farm, 'harvester'), () => scanApi.searchEmployees('', farm, 'harvester'));
}

/** Load the Packhouse pickers' lists in the background: the farm's recent graders and packers. */
export function warmPackhouseLists(farm: string): void {
  if (!farm) return;
  prefetchList(employeesKey(farm, 'grader'), () => scanApi.searchEmployees('', farm, 'grader'));
  prefetchList(employeesKey(farm, 'packer'), () => scanApi.searchEmployees('', farm, 'packer'));
}
