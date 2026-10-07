import type { RefObject } from 'react';
import type { ScanFieldHandle } from './ScanField';

/**
 * Focus a ScanField once the screen transition is complete.
 *
 * Calling `focus()` immediately after mount on Android often gets dropped
 * because the navigation animation hasn't settled and the TextInput's native
 * node hasn't attached yet. Waiting until the JS thread is idle plus a single
 * animation frame resolves both timing issues without arbitrary sleeps.
 * (requestIdleCallback replaces the deprecated InteractionManager.)
 *
 * Use this in every Honeywell-driven screen so operators never have to tap.
 * Returns a cancel function, so it can be used directly as a useFocusEffect
 * callback.
 */
export function focusWhenReady(ref: RefObject<ScanFieldHandle | null>): () => void {
  let frame: number | undefined;
  const idle = requestIdleCallback(() => {
    frame = requestAnimationFrame(() => ref.current?.focus());
  });
  return () => {
    cancelIdleCallback(idle);
    if (frame !== undefined) cancelAnimationFrame(frame);
  };
}
