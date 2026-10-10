import { create } from 'zustand';
import { storage, StorageKeys } from '@/src/services/storage';
import { scanApi } from '@/src/services/scan-api';
import { getInstallId } from '@/src/services/install-register';
import { LOGOUT_MARK_PENDING, useAuthStore } from '@/src/stores/authStore';
import { isProcessKey, type ProcessKey } from '@/src/scan/processes';
import { userMessage } from '@/src/services/user-message';

/** Offered when the server has no farms set up (no Warehouse Mapping) or can't be reached. */
export const DEFAULT_FARMS = ['Burguret', 'Turaco', 'Pendekeza'];

/** Where the farm list came from. */
export type FarmsSource = 'server' | 'cache' | 'default';

interface ScanState {
  /** Scanner config read from storage (farm, last known processes, cached farms). */
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
  /** The processes the signed-in user may use, set in ERPNext (Post Harvest Settings: Users). */
  processes: ProcessKey[];
  /**
   * Harvesting asks for the stem length of each bucket (Post Harvest Settings). Works
   * whether or not the varieties are stem-length variants yet: a template is harvested
   * as its variant for that length, a plain item with the length on the Stock Entry.
   */
  harvestByStemLength: boolean;

  hydrate: () => Promise<void>;
  load: () => Promise<void>;
  setFarm: (farm: string) => Promise<void>;
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
  // Until the server says otherwise (Post Harvest Settings).
  harvestByStemLength: true,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const [farm, processes, cached, byStemLength] = await Promise.all([
        storage.get(StorageKeys.farm),
        storage.get(StorageKeys.processes),
        storage.get(StorageKeys.farmsCache),
        storage.get(StorageKeys.harvestByStemLength),
      ]);
      const cachedFarms = parseList(cached);
      set({
        farm: get().farm || farm || '',
        processes: get().processes.length ? get().processes : parseList(processes).filter(isProcessKey),
        harvestByStemLength: byStemLength !== '0',
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
      const setup = await scanApi.setup(await getInstallId());
      // Logged out from Post Harvest Settings (this device, or all of them): back to the
      // login page. The server, email and saved password stay; the new mark is taken as
      // seen first, so signing in again isn't logged straight back out.
      if (setup.logout_mark !== undefined) {
        const seen = await storage.get(StorageKeys.logoutMark);
        if (seen === null || seen === LOGOUT_MARK_PENDING) {
          await storage.set(StorageKeys.logoutMark, setup.logout_mark);
        } else if (seen !== setup.logout_mark) {
          await storage.set(StorageKeys.logoutMark, setup.logout_mark);
          await useAuthStore.getState().logout();
          return;
        }
      }
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
      // A server without the access settings yet leaves the last known ones in place.
      if (setup.processes) {
        const allowed = setup.processes.filter(isProcessKey);
        // Nothing ticked for the user in ERPNext: Production.
        const processes: ProcessKey[] = allowed.length ? allowed : ['production'];
        set({ processes });
        storage.set(StorageKeys.processes, JSON.stringify(processes)).catch(() => {});
      }
      if (setup.harvest_by_stem_length !== undefined) {
        set({ harvestByStemLength: !!setup.harvest_by_stem_length });
        storage.set(StorageKeys.harvestByStemLength, setup.harvest_by_stem_length ? '1' : '0').catch(() => {});
      }
    } catch (err) {
      set({
        error: userMessage(err, 'Could not load scan setup.'),
        farmsNotice: `Could not load the farm list. Showing the ${
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
}));
