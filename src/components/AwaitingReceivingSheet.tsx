import React, { useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ListSkeleton } from '@/src/components/Skeleton';
import { useSheetLayout } from '@/src/components/useSheetLayout';
import { scanApi, type AwaitingBucket } from '@/src/services/scan-api';
import { userMessage } from '@/src/services/user-message';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

interface Props {
  farm: string;
  open: boolean;
  onClose: () => void;
}

/** Every harvested bucket at the farm not received yet: variety, stems, where and when. */
export function AwaitingReceivingSheet({ farm, open, onClose }: Props) {
  const { overlayRef, onOverlayLayout, sheetStyle } = useSheetLayout(open);
  const [buckets, setBuckets] = useState<AwaitingBucket[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    scanApi
      .awaitingReceiving(farm)
      .then((r) => {
        if (!live) return;
        if (!r.success) throw new Error(r.error || 'Could not load the buckets');
        setBuckets(r.buckets ?? []);
        setError(null);
      })
      .catch((err) => live && setError(userMessage(err, 'Could not load the buckets')));
    return () => {
      live = false;
    };
  }, [open, farm]);

  const stems = (buckets ?? []).reduce((n, b) => n + b.stems, 0);

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View ref={overlayRef} style={s.overlay} onLayout={onOverlayLayout}>
        {/* The backdrop closes the sheet; the sheet itself is a plain View so the list keeps its swipes. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[s.sheet, sheetStyle]}>
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>Awaiting receiving</Text>
              {buckets ? (
                <Text style={s.summary}>
                  {buckets.length.toLocaleString()} bucket{buckets.length === 1 ? '' : 's'} · {stems.toLocaleString()} stems
                </Text>
              ) : null}
            </View>
            <Pressable onPress={onClose} style={s.closeBtn} accessibilityLabel="Close">
              <Ionicons name="close" size={20} color={colors.text} />
            </Pressable>
          </View>
          {error ? <Text style={s.error}>{error}</Text> : null}
          <FlatList
            style={s.list}
            data={buckets ?? []}
            keyExtractor={(b) => b.bucket}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={s.separator} />}
            ListEmptyComponent={
              buckets === null && !error ? <ListSkeleton rows={4} /> : error ? null : <Text style={s.empty}>Every bucket has been received.</Text>
            }
            renderItem={({ item: b }) => (
              <View style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={s.bucket} numberOfLines={1}>
                    {b.bucket}
                  </Text>
                  <Text style={s.variety} numberOfLines={1}>
                    {b.item_name}
                    {b.stem_length ? <Text style={s.length}>{`  ${b.stem_length}`}</Text> : null}
                  </Text>
                  <Text style={s.sub} numberOfLines={1}>
                    {[b.greenhouse, b.bed ? `bed ${b.bed}` : null, b.harvester].filter(Boolean).join(' · ')}
                  </Text>
                  {b.harvested_at ? <Text style={s.when}>Harvested {harvestedAt(b.harvested_at)}</Text> : null}
                </View>
                <View style={s.qty}>
                  <Text style={s.stems}>{b.stems.toLocaleString()}</Text>
                  <Text style={s.unit}>stems</Text>
                </View>
              </View>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

/** "08 Oct 14:05" from the server's "2026-10-08 14:05:33.1". */
function harvestedAt(ts: string): string {
  const [date, time = ''] = ts.split(' ');
  const [, m, d] = date.split('-');
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1] ?? m;
  return `${d} ${month} ${time.slice(0, 5)}`.trim();
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.lg,
  },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  title: { fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: colors.text },
  summary: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  error: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.error, marginBottom: spacing.sm },
  list: { flexShrink: 1 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  variety: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.text, marginTop: 2 },
  length: { fontFamily: fontFamily.bold, color: colors.text },
  sub: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  bucket: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: colors.text },
  when: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  qty: { alignItems: 'flex-end' },
  stems: { fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: colors.text },
  unit: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
  empty: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', padding: spacing.xl },
});
