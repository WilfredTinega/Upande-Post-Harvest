import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, ScrollView, StyleSheet, TextInput, View, type ScrollViewProps } from 'react-native';
import { spacing } from '@/src/theme';
import { KEYBOARD_PANS } from '@/src/services/app-version';

/** Room left between the focused field and the keyboard. */
const GAP = spacing.lg;

/**
 * A ScrollView that keeps the focused field above the keyboard without overshooting.
 *
 * What the keyboard covers is measured rather than assumed: when the window already made
 * room (it resized, or Android panned it), nothing is added, so the page never scrolls into
 * blank space. Otherwise the covered height is added below the content and the page scrolls
 * only as far as the focused field needs.
 */
export function KeyboardScrollView({ children, contentContainerStyle, onScroll, onLayout, ...rest }: ScrollViewProps) {
  const scrollRef = useRef<ScrollView>(null);
  const frameRef = useRef<View>(null);
  const keyboardTop = useRef<number | null>(null);
  const scrollY = useRef(0);
  const [covered, setCovered] = useState(0);

  const reveal = useCallback((visibleBottom: number) => {
    const input = TextInput.State.currentlyFocusedInput();
    if (!input) return;
    input.measureInWindow((_x, y, _w, h) => {
      const below = y + h + GAP - visibleBottom;
      if (below > 0) scrollRef.current?.scrollTo({ y: scrollY.current + below, animated: true });
    });
  }, []);

  const measure = useCallback(() => {
    const top = keyboardTop.current;
    if (top === null) return setCovered(0);
    frameRef.current?.measureInWindow((_x, y, _w, h) => {
      const bottom = y + h;
      setCovered(Math.max(0, Math.round(bottom - top)));
      // After the padding is laid out, so there is room to scroll into.
      requestAnimationFrame(() => reveal(Math.min(bottom, top)));
    });
  }, [reveal]);

  useEffect(() => {
    if (KEYBOARD_PANS) return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      keyboardTop.current = e.endCoordinates.screenY;
      measure();
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      keyboardTop.current = null;
      setCovered(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [measure]);

  return (
    <View
      ref={frameRef}
      style={{ flex: 1 }}
      // The window may resize after the keyboard shows: measure again.
      onLayout={(e) => {
        onLayout?.(e);
        if (keyboardTop.current !== null) measure();
      }}
    >
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        {...rest}
        scrollEventThrottle={16}
        onScroll={(e) => {
          scrollY.current = e.nativeEvent.contentOffset.y;
          onScroll?.(e);
        }}
        contentContainerStyle={[contentContainerStyle, covered ? { paddingBottom: basePadding(contentContainerStyle) + covered } : null]}
      >
        {children}
      </ScrollView>
    </View>
  );
}

/** The content's own bottom padding, kept under the keyboard's. */
function basePadding(style: ScrollViewProps['contentContainerStyle']): number {
  const flat = StyleSheet.flatten(style) ?? {};
  const pad = flat.paddingBottom ?? flat.paddingVertical ?? flat.padding ?? 0;
  return typeof pad === 'number' ? pad : 0;
}
