// The `fingerprint` runtimeVersion is what decides which installed binaries an
// OTA update reaches. By default @expo/fingerprint hashes the marketing
// `version`, so every release bump (one per develop -> beta promotion) minted a
// new runtime and an update published from a release commit reached no binary
// at all (measured 2026-09-15: 1.2.1 and 1.2.2 hashed differently).
//
// Skipping the versions is safe: they carry no native code. `version` is the
// marketing string, and buildNumber / versionCode come from EAS's remote
// counters (`appVersionSource: remote`), never from app.config. Native changes
// — a config plugin, a native module, a plugin option — still change the hash.
//
// Setting sourceSkips REPLACES the library default rather than adding to it,
// so the default (PackageJsonAndroidAndIosScriptsIfNotContainRun) is restated.
// An unknown name is dropped silently by @expo/fingerprint — the names here are
// checked against the installed SourceSkips enum by the test below.
//
// Locked by packages/shared/test/ci/otaUpdates.test.ts.

/** @type {import('@expo/fingerprint').Config} */
const config = {
  sourceSkips: ['ExpoConfigVersions', 'PackageJsonAndroidAndIosScriptsIfNotContainRun'],
};

module.exports = config;
