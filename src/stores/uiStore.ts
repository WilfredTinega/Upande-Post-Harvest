import { create } from 'zustand';

/** Shared UI chrome state — kept tiny on purpose. Anything bigger should live
 *  in a feature store. */
interface UIState {
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  drawerOpen: false,
  openDrawer: () => set({ drawerOpen: true }),
  closeDrawer: () => set({ drawerOpen: false }),
  toggleDrawer: () => set({ drawerOpen: !get().drawerOpen }),
}));
