import { create } from 'zustand';
import { storage, StorageKeys } from '@/src/services/storage';
import { scanApi, type WalkInSaleLine } from '@/src/services/scan-api';
import { userMessage } from '@/src/services/user-message';
import { loadWalkInData, markWalkInSold } from '@/src/stores/walkInSaleStore';

/**
 * Walk-in sales submitted on the phone and still going to the server. A sale leaves the
 * page at once (its bunches off the phone's stock) and is sent in the background, again and
 * again until the server has it: the same sale sent twice is matched by its `submission`,
 * never sold twice. One the server refuses (a bunch sold elsewhere meanwhile) waits here for
 * the cashier: try again, put it back on the page, or drop it.
 */
export interface OutboxSale {
  submission: string;
  lines: WalkInSaleLine[];
  total: number;
  stems: number;
  created: string;
  state: 'sending' | 'waiting' | 'failed';
  attempts: number;
  /** Not before (ms since epoch). */
  next: number;
  error?: string;
  /** The bunch the server refused. */
  bunch?: string;
}

export interface OutboxResult {
  ok: boolean;
  sale: OutboxSale;
  invoice?: string;
  number?: number;
  customer?: string;
  total?: number;
  error?: string;
}

interface OutboxState {
  sales: OutboxSale[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  add: (sale: { submission: string; lines: WalkInSaleLine[] }) => void;
  retry: (submission: string) => void;
  drop: (submission: string) => void;
}

const listeners = new Set<(r: OutboxResult) => void>();
/** Told of each sale the server took or refused. */
export function onOutboxResult(fn: (r: OutboxResult) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const save = (sales: OutboxSale[]) => {
  storage.set(StorageKeys.walkInOutbox, JSON.stringify(sales)).catch(() => undefined);
};

/** Waits before trying again: 5 s, 15 s, 30 s, then every minute. */
const backoff = (attempts: number) => [5, 15, 30][attempts - 1] ?? 60;

let running = false;
let hydrating = false;
let timer: ReturnType<typeof setTimeout> | null = null;

export const useWalkInOutbox = create<OutboxState>((set, get) => {
  const patch = (submission: string, change: Partial<OutboxSale>) => {
    const sales = get().sales.map((s) => (s.submission === submission ? { ...s, ...change } : s));
    set({ sales });
    save(sales);
  };
  const remove = (submission: string) => {
    const sales = get().sales.filter((s) => s.submission !== submission);
    set({ sales });
    save(sales);
  };

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const due = get().sales.filter((s) => s.state !== 'failed');
    if (!due.length) return;
    const wait = Math.max(0, Math.min(...due.map((s) => s.next)) - Date.now());
    timer = setTimeout(pump, wait);
  };

  // One sale at a time, oldest first, so two never race on the server.
  const pump = async () => {
    if (running) return;
    running = true;
    try {
      for (;;) {
        const sale = get().sales.find((s) => s.state !== 'failed' && s.next <= Date.now());
        if (!sale) break;
        patch(sale.submission, { state: 'sending' });
        try {
          const r = await scanApi.walkInSaleSubmit(sale.lines, sale.submission);
          if (r.success) {
            remove(sale.submission);
            listeners.forEach((fn) =>
              fn({ ok: true, sale, invoice: r.sales_invoice, number: r.number, customer: r.customer, total: r.total }),
            );
          } else {
            // Refused: it needs the cashier, and its bunches go back on the phone's stock.
            patch(sale.submission, { state: 'failed', error: r.error || 'Could not submit the invoice', bunch: r.bunch_id });
            loadWalkInData().catch(() => undefined);
            listeners.forEach((fn) => fn({ ok: false, sale, error: r.error || 'Could not submit the invoice' }));
          }
        } catch (err) {
          // Not through (no network, or the server too slow to answer): send it again later.
          const attempts = sale.attempts + 1;
          patch(sale.submission, {
            state: 'waiting',
            attempts,
            next: Date.now() + backoff(attempts) * 1000,
            error: userMessage(err, 'Did not reach the server'),
          });
        }
      }
    } finally {
      running = false;
      schedule();
    }
  };

  return {
    sales: [],
    hydrated: false,
    hydrate: async () => {
      if (get().hydrated || hydrating) return;
      hydrating = true;
      let saved: OutboxSale[] = [];
      try {
        const raw = await storage.get(StorageKeys.walkInOutbox);
        const v = raw ? JSON.parse(raw) : [];
        if (Array.isArray(v)) saved = v;
      } catch {
        // A broken entry: nothing waiting.
      }
      // A send cut short when the app closed is sent again now.
      const sales = [
        ...saved.map((s) => (s.state === 'sending' ? { ...s, state: 'waiting' as const, next: 0 } : s)),
        ...get().sales.filter((s) => !saved.some((o) => o.submission === s.submission)),
      ];
      set({ sales, hydrated: true });
      save(sales);
      pump();
    },
    add: ({ submission, lines }) => {
      const sale: OutboxSale = {
        submission,
        lines,
        total: lines.reduce((n, l) => n + l.amount, 0),
        stems: lines.reduce((n, l) => n + l.stems, 0),
        created: new Date().toISOString(),
        state: 'waiting',
        attempts: 0,
        next: 0,
      };
      markWalkInSold(lines.map((l) => l.bunch_id));
      const sales = [...get().sales, sale];
      set({ sales });
      save(sales);
      pump();
    },
    retry: (submission) => {
      patch(submission, { state: 'waiting', next: 0, error: undefined, bunch: undefined });
      pump();
    },
    drop: (submission) => {
      remove(submission);
      loadWalkInData().catch(() => undefined);
    },
  };
});
