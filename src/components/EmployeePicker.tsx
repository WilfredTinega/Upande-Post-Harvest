import React, { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { scanApi, type Employee, type EmployeeRole } from '@/src/services/scan-api';
import { cachedList, employeesKey, fetchList } from '@/src/services/list-cache';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';
import { ListSkeleton } from '@/src/components/Skeleton';
import { useSheetLayout } from '@/src/components/useSheetLayout';
import { userMessage } from '@/src/services/user-message';

/** Pause after typing before searching. */
const SEARCH_DELAY_MS = 150;

interface Props {
  label: string;
  value: Employee | null;
  onChange: (employee: Employee | null) => void;
  placeholder?: string;
  optional?: boolean;
  /** List this farm's recent people in `role` first. */
  recentAtFarm?: string;
  role?: EmployeeRole;
  /** Keep `label` for the picker's title only, e.g. when the field sits in a row. */
  inline?: boolean;
}

/** Employee field backed by a server-side search (there are too many to list up front). */
export function EmployeePicker({
  label,
  value,
  onChange,
  placeholder = 'Select employee',
  optional,
  recentAtFarm,
  role = 'harvester',
  inline = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const { overlayRef, onOverlayLayout, sheetStyle } = useSheetLayout(open);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    const mine = ++seq.current;
    const key: string | null = employeesKey(recentAtFarm, role, query);
    const held = key ? cachedList<Employee[]>(key) : undefined;
    // A held list shows at once and refreshes quietly; the skeleton is only for a first load.
    const t = setTimeout(
      async () => {
        if (held) setResults(held);
        else setLoading(true);
        try {
          const load = () => scanApi.searchEmployees(query, recentAtFarm, role);
          const rows = (await (key ? fetchList<Employee[]>(key, load) : load())) ?? [];
          if (mine === seq.current) {
            setResults(rows);
            setError(null);
          }
        } catch (err) {
          if (mine === seq.current && !held) setError(userMessage(err, 'Search failed'));
        } finally {
          if (mine === seq.current) setLoading(false);
        }
      },
      query && !held ? SEARCH_DELAY_MS : 0,
    );
    return () => clearTimeout(t);
  }, [open, query, recentAtFarm, role]);

  const pick = (e: Employee | null) => {
    onChange(e);
    setOpen(false);
    setQuery('');
  };

  return (
    <View>
      {inline ? null : (
        <Text style={s.label}>
          {label}
          {optional ? <Text style={s.optional}>  optional</Text> : null}
        </Text>
      )}
      <Pressable onPress={() => setOpen(true)} style={s.field}>
        <Ionicons name="person-outline" size={18} color={colors.textMuted} />
        <Text style={[s.value, !value && s.placeholder]} numberOfLines={1}>
          {value ? (
            <>
              {value.employee_name}
              <Text style={s.optionNumber}>  {value.employee_number || value.name}</Text>
            </>
          ) : (
            placeholder
          )}
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
        <View ref={overlayRef} style={s.overlay} onLayout={onOverlayLayout}>
          {/* The backdrop closes the sheet; the sheet itself is a plain View so its list keeps its swipes. */}
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} accessibilityLabel="Close" />
          <View style={[s.sheet, sheetStyle]}>
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
                placeholder="Search name or payroll number"
                placeholderTextColor={colors.textMuted}
                autoFocus
                autoCorrect={false}
                style={s.search}
              />
              
            </View>
            {error ? <Text style={s.error}>{error}</Text> : null}
            <FlatList
              style={s.list}
              // Each load, a new search too, shows the skeleton in place of the old rows.
              data={loading ? [] : results}
              keyExtractor={(e) => e.name}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
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
                  <Text style={s.optionLabel} numberOfLines={1}>
                    {item.employee_name}
                    <Text style={s.optionNumber}>  {item.employee_number || item.name}</Text>
                  </Text>
                  {item.recent || item.designation ? (
                    <Text style={s.optionSub}>
                      {[item.recent ? 'Recent' : null, item.designation].filter(Boolean).join(' · ')}
                    </Text>
                  ) : null}
                </Pressable>
              )}
            />
          </View>
        </View>
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
    minHeight: 46,
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
  },
  list: { flexShrink: 1 },
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
  option: { minHeight: 56, justifyContent: 'center', paddingVertical: spacing.md },
  optionLabel: { fontFamily: fontFamily.medium, fontSize: fontSize.md, color: colors.text },
  optionNumber: { fontFamily: fontFamily.bold, color: colors.text },
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
