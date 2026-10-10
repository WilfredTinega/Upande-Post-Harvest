import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';
import { useSheetLayout } from '@/src/components/useSheetLayout';

/** Rows shown before searching; the rest are found by search. */
const MAX_ROWS = 20;
/** Up to this many options are listed without a search box. */
const FEW_OPTIONS = 8;

export interface DropdownOption {
  label: string;
  value: string;
  sublabel?: string;
}

interface DropdownProps {
  label?: string;
  placeholder?: string;
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  searchable?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  emptyText?: string;
  /** Keep `label` for the picker's title only, e.g. when the field sits in a row. */
  inline?: boolean;
}

export function Dropdown({
  label,
  placeholder = 'Select…',
  value,
  options,
  onChange,
  searchable = true,
  disabled = false,
  invalid = false,
  emptyText = 'No matches',
  inline = false,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { overlayRef, onOverlayLayout, sheetStyle } = useSheetLayout(open);

  const selected = options.find((o) => o.value === value);
  // A short list needs no search box.
  const showSearch = searchable && options.length > FEW_OPTIONS;

  const filtered = useMemo(() => {
    if (!query.trim()) return options.slice(0, MAX_ROWS);
    const q = query.toLowerCase();
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    );
  }, [options, query]);

  return (
    <View>
      {label && !inline ? <Text style={s.label}>{label}</Text> : null}
      <TouchableOpacity
        style={[s.field, invalid && s.fieldError, disabled && { opacity: 0.6 }]}
        onPress={() => !disabled && setOpen(true)}
        activeOpacity={0.7}
      >
        <Text style={[s.value, !selected && s.placeholder]} numberOfLines={1}>
          {selected ? selected.label : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View ref={overlayRef} style={s.overlay} onLayout={onOverlayLayout}>
          {/* Tapping outside the sheet closes it. A sibling, not a wrapper, so the list still scrolls. */}
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} accessibilityLabel="Close" />
          <View style={[s.sheet, sheetStyle]}>
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>{label || 'Select'}</Text>
              <TouchableOpacity onPress={() => setOpen(false)} style={s.closeBtn} activeOpacity={0.7}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {showSearch ? (
              <View style={s.searchWrap}>
                <Ionicons name="search" size={16} color={colors.textMuted} />
                <TextInput
                  style={s.search}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search…"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            ) : null}

            <FlatList
              style={s.list}
              data={filtered}
              keyExtractor={(it) => it.value}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={s.separator} />}
              ListEmptyComponent={
                <View style={s.empty}>
                  <Text style={s.emptyText}>{emptyText}</Text>
                </View>
              }
              renderItem={({ item }) => {
                const isSelected = item.value === value;
                return (
                  <TouchableOpacity
                    style={s.option}
                    onPress={() => {
                      onChange(item.value);
                      setOpen(false);
                      setQuery('');
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[s.optionLabel, isSelected && { fontFamily: fontFamily.semiBold }]}
                      >
                        {item.label}
                      </Text>
                      {item.sublabel ? <Text style={s.optionSub}>{item.sublabel}</Text> : null}
                    </View>
                    {isSelected ? <Ionicons name="checkmark" size={18} color={colors.text} /> : null}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  label: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text, marginBottom: spacing.sm },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 46,
  },
  fieldError: { borderColor: colors.error, borderWidth: 1.5 },
  value: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: colors.text, flex: 1 },
  placeholder: { color: colors.textMuted },

  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  list: { flexShrink: 1 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  sheetTitle: { fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: colors.text },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceAlt, justifyContent: 'center', alignItems: 'center' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  search: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.md, color: colors.text, padding: 0 },
  option: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md },
  optionLabel: { fontFamily: fontFamily.medium, fontSize: fontSize.md, color: colors.text },
  optionSub: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  empty: { padding: spacing.xl, alignItems: 'center' },
  emptyText: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textMuted },
});
