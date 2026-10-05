import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '@/src/components/Screen';
import { ProcessLanding } from '@/src/components/ProcessLanding';
import { useToast } from '@/src/components/Toast';
import { useScanStore } from '@/src/stores/scanStore';
import { useUIStore } from '@/src/stores/uiStore';
import { type ActionDef } from '@/src/scan/actions';
import { PROCESSES, isProcessKey } from '@/src/scan/processes';
import { useOverview } from '@/src/scan/useOverview';

/** One process's landing: the same figures and action tiles as on home. */
export default function ProcessScreen() {
  const router = useRouter();
  const { showError } = useToast();
  const { key } = useLocalSearchParams<{ key: string }>();
  const farm = useScanStore((s) => s.farm);
  const openDrawer = useUIStore((s) => s.openDrawer);
  const { overview, loading, error: overviewError, reload } = useOverview(farm);
  const process = PROCESSES.find((p) => p.key === key);

  useEffect(() => {
    if (!isProcessKey(key)) router.back();
  }, [key, router]);

  if (!process) return null;

  const open = (action: ActionDef) => {
    if (action.needsFarm && !farm) {
      showError('Choose the farm first.');
      router.push('/settings');
      return;
    }
    router.push({ pathname: '/scan/[action]', params: { action: action.key } });
  };

  return (
    <Screen
      title={process.label}
      leftIcon="arrow-back"
      onPressLeft={() => router.back()}
      rightIcon="menu"
      onPressRight={openDrawer}
      refreshing={loading}
      onRefresh={reload}
    >
      <ProcessLanding
        process={process.key}
        farm={farm}
        overview={overview}
        loading={loading}
        error={overviewError}
        onRetry={reload}
        showLabel={false}
        onOpen={open}
      />
    </Screen>
  );
}
