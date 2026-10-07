import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/components/Screen';
import { Card } from '@/src/components/Card';
import { Button } from '@/src/components/Button';
import { deviceApi, type InstallRow, type InstallsReply } from '@/src/services/scan-api';
import { HttpError } from '@/src/services/api';
import { getInstallId } from '@/src/services/install-register';
import { compareVersions } from '@/src/services/updates';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';
import { userMessage } from '@/src/services/user-message';
import { useScanStore } from '@/src/stores/scanStore';

/**
 * The device register: every handheld the app is installed on, who signed in
 * on it, and which build it runs. System Managers only — the server refuses
 * everyone else (`upande_postharvest.mobile_api.devices.installs`).
 *
 * Timestamps come back in the site's timezone with no offset, so "x ago" is
 * measured against the `server_time` of the same response, not the phone's clock.
 */

const PAGE_SIZE = 30;
const WINDOWS: { label: string; days: number }[] = [
  { label: 'All', days: 0 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
];

function parseServer(ts: string | null | undefined): number | null {
  if (!ts) return null;
  const t = Date.parse(ts.replace(' ', 'T'));
  return Number.isFinite(t) ? t : null;
}

function ago(ts: string | null | undefined, serverNow: string | null | undefined): string {
  const t = parseServer(ts);
  const now = parseServer(serverNow) ?? Date.now();
  if (t == null) return '—';
  const mins = Math.max(0, Math.round((now - t) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days < 60 ? `${days}d ago` : (ts ?? '').slice(0, 10);
}

export default function DevicesScreen() {
  // System Managers only (the server refuses everyone else too): anyone else who
  // lands here, e.g. from a deep link, goes back to Settings.
  const canViewDevices = useScanStore((st) => st.canViewDevices);
  return canViewDevices ? <DevicesRegister /> : <Redirect href="/settings" />;
}

function DevicesRegister() {
  const router = useRouter();
  const [data, setData] = useState<InstallsReply | null>(null);
  const [rows, setRows] = useState<InstallRow[]>([]);
  /** The filter the shown data belongs to; loading = it differs from the current one. */
  const [settledKey, setSettledKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(0);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [myInstallId, setMyInstallId] = useState<string | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    getInstallId().then(setMyInstallId);
  }, []);

  // Debounce the search box so typing doesn't fire a request per key.
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' | 'more') => {
      const seq = ++requestSeq.current;
      const key = `${days}|${query}`;
      if (mode === 'refresh') setRefreshing(true);
      else if (mode === 'more') setLoadingMore(true);
      try {
        const start = mode === 'more' ? rows.length : 0;
        const res = await deviceApi.installs({
          start,
          page_length: PAGE_SIZE,
          since_days: days || undefined,
          search: query || undefined,
        });
        if (seq !== requestSeq.current) return; // a newer filter superseded this one
        setData(res);
        setRows((prev) => (mode === 'more' ? [...prev, ...(res.rows ?? [])] : res.rows ?? []));
        setError(null);
      } catch (err) {
        if (seq !== requestSeq.current) return;
        const status = err instanceof HttpError ? err.status : 0;
        setError(
          status === 404
            ? 'The device register is not available on this server.'
            : userMessage(err, 'Could not load the device register.'),
        );
      } finally {
        if (seq === requestSeq.current) {
          setSettledKey(key);
          setRefreshing(false);
          setLoadingMore(false);
        }
      }
    },
    [days, query, rows.length],
  );

  // Reload from the top whenever a filter changes. `load` itself changes with
  // rows.length, so it is deliberately not a dependency here.
  useEffect(() => {
    const t = setTimeout(() => load('initial'), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, query]);

  const loading = settledKey !== `${days}|${query}`;
  const summary = data?.summary;
  const newestVersion = (summary?.by_app_version ?? [])
    .map((v) => v.app_version)
    .filter(Boolean)
    .sort((a, b) => compareVersions(b, a))[0];
  const hasMore = rows.length < (data?.total ?? 0);

  return (
    <Screen
      title="Devices"
      leftIcon="arrow-back"
      onPressLeft={() => router.back()}
      loading={loading && !data}
      error={!data ? error : null}
      onRetry={() => load('initial')}
      refreshing={refreshing}
      onRefresh={() => load('refresh')}
    >
      {summary ? (
        <>
          <View style={s.tiles}>
            <Tile label="Devices" value={summary.devices} />
            <Tile label="Users" value={summary.users} />
            <Tile label="Active 7d" value={summary.active_7d} />
            <Tile label="Active 30d" value={summary.active_30d} />
          </View>
          <Text style={s.caption}>
            {summary.total_installs} install{summary.total_installs === 1 ? '' : 's'} ever registered ·{' '}
            {summary.physical_devices} physical device{summary.physical_devices === 1 ? '' : 's'}
          </Text>

          {summary.by_app_version.length ? (
            <Card title="Versions in use">
              {summary.by_app_version.map((v) => (
                <BarRow
                  key={v.app_version || '?'}
                  label={v.app_version || 'Unknown'}
                  count={v.count}
                  total={summary.devices}
                  highlight={!!newestVersion && v.app_version === newestVersion}
                />
              ))}
            </Card>
          ) : null}

          {summary.by_user.length ? (
            <Card title="People">
              {summary.by_user.map((u) => (
                <View key={u.user} style={s.listRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowTitle} numberOfLines={1}>
                      {u.full_name || u.user}
                    </Text>
                    <Text style={s.rowMeta} numberOfLines={1}>
                      {u.device_model || 'Unknown device'} · {u.devices} device{u.devices === 1 ? '' : 's'} · {u.logins}{' '}
                      sign-in{u.logins === 1 ? '' : 's'}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <VersionBadge version={u.app_version} newest={newestVersion} />
                    <Text style={s.rowMeta}>{ago(u.last_seen, data?.server_time)}</Text>
                  </View>
                </View>
              ))}
            </Card>
          ) : null}
        </>
      ) : null}

      <Card title="All devices">
        <View style={s.searchBox}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Model, user or IP"
            placeholderTextColor={colors.textMuted}
            style={s.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={s.windows}>
          {WINDOWS.map((w) => (
            <TouchableOpacity
              key={w.days}
              style={[s.windowChip, days === w.days && s.windowChipOn]}
              onPress={() => setDays(w.days)}
            >
              <Text style={[s.windowText, days === w.days && s.windowTextOn]}>{w.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {error && data ? <Text style={s.errorText}>{error}</Text> : null}
        {!rows.length && !loading ? (
          <Text style={s.empty}>{query || days ? 'No device matches.' : 'No device has registered yet.'}</Text>
        ) : null}

        {rows.map((r) => (
          <DeviceRow
            key={r.install_id}
            row={r}
            serverNow={data?.server_time}
            newest={newestVersion}
            mine={r.install_id === myInstallId}
          />
        ))}

        {hasMore ? (
          <Button
            label={loadingMore ? 'Loading…' : `Show more (${rows.length} of ${data?.total ?? 0})`}
            variant="ghost"
            onPress={() => load('more')}
            loading={loadingMore}
            style={{ marginTop: spacing.sm }}
          />
        ) : null}
      </Card>
    </Screen>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <View style={s.tile}>
      <Text style={s.tileValue}>{value}</Text>
      <Text style={s.tileLabel}>{label}</Text>
    </View>
  );
}

function BarRow({ label, count, total, highlight }: { label: string; count: number; total: number; highlight: boolean }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <View style={s.barRow}>
      <Text style={[s.barLabel, highlight && s.bold]}>
        {label}
        {highlight ? '  · latest' : ''}
      </Text>
      <View style={s.barTrack}>
        <View style={[s.barFill, { width: `${pct}%` }, !highlight && s.barFillMuted]} />
      </View>
      <Text style={s.barCount}>{count}</Text>
    </View>
  );
}

function VersionBadge({ version, newest }: { version: string; newest?: string }) {
  const behind = !!newest && !!version && compareVersions(version, newest) < 0;
  return (
    <View style={[s.badge, behind && s.badgeBehind]}>
      <Text style={[s.badgeText, behind && s.badgeTextBehind]}>{version || '?'}</Text>
    </View>
  );
}

function DeviceRow({
  row,
  serverNow,
  newest,
  mine,
}: {
  row: InstallRow;
  serverNow?: string;
  newest?: string;
  mine: boolean;
}) {
  const [open, setOpen] = useState(false);
  const model = [row.device_brand, row.device_model].filter(Boolean).join(' ') || 'Unknown device';
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={() => setOpen((o) => !o)} style={s.listRow}>
      <Ionicons
        name={row.is_physical_device ? 'phone-portrait-outline' : 'desktop-outline'}
        size={20}
        color={colors.textSecondary}
      />
      <View style={{ flex: 1 }}>
        <Text style={s.rowTitle} numberOfLines={1}>
          {row.device_name && row.device_name !== row.device_model ? row.device_name : model}
          {mine ? '  (this device)' : ''}
        </Text>
        <Text style={s.rowMeta} numberOfLines={1}>
          {row.full_name || row.user || 'No user'} · {ago(row.last_seen, serverNow)}
        </Text>
        {open ? (
          <View style={s.details}>
            <Detail label="Model" value={model} />
            <Detail label="OS" value={`${row.platform} ${row.os_version}`.trim()} />
            <Detail label="Runtime" value={row.runtime_version || '—'} />
            {row.previous_app_version ? (
              <Detail
                label="Upgraded"
                value={`${row.previous_app_version} → ${row.app_version} · ${ago(row.version_changed_at, serverNow)}`}
              />
            ) : null}
            <Detail label="Launches" value={String(row.launches)} />
            <Detail label="First seen" value={(row.first_seen ?? '—').slice(0, 16)} />
            <Detail label="IP" value={row.ip_address || '—'} />
            <Detail label="Install ID" value={row.install_id.slice(0, 8)} />
            {!row.is_physical_device ? <Detail label="Type" value="Emulator" /> : null}
          </View>
        ) : null}
      </View>
      <VersionBadge version={row.app_version} newest={newest} />
    </TouchableOpacity>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.detailRow}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  tileValue: { fontFamily: fontFamily.bold, fontSize: fontSize.xl, color: colors.text },
  tileLabel: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  caption: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 },
  barLabel: { width: 110, fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.text },
  bold: { fontFamily: fontFamily.semiBold },
  barTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: colors.text },
  barFillMuted: { backgroundColor: colors.textMuted },
  barCount: { width: 28, textAlign: 'right', fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.text },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rowTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  rowMeta: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    backgroundColor: '#DCFCE7',
  },
  badgeBehind: { backgroundColor: '#FEF3C7' },
  badgeText: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: '#166534' },
  badgeTextBehind: { color: '#92400E' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    height: 40,
  },
  searchInput: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.md, color: colors.text, padding: 0 },
  windows: { flexDirection: 'row', gap: spacing.sm, marginVertical: spacing.md },
  windowChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  windowChipOn: { backgroundColor: colors.text, borderColor: colors.text },
  windowText: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textSecondary },
  windowTextOn: { color: colors.textOnPrimary },
  details: { marginTop: spacing.sm, gap: 2 },
  detailRow: { flexDirection: 'row', gap: spacing.sm },
  detailLabel: { width: 80, fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted },
  detailValue: { flex: 1, fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textSecondary },
  empty: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  errorText: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.error, marginBottom: spacing.sm },
});
