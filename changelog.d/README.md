# Pending changelog entries

One file per change, so two open PRs never edit the same lines. Editing
`## [Unreleased]` in `CHANGELOG.md` directly used to conflict in about half of
all merges into develop, and GitHub ignores the `merge=union` in
`.gitattributes`, so those PRs showed as conflicting until someone rebased them.

- **Add** `changelog.d/<branch-or-topic>.md` with one or more bullets, written
  exactly as they should read in `CHANGELOG.md`:

  ```md
  - Fix: on Android the startup intro played no sound while the phone was on
    vibrate. **Migration:** none.
  ```

  A `**Migration:**` marker works here just as it does in `CHANGELOG.md`; the
  promotion PRs build their checklist from the stamped section.
- **Don't** write user-facing changes under `## [Unreleased]` any more. That
  section now holds only the `<!-- store-notes -->` block, edited when cutting a
  release.
- **`pnpm release:cut`** stamps `[Unreleased]` plus every fragment (in filename
  order) into `## vX.Y.Z — date` and deletes the fragments in the same bump
  commit.
