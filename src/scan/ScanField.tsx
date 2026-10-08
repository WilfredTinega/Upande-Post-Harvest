import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';
import { setCameraResultCallback } from '@/src/components/CameraScannerScreen';

export type ScanFieldHandle = {
  focus: () => void;
  clear: () => void;
};

type Props = {
  placeholder?: string;
  onScan: (code: string) => void;
  autoFocus?: boolean;
  editable?: boolean;
  /** Keep focus on the field so the Honeywell trigger always lands here. */
  stickyFocus?: boolean;
  /** Show the OS soft keyboard on focus. Off by default — hardware scanners
   *  type via HID and the keyboard popping up just gets in the way. */
  showSoftKeyboard?: boolean;
  /** Reports whether the field holds focus, i.e. a hardware scan will land. */
  onFocusChange?: (focused: boolean) => void;
  /** No text field: one wide button that opens the camera, labelled with this. */
  cameraOnly?: string;
};

const DEBOUNCE_MS = 300;
const REFOCUS_DELAY_MS = 100;

/**
 * Scan input for Honeywell keyboard-wedge scanners, with a camera fallback.
 *
 * A scan completes on Enter (the usual scanner suffix) or, for scanners
 * configured without a suffix, as soon as the buffer is a complete JSON
 * object (bunch / bucket / truck labels are JSON).
 */
export const ScanField = forwardRef<ScanFieldHandle, Props>(function ScanField(
  {
    placeholder = 'Scan or type code',
    onScan,
    autoFocus,
    editable = true,
    stickyFocus = false,
    showSoftKeyboard = false,
    onFocusChange,
    cameraOnly,
  },
  ref,
) {
  const inputRef = useRef<TextInput>(null);
  const [text, setText] = useState('');
  // Green border while a hardware scan will land here; amber when it won't.
  const [hasFocus, setHasFocus] = useState(false);
  const lastScanAt = useRef(0);
  // True while we apply a programmatic clear, so the JSON-complete detector
  // doesn't see it as scanner input.
  const programmaticRef = useRef(false);
  // Set while the camera screen is open so sticky focus doesn't fight it.
  const navigatingAwayRef = useRef(false);

  const clearProgrammatic = () => {
    programmaticRef.current = true;
    setText('');
    setTimeout(() => {
      programmaticRef.current = false;
    }, 0);
  };

  useImperativeHandle(ref, () => ({
    // Also re-arms sticky focus after the camera was closed without a scan.
    focus: () => {
      navigatingAwayRef.current = false;
      inputRef.current?.focus();
    },
    clear: () => clearProgrammatic(),
  }));

  const fire = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    const now = Date.now();
    if (now - lastScanAt.current < DEBOUNCE_MS) return;
    lastScanAt.current = now;
    clearProgrammatic();
    onScan(trimmed);
    inputRef.current?.focus();
  };

  const handleChange = (next: string) => {
    setText(next);
    if (programmaticRef.current) return;
    const trimmed = next.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        JSON.parse(trimmed);
        fire(trimmed);
      } catch {
        // partial buffer — keep accumulating
      }
    }
  };

  const handleBlur = () => {
    setHasFocus(false);
    onFocusChange?.(false);
    if (!stickyFocus || !editable || navigatingAwayRef.current) return;
    // A short delay lets a deliberate focus elsewhere (a button, a picker) win.
    setTimeout(() => {
      if (!stickyFocus || !editable || navigatingAwayRef.current) return;
      inputRef.current?.focus();
    }, REFOCUS_DELAY_MS);
  };

  const openCamera = () => {
    navigatingAwayRef.current = true;
    setCameraResultCallback((code) => {
      navigatingAwayRef.current = false;
      fire(code);
    });
    router.push('/camera-scanner');
  };

  if (cameraOnly) {
    return (
      <Pressable
        onPress={openCamera}
        disabled={!editable}
        style={({ pressed }) => [s.cameraWide, pressed && s.pressed, !editable && s.disabled]}
        accessibilityRole="button"
        accessibilityLabel={cameraOnly}
      >
        <Ionicons name="camera-outline" size={24} color={colors.textOnPrimary} />
        <Text style={s.cameraWideText}>{cameraOnly}</Text>
      </Pressable>
    );
  }

  return (
    <View style={s.wrap}>
      <TextInput
        ref={inputRef}
        value={text}
        onChangeText={handleChange}
        onSubmitEditing={(e) => fire(e.nativeEvent.text)}
        onBlur={handleBlur}
        onFocus={() => {
          setHasFocus(true);
          onFocusChange?.(true);
        }}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        autoFocus={autoFocus}
        editable={editable}
        showSoftInputOnFocus={showSoftKeyboard}
        autoCapitalize="none"
        autoCorrect={false}
        submitBehavior="submit"
        returnKeyType="done"
        style={[s.input, hasFocus ? s.inputReady : s.inputIdle]}
      />
      <Pressable
        onPress={openCamera}
        style={[s.cameraBtn, !editable && s.disabled]}
        disabled={!editable}
        accessibilityLabel="Scan with camera"
      >
        <Ionicons name="camera-outline" size={22} color={colors.textOnPrimary} />
      </Pressable>
    </View>
  );
});

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.sm },
  input: {
    flex: 1,
    minHeight: 52,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    fontFamily: fontFamily.medium,
    fontSize: fontSize.md,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  inputReady: { borderColor: colors.success, borderWidth: 2, backgroundColor: '#F0FDF4' },
  inputIdle: { borderColor: colors.warning, borderWidth: 2 },
  cameraBtn: {
    width: 52,
    minHeight: 52,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraWide: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 56,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
  },
  cameraWideText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.textOnPrimary },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.4 },
});
