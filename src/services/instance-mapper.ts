/**
 * Known Tambuzi instances, and which one a server URL belongs to.
 *
 * The login screen offers INSTANCES to pick from (plus a custom URL for dev
 * servers), and the app shows an environment banner whenever it is signed in
 * to anything other than production, so nobody scans real stock into a
 * test system (or test stock into production) by mistake.
 *
 * To add a server: add it to INSTANCES if operators should see it on the login
 * screen, and add every URL it answers on to URL_TO_INSTANCE.
 */

export type InstanceKey = 'tambuzi' | 'tambuzi-local';
export type Environment = 'production' | 'staging' | 'development';

export interface Instance {
  key: InstanceKey;
  label: string;
  /** Canonical URL used when the instance is picked on the login screen. */
  url: string;
  environment: Environment;
}

export const INSTANCES: Instance[] = [
  // Local bench (site tambuzi16, the bench's default site) on the dev machine's
  // LAN IP, so a phone or Honeywell on the same Wi-Fi can reach it. Update the IP
  // if the dev machine's DHCP lease changes.
  { key: 'tambuzi-local', label: 'Tambuzi Local', url: 'http://192.168.88.245:8000', environment: 'development' },
  { key: 'tambuzi', label: 'Tambuzi', url: 'https://tambuzi.upande.com', environment: 'production' },
];

const URL_TO_INSTANCE: Record<string, InstanceKey> = {
  'http://192.168.88.245:8000': 'tambuzi-local',
  // Android emulator's alias for the host machine.
  'http://10.0.2.2:8000': 'tambuzi-local',
  'http://localhost:8000': 'tambuzi-local',
  'https://tambuzi.upande.com': 'tambuzi',
  'https://tambuzi.frappe.cloud': 'tambuzi',
};

/** Lowercase scheme + host, no trailing slash — the form URL_TO_INSTANCE uses. */
export function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '').toLowerCase();
}

export function getInstanceByUrl(url: string | null | undefined): Instance | null {
  if (!url) return null;
  const key = URL_TO_INSTANCE[normalizeUrl(url)];
  return key ? (INSTANCES.find((i) => i.key === key) ?? null) : null;
}

const byKey = (key: InstanceKey): Instance => INSTANCES.find((i) => i.key === key)!;

/** Development builds default to the local bench, release builds to production. */
export const DEFAULT_INSTANCE: Instance = __DEV__ ? byKey('tambuzi-local') : byKey('tambuzi');
