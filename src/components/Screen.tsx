import React from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontFamily, fontSize } from '@/src/theme';

interface ScreenProps {
  title?: string;
  /** Optional accent passed through to header underline / spinner. */
  color?: string;
  /** Left-side icon (defaults to menu hamburger) */
  leftIcon?: React.ComponentProps<typeof Ionicons>['name'];
  onPressLeft?: () => void;
  /** Right-side icon button */
  rightIcon?: React.ComponentProps<typeof Ionicons>['name'];
  onPressRight?: () => void;

  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;

  refreshing?: boolean;
  onRefresh?: () => void;

  /** Hide the scroll wrapper for screens that manage their own layout. */
  scroll?: boolean;
  children: React.ReactNode;
}

export function Screen({
  title,
  color = colors.primary,
  leftIcon,
  onPressLeft,
  rightIcon,
  onPressRight,
  loading,
  error,
  onRetry,
  refreshing,
  onRefresh,
  scroll = true,
  children,
}: ScreenProps) {
  const header = title || leftIcon || rightIcon ? (
    <View style={[s.header, { borderBottomColor: colors.border }]}>
      {leftIcon ? (
        <TouchableOpacity onPress={onPressLeft} hitSlop={8} style={s.headerBtn} accessibilityLabel={iconLabel(leftIcon)}>
          <Ionicons name={leftIcon} size={24} color={colors.text} />
        </TouchableOpacity>
      ) : (
        <View style={s.headerBtn} />
      )}
      <Text style={s.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      {rightIcon ? (
        <TouchableOpacity onPress={onPressRight} hitSlop={8} style={s.headerBtn} accessibilityLabel={iconLabel(rightIcon)}>
          <Ionicons name={rightIcon} size={24} color={colors.text} />
        </TouchableOpacity>
      ) : (
        <View style={s.headerBtn} />
      )}
    </View>
  ) : null;

  let body: React.ReactNode;
  if (loading) {
    body = (
      <View style={s.center}>
        <ActivityIndicator size="large" color={color} />
      </View>
    );
  } else if (error) {
    body = (
      <View style={s.center}>
        <Ionicons name="alert-circle-outline" size={32} color={colors.error} />
        <Text style={s.errorText}>{error}</Text>
        {onRetry ? (
          <TouchableOpacity onPress={onRetry} style={s.retryBtn}>
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  } else if (scroll) {
    // Keyboard-aware so a focused input (stems, reasons, search) scrolls clear
    // of the soft keyboard instead of hiding behind it.
    body = (
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid
        extraScrollHeight={spacing.xl}
        extraHeight={spacing.xxl * 3}
        refreshControl={
          onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined
        }
      >
        {children}
      </KeyboardAwareScrollView>
    );
  } else {
    body = <View style={{ flex: 1 }}>{children}</View>;
  }

  return (
    // The status bar strip takes the header's colour (white), the page below keeps its own.
    <SafeAreaView style={[s.root, header ? s.rootUnderHeader : null]} edges={['top', 'left', 'right']}>
      {header}
      <View style={s.body}>{body}</View>
    </SafeAreaView>
  );
}

function iconLabel(icon: string): string {
  if (icon === 'menu' || icon === 'menu-outline') return 'Open menu';
  if (icon === 'arrow-back') return 'Back';
  if (icon.startsWith('settings')) return 'Settings';
  return icon;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  rootUnderHeader: { backgroundColor: colors.surface },
  body: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    backgroundColor: colors.surface,
  },
  headerBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.lg,
    color: colors.text,
  },
  scrollContent: { padding: spacing.lg, paddingBottom: spacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  errorText: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: colors.error, textAlign: 'center' },
  retryBtn: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  retryText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.primary },
});
