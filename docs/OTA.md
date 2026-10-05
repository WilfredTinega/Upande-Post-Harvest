# Over-the-air updates

A patch release ships as a JavaScript bundle. A minor (or major) release ships
as an APK.

| from → to | delivery | what the user does |
| --- | --- | --- |
| 1.0.5 → 1.0.6 | JS bundle over the air | nothing; the app restarts into it |
| 1.0.9 → 1.1.0 | full APK, attached to GitHub Release `v1.1.0` | Android's installer |

## Why the line is at `major.minor`

That is what the odometer in `scripts/version.mjs` already means: a normal merge
bumps the patch, and `bump: minor` is the deliberate signal that something
native changed (a new module, a permission, an SDK bump). None of those can
travel in a JS bundle.

`scripts/version.mjs --apply` writes `major.minor` into `app.json` as the literal
string **`runtimeVersion`** (for example `"1.0"`), replacing the
`{ "policy": "appVersion" }` object the project started with. It is
`expo-updates`' own compatibility gate, so a bundle published for runtime `1.0`
is *refused* by a `1.1` build rather than half-applied. Any app-side code that
classifies an update must agree: `1.0.6` belongs to runtime `"1.0"`.

## Who serves what

`expo-updates` refuses any manifest response that lacks an
`expo-protocol-version` header ("Legacy manifests are no longer supported",
`UpdateFactory.kt`). GitHub Pages cannot set response headers, so the manifest
cannot be fetched from Pages directly. The split:

| what | served by | why |
| --- | --- | --- |
| the manifest | the Frappe site: `GET https://tambuzi.upande.com/api/method/upande_tambuzi.mobile_api.ota.manifest` (`expo.updates.url`) | reads the `expo-runtime-version` / `expo-platform` headers the client sends, fetches `<otaBaseUrl>/<platform>/<runtime>/manifest.json` from Pages, and returns it with `expo-protocol-version: 1` added |
| the bundle and assets | GitHub Pages: `https://wilfredtinega.github.io/Post-Harvest/ota/android/<runtime>/…` (`expo.extra.otaBaseUrl`) | asset downloads need no special headers, and the manifest's URLs are absolute |

`updates.url` is fixed and `scripts/version.mjs` never rewrites it. The runtime
travels in the request header, as the protocol intends. `scripts/publish-ota.mjs`
builds every asset URL from `expo.extra.otaBaseUrl` + `/android/<runtimeVersion>/`,
not from `updates.url`.

Use GitHub Pages, not `raw.githubusercontent.com`: raw serves everything as
`text/plain`.

## What the publish produces

```sh
node scripts/version.mjs --apply     # 1.0.5 -> 1.0.6, keeps runtimeVersion "1.0"
npm run ota:build                    # writes ./ota/android/1.0/
```

`ota:build` runs `expo export --platform android`, copies the Hermes bundle
(`_expo/static/js/android/entry-<hash>.hbc`) and `assets/` into the runtime
folder, and writes `manifest.json`:

- a fresh `id` on every publish (the client compares it with what it runs);
- the bundle keyed by its own hashed file name, so a new bundle is never mistaken
  for an old one already on disk;
- each asset keyed by its bare content hash, the same key the APK's embedded copy
  carries, so phones reuse fonts and images they already have;
- `extra.expoClient` (the public app config), so `Constants.expoConfig.version`
  reports the update's version rather than the APK's, plus `extra.appVersion`
  and `extra.publishedAt`.

It refuses to write a manifest whose asset keys contain a path separator, which
`expo-updates` would reject silently on the phone.

## In CI

`.github/workflows/release.yml` runs both steps after the version bump and
**before** the native prebuild, on every run whose new version is not `x.y.0`,
and publishes `./ota` to the `gh-pages` branch with `peaceiris/actions-gh-pages@v4`:

```yaml
publish_dir: ./ota
destination_dir: ota
keep_files: true      # other runtimes' bundles must survive
```

`keep_files: true` matters: devices on runtime `1.0` keep asking for
`/ota/android/1.0/` long after `1.1` exists. `ota/` and `.ota-export/` are
gitignored and removed before the release commit.

A run that lands on `x.y.0` skips the OTA steps: the runtime has moved and no
device is on it yet. The APK is the update.

## One-time setup

1. **Enable GitHub Pages**: repository *Settings → Pages → Build and deployment
   → Deploy from a branch → `gh-pages` / `(root)`*. The first OTA release
   creates the branch; until Pages is switched on nothing serves it and devices
   simply find no update. (If the branch does not exist yet when you open the
   settings, come back after the first OTA release.)
2. **Workflow permissions**: *Settings → Actions → General → Workflow
   permissions* must allow read and write, or the release job cannot push the
   version commit, the tag, or `gh-pages`. The workflow asks for
   `contents: write`, which only works when the repository allows it.
3. **Deploy the manifest endpoint**: `upande_tambuzi.mobile_api.ota.manifest` on
   `tambuzi.upande.com`. Until it exists `checkForUpdateAsync` rejects and the
   app stays on its embedded bundle; nothing breaks, nothing updates.

## What is not done

- **Code signing.** `expo-updates` supports signed manifests; the Frappe endpoint
  could serve the signature header, but a key has to be generated and stored as a
  secret first. Until then the trust boundary is HTTPS plus write access to the
  Pages branch and to the site.
- **First-run verification.** Verify an end-to-end fetch through the endpoint on
  a real release build before relying on it.
