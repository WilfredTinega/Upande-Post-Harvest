import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

interface CardProps {
  title?: string;
  style?: ViewStyle;
  children: React.ReactNode;
}

export function Card({ title, style, children }: CardProps) {
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
