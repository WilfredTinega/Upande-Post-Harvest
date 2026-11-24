#!/usr/bin/env node
/**
 * The native fingerprint of a checkout: one hash over everything that ends up in
 * the APK's native code (native modules and their versions, config plugins,
 * permissions, the Expo SDK). Two checkouts with the same hash can share a
 * runtime; a different hash means a JS bundle from one may crash the other.
 *
 *   node scripts/native-fingerprint.mjs [dir]          # prints the hash
 *   node scripts/native-fingerprint.mjs [dir] --json   # hash + sources
 *
 * Every release changes expo.version / runtimeVersion / android.versionCode and
 * the release workflow stamps expo.extra, none of which is native code, so they
 * are left out. `dir` defaults to the current directory and needs its own
 * node_modules: the native files hashed are the installed packages'.
 *
 * The options live here, not in a fingerprint.config.js, so an older checkout
 * (a past release tag) is hashed exactly the same way as the current one.
 */
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const json = args.includes('--json');
const dir = resolve(args.find((a) => !a.startsWith('--')) ?? '.');

const require = createRequire(import.meta.url);
const { createFingerprintAsync, SourceSkips } = require('@expo/fingerprint');

const fingerprint = await createFingerprintAsync(dir, {
  platforms: ['android'],
  sourceSkips:
    SourceSkips.ExpoConfigVersions |
    SourceSkips.ExpoConfigRuntimeVersionIfString |
    SourceSkips.ExpoConfigExtraSection |
    SourceSkips.PackageJsonScriptsAll,
});

if (json) {
  console.log(JSON.stringify({ hash: fingerprint.hash, sources: fingerprint.sources }, null, 2));
} else {
  console.log(fingerprint.hash);
}
