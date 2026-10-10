import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dialog } from '@/src/components/AppDialog';
import { Button } from '@/src/components/Button';
import { Card } from '@/src/components/Card';
import { useSheetLayout } from '@/src/components/useSheetLayout';
import { useToast } from '@/src/components/Toast';
import { scanApi, type FieldRejectLine } from '@/src/services/scan-api';
import { useFieldRejectsStore } from '@/src/stores/fieldRejectsStore';
import { userMessage } from '@/src/services/user-message';
import { audio } from '@/src/audio';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

interface Props {
  farm: string;
}

const NO_LINES: FieldRejectLine[] = [];

/** The field rejects added so far, each with its bed/bay, and the one submit for all of them. */
export function FieldRejectsList({ farm }: Props) {
  const lines = useFieldRejectsStore((st) => st.lists[farm] ?? NO_LINES);
  const hydrate = useFieldRejectsStore((st) => st.hydrate);
  useEffect(() => {
    hydrate();
  }, [hydrate]);
  const onChange = (next: FieldRejectLine[]) => useFieldRejectsStore.getState().set(farm, next);
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  // The row the server refused, marked until the list changes.
  const [badRow, setBadRow] = useState<number | null>(null);
  // The row whose stems are being edited, and the typed count.
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState('');

  const { overlayRef, onOverlayLayout, sheetStyle } = useSheetLayout(editing !== null);

  if (!lines.length) return null;
  const stems = lines.reduce((n, l) => n + l.stems, 0);

  const change = (next: FieldRejectLine[]) => {
    setBadRow(null);
    onChange(next);
  };

  const startEdit = (i: number) => {
    setEditing(i);
    setDraft(String(lines[i].stems));
  };

  const draftStems = Number(draft.trim());
  const draftValid = Number.isInteger(draftStems) && draftStems > 0;

  const saveEdit = () => {
    if (editing === null || !draftValid) return;
    change(lines.map((l, j) => (j === editing ? { ...l, stems: draftStems } : l)));
    setEditing(null);
  };

  const removeEditing = () => {
    if (editing === null) return;
    change(lines.filter((_, j) => j !== editing));
    setEditing(null);
  };

  const submit = async () => {
    setBusy(true);
    try {
      const r = await scanApi.submitFieldRejects(farm, lines);
      if (r.success) {
        audio.beep();
        notify(`${lines.length} rejects submitted · ${stems.toLocaleString()} stems`, 'success', 2000, 'center');
        change([]);
      } else {
        audio.error();
        setBadRow(r.row ? r.row - 1 : null);
        notify(r.error || 'Could not submit the rejects', 'error', 3000, 'center');
      }
    } catch (err) {
      audio.error();
      notify(userMessage(err, 'Could not submit the rejects'), 'error', 3000, 'center');
    } finally {
      setBusy(false);
    }
  };

  const confirmSubmit = () => {
    const greenhouses = [...new Set(lines.map((l) => l.greenhouse))];
    dialog(
      'Submit field rejects',
      `Are you sure you want to submit these ${lines.length} reject${lines.length === 1 ? '' : 's'} ` +
        `(${stems.toLocaleString()} stems)? This creates one entry for ` +
        (greenhouses.length === 1 ? greenhouses[0] : `each of ${greenhouses.length} greenhouses: ${greenhouses.join(', ')}`) +
        '.',
      [
        { text: 'No', style: 'cancel' },
        { text: 'Yes', onPress: submit },
      ],
    );
  };

  return (
    <Card style={s.card}>
      <View style={s.head}>
        <Text style={s.title}>
          {lines.length} reject{lines.length === 1 ? '' : 's'} to submit
        </Text>
        <Text style={s.total}>Total {stems.toLocaleString()} stems</Text>
      </View>
      <View style={s.table}>
        <View style={[s.row, s.headRow]}>
          <Text style={[s.th, s.colVariety]}>Variety</Text>
          <Text style={[s.th, s.colStems]}>Stems</Text>
        </View>
        {lines.map((l, i) => (
          <Pressable
            key={i}
            onPress={() => startEdit(i)}
            disabled={busy}
            style={({ pressed }) => [s.row, badRow === i && s.rowBad, pressed && s.rowPressed]}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${l.item_code}, ${l.stems} stems`}
          >
            <View style={s.colVariety}>
              <Text style={s.variety} numberOfLines={2}>
                {l.item_code}
              </Text>
              <Text style={s.reason} numberOfLines={2}>
                {l.reason}
              </Text>
            </View>
            <Text style={[s.td, s.colStems]}>{l.stems.toLocaleString()}</Text>
          </Pressable>
        ))}
      </View>
      <Button
        label={busy ? 'Submitting…' : `Submit ${lines.length} reject${lines.length === 1 ? '' : 's'}`}
        iconLeft="checkmark-done-outline"
        loading={busy}
        onPress={confirmSubmit}
      />
      <EditSheet
        line={editing === null ? null : lines[editing]}
        draft={draft}
        onDraft={(t) => setDraft(t.replace(/[^0-9]/g, ''))}
        valid={draftValid}
        onSave={saveEdit}
        onRemove={removeEditing}
        onClose={() => setEditing(null)}
        overlayRef={overlayRef}
        onOverlayLayout={onOverlayLayout}
        sheetStyle={sheetStyle}
      />
    </Card>
  );
}

interface EditSheetProps {
  line: FieldRejectLine | null;
  draft: string;
  onDraft: (t: string) => void;
  valid: boolean;
  onSave: () => void;
  onRemove: () => void;
  onClose: () => void;
  overlayRef: ReturnType<typeof useSheetLayout>['overlayRef'];
  onOverlayLayout: () => void;
  sheetStyle: ReturnType<typeof useSheetLayout>['sheetStyle'];
}

/** One reject's stems to change, or the reject to take off the list. */
function EditSheet({ line, draft, onDraft, valid, onSave, onRemove, onClose, overlayRef, onOverlayLayout, sheetStyle }: EditSheetProps) {
  return (
    <Modal visible={!!line} transparent animationType="slide" onRequestClose={onClose}>
      <View ref={overlayRef} style={s.overlay} onLayout={onOverlayLayout}>
        {/* The backdrop closes the sheet; the sheet itself is a plain View so its list keeps its swipes. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[s.sheet, sheetStyle]}>
          {line ? (
            <>
              <View style={s.sheetHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={s.sheetTitle} numberOfLines={1}>
                    {line.item_code}
                  </Text>
                  <Text style={s.sub} numberOfLines={1}>
                    Bed {line.bed} · {line.reason} · {line.greenhouse}
                  </Text>
                </View>
                <Pressable onPress={onClose} style={s.closeBtn} accessibilityLabel="Close">
                  <Ionicons name="close" size={20} color={colors.text} />
                </Pressable>
              </View>
              <Text style={s.inputLabel}>Stems rejected</Text>
              <TextInput
                value={draft}
                onChangeText={onDraft}
                onSubmitEditing={onSave}
                keyboardType="number-pad"
                returnKeyType="done"
                maxLength={4}
                autoFocus
                style={s.input}
              />
              <View style={s.sheetButtons}>
                <Button label="Remove" iconLeft="trash-outline" variant="outline" color={colors.error} onPress={onRemove} style={{ flex: 1 }} />
                <Button label="Save" iconLeft="checkmark-outline" disabled={!valid} onPress={onSave} style={{ flex: 1 }} />
              </View>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  card: { marginTop: spacing.md, gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  title: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  total: { fontFamily: fontFamily.bold, fontSize: fontSize.sm, color: colors.text },
  table: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  headRow: { borderTopWidth: 0, backgroundColor: colors.surfaceAlt },
  rowBad: { backgroundColor: '#FEF2F2' },
  th: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: colors.textSecondary },
  td: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  colVariety: { flex: 1, minWidth: 0 },
  colStems: { width: 64, textAlign: 'right' },

  rowPressed: { backgroundColor: colors.surfaceAlt },
  variety: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text },
  reason: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  sheetTitle: { fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: colors.text },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputLabel: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  input: {
    minHeight: 52,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    fontFamily: fontFamily.bold,
    fontSize: fontSize.lg,
    color: colors.text,
  },
  sheetButtons: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  sub: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
});
