import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import { deviceApi, type InstallFacts } from './scan-api';
import { runtimeVersionOf } from './updates';
import { APP_VERSION } from './app-version';

/**
 * The device register: which handhelds this app is installed on, and which
 * build each signed-in person is running. Ported from the Upande Sensors app
 * (src/api/install.js); the server side is `upande_postharvest.mobile_api.devices`.
 *
 * The unit is a (device, user) pair. Scanners are shared between shifts, so a
 * sign-in always reports — that is the event that binds a person to a device.
 *
 * Sent: a random install id, the platform, brand / model / device name, OS
 * version, app and runtime versions, and whether it is a real device. NOT sent:
 * an IP, location, phone number or any hardware id. The IP in the register is
 * the one the server observes on the request.
 *
 * The install id lives in SecureStore under its own key. `forgetDevice` only
 * clears the keys in `StorageKeys`, so signing out keeps the same device row;
 * only an uninstall mints a new one.
 *
 * Nothing here is allowed to be visible: every failure (a site without the
 * endpoint, no network, a SecureStore that refuses) resolves to null.
 */

const KEY_INSTALL_ID = 'upande_install_id_v1';
const KEY_LAST_REPORT = 'upande_install_reported_at_v1';
const KEY_LAST_USER = 'upande_install_reported_user_v1';

/** At most one *launch* report an hour for the same account. Sign-ins are never throttled. */
const REPORT_INTERVAL_MS = 60 * 60 * 1000;

export type InstallReason = 'login' | 'launch';

let loggedOnce = false;
function logOnce(where: string, err: unknown) {
  if (!__DEV__ || loggedOnce) return;
  loggedOnce = true;
  console.log(`[install] ${where}: ${err instanceof Error ? err.message : String(err)}`);
}

let cachedInstallId: string | null = null;

/** This install's id, minted on first run. Null when SecureStore is unusable. */
export async function getInstallId(): Promise<string | null> {
  if (cachedInstallId) return cachedInstallId;
  try {
    const stored = await SecureStore.getItemAsync(KEY_INSTALL_ID);
    if (stored) {
      cachedInstallId = stored;
      return stored;
    }
    const minted = Crypto.randomUUID();
    await SecureStore.setItemAsync(KEY_INSTALL_ID, minted);
    cachedInstallId = minted;
    return minted;
  } catch (err) {
    logOnce('install id', err);
    return null;
  }
}

/** What this device and this build are. */
export function deviceFacts(): InstallFacts {
  const version = APP_VERSION;
  const declared = Constants.expoConfig?.runtimeVersion;
  return {
    platform: Platform.OS,
    device_brand: Device.brand || null,
    device_model: Device.modelName || null,
    device_name: Device.deviceName || null,
    os_version: Device.osVersion || null,
    app_version: version,
    runtime_version: typeof declared === 'string' && declared ? declared : runtimeVersionOf(version),
    is_physical_device: Device.isDevice ? 1 : 0,
  };
}

let reportedLaunchThisProcess = false;

// Serialised, so a sign-in and the launch hook firing in the same tick don't
// both read the throttle before either writes it.
let chain: Promise<unknown> = Promise.resolve(null);
function serialised<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  chain = run.then(
    () => null,
    () => null,
  );
  return run;
}

/**
 * Tell the server this device exists and which build this account is on.
 * Never rejects. `user` feeds the throttle only — the server files the row
 * under the session's account, never one the client asserts.
 */
export function reportInstall({ reason = 'launch', user }: { reason?: InstallReason; user?: string | null } = {}) {
  const isLogin = reason === 'login';
  if (!isLogin) {
    if (reportedLaunchThisProcess) return Promise.resolve(null);
    reportedLaunchThisProcess = true;
  }

  return serialised(async () => {
    try {
      const now = Date.now();
      const account = user || null;

      if (!isLogin) {
        const [last, lastUser] = await Promise.all([
          SecureStore.getItemAsync(KEY_LAST_REPORT).then((v) => Number(v) || 0),
          SecureStore.getItemAsync(KEY_LAST_USER).catch(() => null),
        ]);
        const sameUser = !account || !lastUser || lastUser === account;
        // A stamp in the future (clock moved back) counts as due.
        if (sameUser && last && last <= now && now - last < REPORT_INTERVAL_MS) return null;
      }

      const installId = await getInstallId();
      if (!installId) return null;

      const result = await deviceApi.registerInstall(installId, isLogin ? 'login' : 'launch', deviceFacts());

      // Only after the server accepted it, so a failed send retries next launch.
      await Promise.all([
        SecureStore.setItemAsync(KEY_LAST_REPORT, String(now)).catch(() => {}),
        account ? SecureStore.setItemAsync(KEY_LAST_USER, account).catch(() => {}) : null,
      ]);
      return result;
    } catch (err) {
      logOnce('report', err);
      return null;
    }
  });
}
