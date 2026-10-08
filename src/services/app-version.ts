import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

/**
 * The running build's version. Under an OTA bundle that is the bundle's own
 * version, read from its manifest — `Constants.expoConfig` can still report the
 * APK's, and a phone that thinks it is older than it is keeps "updating" to
 * what it already runs.
 */
const manifest = Updates.manifest as
  | { extra?: { expoClient?: { version?: string }; appVersion?: string } }
  | null
  | undefined;

export const APP_VERSION: string | null =
  manifest?.extra?.expoClient?.version ??
  manifest?.extra?.appVersion ??
  Constants.expoConfig?.version ??
  null;

/**
 * The 1.0 APK was built with the keyboard in "pan" mode: Android slides the whole window
 * up itself, so the screens must not scroll for the keyboard as well (that overshoots
 * into blank space). Later APKs keep the window still and leave the scrolling to us.
 */
export const KEYBOARD_PANS = Platform.OS === 'android' && Updates.isEnabled && Updates.runtimeVersion === '1.0';
