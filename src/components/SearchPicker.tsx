import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';
import { ListSkeleton } from '@/src/components/Skeleton';
import { useSheetLayout } from '@/src/components/useSheetLayout';
import { userMessage } from '@/src/services/user-message';
import { cachedList, fetchList } from '@/src/services/list-cache';

/** Pause after typing before searching. */
const SEARCH_DELAY_MS = 150;

export interface PickerRow {
  title: string;
  sub?: string;
  /** Bold text at the start of `sub`, e.g. "0 / 50 stems". */
  lead?: string;
  /** A coloured stripe down the row's left edge: green good, amber partway, red a problem. */
  stripe?: 'good' | 'partial' | 'bad';
  /** A short red line under the row saying what fixes the problem. */
  alert?: string;
  /** Short text on the right, e.g. progress. */
  right?: string;
  /** Detail behind a caret on the row, e.g. an order's varieties; the first column takes the rest of the width. */
  table?: { columns: string[]; rows: string[][] };
}

interface Props<T> {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  /** The chosen value, shown in the field; null when nothing is chosen. */
  value: PickerRow | null;
  placeholder: string;
  /** Loads the options, filtered by the search text (server-side). */
  load: (query: string) => Promise<T[]>;
  disabled?: boolean;
  /** Hold the lists under this key (see list-cache) so the sheet opens on them at once. */
  cacheKey?: string;
  keyOf: (item: T) => string;
  row: (item: T) => PickerRow;
  onPick: (item: T) => void;
  onClear?: () => void;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Called after the sheet closes (picked or not), e.g. to refocus the scan field. */
  onClose?: () => void;
}

/** A field that opens a bottom sheet of server-loaded options (searchable). */
export function SearchPicker<T>({
  label,
  icon,
  value,
  placeholder,
  load,
  keyOf,
  row,
  onPick,
  onClear,
  searchable = true,
  searchPlaceholder = 'Search',
  emptyText = 'Nothing to choose',
  onClose,
  disabled = false,
  cacheKey,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The one row whose table is open; opening another closes it.
  const [expanded, setExpanded] = useState<string | null>(null);
  const toggle = (key: string) => setExpanded((prev) => (prev === key ? null : key));
  const seq = useRef(0);
  const { overlayRef, onOverlayLayout, sheetStyle } = useSheetLayout(open);
  const loadRef = useRef(load);
  useLayoutEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    if (!open) return;
    const mine = ++seq.current;
    const key = cacheKey === undefined ? null : `${cacheKey}|${query.trim()}`;
    const held = key ? cachedList<T[]>(key) : undefined;
    // A held list shows at once and refreshes quietly; the skeleton is only for a first load.
    const t = setTimeout(
      async () => {
        if (held) setItems(held);
        else setLoading(true);
        try {
          const load = () => loadRef.current(query);
          const rows = (await (key ? fetchList<T[]>(key, load) : load())) ?? [];
          if (mine === seq.current) {
            setItems(rows);
            setError(null);
          }
        } catch (err) {
          if (mine === seq.current && !held) setError(userMessage(err, 'Could not load the list'));
        } finally {
          if (mine === seq.current) setLoading(false);
        }
      },
      query && !held ? SEARCH_DELAY_MS : 0,
    );
    return () => clearTimeout(t);
  }, [open, query, cacheKey]);

  const close = () => {
    setOpen(false);
    setQuery('');
    setExpanded(null);
    onClose?.();
  };

  const pick = (item: T) => {
    onPick(item);
    close();
  };

  return (
    <View>
      <Text style={s.label}>{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        disabled={disabled}
        style={({ pressed }) => [s.field, pressed && s.pressed, disabled && s.disabled]}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ? value.title : placeholder}`}
      >
        <Ionicons name={icon} size={20} color={value ? colors.text : colors.textMuted} />
        <View style={{ flex: 1 }}>
          <Text style={[s.value, !value && s.placeholder]} numberOfLines={1}>
            {value ? value.title : placeholder}
          </Text>
          {value?.sub ? (
            <Text style={s.valueSub} numberOfLines={1}>
              {value.sub}
            </Text>
          ) : null}
        </View>
        {value?.right ? <Text style={s.right}>{value.right}</Text> : null}
        {value && onClear ? (
          <Pressable onPress={onClear} hitSlop={12} accessibilityLabel={`Clear ${label}`}>
            <Ionicons name="close-circle" size={22} color={colors.textMuted} />
          </Pressable>
        ) : (
          <Ionicons name="chevron-down" size={20} color={colors.textMuted} />
        )}
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
        <Pressable ref={overlayRef} style={s.overlay} onPress={close} onLayout={onOverlayLayout}>
          <Pressable style={[s.sheet, sheetStyle]} onPress={() => {}}>
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>{label}</Text>
              <Pressable onPress={close} style={s.closeBtn} accessibilityLabel="Close">
                <Ionicons name="close" size={20} color={colors.text} />
              </Pressable>
            </View>
            {searchable ? (
              <View style={s.searchWrap}>
                <Ionicons name="search" size={16} color={colors.textMuted} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder={searchPlaceholder}
                  placeholderTextColor={colors.textMuted}
                  autoCorrect={false}
                  autoCapitalize="none"
                  style={s.search}
                />
              </View>
            ) : null}
            {error ? <Text style={s.error}>{error}</Text> : null}
            <FlatList
              style={s.list}
              // Each load, a new search too, shows the skeleton in place of the old rows.
              data={loading ? [] : items}
              keyExtractor={keyOf}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={s.separator} />}
              ListEmptyComponent={loading ? <ListSkeleton /> : error ? null : <Text style={s.empty}>{emptyText}</Text>}
              renderItem={({ item }) => {
                const r = row(item);
                const key = keyOf(item);
                const isOpen = expanded === key;
                return (
                  <View>
                    <Pressable onPress={() => pick(item)} style={({ pressed }) => [s.option, pressed && s.pressed]}>
                      {r.stripe ? (
                        <View
                          style={[
                            s.stripe,
                            {
                              backgroundColor: r.stripe === 'bad' ? colors.error : r.stripe === 'partial' ? colors.warning : colors.success,
                            },
                          ]}
                        />
                      ) : null}
                      <View style={{ flex: 1 }}>
                        <Text style={s.optionLabel}>{r.title}</Text>
                        {r.lead || r.sub ? (
                          <Text style={s.optionSub}>
                            {r.lead ? <Text style={s.lead}>{r.lead}</Text> : null}
                            {r.lead && r.sub ? ' · ' : ''}
                            {r.sub ?? ''}
                          </Text>
                        ) : null}
                        {r.alert ? <Text style={s.alert}>{r.alert}</Text> : null}
                      </View>
                      {r.right ? <Text style={s.right}>{r.right}</Text> : null}
                      {r.table?.rows.length ? (
                        <Pressable
                          onPress={() => toggle(key)}
                          hitSlop={10}
                          style={s.caret}
                          accessibilityLabel={isOpen ? `Hide ${r.title} details` : `Show ${r.title} details`}
                        >
                          <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={20} color={colors.text} />
                        </Pressable>
                      ) : null}
                    </Pressable>
                    {isOpen && r.table ? (
                      <View style={s.table}>
                        <View style={[s.tableRow, s.tableHead]}>
                          {r.table.columns.map((c, i) => (
                            <Text key={i} style={[s.th, i === 0 ? s.cellFirst : s.cell]}>
                              {c}
                            </Text>
                          ))}
                        </View>
                        {r.table.rows.map((cells, j) => (
                          <View key={j} style={s.tableRow}>
                            {cells.map((c, i) => (
                              <Text key={i} style={[s.td, i === 0 ? s.cellFirst : s.cell]} numberOfLines={2}>
                                {c}
                              </Text>
                            ))}
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  label: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.sm,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.6 },
  value: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.text,
  },
  valueSub: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  placeholder: { color: colors.textMuted, fontFamily: fontFamily.regular },
  right: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.lg,
  },
  list: { flexShrink: 1 },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sheetTitle: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.lg,
    color: colors.text,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    marginBottom: spacing.sm,
  },
  search: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.text,
    padding: 0,
  },
  error: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.error,
    marginBottom: spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    minHeight: 56,
  },
  optionLabel: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.md,
    color: colors.text,
  },
  optionSub: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  lead: { fontFamily: fontFamily.bold, color: colors.text },
  stripe: { alignSelf: 'stretch', width: 4, borderRadius: 2 },
  caret: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  table: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  tableHead: { borderTopWidth: 0, backgroundColor: colors.surfaceAlt },
  th: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  td: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  cellFirst: { flex: 1, minWidth: 0 },
  cell: { width: 64, textAlign: 'right' },
  alert: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.xs,
    color: colors.error,
    marginTop: 2,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  empty: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    padding: spacing.xl,
  },
});
