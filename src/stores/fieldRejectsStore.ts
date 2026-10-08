import { create } from 'zustand';
import { storage, StorageKeys } from '@/src/services/storage';
import type { FieldRejectLine } from '@/src/services/scan-api';

type Lists = Record<string, FieldRejectLine[]>;

interface FieldRejectsState {
  /** Each farm's list, kept on the phone until it is submitted. */
  lists: Lists;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  add: (farm: string, line: FieldRejectLine) => void;
  set: (farm: string, lines: FieldRejectLine[]) => void;
}

const save = (lists: Lists) => {
  storage.set(StorageKeys.fieldRejects, JSON.stringify(lists)).catch(() => {
    // Still in memory; the next change saves it again.
  });
};

/** The Field Rejects list survives leaving the screen and restarting the app. */
export const useFieldRejectsStore = create<FieldRejectsState>((set, get) => ({
  lists: {},
  hydrated: false,
  hydrate: async () => {
    if (get().hydrated) return;
    let saved: Lists = {};
    try {
      const raw = await storage.get(StorageKeys.fieldRejects);
      const v = raw ? JSON.parse(raw) : {};
      if (v && typeof v === 'object' && !Array.isArray(v)) saved = v;
    } catch {
      // A broken entry starts an empty list.
    }
    // Lines added before the saved lists were read stay after them.
    const lists = { ...saved };
    for (const [farm, lines] of Object.entries(get().lists)) lists[farm] = [...(saved[farm] ?? []), ...lines];
    set({ lists, hydrated: true });
  },
  add: (farm, line) => {
    const lists = { ...get().lists, [farm]: [...(get().lists[farm] ?? []), line] };
    set({ lists });
    save(lists);
  },
  set: (farm, lines) => {
    const lists = { ...get().lists };
    if (lines.length) lists[farm] = lines;
    else delete lists[farm];
    set({ lists });
    save(lists);
  },
}));
