# BlockingOverlay as an in-tree view, not a native Modal

**Priority:** medium
**Landed:** dev
**Gate:** release:1.14.0
**Next:** once a release carrying #765 is on beta, open a form with the overlay over a sheet on an iOS TestFlight build and confirm nothing freezes, then retire

**Decided 2026-11-27 (Álvaro):** build it — first batch of the Órdago harvest (`_workspace/docs/plans/ideas/harvest-across-repos.md`).

**Goal:** `apps/mobile/components/primitives/BlockingOverlay.tsx` renders a `<Modal>`.
On iOS a Modal opened while another is presented can freeze the app. Render it as an
absolutely positioned view in the tree, same look.

Source: `~/githubs/ordago-app/ordago-apps` `docs/decisions/blocking-overlay-no-native-modal.md`.

## Done when

Same appearance and the same touch blocking, on top of sheets and modals that are open,
a jest test for the primitive, and a QA entry in `docs/qa/pending/` (it is visible).
