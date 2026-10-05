import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, DMSans_400Regular, DMSans_500Medium } from '@expo-google-fonts/dm-sans';
import { Poppins_600SemiBold, Poppins_700Bold } from '@expo-google-fonts/poppins';
import * as SplashScreen from 'expo-splash-screen';
import { ToastProvider } from '@/src/components/Toast';
import { OfflineBanner } from '@/src/components/OfflineBanner';
import { DrawerMenu } from '@/src/components/DrawerMenu';
import { OtaToast } from '@/src/components/OtaToast';
import { UpdateController } from '@/src/components/UpdateController';
import { useAuthStore } from '@/src/stores/authStore';
import { useNetworkStore } from '@/src/stores/networkStore';
import { useScanStore } from '@/src/stores/scanStore';

// Hold the native splash until fonts + auth hydrated.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const hydrated = useAuthStore((s) => s.hydrated);
  const hasSession = useAuthStore((s) => s.hasSession);
  const biometricLocked = useAuthStore((s) => s.biometricLocked);
  const hydrate = useAuthStore((s) => s.hydrate);
  const initNetwork = useNetworkStore((s) => s.init);
  const hydrateScanner = useScanStore((s) => s.hydrate);

  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    hydrate();
    initNetwork();
    // Scanner config (station farm, processes) is needed before sign-in.
    hydrateScanner();
  }, [hydrate, initNetwork, hydrateScanner]);

  useEffect(() => {
    if (fontsLoaded && hydrated) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, hydrated]);

  // Auth gate — route between login / biometric-lock / app based on state.
  useEffect(() => {
    if (!hydrated) return;
    const first = segments[0] as string | undefined;
    const inAuthFlow = first === 'login' || first === 'biometric-lock';

    if (!hasSession) {
      if (first !== 'login') router.replace('/login');
      return;
    }
    if (biometricLocked) {
      if (first !== 'biometric-lock') router.replace('/biometric-lock');
      return;
    }
    if (inAuthFlow) router.replace('/');
  }, [hydrated, hasSession, biometricLocked, segments, router]);

  if (!fontsLoaded || !hydrated) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <ToastProvider>
        <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', gestureEnabled: true }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="process/[key]" />
          <Stack.Screen name="scan/[action]" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="devices" />
          <Stack.Screen name="login" />
          <Stack.Screen name="biometric-lock" options={{ animation: 'fade' }} />
          <Stack.Screen name="camera-scanner" options={{ presentation: 'fullScreenModal' }} />
        </Stack>
        <OfflineBanner />
        <UpdateController />
        <OtaToast />
        {/* Rendered at the root so its Modal sits above every screen. */}
        {hasSession && !biometricLocked ? <DrawerMenu /> : null}
      </ToastProvider>
    </SafeAreaProvider>
  );
}
