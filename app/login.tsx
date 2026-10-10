import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, fontFamily, fontSize, shadow, spacing } from '@/src/theme';
import { KeyboardScrollView } from '@/src/components/KeyboardScrollView';
import { useAuthStore } from '@/src/stores/authStore';
import { storage, StorageKeys } from '@/src/services/storage';
import * as Biometric from '@/src/services/biometric';
import { useToast } from '@/src/components/Toast';
import { useScanStore } from '@/src/stores/scanStore';
import { appTitle } from '@/src/scan/processes';
import { verifyServer } from '@/src/services/url';
import { userMessage } from '@/src/services/user-message';

export default function LoginScreen() {
  const login = useAuthStore((s) => s.login);
  const status = useAuthStore((s) => s.status);
  const setHasSession = useAuthStore.setState;
  const { showError } = useToast();

  const [instanceUrl, setInstanceUrl] = useState('');
  // The full address that passed the server check; sign-in uses it as is.
  const [verifiedUrl, setVerifiedUrl] = useState<string | null>(null);
  // First install has no server saved: ask for it, then for the credentials.
  const [step, setStep] = useState<'loading' | 'server' | 'credentials'>('loading');
  const [savingServer, setSavingServer] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Biometric availability: stored sid + biometric_enabled flag + native module
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);

  const passwordRef = useRef<TextInput>(null);

  // Vertically centred by measured offset, not justifyContent (see s.scroll).
  const [viewHeight, setViewHeight] = useState(0);
  const [formHeight, setFormHeight] = useState(0);
  const centreOffset = Math.max(0, (viewHeight - 2 * spacing.lg - formHeight) / 2);
  const processes = useScanStore((st) => st.processes);

  useEffect(() => {
    (async () => {
      const [savedUrl, savedEmail, savedPassword, bioFlag] = await Promise.all([
        storage.get(StorageKeys.instanceUrlBackup),
        storage.get(StorageKeys.emailBackup),
        storage.get(StorageKeys.passwordBackup),
        storage.get(StorageKeys.biometricEnabled),
      ]);
      if (savedUrl) {
        setInstanceUrl(bareAddress(savedUrl));
        setVerifiedUrl(savedUrl);
      }
      setStep(savedUrl ? 'credentials' : 'server');
      if (savedEmail) setEmail(savedEmail);
      setBioAvailable(!!savedPassword && bioFlag === '1' && Biometric.isModuleAvailable());
    })();
  }, []);

  const onSaveServer = async () => {
    setErrorMsg(null);
    if (!instanceUrl.trim()) {
      setErrorMsg('Enter the server address.');
      return;
    }
    setSavingServer(true);
    try {
      const baseUrl = await verifyServer(instanceUrl);
      await storage.set(StorageKeys.instanceUrlBackup, baseUrl);
      setInstanceUrl(bareAddress(baseUrl));
      setVerifiedUrl(baseUrl);
      setStep('credentials');
    } catch (err) {
      setErrorMsg(userMessage(err, 'Could not reach this server.'));
    } finally {
      setSavingServer(false);
    }
  };

  const onChangeServer = () => {
    setErrorMsg(null);
    setPassword('');
    setStep('server');
  };

  const onSignIn = async () => {
    setErrorMsg(null);
    if (!instanceUrl.trim() || !email.trim() || !password.trim()) {
      setErrorMsg('Fill all fields.');
      return;
    }
    const ok = await login(email.trim(), password, verifiedUrl ?? instanceUrl.trim());
    if (!ok) {
      const err = useAuthStore.getState().error || 'Sign-in failed.';
      setErrorMsg(err);
      showError(err);
    }
  };

  const onBiometric = async () => {
    setErrorMsg(null);
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
      <KeyboardScrollView
        contentContainerStyle={s.scroll}
        onLayout={(e) => setViewHeight(e.nativeEvent.layout.height)}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ marginTop: centreOffset }} onLayout={(e) => setFormHeight(e.nativeEvent.layout.height)}>
          <View style={s.hero}>
            {/* Hidden server switch: hold the logo for 3 seconds. */}
            <Pressable
              onLongPress={step === 'credentials' ? onChangeServer : undefined}
              delayLongPress={3000}
              accessibilityLabel="Upande"
            >
              <Image source={require('@/assets/images/upande_logo.png')} style={s.logo} resizeMode="contain" />
            </Pressable>
            <Text style={s.appName}>{appTitle(processes)}</Text>
            {step === 'credentials' ? <Text style={s.tagline}>Sign in to continue</Text> : null}
          </View>

          {step === 'server' ? (
            <View style={s.card}>
              <Text style={s.label}>Server</Text>
              <View style={s.input}>
                <Ionicons name="server-outline" size={18} color={colors.textMuted} style={s.icon} />
                <TextInput
                  value={instanceUrl}
                  onChangeText={setInstanceUrl}
                  onBlur={() => setInstanceUrl((u) => bareAddress(u))}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                  keyboardType="url"
                  returnKeyType="done"
                  onSubmitEditing={onSaveServer}
                  style={s.inputText}
                />
              </View>

              {errorMsg ? (
                <View style={s.errorBox}>
                  <Ionicons name="alert-circle" size={16} color={colors.error} />
                  <Text style={s.errorText}>{errorMsg}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                onPress={onSaveServer}
                disabled={savingServer}
                activeOpacity={0.8}
                style={[s.primaryBtn, savingServer && { opacity: 0.6 }]}
              >
                {savingServer ? (
                  <ActivityIndicator size="small" color={colors.textOnPrimary} />
                ) : (
                  <Text style={s.primaryBtnText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}

          {step === 'credentials' ? (
            <View style={s.card}>
              <View style={s.serverRow}>
                <Ionicons name="server-outline" size={16} color={colors.textMuted} />
                <Text style={s.serverText} numberOfLines={1}>
                  {instanceUrl}
                </Text>
              </View>

              <Text style={s.label}>Email or username</Text>
              <View style={s.input}>
                <Ionicons name="mail-outline" size={18} color={colors.textMuted} style={s.icon} />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="username"
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
                <TouchableOpacity
                  onPress={() => setShowPassword((p) => !p)}
                  hitSlop={8}
                  style={{ paddingRight: spacing.md }}
                >
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
                style={[s.primaryBtn, status === 'loading' && { opacity: 0.6 }]}
              >
                {status === 'loading' ? (
                  <ActivityIndicator size="small" color={colors.textOnPrimary} />
                ) : (
                  <Text style={s.primaryBtnText}>Sign in</Text>
                )}
              </TouchableOpacity>

              {bioAvailable ? (
                <TouchableOpacity onPress={onBiometric} disabled={bioBusy} activeOpacity={0.8} style={s.bioFab}>
                  {bioBusy ? (
                    <ActivityIndicator color={colors.text} />
                  ) : (
                    <Ionicons name="finger-print" size={22} color={colors.text} />
                  )}
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </View>
      </KeyboardScrollView>
    </SafeAreaView>
  );
}

/** Strip the scheme and any trailing slash, so the address is shown as typed. */
function bareAddress(url: string): string {
  return url
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  // No justifyContent: 'center' here -- centering a flexGrow container fights
  // the keyboard scroll view's scroll-to-focused-input math and was leaving the
  // password field / Sign in button hidden behind the keyboard. The form is
  // centred with a measured top margin instead.
  scroll: {
    padding: spacing.lg,
    flexGrow: 1,
  },
  hero: { alignItems: 'center', marginBottom: spacing.xl },
  logo: { width: 76, height: 76, marginBottom: spacing.md },
  appName: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xl,
    color: colors.text,
  },
  tagline: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 4,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  serverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  serverText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  label: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.sm,
    color: colors.text,
    marginBottom: spacing.sm,
  },
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
  errorText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.error,
  },
  primaryBtn: {
    marginTop: spacing.lg,
    alignSelf: 'center',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 34,
    minWidth: 120,
  },
  primaryBtnText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.md,
    color: colors.textOnPrimary,
  },
  bioFab: {
    alignSelf: 'center',
    marginTop: spacing.lg,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.md,
  },
});
