import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { usePathname, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';
import { useAuthStore } from '@/src/stores/authStore';
import { useScanStore } from '@/src/stores/scanStore';
import { useUIStore } from '@/src/stores/uiStore';
import { actionsFor, type ActionDef } from '@/src/scan/actions';
import { PROCESSES, appTitle, processLabel } from '@/src/scan/processes';

/** Every action of this scanner's processes, grouped by process, plus Settings. */
export function DrawerMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const visible = useUIStore((s) => s.drawerOpen);
  const onClose = useUIStore((s) => s.closeDrawer);
  const { width: screenWidth } = useWindowDimensions();
  const fullName = useAuthStore((s) => s.fullName);
  const email = useAuthStore((s) => s.email);
  const logout = useAuthStore((s) => s.logout);
  const farm = useScanStore((s) => s.farm);
  const processes = useScanStore((s) => s.processes);

  const drawerWidth = Math.min(Math.max(screenWidth * 0.82, 260), 340);
  const slide = useRef(new Animated.Value(-drawerWidth)).current;

  useEffect(() => {
    if (visible) {
      slide.setValue(-drawerWidth);
      Animated.timing(slide, { toValue: 0, duration: 250, useNativeDriver: true }).start();
    } else {
      slide.setValue(-drawerWidth);
    }
  }, [visible, drawerWidth, slide]);

  const closeWithAnim = (then?: () => void) => {
    Animated.timing(slide, { toValue: -drawerWidth, duration: 200, useNativeDriver: true }).start(() => {
      onClose();
      then?.();
    });
  };

  const go = (href: Href, active: boolean) => {
    if (active) {
      closeWithAnim();
      return;
    }
    closeWithAnim(() => {
      // Scan and process screens replace each other so Back always leads home.
      if (pathname.startsWith('/scan/') || pathname.startsWith('/process/')) router.replace(href);
      else router.push(href);
    });
  };

  const goHome = () => closeWithAnim(() => pathname !== '/' && router.dismissTo('/'));

  const openAction = (a: ActionDef) => {
    if (a.needsFarm && !farm) {
      go('/settings', pathname === '/settings');
      return;
    }
    go({ pathname: '/scan/[action]', params: { action: a.key } }, pathname === `/scan/${a.key}`);
  };

  const onSignOut = () =>
    closeWithAnim(async () => {
      await logout();
      router.replace('/login');
    });

  const actions = actionsFor(processes);
  const groups = PROCESSES.filter((p) => actions.some((a) => a.group === p.key));
  const initials =
    (fullName || email || '?')
      .split(' ')
      .filter(Boolean)
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase() || '?';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={() => closeWithAnim()}
      statusBarTranslucent
      navigationBarTranslucent
      hardwareAccelerated
    >
      {/* A Modal is its own window on Android, so the app's root safe-area insets
          don't reach it: measure them again in here, or the logo and title draw
          under the status bar. */}
      <SafeAreaProvider style={s.overlay}>
        <Pressable style={s.backdrop} onPress={() => closeWithAnim()} accessibilityLabel="Close menu" />
        <Animated.View style={[s.drawer, { width: drawerWidth, transform: [{ translateX: slide }] }]}>
          <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom', 'left']}>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={s.scroll}
              bounces={false}
              showsVerticalScrollIndicator={false}
            >
              <View style={s.brand}>
                <Image
                  source={require('@/assets/images/upande_logo.png')}
                  style={s.logo}
                  resizeMode="contain"
                  accessibilityLabel="Upande"
                />
                <Text style={s.brandName} numberOfLines={2}>
                  {appTitle(processes)}
                </Text>
              </View>

              <View style={s.header}>
                <View style={s.avatar}>
                  <Text style={s.avatarText}>{initials}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.name} numberOfLines={1}>
                    {fullName || email || 'User'}
                  </Text>
                  {email ? (
                    <Text style={s.email} numberOfLines={1}>
                      {email}
                    </Text>
                  ) : null}
                </View>
              </View>

              <TouchableOpacity
                style={s.station}
                onPress={() => go('/settings', pathname === '/settings')}
                activeOpacity={0.7}
                accessibilityLabel="Change process and farm"
              >
                <Ionicons name="location-outline" size={18} color={colors.text} />
                <View style={{ flex: 1 }}>
                  <Text style={s.stationFarm}>{farm || 'No farm chosen'}</Text>
                  <Text style={s.stationSub} numberOfLines={1}>
                    {processes.length ? processLabel(processes) : 'All processes'}
                  </Text>
                </View>
                <Text style={s.change}>Change</Text>
              </TouchableOpacity>

              <NavRow icon="home-outline" label="Home" active={pathname === '/'} onPress={goHome} />

              {groups.map((g) => (
                <View key={g.key}>
                  <TouchableOpacity
                    onPress={() => go({ pathname: '/process/[key]', params: { key: g.key } }, pathname === `/process/${g.key}`)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`${g.label} overview`}
                    style={s.groupRow}
                  >
                    <Text style={[s.group, pathname === `/process/${g.key}` && s.groupOn]}>{g.label}</Text>
                    <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                  </TouchableOpacity>
                  {actions
                    .filter((a) => a.group === g.key)
                    .map((a) => (
                      <NavRow
                        key={a.key}
                        icon={a.icon}
                        label={a.label}
                        active={pathname === `/scan/${a.key}`}
                        onPress={() => openAction(a)}
                      />
                    ))}
                </View>
              ))}
            </ScrollView>

            {/* Pinned to the bottom-left, whatever the list's length. */}
            <View style={s.footer}>
              <NavRow
                icon="settings-outline"
                label="Settings"
                active={pathname === '/settings'}
                onPress={() => go('/settings', pathname === '/settings')}
              />
              <NavRow icon="log-out-outline" label="Sign out" danger onPress={onSignOut} />
              <Text style={s.version}>{appTitle(processes)} v{Constants.expoConfig?.version ?? '1.0.0'}</Text>
            </View>
          </SafeAreaView>
        </Animated.View>
      </SafeAreaProvider>
    </Modal>
  );
}

function NavRow({
  icon,
  label,
  active,
  danger,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  active?: boolean;
  danger?: boolean;
  onPress: () => void;
}) {
  const fg = active ? colors.textOnPrimary : danger ? colors.error : colors.text;
  return (
    <TouchableOpacity
      style={[s.navItem, active && s.navItemOn]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
    >
      <Ionicons name={icon} size={20} color={active ? fg : danger ? colors.error : colors.textSecondary} />
      <Text style={[s.navLabel, { color: fg }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.overlay },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.surface,
    flexDirection: 'column',
    elevation: 24,
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingBottom: spacing.md,
    marginBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  logo: { width: 38, height: 38 },
  brandName: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: colors.text },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingBottom: spacing.md },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: colors.textOnPrimary },
  name: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text },
  email: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  station: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 56,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceAlt,
    marginBottom: spacing.md,
  },
  stationFarm: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: colors.text },
  stationSub: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textSecondary },
  change: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: colors.text },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 36,
    marginTop: spacing.md,
    paddingRight: spacing.sm,
  },
  groupOn: { color: colors.text },
  group: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: spacing.sm,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 48,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  navItemOn: { backgroundColor: colors.primary },
  navLabel: { fontFamily: fontFamily.medium, fontSize: fontSize.md },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
  },
  version: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
});
