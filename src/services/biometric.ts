/**
 * Safe wrapper around expo-local-authentication.
 *
 * The native module is compiled into the APK. If an OTA JS bundle loads
 * the shim on a binary that doesn't ship the native side, calling it
 * crashes at the native layer (JS can't catch it). We probe three ways
 * before importing the module and degrade silently when it's missing.
 *
 * Detection (in order):
 *   1. expo-modules-core.requireOptionalNativeModule
 *   2. Legacy NativeModules bridge
 *   3. TurboModuleRegistry (new RN arch)
 */
import { NativeModules } from 'react-native';

let cachedModule: any = null;
let attempted = false;

function nativeRegistered(): boolean {
  // 1) expo-modules-core's official optional probe (preferred).
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const core = require('expo-modules-core');
    if (core && typeof core.requireOptionalNativeModule === 'function') {
      const native = core.requireOptionalNativeModule('ExpoLocalAuthentication');
      if (native) return true;
    }
  } catch {
    // older SDKs may not expose requireOptionalNativeModule — fall through
  }

  // 2) Legacy bridge.
  try {
    if (NativeModules && (NativeModules as any).ExpoLocalAuthentication) return true;
  } catch {}

  // 3) TurboModule registry.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const rn = require('react-native');
    const reg = rn?.TurboModuleRegistry;
    if (reg && typeof reg.get === 'function') {
      if (reg.get('ExpoLocalAuthentication')) return true;
    }
  } catch {}

  return false;
}

function getModule(): any {
  if (attempted) return cachedModule;
  attempted = true;
  if (!nativeRegistered()) return null;
  try {
    cachedModule = require('expo-local-authentication');
    if (!cachedModule || typeof cachedModule.hasHardwareAsync !== 'function') {
      cachedModule = null;
    }
  } catch {
    cachedModule = null;
  }
  return cachedModule;
}

export function isModuleAvailable(): boolean {
  return getModule() !== null;
}

export async function hasHardware(): Promise<boolean> {
  const m = getModule();
  if (!m) return false;
  try {
    return await m.hasHardwareAsync();
  } catch {
    return false;
  }
}

export async function isEnrolled(): Promise<boolean> {
  const m = getModule();
  if (!m) return false;
  try {
    return await m.isEnrolledAsync();
  } catch {
    return false;
  }
}

export async function isAvailable(): Promise<boolean> {
  if (!isModuleAvailable()) return false;
  const [hw, en] = await Promise.all([hasHardware(), isEnrolled()]);
  return hw && en;
}

export interface BiometricAuthOptions {
  promptMessage?: string;
  cancelLabel?: string;
  fallbackLabel?: string;
  disableDeviceFallback?: boolean;
}

export interface BiometricAuthResult {
  success: boolean;
  error?: string;
}

export async function authenticate(opts: BiometricAuthOptions = {}): Promise<BiometricAuthResult> {
  const m = getModule();
  if (!m) return { success: false, error: 'biometric_unavailable' };
  try {
    const res = await m.authenticateAsync(opts);
    return { success: !!res?.success, error: res?.error };
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'auth_failed' };
  }
}
