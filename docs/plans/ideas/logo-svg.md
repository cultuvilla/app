# Vector (SVG) master for the Cultuvilla logo

**Priority:** low

## Goal

Replace the 472×472 PNG logo with an SVG master, the same way the lettering
already has one in [packages/shared/assets/brand/](../../../packages/shared/assets/brand/),
and derive every raster copy from it.

## Context

The wordmark has an outlined SVG master (`cultuvilla-lettering.svg`); the mark
does not. The only source is `apps/mobile/assets/logo.png` (472 px, 160 KB),
byte-identical to `packages/shared/assets/icons/logo_cultuvilla_nobg.png`. Every
other copy is a downscale of it:

- `apps/mobile/components/auth/AuthHeader.tsx` — `require('../../assets/logo.png')`
- `apps/mobile/lib/export/cultuvillaLogo.ts` — 128 px base64 for the xlsx export
- `functions/src/wrapped/render/brand/logo.png` — 160 px for the Wrapped cards
- `scripts/generate-qr.mjs` — QR centre logo
- `apps/mobile/assets/{icon,adaptive-icon,favicon}.png` — store/OS icons

472 px is already soft on tablets and high-DPI desktops, and each downscale
re-quantises colour. The lettering showed how easily copies diverge: the
animator's PNG of it had `CUL` in `#566047` (the app palette's `olive`) instead
of the brand master's `#496345`. One vector master settles which is canonical.

## Design / approach

1. **Get a real vector from the designer** (outlined paths, flat fills, no
   effects), exported to `packages/shared/assets/brand/cultuvilla-logo.svg`, with
   the palette documented in the brand README beside the lettering spec
   (leaves `#496345`, houses `#cd6338`).
   Auto-tracing the PNG (potrace et al.) is the fallback only — it produces lumpy
   curves at exactly the sizes where the SVG is supposed to win.
2. **Regenerate rasters from the SVG** with one script (sharp renders SVG), so
   `logo.png`, the Wrapped copy, the xlsx base64 and the QR logo stop being
   hand-made downscales. OS/store icons stay PNG (platform requirement) but are
   rendered from the master.
3. **The intro needs nothing.** The animator rebuilt the door without the logo
   PNG, so `apps/mobile/assets/intro/cultuvilla-intro.json` is already fully
   vector. Its wordmark comes from the lettering SVG via
   `scripts/prepare-intro-lottie.mjs`; if the logo ever enters the animation
   again, extend that script the same way rather than embedding a PNG.
4. Where the app renders the logo in-UI (`AuthHeader`), consider
   `react-native-svg` so it is crisp at any size — only if it's already a
   dependency or worth adding for other reasons.

## Open questions

- Does the designer have the original vector (AI/Figma), or does it need redrawing?
- Should the SVG ship with or without the white door/path cut-outs as real holes
  (transparent) vs white fills? Holes are more reusable on non-white grounds.
