import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { Screen } from '@/src/components/Screen';
import { ProcessLanding } from '@/src/components/ProcessLanding';
import { useToast } from '@/src/components/Toast';
import { useScanStore } from '@/src/stores/scanStore';
import { useUIStore } from '@/src/stores/uiStore';
import { type ActionDef } from '@/src/scan/actions';
import { type ProcessDef } from '@/src/scan/processes';
import { useOverview } from '@/src/scan/useOverview';

interface Props {
  process: ProcessDef;
  /** The page the app opens on: menu and settings instead of Back. */
  root?: boolean;
  /** Shown above the figures (setup notices on the opening page). */
  top?: ReactNode;
  /** Pulled to refresh, besides the figures. */
  onRefresh?: () => void;
}

/** One process's page: its figures and action tiles. */
export function ProcessPage({ process, root, top, onRefresh }: Props) {
  const router = useRouter();
  const { showError } = useToast();
  const farm = useScanStore((s) => s.farm);
  const openDrawer = useUIStore((s) => s.openDrawer);
  const { overview, loading, error, reload } = useOverview(farm);

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
      leftIcon={root ? 'menu' : 'arrow-back'}
      onPressLeft={root ? openDrawer : () => router.back()}
      rightIcon={root ? 'settings-outline' : 'menu'}
      onPressRight={root ? () => router.push('/settings') : openDrawer}
      refreshing={loading}
      onRefresh={() => {
        onRefresh?.();
        reload();
      }}
    >
      {top}
      <ProcessLanding
        process={process.key}
        farm={farm}
        overview={overview}
        loading={loading}
        error={error}
        onRetry={reload}
        showLabel={false}
        onOpen={open}
      />
    </Screen>
  );
}
