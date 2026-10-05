/**
 * Expo config plugin: give the Gradle build enough memory to finish.
 *
 * `expo prebuild` regenerates android/ from scratch on every CI run, so
 * gradle.properties cannot simply be edited and committed — it has to be
 * re-applied, which is what this does.
 *
 * ── Why ──────────────────────────────────────────────────────────────────────
 *
 * This app carries expo-updates (six native modules on its own), expo-camera,
 * reanimated + worklets, gesture-handler and screens. Each is another Kotlin
 * compilation and another set of classes to dex, and the template's default
 * Gradle heap (-Xmx512m -XX:MaxMetaspaceSize=256m) is sized for a much smaller
 * project. The same pipeline in the sibling Upande Sensors app failed exactly
 * this way:
 *
 *     The Daemon will expire after the build after running out of JVM Metaspace.
 *     > Task :app:packageRelease FAILED
 *
 * Metaspace holds class metadata, so both it and the heap are raised here.
 *
 * `HeapDumpOnOutOfMemoryError` is set so that if it happens again the failure
 * arrives with evidence rather than as a task that simply stopped.
 *
 * Coexists with expo-build-properties: that plugin owns usesCleartextTraffic and
 * other manifest/build settings; this one only sets the two keys below.
 */

const { withGradleProperties } = require('expo/config-plugins');

/**
 * Sized for a GitHub-hosted runner (4 cores, 16GB) with room to spare. Raising
 * these costs nothing on a machine that has the memory, and the build cannot
 * finish on one that does not.
 */
const PROPERTIES = {
  'org.gradle.jvmargs':
    '-Xmx4096m -XX:MaxMetaspaceSize=1024m -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8',

  /**
   * Real Android devices only.
   *
   * The template builds four architectures, and each one carries its own copy of
   * every native library — Hermes, the React Native runtime, expo-modules-core,
   * screens, reanimated, camera. Shipping all four roughly doubles the APK, and
   * a large download to a phone on farm mobile data is what actually fails.
   *
   * `x86` and `x86_64` exist for emulators. No device in the field runs either,
   * so they were paying for themselves twice: once in the download and once in
   * the build's memory and wall-clock.
   *
   * `armeabi-v7a` stays alongside `arm64-v8a`. It is 32-bit ARM, which is what
   * older and cheaper handsets run, and this app is deployed to farms rather
   * than to a fleet of recent phones — dropping it would halve the APK again at
   * the cost of silently excluding those devices.
   *
   * The trade: this APK will not install on an Android emulator. A local
   * `npx expo run:android` on an emulator needs the filter lifted for that run:
   *
   *     ./gradlew assembleDebug -PreactNativeArchitectures=x86_64
   */
  reactNativeArchitectures: 'armeabi-v7a,arm64-v8a',
};

function withBuildTuning(config) {
  return withGradleProperties(config, (cfg) => {
    for (const [key, value] of Object.entries(PROPERTIES)) {
      const existing = cfg.modResults.find(
        (item) => item.type === 'property' && item.key === key,
      );
      // Set, not appended: the template ships its own `org.gradle.jvmargs`, and
      // a duplicate key would leave which one wins up to file order.
      if (existing) existing.value = value;
      else cfg.modResults.push({ type: 'property', key, value });
    }
    return cfg;
  });
}

module.exports = withBuildTuning;
