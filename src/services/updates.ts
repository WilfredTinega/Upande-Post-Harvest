import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

/**
 * Checking GitHub Releases for a newer build of this app. Ported from the
 * Upande Sensors app (src/api/updates.js) — same rules, same failure handling.
 *
 * Deliberately not on the Frappe client: this talks to api.github.com, carries
 * no session, and must keep working when the site is unreachable — an update is
 * often exactly what someone reaches for when the app is misbehaving.
 *
 * Unauthenticated GitHub API calls are limited to 60 per hour *per IP*, and a
 * packhouse puts every handheld behind one NAT address. So the automatic check
 * runs once a day per device, and a rate-limited answer falls back to the
 * releases atom feed, which is not part of that quota.
 *
 * ── Which channel delivers an update ────────────────────────────────────────
 *
 * `major.minor` is the native boundary and is written into app.json as the
 * literal `runtimeVersion` (scripts/version.mjs keeps them in step):
 *
 *   1.0.5 -> 1.0.6   same runtime: a JS bundle over the air (expo-updates).
 *   1.0.9 -> 1.1.0   the runtime moved: a full APK from GitHub Releases.
 *
 * Only x.y.0 releases build an APK and are marked "latest" on GitHub, so this
 * check is the APK channel; patches arrive through the OTA loop in
 * `UpdateController`.
 */

const extra = (Constants.expoConfig?.extra ?? {}) as { githubRepo?: string };

/** `owner/repo` the release workflow publishes to (app.json → expo.extra.githubRepo). */
export const GITHUB_REPO = extra.githubRepo || 'WilfredTinega/Upande-Post-Harvest';
export const RELEASES_URL = `https://github.com/${GITHUB_REPO}/releases`;
/** Asset prefix the release workflow names every APK with. */
const APK_PREFIX = 'post_harvest_v';

const API_ROOT = 'https://api.github.com';
const TIMEOUT_MS = 15000;

/** One automatic check per device per day; the manual button ignores this. */
export const AUTO_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

const CACHE_KEY = 'update_check_v1';

export const UPDATE_ERRORS = {
  OFFLINE: 'offline',
  TIMEOUT: 'timeout',
  RATE_LIMITED: 'rate_limited',
  NO_RELEASES: 'no_releases',
  FAILED: 'failed',
} as const;
export type UpdateErrorKind = (typeof UPDATE_ERRORS)[keyof typeof UPDATE_ERRORS];

export class UpdateCheckError extends Error {
  kind: UpdateErrorKind;
  constructor(kind: UpdateErrorKind, message: string) {
    super(message);
    this.name = 'UpdateCheckError';
    this.kind = kind;
  }
}

export const UPDATE_KINDS = {
  /** Deliverable as a JS bundle — small, no reinstall. */
  JS: 'js',
  /** Needs a new APK: the native side changed. */
  NATIVE: 'native',
} as const;
export type UpdateKind = (typeof UPDATE_KINDS)[keyof typeof UPDATE_KINDS];

export interface Release {
  version: string;
  notes: string;
  publishedAt: string | null;
  pageUrl: string;
  downloadUrl: string | null;
  assetName: string | null;
  size: string | null;
  sizeBytes: number | null;
}

export interface UpdateCheck extends Release {
  current: string | null;
  available: boolean;
  kind: UpdateKind | null;
  runtime: string | null;
  releaseRuntime: string | null;
}

/** Numeric-segment comparison ignoring a leading `v`: 1 when a is newer, -1 older, 0 equal. */
export function compareVersions(a: unknown, b: unknown): number {
  const parse = (v: unknown) =>
    String(v ?? '')
      .trim()
      .replace(/^v/i, '')
      .split('.')
      .map((n) => parseInt(n, 10) || 0);
  const left = parse(a);
  const right = parse(b);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    if (l !== r) return l > r ? 1 : -1;
  }
  return 0;
}

/** The `runtimeVersion` a given app version belongs to, e.g. "1.0" for 1.0.6. */
export function runtimeVersionOf(version: unknown): string | null {
  const parts = String(version || '').trim().split('.');
  if (parts.length < 2) return null;
  const major = Number.parseInt(parts[0], 10);
  const minor = Number.parseInt(parts[1], 10);
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return null;
  return `${major}.${minor}`;
}

/** Which delivery moving between two versions needs; null when there is nothing to compare. */
export function updateKind(installed: unknown, latest: unknown): UpdateKind | null {
  const from = runtimeVersionOf(installed);
  const to = runtimeVersionOf(latest);
  if (!from || !to) return null;
  return from === to ? UPDATE_KINDS.JS : UPDATE_KINDS.NATIVE;
}

export function formatBytes(bytes: number | null | undefined): string | null {
  if (!Number.isFinite(bytes) || !bytes || bytes <= 0) return null;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Only x.y.0 releases build an APK, so the APK for any version is its runtime's x.y.0 one. */
function apkVersionOf(version: string): string {
  const runtime = runtimeVersionOf(version);
  return runtime ? `${runtime}.0` : version;
}

function predictedApkUrl(version: string): string {
  const v = apkVersionOf(version);
  return `https://github.com/${GITHUB_REPO}/releases/download/v${v}/${APK_PREFIX}${v}.apk`;
}

interface GithubAsset {
  name?: string;
  size?: number;
  browser_download_url?: string;
}

function findApkAsset(release: { assets?: GithubAsset[] } | null): GithubAsset | null {
  const assets = Array.isArray(release?.assets) ? release!.assets : [];
  return assets.find((a) => typeof a?.name === 'string' && a.name.toLowerCase().endsWith('.apk')) ?? null;
}

/** The newest published release. Throws UpdateCheckError; never half-populated. */
export async function fetchLatestRelease(): Promise<Release> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_ROOT}/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      signal: controller.signal,
    });
  } catch {
    if (timedOut) throw new UpdateCheckError(UPDATE_ERRORS.TIMEOUT, 'GitHub did not respond in time.');
    throw new UpdateCheckError(UPDATE_ERRORS.OFFLINE, 'Could not reach GitHub.');
  } finally {
    clearTimeout(timer);
  }

  // An exhausted quota is 403 (or 429) with a zeroed remaining header; a plain
  // 403 without it is a genuine refusal.
  if (response.status === 403 || response.status === 429) {
    const remaining = response.headers.get('x-ratelimit-remaining');
    if (remaining === '0' || response.status === 429) {
      throw new UpdateCheckError(UPDATE_ERRORS.RATE_LIMITED, 'GitHub is rate limiting this network. Try again later.');
    }
    throw new UpdateCheckError(UPDATE_ERRORS.FAILED, 'GitHub refused the request.');
  }
  // 404 here means "no release published yet" (or a private repo).
  if (response.status === 404) {
    throw new UpdateCheckError(UPDATE_ERRORS.NO_RELEASES, 'No release has been published yet.');
  }
  if (!response.ok) {
    throw new UpdateCheckError(UPDATE_ERRORS.FAILED, `GitHub returned ${response.status}.`);
  }

  let release: any;
  try {
    release = await response.json();
  } catch {
    throw new UpdateCheckError(UPDATE_ERRORS.FAILED, 'GitHub sent a response the app could not read.');
  }

  const version = String(release?.tag_name ?? '').replace(/^v/i, '');
  if (!version) throw new UpdateCheckError(UPDATE_ERRORS.NO_RELEASES, 'The latest release has no version tag.');

  const asset = findApkAsset(release);
  return {
    version,
    notes: typeof release?.body === 'string' ? release.body.trim() : '',
    publishedAt: release?.published_at ?? null,
    pageUrl: release?.html_url || RELEASES_URL,
    downloadUrl: asset?.browser_download_url ?? null,
    assetName: asset?.name ?? null,
    size: formatBytes(asset?.size),
    sizeBytes: asset?.size ?? null,
  };
}

/**
 * The releases atom feed, used when the JSON API is rate limited. It is a
 * normal web endpoint outside the API quota; it has no asset list, so the APK
 * URL is derived from the release workflow's naming.
 */
async function fetchLatestReleaseViaAtom(): Promise<Release> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let xml: string;
  try {
    const response = await fetch(`https://github.com/${GITHUB_REPO}/releases.atom`, {
      headers: { Accept: 'application/atom+xml' },
      signal: controller.signal,
    });
    if (!response.ok) throw new UpdateCheckError(UPDATE_ERRORS.FAILED, `Release feed returned ${response.status}.`);
    xml = await response.text();
  } catch (err) {
    if (err instanceof UpdateCheckError) throw err;
    throw new UpdateCheckError(UPDATE_ERRORS.OFFLINE, 'Could not reach GitHub.');
  } finally {
    clearTimeout(timer);
  }

  const entry = xml.split('<entry>')[1];
  const tag = entry?.match(/<id>[^<]*\/([^/<]+)<\/id>/)?.[1];
  const version = String(tag ?? '').replace(/^v/i, '');
  if (!version) throw new UpdateCheckError(UPDATE_ERRORS.NO_RELEASES, 'No release has been published yet.');

  return {
    version,
    notes: '',
    publishedAt: entry?.match(/<updated>([^<]+)<\/updated>/)?.[1] ?? null,
    pageUrl: `${RELEASES_URL}/tag/${tag}`,
    downloadUrl: predictedApkUrl(version),
    assetName: `${APK_PREFIX}${apkVersionOf(version)}.apk`,
    size: null,
    sizeBytes: null,
  };
}

/** Compare the running build against the newest release. */
export async function checkForUpdate(currentVersion: string | null): Promise<UpdateCheck> {
  let release: Release;
  try {
    release = await fetchLatestRelease();
  } catch (err) {
    if (err instanceof UpdateCheckError && err.kind === UPDATE_ERRORS.RATE_LIMITED) {
      release = await fetchLatestReleaseViaAtom();
    } else {
      throw err;
    }
  }

  const result: UpdateCheck = {
    ...release,
    current: currentVersion ?? null,
    available: compareVersions(release.version, currentVersion) > 0,
    kind: updateKind(currentVersion, release.version),
    runtime: runtimeVersionOf(currentVersion),
    releaseRuntime: runtimeVersionOf(release.version),
  };

  await SecureStore.setItemAsync(CACHE_KEY, JSON.stringify({ at: Date.now(), result })).catch(() => {});
  return result;
}

async function readCachedUpdate(): Promise<{ at: number; result: UpdateCheck } | null> {
  try {
    const raw = await SecureStore.getItemAsync(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.result || typeof parsed.at !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * At most one real check per `AUTO_CHECK_INTERVAL_MS`, the cached verdict in
 * between. Resolves null instead of throwing: a background check that fails
 * must leave the UI exactly as it was.
 */
export async function autoCheckForUpdate(currentVersion: string | null): Promise<UpdateCheck | null> {
  const cached = await readCachedUpdate();
  // A cached verdict only holds for the build that produced it.
  const stale =
    !cached ||
    Date.now() - cached.at > AUTO_CHECK_INTERVAL_MS ||
    cached.result?.current !== (currentVersion ?? null);
  if (!stale) return cached!.result;
  try {
    return await checkForUpdate(currentVersion);
  } catch {
    return cached && cached.result?.current === (currentVersion ?? null) ? cached.result : null;
  }
}
