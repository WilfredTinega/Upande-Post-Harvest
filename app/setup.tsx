import { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/src/components/Screen';
import { Card } from '@/src/components/Card';
import { Button } from '@/src/components/Button';
import { ScannerConfig } from '@/src/components/ScannerConfig';
import { setupComplete, useScanStore } from '@/src/stores/scanStore';
import { spacing } from '@/src/theme';

/** After sign-in, until the farm and the greenhouse/block are chosen. */
export default function SetupScreen() {
  const router = useRouter();
  const load = useScanStore((s) => s.load);
  const loading = useScanStore((s) => s.loading);
  const ready = useScanStore(setupComplete);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Screen title="Configure Station">
      <Card>
        <ScannerConfig />
      </Card>
      <View style={{ height: spacing.md }} />
      <Button
        label="Continue"
        iconLeft="arrow-forward"
        onPress={() => router.replace('/')}
        disabled={!ready || loading}
        loading={loading}
      />
    </Screen>
  );
}
