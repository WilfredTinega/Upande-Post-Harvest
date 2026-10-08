import { create } from 'zustand';
import { storage, StorageKeys } from '@/src/services/storage';
import { loginToServer } from '@/src/services/auth-api';
import * as Biometric from '@/src/services/biometric';
import { userMessage } from '@/src/services/user-message';
import { reportInstall } from '@/src/services/install-register';

type Status = 'idle' | 'loading' | 'success' | 'error';

export interface AuthState {
  hydrated: boolean;
  status: Status;
  error: string | null;

  hasSession: boolean;
  fullName: string | null;
  email: string | null;
  instanceUrl: string | null;

  /** Per-device flag — does this device want biometric login? */
  biometricEnabled: boolean;
  /** Runtime gate — true when the app should show the biometric lock screen. */
  biometricLocked: boolean;

  hydrate: () => Promise<void>;
  login: (email: string, password: string, bareUrl: string) => Promise<boolean>;
  setBiometricEnabled: (on: boolean) => Promise<void>;
  /** Prompt the OS biometric, then RE-AUTHENTICATE using the stored password
   *  (re-establishing a fresh session cookie) — not just clearing the gate. */
  biometricLogin: () => Promise<
    | { ok: true }
    | { ok: false; reason: 'cancelled' | 'no_credentials' | 'auth_failed' | 'unavailable'; message?: string }
  >;
  /** Soft logout — clear session in memory, keep biometric flag and stored cookie. */
  logout: () => Promise<void>;
  /** Hard logout — wipe everything. Used when silent re-login fails. */
  forgetDevice: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  hydrated: false,
  status: 'idle',
  error: null,

  hasSession: false,
  fullName: null,
  email: null,
  instanceUrl: null,

  biometricEnabled: false,
  biometricLocked: false,

  hydrate: async () => {
    try {
      const [cookie, instanceUrl, email, fullName, bioFlag] = await Promise.all([
        storage.get(StorageKeys.cookie),
        storage.get(StorageKeys.instanceUrl),
        storage.get(StorageKeys.emailBackup),
        storage.get(StorageKeys.fullName),
        storage.get(StorageKeys.biometricEnabled),
      ]);

      const hasSession = !!cookie && !!instanceUrl;
      const biometricEnabled = bioFlag === '1';
      const biometricLocked = hasSession && biometricEnabled && Biometric.isModuleAvailable();

      set({ hydrated: true, hasSession, instanceUrl, email, fullName, biometricEnabled, biometricLocked });
    } catch (err) {
      set({ hydrated: true, error: userMessage(err, 'Could not restore the session.') });
    }
  },

  login: async (email, password, bareUrl) => {
    set({ status: 'loading', error: null });
    try {
      const result = await loginToServer(bareUrl, email, password);
      set({
        status: 'success',
        hasSession: true,
        instanceUrl: result.baseUrl,
        email: result.email,
        fullName: result.fullName ?? get().fullName,
        biometricLocked: false, // post-fresh-login, never lock
      });
      // A sign-in binds this account to the device in the register; never throttled.
      reportInstall({ reason: 'login', user: result.email });
      return true;
    } catch (err) {
      const message = userMessage(err, 'Could not sign in. Try again.');
      set({ status: 'error', error: message });
      return false;
    }
  },

  biometricLogin: async () => {
    if (!Biometric.isModuleAvailable()) {
      return { ok: false, reason: 'unavailable' };
    }
    const auth = await Biometric.authenticate({
      promptMessage: 'Unlock Upande Post Harvest',
      fallbackLabel: 'Use password',
      cancelLabel: 'Cancel',
    });
    if (!auth.success) {
      if (auth.error === 'user_cancel' || auth.error === 'system_cancel') {
        return { ok: false, reason: 'cancelled' };
      }
      return { ok: false, reason: 'auth_failed', message: auth.error };
    }
    const [email, password, url] = await Promise.all([
      storage.get(StorageKeys.emailBackup),
      storage.get(StorageKeys.passwordBackup),
      storage.get(StorageKeys.instanceUrlBackup),
    ]);
    if (!email || !password || !url) {
      return { ok: false, reason: 'no_credentials' };
    }
    const ok = await get().login(email, password, url);
    if (!ok) {
      return { ok: false, reason: 'auth_failed', message: get().error ?? undefined };
    }
    return { ok: true };
  },

  setBiometricEnabled: async (on) => {
    await storage.set(StorageKeys.biometricEnabled, on ? '1' : '0');
    set({ biometricEnabled: on });
  },

  logout: async () => {
    // Soft — clears the session in memory only. Biometric flag + credentials
    // stay so the user can sign back in via biometric on the same device.
    set({ hasSession: false, biometricLocked: false, status: 'idle', error: null });
  },

  forgetDevice: async () => {
    // The scanner's own configuration (station farm, processes) belongs to the
    // device, not the user, so it survives.
    await storage.clearExcept([StorageKeys.farm, StorageKeys.processes, StorageKeys.farmsCache]);
    set({
      hasSession: false,
      biometricEnabled: false,
      biometricLocked: false,
      fullName: null,
      email: null,
      instanceUrl: null,
      status: 'idle',
      error: null,
    });
  },
}));
