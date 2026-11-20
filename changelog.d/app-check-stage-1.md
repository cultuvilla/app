- Internal: the app now sends Firebase App Check tokens — Play Integrity on
  Android and App Attest (DeviceCheck fallback) on iOS in beta and production,
  the debug provider in dev and E2E builds. Enforcement stays off, so nothing
  changes for users; it adds a native module, so OTA updates from this release
  on reach only binaries built with it. **Migration:** none.
