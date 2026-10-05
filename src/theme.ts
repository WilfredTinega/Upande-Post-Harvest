/**
 * Upande design tokens — canonical across all Upande mobile apps.
 *
 * The reference implementation is the Upande Coffee app's theme. This file
 * is that one minus the coffee-specific accent tokens (cherry, parchment,
 * roast), which are only meaningful for coffee charts and illustrations.
 *
 * Don't introduce per-feature accent colors. Distinguish sections by icons
 * and layout, not color. Status hues (success / warning / error) stay shared.
 */

export const colors = {
  // Surfaces
  background: '#FAFAFA',
  surface: '#FFFFFF',
  surfaceAlt: '#F5F5F5',
  primaryMuted: '#F5F5F5',

  // Text
  text: '#171717',
  textSecondary: '#525252',
  textMuted: '#A3A3A3',
  textOnPrimary: '#FFFFFF',

  // Action
  primary: '#171717',

  // Status
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
  danger: '#EF4444',

  // Chrome
  border: '#E5E5E5',
  overlay: 'rgba(0, 0, 0, 0.4)',
} as const;

export const fontFamily = {
  regular: 'DMSans_400Regular',
  medium: 'DMSans_500Medium',
  semiBold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
} as const;

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 18,
  xl: 22,
  xxl: 28,
} as const;

export const typography = {
  h1: { fontFamily: fontFamily.bold, fontSize: fontSize.xxl, color: colors.text } as const,
  h2: { fontFamily: fontFamily.bold, fontSize: fontSize.xl, color: colors.text } as const,
  h3: { fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: colors.text } as const,
  body: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: colors.text } as const,
  bodySmall: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary } as const,
  caption: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textMuted } as const,
  label: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text } as const,
  mono: { fontFamily: 'monospace', fontSize: fontSize.md, color: colors.text } as const,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const borderRadius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
} as const;

export const shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
} as const;
