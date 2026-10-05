import { create } from 'zustand';
import { AppState, type AppStateStatus } from 'react-native';
import * as Network from 'expo-network';

/**
 * Network-status store. Owns:
 *   - the current online/offline view as the app sees it
 *   - polling cadence (slow when online, fast when offline)
 *   - a "reachability" probe escalated when API calls fail
 *
 * API call sites tell the store about success/failure via
 * `notifyApiSuccess()` / `notifyApiFailure()`. After N consecutive API
 * failures the store flips to offline even if the OS still reports a
 * connection — the practical signal is whether OUR server is reachable.
 */

const FAILURE_THRESHOLD = 2;
const ONLINE_POLL_MS = 15_000;
const OFFLINE_POLL_MS = 6_000;

interface NetworkState {
  online: boolean;
  /** True for a brief moment while we're confirming connectivity changes. */
  checking: boolean;
  consecutiveFailures: number;
  /** Whether the store has been initialised (subscriber attached). */
  ready: boolean;

  init: () => void;
  forceCheck: () => Promise<void>;
  notifyApiSuccess: () => void;
  notifyApiFailure: () => void;
  setOnline: (online: boolean) => void;
}

let pollTimer: ReturnType<typeof setTimeout> | null = null;
let appStateSub: { remove: () => void } | null = null;

async function checkConnectivity(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return !!(state.isConnected && state.isInternetReachable !== false);
  } catch {
    return false;
  }
}

export const useNetworkStore = create<NetworkState>((set, get) => ({
  online: true,
  checking: false,
  consecutiveFailures: 0,
  ready: false,

  init: () => {
    if (get().ready) return;
    set({ ready: true });

    const scheduleNext = () => {
      if (pollTimer) clearTimeout(pollTimer);
      const delay = get().online ? ONLINE_POLL_MS : OFFLINE_POLL_MS;
      pollTimer = setTimeout(() => {
        get().forceCheck().finally(scheduleNext);
      }, delay);
    };

    // Foreground → recheck right away
    appStateSub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') get().forceCheck();
    });

    // Initial probe + start polling
    get().forceCheck().finally(scheduleNext);
  },

  forceCheck: async () => {
    if (get().checking) return;
    set({ checking: true });
    try {
      const online = await checkConnectivity();
      // OS-level connectivity is the floor. Only reset the failure counter if
      // we have BOTH a connection AND no recent API failure has been recorded.
      if (online && get().consecutiveFailures === 0) {
        if (!get().online) set({ online: true });
      } else if (!online) {
        if (get().online) set({ online: false });
      }
    } finally {
      set({ checking: false });
    }
  },

  notifyApiSuccess: () => {
    const failures = get().consecutiveFailures;
    if (failures > 0) set({ consecutiveFailures: 0 });
    if (!get().online) set({ online: true });
  },

  notifyApiFailure: () => {
    const next = get().consecutiveFailures + 1;
    set({ consecutiveFailures: next });
    if (next >= FAILURE_THRESHOLD && get().online) {
      // Don't trust the OS — flag offline and force a probe.
      set({ online: false });
      get().forceCheck();
    }
  },

  setOnline: (online) => set({ online }),
}));

export function teardownNetworkStore(): void {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  if (appStateSub) {
    appStateSub.remove();
    appStateSub = null;
  }
}
