import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';
import { useUpdateStore } from '@/src/stores/updateStore';
import { useAuthStore } from '@/src/stores/authStore';
import { UPDATE_KINDS } from '@/src/services/updates';
import { reportInstall } from '@/src/services/install-register';

/**
 * Starts the update loops and the device-register launch report. Renders
 * nothing; mounted once at the root (app/_layout.tsx).
 */
export function UpdateController() {
  const checkOta = useUpdateStore((s) => s.checkOta);
  const applyOta = useUpdateStore((s) => s.applyOta);
  const autoCheck = useUpdateStore((s) => s.autoCheck);
  const install = useUpdateStore((s) => s.install);
  const flushPending = useUpdateStore((s) => s.flushPending);
  const update = useUpdateStore((s) => s.update);

  const hasSession = useAuthStore((s) => s.hasSession);
  const biometricLocked = useAuthStore((s) => s.biometricLocked);
  const email = useAuthStore((s) => s.email);

  // OTA: at mount, then on every return to the foreground (throttled). A
  // scanner left open on one process all day still picks up a midday fix.
  useEffect(() => {
    checkOta({ force: true });
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      checkOta();
      flushPending();
    });
    return () => sub.remove();
  }, [checkOta, flushPending]);

  // The native ON_LOAD download finishing: apply it now rather than one launch later.
  const { isUpdatePending } = Updates.useUpdates();
  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled || !isUpdatePending) return;
    applyOta();
  }, [isUpdatePending, applyOta]);

  // APK: one silent, day-throttled check per launch.
  useEffect(() => {
    autoCheck();
  }, [autoCheck]);

  // Fetch and hand to the installer as soon as a newer native build is known.
  // Never in development: a Metro reload kills the transfer.
  useEffect(() => {
    if (__DEV__) return;
    if (!update?.available) return;
    if (update.kind !== UPDATE_KINDS.JS && !update.downloadUrl) return;
    install(update, { auto: true });
  }, [update, install]);

  // Device register: one throttled launch report once a session is usable.
  useEffect(() => {
    if (!hasSession || biometricLocked) return;
    reportInstall({ reason: 'launch', user: email });
  }, [hasSession, biometricLocked, email]);

  return null;
}
