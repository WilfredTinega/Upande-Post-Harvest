import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';

/**
 * Downloading a release APK and handing it to Android's package installer.
 * Ported from the Upande Sensors app (src/utils/installApk.js).
 *
 * Android will not install from a `file://` path, so the download is exposed
 * through Expo's FileProvider as a `content://` URI and the intent is granted
 * read access. The legacy expo-file-system API is used on purpose: the new
 * `File` API has no download-with-progress and no content-URI helper.
 *
 * The install itself can never be silent on an ordinary app: Android shows its
 * own "Update this app?" screen. `REQUEST_INSTALL_PACKAGES` (app.json) only
 * stops the OS refusing the attempt outright.
 */

const FLAG_GRANT_READ_URI_PERMISSION = 1;
const VIEW_ACTION = 'android.intent.action.VIEW';
const INSTALL_ACTION = 'android.intent.action.INSTALL_PACKAGE';
const UNKNOWN_SOURCES_SETTINGS = 'android.settings.MANAGE_UNKNOWN_APP_SOURCES';
const APK_MIME = 'application/vnd.android.package-archive';

/** A dropped connection is normal for a file this size; one failure is not final. */
const DOWNLOAD_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1500;

export const INSTALL_ERRORS = {
  DOWNLOAD: 'download',
  /** Almost always "Install unknown apps" being off for this app. */
  BLOCKED: 'blocked',
  FAILED: 'failed',
} as const;
export type InstallErrorKind = (typeof INSTALL_ERRORS)[keyof typeof INSTALL_ERRORS];

export class InstallError extends Error {
  kind: InstallErrorKind;
  cause?: unknown;
  constructor(message: string, { kind = INSTALL_ERRORS.FAILED, cause }: { kind?: InstallErrorKind; cause?: unknown } = {}) {
    super(message);
    this.name = 'InstallError';
    this.kind = kind;
    this.cause = cause;
  }
}

export interface DownloadProgress {
  /** Null when the server sent no Content-Length. */
  fraction: number | null;
  written: number;
  total: number | null;
}

/** Open the per-app "Install unknown apps" screen — it cannot be requested with a dialog. */
export async function openUnknownAppSourcesSettings(): Promise<void> {
  const pkg = Constants.expoConfig?.android?.package;
  await IntentLauncher.startActivityAsync(UNKNOWN_SOURCES_SETTINGS, pkg ? { data: `package:${pkg}` } : {});
}

/**
 * Download `url` and return the file, without installing it. Split from the
 * launch because Android 10+ refuses to start an activity from the background:
 * a download that lands while the app is hidden is held and launched on the
 * next foreground.
 */
export async function downloadApk(
  url: string,
  {
    fileName,
    onProgress,
    expectedBytes,
  }: { fileName?: string | null; onProgress?: (p: DownloadProgress) => void; expectedBytes?: number | null } = {},
): Promise<{ uri: string; size: number }> {
  if (Platform.OS !== 'android') throw new InstallError('APK installation is only possible on Android.');
  if (!url) throw new InstallError('No download link for this release.');

  const name = fileName || url.split('/').pop() || 'update.apk';
  // The files directory, not the cache: Android evicts the cache under storage
  // pressure, mid-download.
  const dir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
  const target = `${dir}${name}`;

  // Sweep old APKs on the way in (a partial file would be rejected as corrupt,
  // and the files directory is never reclaimed). Never after launching: the
  // installer reads the file asynchronously.
  try {
    for (const entry of await FileSystem.readDirectoryAsync(dir!)) {
      if (entry.toLowerCase().endsWith('.apk')) {
        await FileSystem.deleteAsync(`${dir}${entry}`, { idempotent: true }).catch(() => {});
      }
    }
  } catch {
    // An unreadable directory is no reason to refuse the download.
  }
  await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => {});

  try {
    const free = await FileSystem.getFreeDiskStorageAsync();
    const needed = (expectedBytes || 80 * 1024 * 1024) * 1.1;
    if (free != null && free < needed) {
      throw new InstallError(
        `Not enough free space for the update — about ${Math.ceil(needed / 1048576)}MB is ` +
          `needed and ${Math.floor(free / 1048576)}MB is free.`,
        { kind: INSTALL_ERRORS.DOWNLOAD },
      );
    }
  } catch (err) {
    if (err instanceof InstallError) throw err;
  }

  const report = (progress: FileSystem.DownloadProgressData) => {
    if (!onProgress) return;
    const written = progress.totalBytesWritten;
    const total = progress.totalBytesExpectedToWrite > 0 ? progress.totalBytesExpectedToWrite : null;
    onProgress({ fraction: total ? written / total : null, written, total });
  };

  // Each attempt starts clean; resumeAsync only resumes from pauseAsync state.
  let result: FileSystem.FileSystemDownloadResult | undefined;
  let lastError: unknown;
  for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt += 1) {
    try {
      if (attempt > 1) {
        await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * (attempt - 1)));
      }
      const download = FileSystem.createDownloadResumable(url, target, {}, report);
      result = await download.downloadAsync();
      if (result?.uri) break;
    } catch (err) {
      lastError = err;
      if (__DEV__) console.warn(`[update] download attempt ${attempt}/${DOWNLOAD_ATTEMPTS} failed:`, err);
    }
  }

  if (!result?.uri) {
    throw new InstallError(
      `The download failed after ${DOWNLOAD_ATTEMPTS} attempts. Check your connection and try again.`,
      { kind: INSTALL_ERRORS.DOWNLOAD, cause: lastError },
    );
  }
  if (result.status && (result.status < 200 || result.status >= 300)) {
    throw new InstallError(`The server returned ${result.status} for the update file.`);
  }

  // An HTML error page saved under a .apk name is still a "successful" download.
  const info = await FileSystem.getInfoAsync(result.uri);
  if (!info.exists || !info.size) throw new InstallError('The downloaded file is empty.');
  return { uri: result.uri, size: info.size };
}

/** Open Android's package installer for a downloaded APK. Call with the app in the foreground. */
export async function launchInstaller(fileUri: string): Promise<true> {
  if (Platform.OS !== 'android') throw new InstallError('APK installation is only possible on Android.');
  if (!fileUri) throw new InstallError('No downloaded update to install.');

  let contentUri: string;
  try {
    contentUri = await FileSystem.getContentUriAsync(fileUri);
  } catch (err) {
    throw new InstallError('Could not prepare the update for installation.', { cause: err });
  }

  // ACTION_VIEW first (what a file manager does on tap); INSTALL_PACKAGE is a
  // deprecated fallback.
  let lastError: unknown;
  for (const action of [VIEW_ACTION, INSTALL_ACTION]) {
    try {
      await IntentLauncher.startActivityAsync(action, {
        data: contentUri,
        type: APK_MIME,
        flags: FLAG_GRANT_READ_URI_PERMISSION,
      });
      return true;
    } catch (err) {
      lastError = err;
    }
  }
  throw new InstallError(
    'Android would not open the installer. Allow this app to install unknown apps, then try again.',
    { kind: INSTALL_ERRORS.BLOCKED, cause: lastError },
  );
}
