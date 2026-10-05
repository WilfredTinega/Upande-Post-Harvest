import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

export type ButtonVariant = 'primary' | 'outline' | 'ghost';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  /** Override the action color (e.g. danger for destructive). */
  color?: string;
  loading?: boolean;
  disabled?: boolean;
  iconLeft?: React.ComponentProps<typeof Ionicons>['name'];
  style?: ViewStyle;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  color,
  loading,
  disabled,
  iconLeft,
  style,
}: ButtonProps) {
  const isOutline = variant === 'outline';
  const isGhost = variant === 'ghost';
  const actionColor = color ?? colors.primary;
  const bg = isOutline || isGhost ? 'transparent' : actionColor;
  const fg = isOutline || isGhost ? actionColor : colors.textOnPrimary;
  const border = isGhost ? 'transparent' : isOutline ? actionColor : 'transparent';

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[
        s.btn,
        {
          backgroundColor: bg,
          borderColor: border,
          opacity: disabled || loading ? 0.5 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={s.inner}>
          {iconLeft ? <Ionicons name={iconLeft} size={18} color={fg} /> : null}
          <Text style={[s.label, { color: fg }]}>{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  btn: {
    borderRadius: borderRadius.full,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  label: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.md,
  },
});
