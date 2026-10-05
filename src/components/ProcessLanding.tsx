import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ProcessOverview } from '@/src/components/ProcessOverview';
import { ProductionSummary } from '@/src/components/ProductionSummary';
import { ACTIONS, type ActionDef } from '@/src/scan/actions';
import { PROCESSES, type ProcessKey } from '@/src/scan/processes';
import type { Overview } from '@/src/services/scan-api';
import { colors, fontFamily, fontSize, shadow, spacing } from '@/src/theme';

interface Props {
  process: ProcessKey;
  farm: string;
  overview: Overview | null;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  /** Section label above the figures; hidden when the screen title already names the process. */
  showLabel: boolean;
  onOpen: (action: ActionDef) => void;
}

/** The same landing for every process: today's figures, then its action tiles. */
export function ProcessLanding({ process, farm, overview, loading, error, onRetry, showLabel, onOpen }: Props) {
  const label = PROCESSES.find((p) => p.key === process)?.label ?? process;
  const actions = ACTIONS.filter((a) => a.group === process);

  return (
    <View style={s.section}>
      {showLabel ? <Text style={s.label}>{label.toUpperCase()}</Text> : null}
      {farm ? <ProcessOverview process={process} overview={overview} loading={loading} error={error} onRetry={onRetry} /> : null}
      <View style={s.grid}>
        {actions.map((a) => {
          const blocked = a.needsFarm && !farm;
          return (
            <Pressable
              key={a.key}
              onPress={() => onOpen(a)}
              style={({ pressed }) => [s.tile, blocked && s.blocked, pressed && s.pressed]}
              accessibilityRole="button"
              accessibilityLabel={a.label}
              accessibilityHint={a.description}
            >
              <View style={s.icon}>
                <Ionicons name={a.icon} size={24} color={colors.text} />
              </View>
              <Text style={s.tileLabel} numberOfLines={2}>
                {a.label}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={s.chevron} />
            </Pressable>
          );
        })}
      </View>
      {process === 'production' && farm ? <ProductionSummary farm={farm} /> : null}
    </View>
  );
}

const s = StyleSheet.create({
  section: { marginTop: spacing.sm },
  label: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    color: colors.textMuted,
    letterSpacing: 1.4,
    marginBottom: spacing.sm,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  tile: {
    width: '48.5%',
    minHeight: 104,
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    justifyContent: 'space-between',
    ...shadow.sm,
  },
  blocked: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text, marginTop: spacing.md },
  chevron: { position: 'absolute', top: spacing.lg, right: spacing.lg },
});
