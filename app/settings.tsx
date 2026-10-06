import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Updates from 'expo-updates';
import * as Device from 'expo-device';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/components/Screen';
import { Card } from '@/src/components/Card';
import { Button } from '@/src/components/Button';
import { ScannerConfig } from '@/src/components/ScannerConfig';
import { useScanStore } from '@/src/stores/scanStore';
import { useToast } from '@/src/components/Toast';
import { useAuthStore } from '@/src/stores/authStore';
import * as Biometric from '@/src/services/biometric';
import { useUpdateStore } from '@/src/stores/updateStore';
import { APP_VERSION } from '@/src/services/app-version';
import { compareVersions, formatBytes, RELEASES_URL, UPDATE_ERRORS } from '@/src/services/updates';
import { INSTALL_ERRORS, openUnknownAppSourcesSettings } from '@/src/services/install-apk';
import { getInstallId } from '@/src/services/install-register';
import { colors, fontFamily, fontSize, spacing } from '@/src/theme';
import { userMessage } from '@/src/services/user-message';

async function openInBrowser(url?: string | null) {
  try {
    await Linking.openURL(url || RELEASES_URL);
  } catch {
    // Nothing useful to say if the OS has no browser.
  }
}

export default function SettingsScreen() {
  const router = useRouter();
  const fullName = useAuthStore((s) => s.fullName);
  const email = useAuthStore((s) => s.email);
  const instanceUrl = useAuthStore((s) => s.instanceUrl);
  const biometricEnabled = useAuthStore((s) => s.biometricEnabled);
  const setBiometricEnabled = useAuthStore((s) => s.setBiometricEnabled);
  const logout = useAuthStore((s) => s.logout);
  const forgetDevice = useAuthStore((s) => s.forgetDevice);
  const { showSuccess, showError } = useToast();
  const [moduleReady, setModuleReady] = useState(false);
  const [hardwareReady, setHardwareReady] = useState(false);
  const loadSetup = useScanStore((st) => st.load);
  const setupLoaded = useScanStore((st) => st.loaded);
  const canViewDevices = useScanStore((st) => st.canViewDevices);

  const update = useUpdateStore((st) => st.update);
  const checking = useUpdateStore((st) => st.checking);
  const updateError = useUpdateStore((st) => st.error);
  const check = useUpdateStore((st) => st.check);
  const downloading = useUpdateStore((st) => st.downloading);
  const progress = useUpdateStore((st) => st.progress);
  const installError = useUpdateStore((st) => st.installError);
  const install = useUpdateStore((st) => st.install);
  const [installId, setInstallId] = useState<string | null>(null);

  useEffect(() => {
    getInstallId().then(setInstallId);
  }, []);

  useEffect(() => {
    if (!setupLoaded) loadSetup();
  }, [setupLoaded, loadSetup]);

  useEffect(() => {
    setModuleReady(Biometric.isModuleAvailable());
    Biometric.isAvailable().then(setHardwareReady);
  }, []);

  const appVersion = APP_VERSION ?? '—';
  const runtimeVersion = Updates.runtimeVersion || null;
  const otaLabel = Updates.isEmbeddedLaunch ? 'Built-in bundle' : `OTA bundle ${Updates.updateId?.slice(0, 8) ?? ''}`;

  /** Download the APK and hand it straight to Android's installer. */
  const installUpdate = useCallback(async () => {
    if (!update?.downloadUrl && update?.kind !== 'js') {
      await openInBrowser(update?.pageUrl);
      return;
    }
    const reached = await install(update, { auto: false });
    if (reached) return;
    const err = useUpdateStore.getState().installError;
    if (!err) return;
    const blocked = err.kind === INSTALL_ERRORS.BLOCKED;
    Alert.alert('Update failed', err.message, [
      { text: 'Close', style: 'cancel' },
      blocked
        ? { text: 'Allow installs', onPress: () => openUnknownAppSourcesSettings().catch(() => {}) }
        : { text: 'Open in browser', onPress: () => openInBrowser(update?.pageUrl) },
    ]);
  }, [update, install]);

  // One button, three jobs in the order they happen: check, update, progress.
  const updateLabel = useMemo(() => {
    if (downloading) {
      if (progress?.fraction != null) return `Downloading… ${Math.round(progress.fraction * 100)}%`;
      if (progress?.written) return `Downloading… ${formatBytes(progress.written) ?? ''}`;
      return 'Downloading…';
    }
    if (checking) return 'Checking…';
    if (update?.available) return `Update to ${update.version}`;
    return 'Check for updates';
  }, [downloading, progress, checking, update?.available, update?.version]);

  const onUpdatePress = useCallback(async () => {
    if (downloading) return;
    if (update?.available) return installUpdate();
    if (__DEV__) {
      showError('Updates are unavailable in development. Use a release build.');
      return;
    }
    const result = await check();
    // A found JS update restarts the app on its own; a found APK downloads on its own.
    if (result && !result.available) showSuccess("You're on the latest version.");
  }, [downloading, update?.available, installUpdate, check, showError, showSuccess]);

  const onToggleBiometric = async () => {
    if (!biometricEnabled) {
      if (!moduleReady) {
        Alert.alert(
          'Update needed',
          'Install the latest build of Post Harvest to enable biometric unlock.',
        );
        return;
      }
      if (!hardwareReady) {
        Alert.alert(
          'Biometric unavailable',
          'Enroll a fingerprint or face in your device settings, then try again.',
        );
        return;
      }
      const res = await Biometric.authenticate({
        promptMessage: 'Confirm biometric unlock',
        cancelLabel: 'Cancel',
        disableDeviceFallback: true,
      });
      if (!res.success) return;
    }
    try {
      await setBiometricEnabled(!biometricEnabled);
      showSuccess(biometricEnabled ? 'Biometric unlock disabled.' : 'Biometric unlock enabled.');
    } catch (err) {
      showError(userMessage(err, 'Could not update setting.'));
    }
  };

  const onSignOut = () => {
    Alert.alert('Sign out?', 'You can sign back in with biometrics or your password.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/login');
        },
      },
    ]);
  };

  const onForgetDevice = () => {
    Alert.alert(
      'Forget this device?',
      'This clears your session and disables biometric unlock. You will need your password to sign back in.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Forget',
          style: 'destructive',
          onPress: async () => {
            await forgetDevice();
            router.replace('/login');
          },
        },
      ],
    );
  };

  return (
    <Screen
      title="Settings"
      leftIcon="arrow-back"
      onPressLeft={() => router.back()}
    >
      <Card>
        <View style={s.avatarRow}>
          <View style={s.avatar}>
            <Text style={s.avatarInitials}>
              {(fullName || email || '?').slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.userName}>{fullName || email || 'Signed in'}</Text>
            {email ? <Text style={s.userEmail}>{email}</Text> : null}
            {instanceUrl ? (
              <Text style={s.userMeta}>{instanceUrl}</Text>
            ) : null}
          </View>
        </View>
      </Card>

      <Card>
        <ScannerConfig />
      </Card>

      <Card title="Security">
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={s.rowLabel}>Biometric unlock</Text>
            <Text style={s.rowHint}>
              {!moduleReady
                ? 'Install latest build to enable'
                : !hardwareReady
                  ? 'Enroll fingerprint/face in device settings'
                  : 'Skip the password with fingerprint or face'}
            </Text>
          </View>
          <Toggle value={biometricEnabled} onChange={onToggleBiometric} />
        </View>
      </Card>

      <Card title="App updates">
        <InfoRow label="Installed" value={appVersion} />
        {runtimeVersion ? <InfoRow label="Runtime" value={`${runtimeVersion} · ${otaLabel}`} /> : null}
        {update ? (
          <>
            <InfoRow
              label="Latest"
              value={compareVersions(update.version, appVersion) > 0 ? update.version : appVersion}
            />
            <Text style={[s.rowHint, update.available && s.accentText]}>
              {update.available
                ? `Version ${update.version} is available${update.size ? ` · ${update.size}` : ''}${
                    update.kind === 'js' ? ' · quick update' : ''
                  }.`
                : "You're on the latest version."}
            </Text>
            {update.available && update.notes ? (
              <Text style={s.notes} numberOfLines={8}>
                {update.notes}
              </Text>
            ) : null}
          </>
        ) : null}
        {updateError ? (
          <Text style={s.errorText}>
            {updateError.message}
            {updateError.kind === UPDATE_ERRORS.RATE_LIMITED ? ' The releases page still works.' : ''}
          </Text>
        ) : null}
        {installError ? <Text style={s.errorText}>{installError.message}</Text> : null}
        <View style={{ height: spacing.md }} />
        <Button
          label={updateLabel}
          variant={update?.available || downloading ? 'primary' : 'outline'}
          onPress={onUpdatePress}
          loading={checking || (downloading && progress?.fraction == null)}
          disabled={downloading}
          iconLeft="cloud-download-outline"
        />
        {updateError || installError ? (
          <>
            <View style={{ height: spacing.sm }} />
            <Button
              label="Open releases page"
              variant="ghost"
              onPress={() => openInBrowser(update?.pageUrl)}
              iconLeft="open-outline"
            />
          </>
        ) : null}
        {Platform.OS === 'android' && installError?.kind === INSTALL_ERRORS.BLOCKED ? (
          <Button
            label="Allow installs from this app"
            variant="ghost"
            onPress={() => openUnknownAppSourcesSettings().catch(() => {})}
            iconLeft="shield-checkmark-outline"
          />
        ) : null}
      </Card>

      <Card title="This device">
        <InfoRow label="Model" value={[Device.brand, Device.modelName].filter(Boolean).join(' ') || '—'} />
        {Device.deviceName ? <InfoRow label="Name" value={Device.deviceName} /> : null}
        <InfoRow label="OS" value={`${Platform.OS === 'android' ? 'Android' : Platform.OS} ${Device.osVersion ?? ''}`.trim()} />
        <InfoRow label="Install ID" value={installId ? installId.slice(0, 8) : '—'} />
        {canViewDevices ? (
          <TouchableOpacity style={s.linkRow} activeOpacity={0.7} onPress={() => router.push('/devices')}>
            <Ionicons name="phone-portrait-outline" size={18} color={colors.text} />
            <Text style={s.linkText}>Devices running the app</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </Card>

      <Card title="Session">
        <Button label="Sign out" variant="outline" onPress={onSignOut} />
        <View style={{ height: spacing.sm }} />
        <Button
          label="Forget this device"
          variant="outline"
          color={colors.danger}
          onPress={onForgetDevice}
          iconLeft="trash-outline"
        />
      </Card>
    </Screen>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.infoRow}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: () => void }) {
  return (
    <TouchableOpacity
      onPress={onChange}
      activeOpacity={0.8}
      style={[s.toggle, value && s.toggleOn]}
    >
      <View style={[s.toggleDot, value && s.toggleDotOn]} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: colors.textOnPrimary },
  userName: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text },
  userEmail: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  userMeta: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowLabel: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  rowHint: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 4 },
  infoLabel: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary },
  infoValue: { flexShrink: 1, fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.text, textAlign: 'right' },
  accentText: { color: colors.text, fontFamily: fontFamily.semiBold },
  notes: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.sm,
    borderRadius: 6,
  },
  errorText: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.error, marginTop: spacing.sm },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  linkText: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  toggle: {
    width: 46,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#E5E5E5',
    padding: 3,
    justifyContent: 'center',
  },
  toggleOn: { backgroundColor: colors.text },
  toggleDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  toggleDotOn: { transform: [{ translateX: 20 }] },
});
