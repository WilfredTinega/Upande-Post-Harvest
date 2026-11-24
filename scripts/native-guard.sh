#!/usr/bin/env bash
# Does this checkout's native code still match the APK of the runtime in app.json?
#
# A JS bundle only runs on an APK built from the same native code, and every
# release on a runtime goes to the phones installed from that runtime's x.y.0
# APK. So a native change (an SDK upgrade, a native module added or moved to
# another version, a config plugin, a permission) has to open a new runtime.
#
# The runtime's fingerprint is the one its APK release recorded on GitHub Pages
# (ota/android/<runtime>/native-fingerprint.txt). A runtime released before
# that existed has none: its x.y.0 tag is checked out and hashed instead.
#
# Prints the verdict and, under GitHub Actions, writes `fingerprint`,
# `baseline` and `changed` (true/false) to $GITHUB_OUTPUT. Needs node_modules
# installed and the gh-pages branch and tags fetched (fetch-depth: 0).
set -euo pipefail

runtime="$(jq -r .expo.runtimeVersion app.json)"
now="$(node scripts/native-fingerprint.mjs)"
base=""
source="no baseline"

if recorded="$(git show "origin/gh-pages:ota/android/${runtime}/native-fingerprint.txt" 2>/dev/null)"; then
  base="$(printf '%s' "$recorded" | tr -d '[:space:]')"
  source="recorded with the ${runtime} APK"
elif git rev-parse -q --verify "refs/tags/v${runtime}.0" > /dev/null; then
  dir="$(mktemp -d)"
  git archive "v${runtime}.0" | tar -x -C "$dir"
  (cd "$dir" && npm ci --ignore-scripts --no-audit --no-fund > /dev/null)
  base="$(node scripts/native-fingerprint.mjs "$dir")"
  source="v${runtime}.0"
fi

changed=false
if [ -n "$base" ] && [ "$base" != "$now" ]; then
  changed=true
  echo "Native code differs from the runtime ${runtime} APK (${source}: ${base}, now: ${now})."
else
  echo "Native code matches the runtime ${runtime} APK (${source}): ${now}"
fi

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    echo "runtime=$runtime"
    echo "fingerprint=$now"
    echo "baseline=$base"
    echo "changed=$changed"
  } >> "$GITHUB_OUTPUT"
fi
