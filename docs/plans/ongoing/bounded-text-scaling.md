# Bound text scaling with a preset on every Text

**Priority:** low

**Landed:** none
**Gate:** none
**Next:** cap the font multiplier at 1.5 through a preset on the Text primitive, with tests

Decided 2026-11-28 (Álvaro, `go` to all picks): maximum font multiplier 1.5.


**Needs Álvaro's yes** — third Órdago harvest run, 2026-11-27. It changes how text renders for users with large fonts.

**Goal:** only Avatar and ActionPill set `maxFontSizeMultiplier`; other text scales without limit (up to 3.57× on iOS) and clips cards. Every `Text` declares a preset, enforced by a test.

Source: ordago-apps `apps/ordago-app/AGENTS.md` § Text scaling, `utils/__tests__/textScaling.test.ts`, 0531efd95.
