import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

interface CardProps {
  title?: string;
  style?: ViewStyle;
  /** Tap the title to show or hide the body (needs a title). */
  collapsible?: boolean;
  /** Whether a collapsible card starts open. */
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function Card({ title, style, collapsible, defaultOpen = false, children }: CardProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (collapsible && title) {
    return (
      <View style={[s.card, style]}>
        <Pressable
          onPress={() => setOpen((o) => !o)}
          style={[s.titleRow, open && { marginBottom: spacing.md }]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={title}
        >
          <Text style={[s.title, { marginBottom: 0, flex: 1 }]}>{title}</Text>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
        </Pressable>
        {open ? children : null}
      </View>
    );
  }

  return (
    <View style={[s.card, style]}>
      {title ? <Text style={s.title}>{title}</Text> : null}
      {children}
    </View>
  );
}

interface AlertProps {
  tone?: 'info' | 'warn' | 'danger' | 'success';
  children: React.ReactNode;
}

const TONE_BG: Record<NonNullable<AlertProps['tone']>, string> = {
  info: '#EEF2FF',
  warn: '#FFFBEB',
  danger: '#FEF2F2',
  success: '#F0FDF4',
};
const TONE_FG: Record<NonNullable<AlertProps['tone']>, string> = {
  info: '#3730A3',
  warn: '#92400E',
  danger: '#991B1B',
  success: '#166534',
};
const TONE_ICON: Record<NonNullable<AlertProps['tone']>, React.ComponentProps<typeof Ionicons>['name']> = {
  info: 'information-circle-outline',
  warn: 'warning-outline',
  danger: 'alert-circle-outline',
  success: 'checkmark-circle-outline',
};

export function Alert({ tone = 'info', children }: AlertProps) {
  return (
    <View style={[s.alert, { backgroundColor: TONE_BG[tone] }]}>
      <Ionicons name={TONE_ICON[tone]} size={16} color={TONE_FG[tone]} style={{ marginTop: 1 }} />
      <Text style={[s.alertText, { color: TONE_FG[tone] }]}>{children}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.sm,
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: spacing.md,
  },
  alert: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.md,
  },
  alertText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    lineHeight: 19,
  },
});
