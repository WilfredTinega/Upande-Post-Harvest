import React from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type TextInputProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

interface LabeledInputProps extends Omit<TextInputProps, 'style'> {
  label: string;
  iconLeft?: React.ComponentProps<typeof Ionicons>['name'];
  trailingIcon?: React.ComponentProps<typeof Ionicons>['name'];
  onPressTrailing?: () => void;
  invalid?: boolean;
  helperText?: string;
}

export const LabeledInput = React.forwardRef<TextInput, LabeledInputProps>(function LabeledInput(
  { label, iconLeft, trailingIcon, onPressTrailing, invalid, helperText, ...rest },
  ref,
) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={s.label}>{label}</Text>
      <View style={[s.wrap, invalid && s.wrapInvalid]}>
        {iconLeft ? (
          <Ionicons
            name={iconLeft}
            size={18}
            color={colors.textMuted}
            style={{ marginLeft: spacing.md }}
          />
        ) : null}
        <TextInput
          ref={ref}
          {...rest}
          style={s.input}
          placeholderTextColor={colors.textMuted}
        />
        {trailingIcon ? (
          <TouchableOpacity onPress={onPressTrailing} hitSlop={8} style={{ paddingRight: spacing.md }}>
            <Ionicons name={trailingIcon} size={18} color={colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>
      {helperText ? (
        <Text style={[s.helper, invalid && { color: colors.error }]}>{helperText}</Text>
      ) : null}
    </View>
  );
});

const s = StyleSheet.create({
  label: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.sm,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  wrapInvalid: {
    borderColor: colors.error,
  },
  input: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.text,
    padding: spacing.md,
  },
  helper: {
    marginTop: spacing.xs,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
});
