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
