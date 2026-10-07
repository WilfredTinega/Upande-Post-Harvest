import { create } from 'zustand';

/** Days from today the Delivery page is filtered to (any number; 0 = today). */
export type DeliveryOffset = number;

/** "YYYY-MM-DD" for today plus `offset` days, on the phone's calendar. */
export function deliveryDate(offset: DeliveryOffset): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

interface DeliveryDateState {
  offset: DeliveryOffset;
  /** Move the date a day back (-1) or forward (+1). */
  step: (days: number) => void;
}

/** The Delivery page's date, shared by its figures, delivery points and boxes. */
export const useDeliveryDate = create<DeliveryDateState>((set, get) => ({
  offset: 0,
  step: (days) => set({ offset: get().offset + days }),
}));
