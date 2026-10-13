import { create } from 'zustand';
import * as Crypto from 'expo-crypto';
import { storage, StorageKeys } from '@/src/services/storage';
import { scanApi, type WalkInSaleLine } from '@/src/services/scan-api';

type PriceRows = Record<string, { stem_length: string; price: number }[]>;
let groups: PriceRows = {};
let itemGroups: Record<string, string> = {};
/** Bunch id → [farm, shop store], for the bunches a walk-in sale can sell; null until loaded. */
let stock: Record<string, [string, string]> | null = null;
let loading: Promise<void> | null = null;

const keep = () => {
  storage.set(StorageKeys.walkInData, JSON.stringify({ groups, itemGroups, stock })).catch(() => undefined);
};

/**
 * Load what scans are checked against, so a scan needs no call to the server: the prices and
 * the bunches in the shop stores (their farm and store). The last load is used at once while a
 * fresh one comes in; submitting checks every bunch again on the server.
 */
export function loadWalkInData(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      if (stock === null) {
        try {
          const raw = await storage.get(StorageKeys.walkInData);
          const v = raw ? JSON.parse(raw) : null;
          if (v && typeof v === 'object') {
            groups = v.groups ?? {};
            itemGroups = v.itemGroups ?? {};
            stock = v.stock ?? null;
          }
        } catch {
          // Nothing kept: the fresh load fills it.
        }
      }
      const [prices, bunches] = await Promise.all([scanApi.walkInPrices(), scanApi.walkInStock()]);
      if (prices.success) {
        groups = prices.groups ?? {};
        itemGroups = prices.items ?? {};
      }
      if (bunches.success) stock = bunches.bunches ?? {};
      keep();
    })().finally(() => {
      loading = null;
    });
  }
  return loading;
}

/** [farm, shop store] of a bunch that can be sold; null when it is not in the shop; undefined before the first load. */
export function walkInBunch(bunchId: string): [string, string] | null | undefined {
  if (stock === null) return undefined;
  return stock[bunchId] ?? null;
}

/** Sold: off the local stock, so it can't be put on another sale. */
export function markWalkInSold(bunchIds: string[]): void {
  if (!stock) return;
  for (const id of bunchIds) delete stock[id];
  keep();
}

/** Per-stem price as the server works it out: this stem length, else the group's row without one, else its first. */
export function walkInPrice(variety: string, stemLength: string): number {
  const rows = groups[itemGroups[variety] ?? ''] ?? [];
  const row = rows.find((r) => r.stem_length === stemLength) ?? rows.find((r) => !r.stem_length) ?? rows[0];
  return row ? row.price : 0;
}

/** Stems in a bunch size: "Bunch (12)" → 12; "Nos" and "Bunch" are one. */
export function bunchStems(size: string): number {
  const m = /\((\d+)\)/.exec(size);
  return m ? Number(m[1]) : 1;
}

interface WalkInSaleState {
  lines: WalkInSaleLine[];
  /** Names this sale on the server, so a resend after a lost reply is not sold twice. */
  submission: string;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  add: (line: WalkInSaleLine) => void;
  remove: (bunchId: string) => void;
  /** The checked, priced line in place of its pending one (kept where it was on the list). */
  settle: (line: WalkInSaleLine) => void;
  clear: () => void;
  /** Price the lines scanned before the prices had loaded. */
  reprice: () => void;
  /** Put a sale back on the page after its submit failed. */
  restore: (lines: WalkInSaleLine[], submission: string) => void;
}

const save = (lines: WalkInSaleLine[], submission: string) => {
  storage.set(StorageKeys.walkInSale, JSON.stringify({ lines, submission })).catch(() => {
    // Still in memory; the next change saves it again.
  });
};

let hydrating = false;

/** The walk-in sale being rung up: kept on the phone until it is submitted. */
export const useWalkInSaleStore = create<WalkInSaleState>((set, get) => ({
  lines: [],
  submission: '',
  hydrated: false,
  hydrate: async () => {
    // Once: a second call while the first reads storage would put back what was cleared since.
    if (get().hydrated || hydrating) return;
    hydrating = true;
    let saved: { lines?: WalkInSaleLine[]; submission?: string } = {};
    try {
      const raw = await storage.get(StorageKeys.walkInSale);
      const v = raw ? JSON.parse(raw) : {};
      if (v && typeof v === 'object' && Array.isArray(v.lines)) saved = v;
    } catch {
      // A broken entry starts an empty sale.
    }
    // A line still being checked when the app closed is dropped: scan it again.
    const kept = (saved.lines ?? []).filter((l) => !l.pending);
    const ids = new Set(kept.map((l) => l.bunch_id));
    const lines = [...kept, ...get().lines.filter((l) => !ids.has(l.bunch_id))];
    set({ lines, submission: saved.submission || get().submission, hydrated: true });
  },
  add: (line) => {
    // A changed list is another sale; an unchanged one sent again is the same sale.
    const submission = Crypto.randomUUID();
    const lines = [...get().lines, line];
    set({ lines, submission });
    save(lines, submission);
  },
  remove: (bunchId) => {
    const lines = get().lines.filter((l) => l.bunch_id !== bunchId);
    const submission = lines.length ? Crypto.randomUUID() : '';
    set({ lines, submission });
    save(lines, submission);
  },
  settle: (line) => {
    if (!get().lines.some((l) => l.bunch_id === line.bunch_id)) return;
    const lines = get().lines.map((l) => (l.bunch_id === line.bunch_id ? line : l));
    const submission = Crypto.randomUUID();
    set({ lines, submission });
    save(lines, submission);
  },
  reprice: () => {
    if (!get().lines.some((l) => !l.amount)) return;
    const lines = get().lines.map((l) => {
      if (l.amount) return l;
      const rate = walkInPrice(l.variety, l.stem_length);
      return { ...l, rate, amount: rate * l.stems };
    });
    set({ lines });
    save(lines, get().submission);
  },
  restore: (lines, submission) => {
    // Anything scanned meanwhile stays, after the sale it belongs with.
    const ids = new Set(lines.map((l) => l.bunch_id));
    const merged = [...lines, ...get().lines.filter((l) => !ids.has(l.bunch_id))];
    set({ lines: merged, submission });
    save(merged, submission);
  },
  clear: () => {
    set({ lines: [], submission: '' });
    save([], '');
  },
}));
