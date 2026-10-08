import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, type DimensionValue, type View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from '@/src/theme';

/** Tallest a bottom sheet grows, as a share of the screen. */
const MAX_SHARE = 0.75;

/**
 * Sizing for a bottom sheet in a Modal: it fits its rows (up to 75% of the screen) and,
 * while the keyboard is up, sits on top of it and shrinks to the space left, so the title,
 * search box and first rows stay in view. The keyboard's overlap is measured, since the
 * modal's window may or may not resize itself.
 */
export function useSheetLayout(open: boolean) {
  const insets = useSafeAreaInsets();
  const overlayRef = useRef<View>(null);
  const keyboardTop = useRef<number | null>(null);
  const [overlayHeight, setOverlayHeight] = useState(0);
  const [overlap, setOverlap] = useState(0);

  const measure = useCallback(() => {
    overlayRef.current?.measureInWindow((_x, y, _w, h) => {
      setOverlayHeight(h);
      const top = keyboardTop.current;
      setOverlap(top === null ? 0 : Math.max(0, Math.round(y + h - top)));
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      keyboardTop.current = e.endCoordinates.screenY;
      measure();
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      keyboardTop.current = null;
      setOverlap(0);
    });
    return () => {
      show.remove();
      hide.remove();
      keyboardTop.current = null;
      setOverlap(0);
    };
  }, [open, measure]);

  const sheetStyle: { maxHeight: DimensionValue; marginBottom?: number; paddingBottom: number } = overlap
    ? {
        marginBottom: overlap,
        maxHeight: Math.min(overlayHeight * MAX_SHARE, overlayHeight - overlap - insets.top - spacing.md),
        paddingBottom: spacing.sm,
      }
    : { maxHeight: `${MAX_SHARE * 100}%`, paddingBottom: insets.bottom + spacing.lg };

  return { overlayRef, onOverlayLayout: measure, sheetStyle };
}
