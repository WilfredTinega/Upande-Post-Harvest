import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/src/components/Button';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

/** A dialog button, as for React Native's Alert.alert. */
export interface DialogButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

interface DialogState {
  title: string;
  message?: string;
  buttons: DialogButton[];
  /** False: only a button closes it (no tap outside, no Back). */
  cancelable: boolean;
  onDismiss?: () => void;
}

/** As Alert.alert's options. */
export interface DialogOptions {
  cancelable?: boolean;
  onDismiss?: () => void;
}

let show: ((d: DialogState) => void) | null = null;

/**
 * The app's dialog, in place of Alert.alert so every question looks like the
 * rest of the app (same card as the scan error dialog). Same arguments as
 * Alert.alert; without buttons it shows a single OK.
 */
export function dialog(title: string, message?: string, buttons?: DialogButton[], options?: DialogOptions): void {
  const d = {
    title,
    message,
    buttons: buttons?.length ? buttons : [{ text: 'OK' }],
    cancelable: options?.cancelable ?? true,
    onDismiss: options?.onDismiss,
  };
  if (show) show(d);
}

/** Mounted once at the root; renders whatever `dialog()` asks for. */
export function AppDialogHost() {
  const [d, setD] = useState<DialogState | null>(null);

  useEffect(() => {
    show = setD;
    return () => {
      show = null;
    };
  }, []);

  const cancel = d?.buttons.find((b) => b.style === 'cancel');
  const close = (b?: DialogButton) => {
    setD(null);
    b?.onPress?.();
  };
  // Back or a tap outside: like the cancel button, unless the dialog must be answered.
  const dismiss = () => {
    if (!d?.cancelable) return;
    const onDismiss = d.onDismiss;
    close(cancel);
    onDismiss?.();
  };
  const destructive = d?.buttons.some((b) => b.style === 'destructive');

  return (
    <Modal visible={!!d} transparent animationType="fade" onRequestClose={dismiss} statusBarTranslucent>
      <View style={s.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityLabel="Close" />
        <View style={s.card} accessibilityRole="alert">
          <View style={[s.iconWrap, { backgroundColor: destructive ? '#FEF2F2' : colors.surfaceAlt }]}>
            <Ionicons
              name={destructive ? 'warning' : 'help-circle'}
              size={36}
              color={destructive ? colors.error : colors.primary}
            />
          </View>
          <Text style={s.title}>{d?.title}</Text>
          {d?.message ? <Text style={s.message}>{d.message}</Text> : null}
          <View style={s.buttons}>
            {/* The answer first, then the way out, as in the scan error dialog. */}
            {[...(d?.buttons ?? [])]
              .sort((a, b) => (a.style === 'cancel' ? 1 : 0) - (b.style === 'cancel' ? 1 : 0))
              .map((b) => (
                <Button
                  key={b.text}
                  label={b.text}
                  variant={b.style === 'cancel' ? 'outline' : 'primary'}
                  color={b.style === 'destructive' ? colors.error : undefined}
                  onPress={() => close(b)}
                  style={s.button}
                />
              ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  title: { fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: colors.text, textAlign: 'center' },
  message: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  buttons: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.md },
  button: { alignSelf: 'stretch' },
});
