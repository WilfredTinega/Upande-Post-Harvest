import { create } from 'zustand';
import { storage, StorageKeys } from '@/src/services/storage';
import { scanApi } from '@/src/services/scan-api';
import { isProcessKey, type ProcessKey } from '@/src/scan/processes';

/** Offered when the server has no farms set up (no Warehouse Mapping) or can't be reached. */
export const DEFAULT_FARMS = ['Burguret', 'Turaco', 'Pendekeza'];

/** Where the farm list came from. */
export type FarmsSource = 'server' | 'cache' | 'default';

interface ScanState {
  /** Scanner config read from storage (farm, processes, cached farms). */
  hydrated: boolean;
  loaded: boolean;
  loading: boolean;
  error: string | null;
  farms: string[];
  farmsSource: FarmsSource;
  /** Why the farm list isn't the server's, shown next to the farm picker. */
  farmsNotice: string | null;
  rejectionReasons: string[];
  /** The signed-in site's logo path, if it has one. */
  logo: string | null;
  /** The signed-in account may open the device register (System Manager). */
  canViewDevices: boolean;
  /** This scanner's station farm, persisted across launches. */
  farm: string;
  /** Processes this scanner is used for, persisted across launches. */
  processes: ProcessKey[];

  hydrate: () => Promise<void>;
  load: () => Promise<void>;
  setFarm: (farm: string) => Promise<void>;
  setProcesses: (processes: ProcessKey[]) => Promise<void>;
}

function parseList(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export const useScanStore = create<ScanState>((set, get) => ({
  hydrated: false,
  loaded: false,
  loading: false,
  error: null,
  farms: DEFAULT_FARMS,
  farmsSource: 'default',
  farmsNotice: null,
  rejectionReasons: [],
  logo: null,
  canViewDevices: false,
  farm: '',
  processes: [],

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const [farm, processes, cached] = await Promise.all([
        storage.get(StorageKeys.farm),
        storage.get(StorageKeys.processes),
        storage.get(StorageKeys.farmsCache),
      ]);
      const cachedFarms = parseList(cached);
      set({
        farm: get().farm || farm || '',
        processes: get().processes.length ? get().processes : parseList(processes).filter(isProcessKey),
        ...(cachedFarms.length && get().farmsSource !== 'server'
          ? { farms: cachedFarms, farmsSource: 'cache' as const }
          : {}),
      });
    } finally {
      set({ hydrated: true });
    }
  },

  load: async () => {
    if (get().loading) return;
    set({ loading: true, error: null });
    await get().hydrate();
    try {
      const setup = await scanApi.setup();
      const farms = (setup.farms ?? []).filter(Boolean);
      if (farms.length) {
        set({ farms, farmsSource: 'server', farmsNotice: null });
        storage.set(StorageKeys.farmsCache, JSON.stringify(farms)).catch(() => {});
      } else {
        set({
          farms: DEFAULT_FARMS,
          farmsSource: 'default',
          farmsNotice:
            'No farms are set up on the server. Add a Warehouse Mapping for each farm in ERPNext. ' +
            'Showing the default farms for now.',
        });
      }
      set({ loaded: true, rejectionReasons: setup.rejection_reasons ?? [], logo: setup.logo || null, canViewDevices: !!setup.can_view_devices });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not load scan setup.';
      set({
        error: msg,
        farmsNotice: `Could not load the farm list (${msg}). Showing the ${
          get().farmsSource === 'cache' ? 'last known' : 'default'
        } farms.`,
      });
    } finally {
      set({ loading: false });
    }
  },

  setFarm: async (farm) => {
    set({ farm });
    await storage.set(StorageKeys.farm, farm);
  },

  setProcesses: async (processes) => {
    set({ processes });
    await storage.set(StorageKeys.processes, JSON.stringify(processes));
  },
}));
