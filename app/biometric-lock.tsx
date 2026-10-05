import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontFamily, fontSize, shadow, spacing } from '@/src/theme';
import { useAuthStore } from '@/src/stores/authStore';

export default function BiometricLockScreen() {
  const biometricLogin = useAuthStore((s) => s.biometricLogin);
  const forgetDevice = useAuthStore((s) => s.forgetDevice);
  const email = useAuthStore((s) => s.email);
  const fullName = useAuthStore((s) => s.fullName);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const promptedOnce = useRef(false);

  const tryUnlock = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    // Prompts biometric, then re-authenticates with the stored password (fresh
    // session cookie). On success the auth gate routes away from this screen.
    const res = await biometricLogin();
    setBusy(false);
    if (res.ok) return;
    if (res.reason === 'cancelled') return;
    if (res.reason === 'unavailable') {
      setError('Biometric unavailable on this build. Sign in with your password.');
      return;
    }
    if (res.reason === 'no_credentials') {
      setError('No saved credentials — sign in with your password once.');
      return;
    }
    setError("Couldn't verify. Try again or use your password.");
  }, [busy, biometricLogin]);

  useEffect(() => {
    if (promptedOnce.current) return;
    promptedOnce.current = true;
    tryUnlock();
  }, [tryUnlock]);

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.content}>
        <Image
              source={require('@/assets/images/upande_logo.png')}
              style={s.logo}
              resizeMode="contain"
              accessibilityLabel="Upande"
            />
        <Text style={s.title}>{fullName ?? email ?? 'Welcome back'}</Text>
        <Text style={s.sub}>Sign in with biometrics to continue.</Text>

        <TouchableOpacity onPress={tryUnlock} disabled={busy} activeOpacity={0.8} style={s.fab}>
          {busy ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Ionicons name="finger-print" size={36} color={colors.text} />
          )}
        </TouchableOpacity>

        {error ? (
          <View style={s.errorBox}>
            <Ionicons name="alert-circle" size={16} color={colors.error} />
            <Text style={s.errorText}>{error}</Text>
          </View>
        ) : null}

        <TouchableOpacity onPress={forgetDevice} hitSlop={8} style={s.linkBtn}>
          <Text style={s.linkText}>Use password instead</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.lg },
  logo: { width: 88, height: 88, marginBottom: spacing.md },
  title: { fontFamily: fontFamily.bold, fontSize: fontSize.xl, color: colors.text, textAlign: 'center' },
  sub: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center' },
  fab: {
    marginTop: spacing.lg,
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.md,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(239, 68, 68, 0.06)',
    padding: spacing.md,
    borderRadius: 10,
    maxWidth: 320,
  },
  errorText: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.error },
  linkBtn: { marginTop: spacing.md, padding: spacing.sm },
  linkText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.primary },
});
