import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, fontFamily, fontSize, shadow, spacing } from '@/src/theme';
import { useAuthStore } from '@/src/stores/authStore';
import { storage, StorageKeys } from '@/src/services/storage';
import * as Biometric from '@/src/services/biometric';
import { useToast } from '@/src/components/Toast';
import { ScannerConfig } from '@/src/components/ScannerConfig';
import { useScanStore } from '@/src/stores/scanStore';
import { appTitle, processLabel } from '@/src/scan/processes';
import { DEFAULT_INSTANCE, INSTANCES, getInstanceByUrl, normalizeUrl } from '@/src/services/instance-mapper';

export default function LoginScreen() {
  const login = useAuthStore((s) => s.login);
  const status = useAuthStore((s) => s.status);
  const setHasSession = useAuthStore.setState;
  const { showError } = useToast();

  const [instanceUrl, setInstanceUrl] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showInstanceConfig, setShowInstanceConfig] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Biometric availability: stored sid + biometric_enabled flag + native module
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);

  const passwordRef = useRef<TextInput>(null);

  // Each scanner is set up (processes + station farm) before anyone signs in.
  const scannerHydrated = useScanStore((st) => st.hydrated);
  const farm = useScanStore((st) => st.farm);
  const processes = useScanStore((st) => st.processes);
  const scannerReady = !!farm && processes.length > 0;
  const [showScanner, setShowScanner] = useState(false);
  const scannerOpen = showScanner || (scannerHydrated && !scannerReady);

  useEffect(() => {
    (async () => {
      const [savedUrl, savedEmail, savedPassword, bioFlag] = await Promise.all([
        storage.get(StorageKeys.instanceUrlBackup),
        storage.get(StorageKeys.emailBackup),
        storage.get(StorageKeys.passwordBackup),
        storage.get(StorageKeys.biometricEnabled),
      ]);
      setInstanceUrl(savedUrl || DEFAULT_INSTANCE.url);
      if (savedEmail) setEmail(savedEmail);
      setBioAvailable(
        !!savedPassword && bioFlag === '1' && Biometric.isModuleAvailable(),
      );
    })();
  }, []);

  const onSignIn = async () => {
    setErrorMsg(null);
    if (!scannerReady) {
      setErrorMsg('Choose the process and farm first.');
      return;
    }
    if (!instanceUrl.trim() || !email.trim() || !password.trim()) {
      setErrorMsg('Fill all fields.');
      return;
    }
    const ok = await login(email.trim(), password, instanceUrl.trim());
    if (!ok) {
      const err = useAuthStore.getState().error || 'Sign-in failed.';
      setErrorMsg(err);
      showError(err);
    }
  };

  const onBiometric = async () => {
    setErrorMsg(null);
    if (!scannerReady) {
      setErrorMsg('Choose the process and farm first.');
      return;
    }
    setBioBusy(true);
    try {
      // Prompts biometric, then re-authenticates with the stored password.
      const res = await useAuthStore.getState().biometricLogin();
      if (res.ok || res.reason === 'cancelled') return;
      if (res.reason === 'no_credentials') {
        setErrorMsg('No saved credentials — sign in with your password once.');
      } else {
        setErrorMsg("Couldn't verify biometric. Use your password.");
      }
    } finally {
      setBioBusy(false);
    }
  };

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <KeyboardAwareScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        enableOnAndroid
        extraScrollHeight={40}
      >
          <View style={s.hero}>
            {/* Hidden server switch: hold the logo for 3 seconds. */}
            <Pressable
              onLongPress={() => setShowInstanceConfig((p) => !p)}
              delayLongPress={3000}
              accessibilityLabel="Upande"
              accessibilityHint="Hold for 3 seconds to change the server"
              style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
            >
              <Image source={require('@/assets/images/upande_logo.png')} style={s.logo} resizeMode="contain" />
            </Pressable>
            <Text style={s.appName}>{appTitle(processes)}</Text>
            <Text style={s.tagline}>Sign in to continue</Text>
          </View>

          {scannerOpen ? (
            <View style={[s.card, { marginBottom: spacing.md }]}>
              <View style={s.scannerHead}>
                {scannerReady ? (
                  <Pressable onPress={() => setShowScanner(false)} hitSlop={10} style={s.scannerDone}>
                    <Text style={s.scannerChange}>Done</Text>
                  </Pressable>
                ) : null}
              </View>
              <ScannerConfig />
            </View>
          ) : scannerHydrated ? (
            <Pressable
              onPress={() => setShowScanner(true)}
              style={[s.card, s.scannerSummary]}
              accessibilityLabel="Change process and farm"
            >
              <Ionicons name="location-outline" size={20} color={colors.text} />
              <View style={{ flex: 1 }}>
                <Text style={s.scannerFarm}>{farm}</Text>
                <Text style={s.scannerSub} numberOfLines={1}>
                  {processLabel(processes)}
                </Text>
              </View>
              <Text style={s.scannerChange}>Change</Text>
            </Pressable>
          ) : null}

          <View style={s.card}>
            <Text style={s.label}>Email</Text>
            <View style={s.input}>
              <Ionicons name="mail-outline" size={18} color={colors.textMuted} style={s.icon} />
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                style={s.inputText}
              />
            </View>

            <Text style={[s.label, { marginTop: spacing.md }]}>Password</Text>
            <View style={s.input}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} style={s.icon} />
              <TextInput
                ref={passwordRef}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                returnKeyType="go"
                onSubmitEditing={onSignIn}
                style={s.inputText}
              />
              <TouchableOpacity onPress={() => setShowPassword((p) => !p)} hitSlop={8} style={{ paddingRight: spacing.md }}>
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={18}
                  color={colors.textMuted}
                />
              </TouchableOpacity>
            </View>

            {errorMsg ? (
              <View style={s.errorBox}>
                <Ionicons name="alert-circle" size={16} color={colors.error} />
                <Text style={s.errorText}>{errorMsg}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              onPress={onSignIn}
              disabled={status === 'loading'}
              activeOpacity={0.8}
              style={[s.primaryBtn, (status === 'loading' || !scannerReady) && { opacity: 0.6 }]}
            >
              {status === 'loading' ? (
                <ActivityIndicator color={colors.textOnPrimary} />
              ) : (
                <Text style={s.primaryBtnText}>Sign in</Text>
              )}
            </TouchableOpacity>

            {bioAvailable ? (
              <TouchableOpacity
                onPress={onBiometric}
                disabled={bioBusy}
                activeOpacity={0.8}
                style={s.bioFab}
              >
                {bioBusy ? (
                  <ActivityIndicator color={colors.text} />
                ) : (
                  <Ionicons name="finger-print" size={28} color={colors.text} />
                )}
              </TouchableOpacity>
            ) : null}
          </View>

          <Text style={s.instanceText}>{instanceLabel(instanceUrl)}</Text>

          {showInstanceConfig ? (
            <View style={[s.card, { marginTop: spacing.sm }]}>
              <Text style={s.label}>Instance</Text>
              <View style={s.instances}>
                {INSTANCES.map((i) => {
                  const active = normalizeUrl(instanceUrl) === normalizeUrl(i.url);
                  return (
                    <Pressable
                      key={i.key}
                      onPress={() => setInstanceUrl(i.url)}
                      style={[s.instanceChip, active && s.instanceChipOn]}
                    >
                      <Text style={[s.instanceChipText, active && s.instanceChipTextOn]}>{i.label}</Text>
                      {i.environment !== 'production' ? (
                        <Text style={[s.instanceChipEnv, active && s.instanceChipTextOn]}>{i.environment}</Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
              <Text style={[s.label, { marginTop: spacing.md }]}>Or a server address</Text>
              <View style={s.input}>
                <Ionicons name="server-outline" size={18} color={colors.textMuted} style={s.icon} />
                <TextInput
                  value={instanceUrl}
                  onChangeText={setInstanceUrl}
                  onBlur={() => setInstanceUrl((u) => bareAddress(u))}
                  placeholder="tambuzi.upande.com"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  style={s.inputText}
                />
              </View>
              <Text style={s.hint}>No need to type https:// — it is added automatically.</Text>
            </View>
          ) : null}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

/** Strip the scheme and any trailing slash, so the address is shown as typed. */
function bareAddress(url: string): string {
  return url.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

/** Known instances by name (plus environment when not production), anything else by URL. */
function instanceLabel(url: string): string {
  const instance = getInstanceByUrl(url);
  if (!instance) return url || 'Configure';
  return instance.environment === 'production' ? instance.label : `${instance.label} (${instance.environment})`;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  // No justifyContent: 'center' here -- centering a flexGrow container fights
  // KeyboardAwareScrollView's scroll-to-focused-input math and was leaving the
  // password field / Sign in button hidden behind the keyboard. Padding keeps
  // the form comfortably placed instead.
  scroll: { padding: spacing.lg, paddingTop: spacing.xxl, paddingBottom: spacing.xxl, flexGrow: 1 },
  hero: { alignItems: 'center', marginBottom: spacing.xl },
  logo: { width: 76, height: 76, marginBottom: spacing.md },
  appName: { fontFamily: fontFamily.bold, fontSize: fontSize.xl, color: colors.text },
  tagline: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 4 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  label: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text, marginBottom: spacing.sm },
  scannerHead: { flexDirection: 'row', justifyContent: 'flex-end', position: 'absolute', top: spacing.sm, right: spacing.sm, zIndex: 1 },
  scannerDone: { minHeight: 40, justifyContent: 'center', paddingHorizontal: spacing.sm },
  scannerSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
    minHeight: 64,
    paddingVertical: spacing.md,
  },
  scannerFarm: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text },
  scannerSub: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textSecondary },
  scannerChange: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  icon: { marginLeft: spacing.md },
  inputText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.text,
    padding: spacing.md,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(239, 68, 68, 0.06)',
    padding: spacing.md,
    borderRadius: borderRadius.sm,
    marginTop: spacing.md,
  },
  errorText: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.error },
  primaryBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  primaryBtnText: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: colors.textOnPrimary },
  bioFab: {
    alignSelf: 'center',
    marginTop: spacing.xl,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.md,
  },
  instances: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  instanceChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
  },
  instanceChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  instanceChipText: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.text },
  instanceChipEnv: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
  instanceChipTextOn: { color: colors.textOnPrimary },
  instanceText: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  hint: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.sm },
});
