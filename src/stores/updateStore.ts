import { AppState } from 'react-native';
import * as Updates from 'expo-updates';
import { create } from 'zustand';
import { APP_VERSION } from '@/src/services/app-version';
import {
  autoCheckForUpdate,
  checkForUpdate,
  UPDATE_ERRORS,
  UPDATE_KINDS,
  UpdateCheckError,
  type UpdateCheck,
  type UpdateErrorKind,
} from '@/src/services/updates';
import {
  downloadApk,
  InstallError,
  launchInstaller,
  type DownloadProgress,
  type InstallErrorKind,
} from '@/src/services/install-apk';

/**
 * Whether a newer build exists, held app-wide — and fetching it when there is.
 * Ported from the Upande Sensors app's UpdateContext; the loops themselves are
 * started by `UpdateController` (mounted once at the root).
 *
 * Two channels:
 *  - OTA: a JS bundle for a patch inside the same runtime, served through
 *    `updates.url` (the Frappe proxy `upande_tambuzi.mobile_api.ota.manifest`).
 *    Checked at launch and on every return to the foreground (at most every
 *    five minutes) and applied without asking.
 *  - APK: a GitHub Releases check, once a day, for a build whose runtime
 *    moved. The download is automatic; Android's own installer screen still
 *    asks — no ordinary app can install silently.
 *
 * Nothing runs in development or Expo Go (`Updates.isEnabled` is false).
 */

/** Inside this window after launch a fetched bundle is applied at once, with no toast. */
const OTA_LAUNCH_WINDOW_MS = 20 * 1000;
/** How long the "Updating…" toast shows before the restart. */
const OTA_TOAST_MS = 2500;
/** At most one OTA check per foreground transition per this interval. */
const OTA_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const launchedAt = Date.now();

// Refs, not state: read and written without a render.
let otaBusy = false;
let otaLastCheck = 0;
let otaApplied = false;
let apkBusy = false;
/** Versions already auto-attempted this launch, so a declined installer isn't re-asked. */
const attempted = new Set<string>();
/** A downloaded APK waiting for the app to return to the foreground (Android 10+). */
let pendingApk: string | null = null;

export interface UpdateState {
  update: UpdateCheck | null;
  checking: boolean;
  error: { kind: UpdateErrorKind; message: string } | null;
  downloading: boolean;
  progress: DownloadProgress | null;
  installError: { kind: InstallErrorKind | null; message: string; auto: boolean } | null;
  otaChecking: boolean;
  /** A bundle is downloaded and the restart is seconds away — drives the toast. */
  otaReady: boolean;

  checkOta: (opts?: { force?: boolean }) => Promise<boolean>;
  applyOta: () => Promise<void>;
  autoCheck: () => Promise<void>;
  /** The Check for updates button: ignores the throttle, surfaces failures. */
  check: () => Promise<UpdateCheck | null>;
  /** Download a release and hand it to the installer. Resolves whether the installer was reached. */
  install: (target?: UpdateCheck | null, opts?: { auto?: boolean }) => Promise<boolean>;
  /** Launch a held installer once the app is visible again. */
  flushPending: () => void;
}

/** Same-runtime update as a bundle: 'applied', 'current' (nothing newer) or 'failed'. */
async function applyJsUpdate(): Promise<'applied' | 'current' | 'failed'> {
  if (!Updates.isEnabled) return 'failed';
  try {
    const found = await Updates.checkForUpdateAsync();
    if (!found?.isAvailable) return 'current';
    await Updates.fetchUpdateAsync();
    await Updates.reloadAsync();
    return 'applied';
  } catch {
    // checkForUpdateAsync REJECTS on anything but a manifest (404, a site
    // without the proxy). That must never cost the user the APK fallback.
    return 'failed';
  }
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  update: null,
  checking: false,
  error: null,
  downloading: false,
  progress: null,
  installError: null,
  otaChecking: false,
  otaReady: false,

  applyOta: async () => {
    if (otaApplied) return;
    otaApplied = true;
    try {
      // Mid-task, announce the restart so it reads as an update, not a crash.
      if (Date.now() - launchedAt >= OTA_LAUNCH_WINDOW_MS) {
        set({ otaReady: true });
        await new Promise((resolve) => setTimeout(resolve, OTA_TOAST_MS));
      }
      await Updates.reloadAsync();
    } catch (err) {
      // The bundle stays installed for the next cold start.
      otaApplied = false;
      set({ otaReady: false });
      if (__DEV__) console.log('[ota] reload', err instanceof Error ? err.message : err);
    }
  },

  checkOta: async ({ force = false } = {}) => {
    if (__DEV__ || !Updates.isEnabled) return false;
    if (otaBusy || otaApplied) return false;
    if (!force && Date.now() - otaLastCheck < OTA_CHECK_INTERVAL_MS) return false;
    otaBusy = true;
    otaLastCheck = Date.now();
    set({ otaChecking: true });
    try {
      const found = await Updates.checkForUpdateAsync();
      if (!found?.isAvailable) return false;
      await Updates.fetchUpdateAsync();
      get().applyOta();
      return true;
    } catch (err) {
      if (__DEV__) console.log('[ota] check', err instanceof Error ? err.message : err);
      return false;
    } finally {
      otaBusy = false;
      set({ otaChecking: false });
    }
  },

  autoCheck: async () => {
    const result = await autoCheckForUpdate(APP_VERSION);
    if (result && !get().update) set({ update: result });
  },

  check: async () => {
    set({ checking: true, error: null });
    try {
      // The JS update first: patch releases are never GitHub's "latest", so the
      // releases check alone would say "up to date" with a bundle waiting.
      if (await get().checkOta({ force: true })) return null;
      const result = await checkForUpdate(APP_VERSION);
      set({ update: result });
      return result;
    } catch (err) {
      set({
        update: null,
        error: {
          kind: err instanceof UpdateCheckError ? err.kind : UPDATE_ERRORS.FAILED,
          message: err instanceof Error ? err.message : 'The check could not be completed.',
        },
      });
      return null;
    } finally {
      set({ checking: false });
    }
  },

  install: async (target, { auto = false } = {}) => {
    const release = target || get().update;
    if (!release?.available) return false;
    if (apkBusy) return false;
    if (auto) {
      if (attempted.has(release.version)) return false;
      attempted.add(release.version);
    }

    apkBusy = true;
    set({ downloading: true, progress: null, installError: null });
    try {
      if (release.kind === UPDATE_KINDS.JS) {
        const js = await applyJsUpdate();
        if (js === 'applied') return true;
        if (js === 'current') {
          set((st) => ({ update: st.update ? { ...st.update, available: false } : st.update }));
          return false;
        }
        // Never pull a full APK on its own initiative for a same-runtime release.
        if (auto) return false;
      }

      if (!release.downloadUrl) {
        set({ installError: { kind: null, message: 'This release has no download attached to it.', auto } });
        return false;
      }

      const file = await downloadApk(release.downloadUrl, {
        fileName: release.assetName,
        onProgress: (progress) => set({ progress }),
        expectedBytes: release.sizeBytes,
      });
      if (AppState.currentState !== 'active') {
        pendingApk = file.uri;
        return false;
      }
      await launchInstaller(file.uri);
      return true;
    } catch (err) {
      set({
        installError: {
          kind: err instanceof InstallError ? err.kind : null,
          message: err instanceof Error ? err.message : 'The update could not be installed.',
          auto,
        },
      });
      return false;
    } finally {
      apkBusy = false;
      set({ downloading: false, progress: null });
    }
  },

  flushPending: () => {
    if (!pendingApk) return;
    // Cleared before launching so a failed launch isn't retried on every foreground.
    const uri = pendingApk;
    pendingApk = null;
    launchInstaller(uri).catch((err) => {
      set({
        installError: {
          kind: err instanceof InstallError ? err.kind : null,
          message: err instanceof Error ? err.message : 'The update could not be installed.',
          auto: true,
        },
      });
    });
  },
}));
