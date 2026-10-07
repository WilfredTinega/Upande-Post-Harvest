import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/src/components/Button';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

export type BlockerTone = 'warning' | 'error';

const TONE: Record<BlockerTone, { fg: string; bg: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = {
  warning: { fg: '#92400E', bg: '#FFFBEB', icon: 'warning' },
  error: { fg: '#991B1B', bg: '#FEF2F2', icon: 'close-circle' },
};

interface BlockerModalProps {
  /** null hides the modal. */
  blocker: { tone: BlockerTone; title: string; detail?: string; retry?: () => void } | null;
  onClose: () => void;
}

/**
 * A scan that did not go through: what happened, in a dialog the operator has
 * to dismiss (OK, Back, or a tap outside), so a failure is never missed.
 */
export function BlockerModal({ blocker, onClose }: BlockerModalProps) {
  const t = TONE[blocker?.tone ?? 'error'];
  return (
    <Modal visible={!!blocker} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={s.card} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          <View style={[s.iconWrap, { backgroundColor: t.bg }]}>
            <Ionicons name={t.icon} size={40} color={t.fg} />
          </View>
          <Text style={[s.title, { color: t.fg }]}>{blocker?.title}</Text>
          {blocker?.detail ? <Text style={s.detail}>{blocker.detail}</Text> : null}
          {blocker?.retry ? (
            <Button
              label="Try again"
              iconLeft="refresh"
              onPress={() => {
                const retry = blocker.retry;
                onClose();
                retry?.();
              }}
              style={s.button}
            />
          ) : null}
          <Button
            label={blocker?.retry ? 'Close' : 'OK'}
            variant={blocker?.retry ? 'outline' : 'primary'}
            onPress={onClose}
            style={blocker?.retry ? s.secondButton : s.button}
          />
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
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  title: { fontFamily: fontFamily.bold, fontSize: fontSize.xl, textAlign: 'center', lineHeight: 28 },
  detail: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  button: { alignSelf: 'stretch', marginTop: spacing.md },
  secondButton: { alignSelf: 'stretch' },
});
