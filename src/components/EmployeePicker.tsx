import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { scanApi, type Employee } from '@/src/services/scan-api';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';
import { ListSkeleton } from '@/src/components/Skeleton';
import { userMessage } from '@/src/services/user-message';

interface Props {
  label: string;
  value: Employee | null;
  onChange: (employee: Employee | null) => void;
  placeholder?: string;
  optional?: boolean;
}

/** Employee field backed by a server-side search (there are too many to list up front). */
export function EmployeePicker({ label, value, onChange, placeholder = 'Select employee', optional }: Props) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    const mine = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const rows = await scanApi.searchEmployees(query);
        if (mine === seq.current) {
          setResults(rows ?? []);
          setError(null);
        }
      } catch (err) {
        if (mine === seq.current) setError(userMessage(err, 'Search failed'));
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [open, query]);

  const pick = (e: Employee | null) => {
    onChange(e);
    setOpen(false);
    setQuery('');
  };

  return (
    <View>
      <Text style={s.label}>
        {label}
        {optional ? <Text style={s.optional}>  optional</Text> : null}
      </Text>
      <Pressable onPress={() => setOpen(true)} style={s.field}>
        <Ionicons name="person-outline" size={18} color={colors.textMuted} />
        <Text style={[s.value, !value && s.placeholder]} numberOfLines={1}>
          {value ? `${value.employee_name} · ${value.name}` : placeholder}
        </Text>
        {value ? (
          <Pressable onPress={() => pick(null)} hitSlop={10}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        ) : (
          <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
        )}
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.overlay} onPress={() => setOpen(false)}>
          <Pressable style={[s.sheet, { paddingBottom: insets.bottom + spacing.lg }]} onPress={() => {}}>
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>{label}</Text>
              <Pressable onPress={() => setOpen(false)} style={s.closeBtn}>
                <Ionicons name="close" size={18} color={colors.text} />
              </Pressable>
            </View>
            <View style={s.searchWrap}>
              <Ionicons name="search" size={16} color={colors.textMuted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search name or ID"
                placeholderTextColor={colors.textMuted}
                autoFocus
                autoCorrect={false}
                style={s.search}
              />
              {loading ? <ActivityIndicator size="small" color={colors.textMuted} /> : null}
            </View>
            {error ? <Text style={s.error}>{error}</Text> : null}
            <FlatList
              data={results}
              keyExtractor={(e) => e.name}
              keyboardShouldPersistTaps="handled"
              ItemSeparatorComponent={() => <View style={s.separator} />}
              ListEmptyComponent={
                loading ? (
                  <ListSkeleton />
                ) : (
                  <Text style={s.empty}>{query ? 'No matching employees' : 'No employees'}</Text>
                )
              }
              renderItem={({ item }) => (
                <Pressable onPress={() => pick(item)} style={s.option}>
                  <Text style={s.optionLabel}>{item.employee_name}</Text>
                  <Text style={s.optionSub}>
                    {item.name}
                    {item.designation ? ` · ${item.designation}` : ''}
                  </Text>
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  label: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text, marginBottom: spacing.sm },
  optional: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  value: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.md, color: colors.text },
  placeholder: { color: colors.textMuted },
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.lg,
    maxHeight: '80%',
    minHeight: '60%',
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  sheetTitle: { fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: colors.text },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
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
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  search: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.md, color: colors.text, padding: 0 },
  error: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.error, marginBottom: spacing.sm },
  option: { paddingVertical: spacing.md },
  optionLabel: { fontFamily: fontFamily.medium, fontSize: fontSize.md, color: colors.text },
  optionSub: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  empty: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    padding: spacing.xl,
  },
});
