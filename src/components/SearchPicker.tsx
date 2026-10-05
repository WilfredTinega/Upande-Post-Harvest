import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';
import { ListSkeleton } from '@/src/components/Skeleton';

export interface PickerRow {
  title: string;
  sub?: string;
  /** Short text on the right, e.g. progress. */
  right?: string;
}

interface Props<T> {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  /** The chosen value, shown in the field; null when nothing is chosen. */
  value: PickerRow | null;
  placeholder: string;
  /** Loads the options, filtered by the search text (server-side). */
  load: (query: string) => Promise<T[]>;
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
}: Props<T>) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (!open) return;
    const mine = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const rows = await loadRef.current(query);
        if (mine === seq.current) {
          setItems(rows ?? []);
          setError(null);
        }
      } catch (err) {
        if (mine === seq.current) setError(err instanceof Error ? err.message : 'Could not load the list');
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, query ? 300 : 0);
    return () => clearTimeout(t);
  }, [open, query]);

  const close = () => {
    setOpen(false);
    setQuery('');
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
        style={({ pressed }) => [s.field, pressed && s.pressed]}
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
        <Pressable style={s.overlay} onPress={close}>
          <Pressable style={[s.sheet, { paddingBottom: insets.bottom + spacing.lg }]} onPress={() => {}}>
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
                {loading ? <ActivityIndicator size="small" color={colors.textMuted} /> : null}
              </View>
            ) : loading ? (
              <ActivityIndicator size="small" color={colors.textMuted} style={{ marginBottom: spacing.sm }} />
            ) : null}
            {error ? <Text style={s.error}>{error}</Text> : null}
            <FlatList
              data={items}
              keyExtractor={keyOf}
              keyboardShouldPersistTaps="handled"
              ItemSeparatorComponent={() => <View style={s.separator} />}
              ListEmptyComponent={loading ? <ListSkeleton /> : error ? null : <Text style={s.empty}>{emptyText}</Text>}
              renderItem={({ item }) => {
                const r = row(item);
                return (
                  <Pressable onPress={() => pick(item)} style={({ pressed }) => [s.option, pressed && s.pressed]}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.optionLabel}>{r.title}</Text>
                      {r.sub ? <Text style={s.optionSub}>{r.sub}</Text> : null}
                    </View>
                    {r.right ? <Text style={s.right}>{r.right}</Text> : null}
                  </Pressable>
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
  label: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text, marginBottom: spacing.sm },
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
  value: { fontFamily: fontFamily.medium, fontSize: fontSize.md, color: colors.text },
  valueSub: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  placeholder: { color: colors.textMuted, fontFamily: fontFamily.regular },
  right: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.lg,
    maxHeight: '85%',
    minHeight: '60%',
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  sheetTitle: { fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: colors.text },
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
  search: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.md, color: colors.text, padding: 0 },
  error: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.error, marginBottom: spacing.sm },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md, minHeight: 56 },
  optionLabel: { fontFamily: fontFamily.medium, fontSize: fontSize.md, color: colors.text },
  optionSub: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  empty: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    padding: spacing.xl,
  },
});
