import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/src/components/Screen';
import { Alert } from '@/src/components/Card';
import { Button } from '@/src/components/Button';
import { ProcessLanding } from '@/src/components/ProcessLanding';
import { InstanceLogo } from '@/src/components/InstanceLogo';
import { useToast } from '@/src/components/Toast';
import { useAuthStore } from '@/src/stores/authStore';
import { useNetworkStore } from '@/src/stores/networkStore';
import { useScanStore } from '@/src/stores/scanStore';
import { useUIStore } from '@/src/stores/uiStore';
import { type ActionDef } from '@/src/scan/actions';
import { PROCESSES, type ProcessDef } from '@/src/scan/processes';
import { useOverview } from '@/src/scan/useOverview';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';

/**
 * Home: one page per process this scanner is used for, swiped horizontally.
 * The header title follows the page on screen (Production → Packhouse →
 * Dispatch); each page scrolls vertically on its own.
 */
export default function HomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { showError } = useToast();
  const fullName = useAuthStore((s) => s.fullName);
  const online = useNetworkStore((s) => s.online);
  const openDrawer = useUIStore((s) => s.openDrawer);
  const { farms, farmsSource, farmsNotice, farm, processes, load, loading, error } = useScanStore();
  const { overview, loading: overviewLoading, error: overviewError, reload } = useOverview(farm);

  useEffect(() => {
    load();
  }, [load]);

  // Every chosen process gets the same landing; all of them until some are chosen.
  const shown = PROCESSES.filter((p) => !processes.length || processes.includes(p.key));
  const [page, setPage] = useState(0);
  const pager = useRef<FlatList<ProcessDef>>(null);
  const current = shown[Math.min(page, shown.length - 1)] ?? PROCESSES[0];

  // Back to the first page when the chosen processes change.
  const shownKey = shown.map((p) => p.key).join(',');
  const [pageKey, setPageKey] = useState(shownKey);
  if (pageKey !== shownKey) {
    setPageKey(shownKey);
    setPage(0);
  }
  useEffect(() => {
    pager.current?.scrollToOffset({ offset: 0, animated: false });
  }, [shownKey]);

  const onPageScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / Math.max(width, 1));
    if (next !== page) setPage(next);
  };

  const goTo = (i: number) => {
    setPage(i);
    pager.current?.scrollToIndex({ index: i, animated: true });
  };

  const unknownFarm = !!farm && farmsSource === 'server' && !farms.includes(farm);
  const needsSetup = !farm || !processes.length || unknownFarm;

  // Process and farm are chosen in Settings: a scanner without them goes
  // straight there after sign-in, once.
  const scannerHydrated = useScanStore((s) => s.hydrated);
  const sentToSetup = useRef(false);
  useEffect(() => {
    if (!scannerHydrated || sentToSetup.current) return;
    if (!farm || !processes.length) {
      sentToSetup.current = true;
      router.push('/settings');
    }
  }, [scannerHydrated, farm, processes.length, router]);

  const open = (action: ActionDef) => {
    if (action.needsFarm && !farm) {
      showError('Choose the farm first.');
      router.push('/settings');
      return;
    }
    router.push({ pathname: '/scan/[action]', params: { action: action.key } });
  };

  const refreshing = loading || overviewLoading;
  const refresh = () => {
    load();
    reload();
  };

  const header = (
    <View>
      <View style={s.greetingBlock}>
        <InstanceLogo />
        <Text style={s.greeting}>{fullName ? `Welcome back, ${fullName.split(' ')[0]}` : 'Welcome'}</Text>
        <View style={s.topRow}>
          <Text style={s.dateText}>
            {farm ? `${farm} · ` : ''}
            <PhoneClock />
          </Text>
          <View style={[s.statusPill, online ? s.pillLive : s.pillOffline]}>
            <View style={[s.statusDot, online ? s.dotLive : s.dotOffline]} />
            <Text style={[s.statusText, online ? s.statusTextLive : s.statusTextOffline]}>
              {online ? 'Live' : 'Offline'}
            </Text>
          </View>
        </View>
      </View>

      {needsSetup ? (
        <View style={s.block}>
          <Alert tone="warn">
            {unknownFarm
              ? `${farm} is not set up on this server. Choose another farm.`
              : !farm
                ? 'Choose the farm before scanning.'
                : 'Choose the process.'}
          </Alert>
          <Button label="Choose process and farm" iconLeft="options-outline" onPress={() => router.push('/settings')} />
        </View>
      ) : null}

      {/* No inline "offline" message: the Live/Offline pill says it. Only a
          server that answers with no farms set up is worth a note here. */}
      {!error && farmsNotice ? (
        <View style={s.block}>
          <Alert tone="warn">{farmsNotice}</Alert>
        </View>
      ) : null}
    </View>
  );

  const landing = (p: ProcessDef) => (
    <ProcessLanding
      process={p.key}
      farm={farm}
      overview={overview}
      loading={overviewLoading}
      error={overviewError}
      onRetry={reload}
      showLabel={false}
      onOpen={open}
    />
  );

  const page_ = (p: ProcessDef) => (
    <ScrollView
      style={{ width }}
      contentContainerStyle={s.page}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      {landing(p)}
    </ScrollView>
  );

  // The greeting and status stay put; only the process pages below them scroll.
  return (
    <Screen
      title={current.label}
      leftIcon="menu"
      onPressLeft={openDrawer}
      rightIcon="settings-outline"
      onPressRight={() => router.push('/settings')}
      scroll={false}
    >
      <View style={s.fixed}>{header}</View>
      {shown.length > 1 ? (
        <>
          <View style={s.dots}>
            {shown.map((p, i) => (
              <Pressable
                key={p.key}
                onPress={() => goTo(i)}
                hitSlop={10}
                accessibilityRole="tab"
                accessibilityState={{ selected: i === page }}
                accessibilityLabel={p.label}
                style={[s.dot, i === page && s.dotOn]}
              />
            ))}
          </View>
          <FlatList
            ref={pager}
            style={{ flex: 1 }}
            data={shown}
            keyExtractor={(p) => p.key}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={onPageScroll}
            scrollEventThrottle={16}
            getItemLayout={(_, index) => ({
              length: width,
              offset: width * index,
              index,
            })}
            renderItem={({ item }) => page_(item)}
          />
        </>
      ) : (
        page_(current)
      )}
    </Screen>
  );
}

/**
 * The phone's date and time, re-read every second so it rolls over with the
 * phone's clock. Its own component, so only this text re-renders each tick.
 */
function PhoneClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <Text>
      {now.toLocaleDateString([], {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      })}
      {' · '}
      {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
    </Text>
  );
}

const s = StyleSheet.create({
  greeting: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.lg,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dateText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  pillLive: { backgroundColor: '#DCFCE7', borderColor: '#86EFAC' },
  pillOffline: { backgroundColor: '#FEF3C7', borderColor: '#FCD34D' },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  dotLive: { backgroundColor: '#16A34A' },
  dotOffline: { backgroundColor: '#D97706' },
  statusText: { fontFamily: fontFamily.medium, fontSize: fontSize.xs },
  statusTextLive: { color: '#16A34A' },
  statusTextOffline: { color: '#D97706' },
  block: { marginTop: spacing.md },
  greetingBlock: { minHeight: 56, justifyContent: 'center' },
  fixed: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.background,
  },
  page: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotOn: { width: 22, backgroundColor: colors.primary },
});
