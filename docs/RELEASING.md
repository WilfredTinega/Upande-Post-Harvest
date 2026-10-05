# Build & Release

The app is built and released entirely by GitHub Actions
(`WilfredTinega/Upande-Post-Harvest`). There is no Expo account, no EAS credits
and no manual APK step: the runner does what `eas build` would do, using
`expo prebuild` plus Gradle. `eas.json` is still in the repo but nothing in this
pipeline reads it.

## Day-to-day flow

```
branch ──▶ PR to main ──▶ PR Checks ──▶ merge ──▶ Release ──▶ APK (x.y.0) or OTA bundle (x.y.z)
```

### On a pull request: `.github/workflows/pr.yml`

Three jobs run against every PR targeting `main`:

- **Lint, typecheck & dependency check**: `expo lint`, `tsc --noEmit`,
  `tests/version.test.mjs` (the versioning rules), `expo install --check`
  (catches dependency versions that drift off the SDK 57 line), and
  `expo-doctor` (advisory only).
- **Version preview**: writes the version, `versionCode`, `runtimeVersion` and
  delivery (APK or OTA) the merge will produce to the run summary.
- **Debug APK**: prebuilds and assembles a debug APK, uploaded as the artifact
  `tambuzi_post_harvest_pr<N>_debug` so a reviewer can install the PR on a
  device. This proves the native project still compiles before the merge lands.

### On merge to main: `.github/workflows/release.yml`

1. Advances the version by one odometer step (see [Versioning](#versioning)) and
   writes `expo.version`, `android.versionCode` and `runtimeVersion` into
   `app.json`, and `version` into `package.json`.
2. Stamps `extra.githubRepo` with the repository the build ran in
   (`scripts/stamp-build.mjs`; a no-op for the canonical repo).
3. Then one of two things:
   - **x.y.1 and up (OTA)**: `scripts/publish-ota.mjs` exports the JS bundle and
     the workflow publishes it to the `gh-pages` branch under
     `ota/android/<runtime>/`. No APK is built. See [OTA.md](OTA.md).
   - **x.y.0 (APK)**: `expo prebuild --platform android --clean`, then
     `./gradlew assembleRelease` signed with the upload keystore, verified with
     `apksigner`, renamed to `tambuzi_post_harvest_v<version>.apk`.
4. Commits `chore(release): x.y.z [skip ci]`, tags `vx.y.z`, pushes both.
5. Publishes a GitHub Release for the tag. An APK release attaches the APK and is
   marked **latest**; an OTA release has no asset and is not marked latest, so
   "latest" always points at the newest APK.

Changes that touch only `**/*.md` or `docs/**` do not trigger a release.

### The first release

With no `v*` tag in the repo yet, the first release run does **not** step the
version: it releases whatever `app.json` says (currently `1.0.0`) as an APK,
because there is no installed build for an OTA bundle to reach. Every run after
that follows the normal rule.

## Versioning

`app.json` → `expo.version` is the single source of truth; `package.json` is
kept in sync.

**Every merge to main advances the version by exactly one step.** The digits
roll over like an odometer:

- **patch (`z`)** counts `0`–`99`, then carries into the minor
- **minor (`y`)** counts `0`–`49`, then carries into the major
- **major (`x`)** is unbounded

```
1.0.0 → 1.0.1 → … → 1.0.99 → 1.1.0 → 1.1.1 → … → 1.49.99 → 2.0.0 → 2.0.1 → …
```

Because the limits are fixed, the version is a counter in disguise, which is
exactly what Android's `versionCode` needs:

```
versionCode = (major * 50 + minor) * 100 + patch
```

`1.0.0` → `5000`, `1.0.99` → `5099`, `1.1.0` → `5100`, `2.0.0` → `10000`. It goes
up by exactly 1 per release, never collides, and needs no external counter. A
version outside the limits (`1.50.0`, `1.0.100`) makes the script fail loudly
rather than silently emit a lower code.

`runtimeVersion` is the literal string `"major.minor"` (`1.0.6` → `"1.0"`). It
is the over-the-air compatibility gate: see [OTA.md](OTA.md).

**A native change needs a minor bump.** Adding a native module, a permission, a
config plugin or an SDK upgrade cannot travel in a JS bundle. Release it by
running the **Release** workflow manually (Actions → Release → Run workflow) with
`bump: minor`, or merge it and let the patch counter roll over, never by a plain
patch release.

Commit style does not affect the version, and it is not enforced. If a subject
starts with a conventional-commit type (`feat:`, `fix:`, `perf:`, `refactor:`,
`docs:`, `build:`, `ci:`, `chore:`), the release notes group it under that
heading; anything else lands under **Other**.

Preview what a branch would release:

```bash
node scripts/version.mjs            # 1.0.0 -> 1.0.1 (patch, versionCode 5001, runtime 1.0, …)
node scripts/version.mjs --json     # machine-readable
node scripts/version.mjs --notes    # the changelog markdown
node tests/version.test.mjs         # the rules, pinned
```

The manual **Release** run takes:

| input | effect |
| --- | --- |
| `bump: auto` | the usual +1 patch |
| `bump: minor` / `major` | skip ahead to the next round number (always an APK) |
| `set_version: 1.2.0` | set that exact version; `bump` is ignored |

## Signing (optional)

The pipeline works with no setup. Without signing secrets it builds and
publishes a **debug-signed** APK, which installs fine by sideloading. The release
body and job summary both say so. Its limits:

- it cannot be published to Google Play;
- Android's debug key is public, so anyone can build an "upgrade" for the app;
- switching to a real key later means users must **uninstall before updating**,
  because Android refuses to install over an APK signed with a different key.

If you expect to sign properly at all, do it before the first APK reaches
phones.

### Setting up an upload keystore

```bash
./scripts/setup-signing.sh
```

That generates `tambuzi-post-harvest-upload.keystore` (PKCS12, alias
`tambuzi-post-harvest`) and prints its password once. It uses `keytool` if a JDK
is installed and falls back to `openssl` otherwise. If the GitHub CLI is
installed and authenticated it uploads the secrets directly; otherwise it writes
them to `SECRETS-TO-UPLOAD.txt`, which `./scripts/upload-secrets.sh` can push
later (`--dry-run` to preview).

| Secret | Contents |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | the keystore, base64-encoded |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | key alias (`tambuzi-post-harvest`) |
| `ANDROID_KEY_PASSWORD` | key password (same as the store password; PKCS12 does not meaningfully separate them) |
| `ANDROID_KEY_SHA256` | certificate fingerprint, so the build can prove it signed with the right key |

Signing switches on only when **all four** of the first secrets are present; a
partial set is treated as unconfigured. Put them in **Repository secrets**, not
Environment secrets: the job does not declare an `environment:`.

`ANDROID_KEY_SHA256` is optional but recommended: without it the build only
checks that it was not debug-signed, rather than that it was signed with *your*
key.

**Back up the keystore file and password in a password manager.** Both are
gitignored and the key cannot be regenerated.

### Why there is a config plugin

`expo prebuild` regenerates `android/` from scratch on every run, and the stock
template signs release builds with the debug key. `plugins/withReleaseSigning.js`
re-applies a `release` signing config on each prebuild, driven by the Gradle
properties `TAMBUZI_STORE_FILE`, `TAMBUZI_STORE_PASSWORD`, `TAMBUZI_KEY_ALIAS`
and `TAMBUZI_KEY_PASSWORD`, so no secret is ever written to a file in the repo.
Without them it falls back to debug signing.

`plugins/withBuildTuning.js` raises the Gradle heap and Metaspace (the default is
too small once expo-updates, camera and reanimated are in) and restricts the
build to `armeabi-v7a,arm64-v8a`, real devices only.

## Building locally

Requires JDK 17 and the Android SDK.

```bash
npm ci
npm run build:apk    # prebuild + gradlew assembleRelease (debug-signed)
```

To sign locally with the real key:

```bash
npm run prebuild
cd android && ./gradlew assembleRelease \
  -PTAMBUZI_STORE_FILE="$PWD/../tambuzi-post-harvest-upload.keystore" \
  -PTAMBUZI_STORE_PASSWORD=... \
  -PTAMBUZI_KEY_ALIAS=tambuzi-post-harvest \
  -PTAMBUZI_KEY_PASSWORD=...
```

The architecture filter means the release APK does not install on an x86
emulator. For an emulator run, lift it:

```bash
npm run android:emulator     # expo run:android -- -PreactNativeArchitectures=x86_64
```

Delete `android/` when you are done; it is gitignored and regenerated on every
CI run.
