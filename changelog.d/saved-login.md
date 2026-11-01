- Fix: updating from a version before the native Firebase SDKs no longer signs you
  out. The session the old version left on the phone is moved to the native SDK on
  first launch, unless the account has signed in again since. **Migration:** none;
  new unauthenticated callable `restoreLegacySession`.
- "Cerrar sesión" now asks for confirmation, since one tap also wipes the local
  cache and restarts the app.
- Internal: a session that ends without the user signing out is reported as
  `SessionLost` in the client error log, with its sign-in providers.
