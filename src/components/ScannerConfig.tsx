import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Alert } from '@/src/components/Card';
import { PROCESSES, type ProcessKey } from '@/src/scan/processes';
import { useScanStore } from '@/src/stores/scanStore';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

/**
 * This scanner's configuration: the processes it is used for and its station
 * (farm). Saved on the device as soon as it changes.
 */
export function ScannerConfig() {
  const farms = useScanStore((s) => s.farms);
  const farmsSource = useScanStore((s) => s.farmsSource);
  const farmsNotice = useScanStore((s) => s.farmsNotice);
  const farm = useScanStore((s) => s.farm);
  const processes = useScanStore((s) => s.processes);
  const setFarm = useScanStore((s) => s.setFarm);
  const setProcesses = useScanStore((s) => s.setProcesses);

  const toggle = (key: ProcessKey) => {
    const on = processes.includes(key);
    if (on && processes.length === 1) return; // at least one process
    const next = on ? processes.filter((p) => p !== key) : [...processes, key];
    setProcesses(PROCESSES.map((p) => p.key).filter((k) => next.includes(k)));
  };

  const unknownFarm = !!farm && farmsSource === 'server' && !farms.includes(farm);
  const farmOptions = farm && !farms.includes(farm) ? [...farms, farm] : farms;

  return (
    <View>
      <Text style={s.heading}>Process</Text>
      <View style={s.list}>
        {PROCESSES.map((p) => {
          const on = processes.includes(p.key);
          return (
            <Pressable
              key={p.key}
              onPress={() => toggle(p.key)}
              style={({ pressed }) => [s.process, on && s.processOn, pressed && s.pressed]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={p.label}
            >
              <Ionicons name={p.icon} size={22} color={on ? colors.textOnPrimary : colors.text} />
              <Text style={[s.processLabel, on && s.onText]}>{p.label}</Text>
              <Ionicons
                name={on ? 'checkbox' : 'square-outline'}
                size={24}
                color={on ? colors.textOnPrimary : colors.textMuted}
              />
            </Pressable>
          );
        })}
      </View>
      {!processes.length ? <Text style={s.hint}>Choose at least one process.</Text> : null}

      <Text style={[s.heading, { marginTop: spacing.lg }]}>Farm</Text>
      <View style={s.farms}>
        {farmOptions.map((f) => {
          const on = f === farm;
          return (
            <Pressable
              key={f}
              onPress={() => setFarm(f)}
              hitSlop={{ top: 6, bottom: 6 }}
              style={({ pressed }) => [s.farm, on && s.processOn, pressed && s.pressed]}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
            >
              {on ? <Ionicons name="checkmark" size={16} color={colors.textOnPrimary} /> : null}
              <Text style={[s.farmText, on && s.onText]}>{f}</Text>
            </Pressable>
          );
        })}
      </View>
      {!farm ? <Text style={s.hint}>Choose the farm.</Text> : null}
      {unknownFarm ? (
        <View style={s.notice}>
          <Alert tone="warn">{`${farm} is not set up on this server. Choose another farm.`}</Alert>
        </View>
      ) : null}
      {farmsNotice ? (
        <View style={s.notice}>
          <Alert tone="warn">{farmsNotice}</Alert>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  heading: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text, marginBottom: spacing.sm },
  list: { gap: spacing.sm },
  process: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  processOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  pressed: { opacity: 0.75 },
  processLabel: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text },
  onText: { color: colors.textOnPrimary },
  hint: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.sm },
  farms: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  farm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 34,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  farmText: { fontFamily: fontFamily.medium, fontSize: fontSize.md, color: colors.text },
  notice: { marginTop: spacing.sm },
});
