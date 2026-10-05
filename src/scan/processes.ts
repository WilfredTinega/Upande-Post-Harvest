import type { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

/**
 * The three post-harvest processes. Each scanner is dedicated to one or more
 * of them; home and the sidebar only show the enabled processes' actions.
 */
export type ProcessKey = 'production' | 'packhouse' | 'dispatch' | 'shop' | 'quality';

export interface ProcessDef {
  key: ProcessKey;
  label: string;
  description: string;
  icon: ComponentProps<typeof Ionicons>['name'];
}

export const PROCESSES: ProcessDef[] = [
  {
    key: 'production',
    label: 'Production',
    description: 'Harvesting → receiving cold store',
    icon: 'leaf-outline',
  },
  {
    key: 'packhouse',
    label: 'Packhouse',
    description: 'Receiving out → grading → packing',
    icon: 'ribbon-outline',
  },
  {
    key: 'dispatch',
    label: 'Dispatch',
    description: 'Staging → loading → dispatch',
    icon: 'bus-outline',
  },
  {
    key: 'shop',
    label: 'Shop',
    description: 'Day 4 flowers → local sale, vase, shop discards',
    icon: 'storefront-outline',
  },
  {
    key: 'quality',
    label: 'Quality',
    description: 'Grading checks, graded rejects and packing rejects',
    icon: 'shield-checkmark-outline',
  },
];

export const PROCESS_KEYS = PROCESSES.map((p) => p.key);

export function isProcessKey(v: unknown): v is ProcessKey {
  return typeof v === 'string' && (PROCESS_KEYS as string[]).includes(v);
}

export function processLabel(keys: ProcessKey[]): string {
  if (!keys.length) return 'No process chosen';
  return PROCESSES.filter((p) => keys.includes(p.key))
    .map((p) => p.label)
    .join(' · ');
}

/** The app's title: the process this scanner is dedicated to, else "Post Harvest". */
export function appTitle(keys: ProcessKey[]): string {
  return keys.length === 1 ? (PROCESSES.find((p) => p.key === keys[0])?.label ?? 'Post Harvest') : 'Post Harvest';
}
