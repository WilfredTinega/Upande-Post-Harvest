import type { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

/**
 * The post-harvest processes. Each user is given one or more of them in ERPNext
 * (Post Harvest Settings: Users); home and the sidebar only show those processes' actions.
 */
export type ProcessKey = 'production' | 'packhouse' | 'dispatch' | 'delivery' | 'shop' | 'quality';

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
    description: 'Harvesting and field rejects',
    icon: 'leaf-outline',
  },
  {
    key: 'packhouse',
    label: 'Packhouse',
    description: 'Receiving → grading → packing → shop',
    icon: 'ribbon-outline',
  },
  {
    key: 'dispatch',
    label: 'Dispatch',
    description: 'Load trucks and send them',
    icon: 'bus-outline',
  },
  {
    key: 'delivery',
    label: 'Delivery',
    description: 'Boxes per delivery point and customer',
    icon: 'navigate-outline',
  },
  {
    key: 'shop',
    label: 'Shop',
    description: 'Walk-in shop, vase, shop discards',
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
  if (!keys.length) return 'No processes';
  return PROCESSES.filter((p) => keys.includes(p.key))
    .map((p) => p.label)
    .join(' · ');
}

/** The app's title: the process this scanner is dedicated to, else "Upande Post Harvest". */
export function appTitle(keys: ProcessKey[]): string {
  return keys.length === 1 ? (PROCESSES.find((p) => p.key === keys[0])?.label ?? 'Upande Post Harvest') : 'Upande Post Harvest';
}
