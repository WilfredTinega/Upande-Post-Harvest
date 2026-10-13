import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Alert } from '@/src/components/Card';
import { Dropdown } from '@/src/components/Dropdown';
import { SkeletonBox } from '@/src/components/Skeleton';
import { cachedList, fetchList, harvestSetupKey } from '@/src/services/list-cache';
import { scanApi, type HarvestSetup } from '@/src/services/scan-api';
import { userMessage } from '@/src/services/user-message';
import { useScanStore } from '@/src/stores/scanStore';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

/**
 * This scanner's station (farm) and the greenhouse/block Harvesting scans into, saved
 * on the device as soon as they change. The processes come from the user's row in
 * Post Harvest Settings in ERPNext.
 */
export function ScannerConfig() {
  const farms = useScanStore((s) => s.farms);
  const farmsSource = useScanStore((s) => s.farmsSource);
  const farmsNotice = useScanStore((s) => s.farmsNotice);
  const farm = useScanStore((s) => s.farm);
  const setFarm = useScanStore((s) => s.setFarm);

  const unknownFarm = !!farm && farmsSource === 'server' && !farms.includes(farm);
  const farmOptions = farm && !farms.includes(farm) ? [...farms, farm] : farms;

  return (
    <View>
      <Text style={s.heading}>Farm</Text>
      <View style={s.farms}>
        {farmOptions.map((f) => {
          const on = f === farm;
          return (
            <Pressable
              key={f}
              onPress={() => setFarm(f)}
              hitSlop={{ top: 6, bottom: 6 }}
              style={({ pressed }) => [s.farm, on && s.farmOn, pressed && s.pressed]}
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
      {farm ? <GreenhouseConfig farm={farm} /> : null}
    </View>
  );
}

function GreenhouseConfig({ farm }: { farm: string }) {
  const greenhouse = useScanStore((s) => s.greenhouse);
  const setGreenhouse = useScanStore((s) => s.setGreenhouse);
  const byStemLength = useScanStore((s) => s.harvestByStemLength);
  const key = harvestSetupKey(farm, byStemLength);
  // The answer for this farm's key; until it comes, what the list cache holds.
  const [loaded, setLoaded] = useState<{ key: string; setup?: HarvestSetup; error?: string } | null>(null);
  const setup = loaded?.key === key ? loaded.setup : cachedList<HarvestSetup>(key);
  const error = loaded?.key === key ? loaded.error : undefined;

  useEffect(() => {
    let live = true;
    fetchList(key, () => scanApi.harvestSetup(farm, byStemLength))
      .then((r) => {
        if (!r.success) throw new Error(r.error || 'Could not load the greenhouses');
        if (live) setLoaded({ key, setup: r });
      })
      .catch((err) => {
        if (live) setLoaded({ key, setup: cachedList<HarvestSetup>(key), error: userMessage(err, 'Could not load the greenhouses') });
      });
    return () => {
      live = false;
    };
  }, [farm, byStemLength, key]);

  const options = (setup?.greenhouses ?? []).map((g) => ({
    label: g.name,
    value: g.name,
    sublabel: g.recent ? 'Recent' : undefined,
  }));

  return (
    <View style={s.section}>
      <Text style={s.heading}>Greenhouse / Block</Text>
      {!setup && !error ? (
        <SkeletonBox height={46} radius={borderRadius.sm} />
      ) : (
        <Dropdown
          placeholder="Choose the greenhouse / block"
          value={greenhouse}
          options={options}
          onChange={setGreenhouse}
          searchable
          emptyText={error ?? `No greenhouses for ${farm}. Set the Greenhouses group in its Warehouse Mapping.`}
        />
      )}
      {!greenhouse ? <Text style={s.hint}>Choose the greenhouse / block.</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  heading: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text, marginBottom: spacing.sm },
  farmOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  pressed: { opacity: 0.75 },
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
  section: { marginTop: spacing.lg },
});
