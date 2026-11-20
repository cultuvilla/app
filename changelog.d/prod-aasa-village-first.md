- Change: on iPhone, a shared village-first link (`cultuvilla.es/<pueblo>/evento/…`)
  opens the app instead of Safari. Prod's `apple-app-site-association` now claims
  the whole host except `/entrar`, like dev and beta; it waited until the wall
  (`minSupported` 1.10.0) passed iOS 1.2.1, the first build with these routes.
  **Migration:** none.
