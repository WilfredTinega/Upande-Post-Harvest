#!/usr/bin/env node
/**
 * Odometer versioning for the Tambuzi Post Harvest Expo app.
 *
 * Every merge to the release branch advances the version by exactly one step.
 * The digits roll over like an odometer with fixed limits:
 *
 *   patch (z) counts 0..99  — 1.0.99 + 1 -> 1.1.0
 *   minor (y) counts 0..49  — 1.49.99 + 1 -> 2.0.0
 *   major (x) is unbounded
 *
 * Because the limits are fixed, a version maps one-to-one onto a plain counter,
 * which is exactly what Android's versionCode wants:
 *
 *   versionCode = (major * 50 + minor) * 100 + patch
 *
 * So versionCode is dense, strictly increasing, and needs no external state.
 *
 * Single source of truth for the version is app.json -> expo.version.
 * package.json is kept in sync so `npm version`-style tooling stays honest.
 *
 * `--apply` also writes `expo.runtimeVersion` as the literal "major.minor"
 * string — the expo-updates compatibility gate (see docs/OTA.md). It replaces
 * any `{ "policy": ... }` object that was there before.
 *
 * Usage:
 *   node scripts/version.mjs                 # print the next version (dry run)
 *   node scripts/version.mjs --json          # machine-readable, for CI outputs
 *   node scripts/version.mjs --apply         # write app.json + package.json
 *   node scripts/version.mjs --bump minor    # skip ahead to the next minor/major
 *   node scripts/version.mjs --set 1.0.0     # put the version somewhere exact
 *   node scripts/version.mjs --keep-version  # report on the current version
 *   node scripts/version.mjs --notes         # print the release notes markdown
 *
 * The pure helpers are exported so tests/version.test.mjs can pin them; the
 * CLI only runs when this file is executed directly.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP_JSON = resolve(ROOT, 'app.json');
const PKG_JSON = resolve(ROOT, 'package.json');

function git(...args) {
  try {
    // stderr is swallowed: `git describe` on a repo with no tags is an expected
    // state (the first release), not something worth printing.
    return execFileSync('git', args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

/** Most recent v* tag, or null on a repo that has never been released. */
function lastTag() {
  return git('describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*') || null;
}

/**
 * Commits since the last tag. Records are NUL-separated so multi-line bodies
 * (where BREAKING CHANGE: footers live) survive parsing intact.
 */
function commitsSince(tag) {
  const range = tag ? `${tag}..HEAD` : 'HEAD';
  const raw = git('log', range, '--no-merges', '--format=%H%x1f%s%x1f%b%x1e');
  if (!raw) return [];
  return raw
    .split('\x1e')
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [hash, subject, body] = record.split('\x1f');
      return { hash, subject: subject ?? '', body: body ?? '' };
    });
}

const HEADER = /^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(?<breaking>!)?:\s*(?<description>.+)$/i;

export function parseCommit(commit) {
  const match = HEADER.exec(commit.subject);
  const breaking =
    Boolean(match?.groups?.breaking) || /^BREAKING[ -]CHANGE:/m.test(commit.body);
  return {
    ...commit,
    type: match?.groups?.type?.toLowerCase() ?? null,
    scope: match?.groups?.scope ?? null,
    description: match?.groups?.description ?? commit.subject,
    breaking,
  };
}

/** Odometer limits: patch wraps at 100, minor wraps at 50. */
export const PATCH_LIMIT = 100;
export const MINOR_LIMIT = 50;

export function parseVersion(version) {
  const parts = String(version).split('.').map((n) => parseInt(n, 10));
  if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n) || n < 0)) {
    throw new Error(`Not a valid x.y.z version: ${version}`);
  }
  const [major, minor, patch] = parts;
  if (minor >= MINOR_LIMIT) {
    throw new Error(`Minor ${minor} in ${version} is out of range (max ${MINOR_LIMIT - 1}).`);
  }
  if (patch >= PATCH_LIMIT) {
    throw new Error(`Patch ${patch} in ${version} is out of range (max ${PATCH_LIMIT - 1}).`);
  }
  return { major, minor, patch };
}

/**
 * One odometer step. `bump` normally stays 'patch' — one merge, one click. The
 * 'minor'/'major' overrides skip the remaining digits, for when a release is
 * significant enough to deserve a round number (or something native changed).
 */
export function nextVersion(current, bump = 'patch') {
  let { major, minor, patch } = parseVersion(current);

  if (bump === 'major') {
    return `${major + 1}.0.0`;
  }
  if (bump === 'minor') {
    minor += 1;
    patch = 0;
  } else if (bump === 'patch') {
    patch += 1;
  } else {
    throw new Error(`Unknown bump "${bump}" (expected patch, minor or major).`);
  }

  if (patch >= PATCH_LIMIT) {
    patch = 0;
    minor += 1;
  }
  if (minor >= MINOR_LIMIT) {
    minor = 0;
    major += 1;
  }
  return `${major}.${minor}.${patch}`;
}

/**
 * The runtime a version belongs to: everything sharing `major.minor` can accept
 * the same JS bundle. The app-side reader of the same rule must agree with this
 * (a "1.0.6" build is runtime "1.0").
 */
export function runtimeVersionFor(version) {
  const { major, minor } = parseVersion(version);
  return `${major}.${minor}`;
}

/**
 * Android requires a monotonically increasing integer. Since the odometer
 * limits are fixed, the version *is* a counter in disguise — just read it back
 * out. No external state, and it never collides or goes backwards.
 */
export function versionCodeFor(version) {
  const { major, minor, patch } = parseVersion(version);
  return (major * MINOR_LIMIT + minor) * PATCH_LIMIT + patch;
}

/** x.y.0 opens a new runtime and needs an APK; every other patch ships OTA. */
export function releaseKindFor(version) {
  return parseVersion(version).patch === 0 ? 'apk' : 'ota';
}

const SECTIONS = [
  ['feat', 'Features'],
  ['fix', 'Bug Fixes'],
  ['perf', 'Performance'],
  ['refactor', 'Refactoring'],
  ['docs', 'Documentation'],
  ['build', 'Build System'],
  ['ci', 'CI'],
  ['chore', 'Chores'],
];

export function releaseNotes(version, commits, tag, repo) {
  const line = (c) =>
    `- ${c.scope ? `**${c.scope}:** ` : ''}${c.description} (${c.hash.slice(0, 7)})`;

  const out = [`## v${version}`, ''];

  const breaking = commits.filter((c) => c.breaking);
  if (breaking.length) {
    out.push('### ⚠ BREAKING CHANGES', '', ...breaking.map(line), '');
  }

  for (const [type, heading] of SECTIONS) {
    const matching = commits.filter((c) => c.type === type && !c.breaking);
    if (matching.length) out.push(`### ${heading}`, '', ...matching.map(line), '');
  }

  const other = commits.filter(
    (c) => !c.breaking && !SECTIONS.some(([type]) => type === c.type),
  );
  if (other.length) out.push('### Other', '', ...other.map(line), '');

  if (commits.length === 0) out.push('_No commits since the previous release._', '');

  if (repo && tag) {
    out.push(
      `**Full changelog:** https://github.com/${repo}/compare/${tag}...v${version}`,
      '',
    );
  }

  return out.join('\n');
}

// --- main -------------------------------------------------------------------

function main(argv) {
  const hasFlag = (name) => argv.includes(`--${name}`);
  const flagValue = (name) => {
    const i = argv.indexOf(`--${name}`);
    return i === -1 ? undefined : argv[i + 1];
  };

  const appConfig = JSON.parse(readFileSync(APP_JSON, 'utf8'));
  const pkg = JSON.parse(readFileSync(PKG_JSON, 'utf8'));

  const currentVersion = appConfig.expo.version;
  const tag = lastTag();
  const commits = commitsSince(tag).map(parseCommit);
  // Always one step per merge; --bump only exists to skip to a round number.
  const bump = flagValue('bump') ?? 'patch';
  // --set X.Y.Z puts the version somewhere specific, e.g. 1.0.0 to start a new
  // release line; otherwise one odometer step.
  const setTo = flagValue('set');
  if (setTo) parseVersion(setTo);
  const version = hasFlag('keep-version')
    ? currentVersion
    : setTo || nextVersion(currentVersion, bump);
  const versionCode = versionCodeFor(version);
  const runtimeVersion = runtimeVersionFor(version);

  if (hasFlag('apply')) {
    appConfig.expo.version = version;
    appConfig.expo.android = { ...appConfig.expo.android, versionCode };
    /**
     * The compatibility gate for over-the-air updates, kept in step with the
     * version by the same command that sets it. `expo-updates` refuses a
     * bundle whose runtime does not match the installed build, so a 1.1.0
     * device can never be handed a 1.0.x JS bundle.
     *
     * `updates.url` is deliberately NOT touched: it points at the Frappe
     * manifest endpoint, which reads the runtime from the
     * `expo-runtime-version` request header. See docs/OTA.md.
     */
    appConfig.expo.runtimeVersion = runtimeVersion;
    writeFileSync(APP_JSON, `${JSON.stringify(appConfig, null, 2)}\n`);

    pkg.version = version;
    writeFileSync(PKG_JSON, `${JSON.stringify(pkg, null, 2)}\n`);
  }

  if (hasFlag('notes')) {
    const repo = process.env.GITHUB_REPOSITORY || appConfig.expo.extra?.githubRepo;
    process.stdout.write(releaseNotes(version, commits, tag, repo));
  } else if (hasFlag('json')) {
    process.stdout.write(
      `${JSON.stringify(
        {
          current: currentVersion,
          version,
          versionCode,
          runtimeVersion,
          release: releaseKindFor(version),
          bump,
          tag: `v${version}`,
          previousTag: tag,
          commitCount: commits.length,
          breaking: commits.filter((c) => c.breaking).length,
        },
        null,
        2,
      )}\n`,
    );
  } else {
    process.stdout.write(
      `${currentVersion} -> ${version} (${bump}, versionCode ${versionCode}, ` +
        `runtime ${runtimeVersion}, ` +
        `${commits.length} commit${commits.length === 1 ? '' : 's'} since ${tag ?? 'the beginning'})\n`,
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2));
}
