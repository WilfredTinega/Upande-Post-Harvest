import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/src/components/Button';
import { Card } from '@/src/components/Card';
import { SkeletonBox } from '@/src/components/Skeleton';
import { useToast } from '@/src/components/Toast';
import { scanApi, type RejectsDay } from '@/src/services/scan-api';
import { userMessage } from '@/src/services/user-message';
import { colors, fontFamily, fontSize, spacing } from '@/src/theme';

interface Props {
  farm: string;
  /** Bumped by the screen after each line is added, to reload the log. */
  version: number;
}

/**
 * Today's graded rejects at the farm: what came into the packhouse, what was graded
 * and rejected, the reject lines (drafted until submitted), and the one submit.
 */
export function GradedRejectsPanel({ farm, version }: Props) {
  const { notify } = useToast();
  const [day, setDay] = useState<RejectsDay | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await scanApi.getRejects(farm);
      if (r.success) setDay(r);
    } catch {
      // The log stays as it was; the next add or submit reloads it.
    }
  }, [farm]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load, version]);

  const remove = async (row: string) => {
    setBusy(true);
    try {
      const r = await scanApi.removeReject(farm, row);
      if (!r.success) notify(r.error || 'Could not remove that line', 'error', 2000, 'center');
    } catch (err) {
      notify(userMessage(err, 'Could not remove that line'), 'error', 2000, 'center');
    } finally {
      setBusy(false);
      load();
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      const r = await scanApi.submitRejects(farm);
      notify(r.success ? `${r.qty} rejected stems submitted` : r.error || 'Could not submit', r.success ? 'success' : 'error', 2000, 'center');
    } catch (err) {
      notify(userMessage(err, 'Could not submit the rejects'), 'error', 2000, 'center');
    } finally {
      setBusy(false);
      load();
    }
  };

  if (!day) {
    return (
      <Card style={s.card}>
        <SkeletonBox height={56} radius={10} />
        <SkeletonBox height={40} radius={10} style={{ marginTop: spacing.sm }} />
      </Card>
    );
  }

  const drafted = day.lines.filter((l) => !l.submitted);
  const draftedStems = drafted.reduce((n, l) => n + l.stems, 0);

  return (
    <Card style={s.card}>
      <View style={s.totals}>
        <Total label="Received" value={day.received_stems} />
        <Total label="Graded" value={day.graded_stems} />
        <Total label="Rejected" value={day.rejected_stems} tone="bad" />
      </View>

      {day.lines.length ? (
        day.lines.map((l) => (
          <View key={l.row} style={s.line}>
            <Text style={s.lineName} numberOfLines={1}>
              {l.item_name}
              {l.stem_length ? <Text style={s.bold}>{`  ${l.stem_length}`}</Text> : null}
              {l.reason ? <Text style={s.reason}>{`  · ${l.reason}`}</Text> : null}
            </Text>
            <Text style={s.lineStems}>{l.stems.toLocaleString()}</Text>
            {l.submitted ? (
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            ) : (
              <Pressable onPress={() => remove(l.row)} disabled={busy} hitSlop={10} accessibilityLabel={`Remove ${l.item_name}`}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </Pressable>
            )}
          </View>
        ))
      ) : (
        <Text style={s.empty}>No rejects recorded today.</Text>
      )}

      {drafted.length ? (
        <Button
          label={busy ? 'Submitting…' : `Submit rejects · ${draftedStems.toLocaleString()} stems`}
          iconLeft="checkmark-done-outline"
          loading={busy}
          onPress={submit}
        />
      ) : null}
    </Card>
  );
}

function Total({ label, value, tone }: { label: string; value: number; tone?: 'bad' }) {
  return (
    <View style={s.total}>
      <Text style={[s.totalValue, tone === 'bad' && { color: colors.error }]}>{value.toLocaleString()}</Text>
      <Text style={s.totalLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { marginTop: spacing.md, gap: spacing.sm },
  totals: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xs },
  total: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: 10, backgroundColor: colors.surfaceAlt },
  totalValue: { fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: colors.text },
  totalLabel: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textSecondary },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  lineName: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.text },
  reason: { color: colors.textMuted },
  bold: { fontFamily: fontFamily.bold },
  lineStems: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  empty: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textMuted, paddingVertical: spacing.sm },
});
