import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export const StorageKeys = {
  cookie: 'cookie',
  instanceUrl: 'instanceurl',
  instanceUrlBackup: 'instanceurl_backup',
  emailBackup: 'email_backup',
  fullName: 'fullname',
  // Last farm the operator scanned for — restored on the next launch.
  farm: 'farm',
  // Processes this scanner is dedicated to (JSON array of ProcessKey).
  processes: 'processes',
  // Farm list from the last successful setup load, offered before sign-in.
  farmsCache: 'farms_cache',
  biometricEnabled: 'biometric_enabled',
  // Password, kept in the OS secure enclave. Fed back into the login endpoint to
  // silently re-authenticate when the server session expires (403 session_expired)
  // and to re-authenticate behind the biometric unlock.
  passwordBackup: 'password_backup',
} as const;

export type StorageKey = (typeof StorageKeys)[keyof typeof StorageKeys];

// The password is the most sensitive thing we persist, so it lives in the OS
// secure enclave (iOS Keychain / Android Keystore) via SecureStore. SecureStore
// isn't available on web, so fall back to AsyncStorage there.
const SECURE_KEYS: string[] = [StorageKeys.passwordBackup];
const secureAvailable = Platform.OS !== 'web';
const isSecureKey = (key: string): boolean => secureAvailable && SECURE_KEYS.includes(key);

export const storage = {
  get: (key: string): Promise<string | null> =>
    isSecureKey(key) ? SecureStore.getItemAsync(key) : AsyncStorage.getItem(key),
  set: (key: string, value: string): Promise<void> =>
    isSecureKey(key) ? SecureStore.setItemAsync(key, value) : AsyncStorage.setItem(key, value),
  remove: (key: string): Promise<void> =>
    isSecureKey(key) ? SecureStore.deleteItemAsync(key) : AsyncStorage.removeItem(key),
  async clearExcept(keep: string[]): Promise<void> {
    const allKeys = Object.values(StorageKeys);
    await Promise.all(allKeys.filter((k) => !keep.includes(k)).map((k) => storage.remove(k)));
  },
  async clearAll(): Promise<void> {
    await Promise.all(Object.values(StorageKeys).map((k) => storage.remove(k)));
  },
};
