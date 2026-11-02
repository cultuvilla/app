/**
 * Pure geometry for image zoom: the in-place pinch and the full-screen viewer.
 *
 * Gestures run on the UI thread and can't be driven from jest, so every decision
 * they make — how far a picture may pan, where a pinch lands, whether a downward
 * flick dismisses — lives here as a plain function a unit test can call. Anything
 * a gesture calls carries the 'worklet' directive.
 *
 * Coordinates: the origin is the CENTRE of the picture's resting place, matching
 * the `translate` transform applied to a centred image. `Offset` is that translate.
 */

export const MIN_SCALE = 1;
export const MAX_SCALE = 4;
/** Where a double-tap lands when starting from 1x. */
export const DOUBLE_TAP_SCALE = 3;
/** Two taps closer together than this (ms) count as a double-tap. */
export const DOUBLE_TAP_MS = 280;
/** Downward drag (px) past which releasing dismisses the viewer. */
export const DISMISS_DISTANCE = 110;
/** Downward fling velocity (px/s) that dismisses regardless of distance. */
export const DISMISS_VELOCITY = 700;
/** How far past the limits a pinch may overshoot before settling back. */
const SCALE_OVERSHOOT = 1.25;
/** Fraction of a drag that still moves a picture already past its pan bound. */
const PAST_BOUND_RESISTANCE = 0.35;
/** Scale at which the page behind an in-place pinch reaches full dim. */
const IN_PLACE_FULL_DIM_SCALE = 1.6;
const IN_PLACE_MAX_DIM = 0.7;

export type Size = { width: number; height: number };
export type Offset = { x: number; y: number };
export type Point = { x: number; y: number };

export function clampScale(scale: number): number {
  'worklet';
  if (!Number.isFinite(scale)) return MIN_SCALE;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/**
 * `contain` the natural image inside the viewport: the whole picture is
 * visible, letterboxed on the axis where it is relatively smaller. Falls back
 * to the viewport when either size is degenerate, so a not-yet-decoded image
 * still produces sane pan bounds instead of NaN.
 */
export function fitSize(natural: Size, viewport: Size): Size {
  const { width: nw, height: nh } = natural;
  const { width: vw, height: vh } = viewport;
  if (nw <= 0 || nh <= 0 || vw <= 0 || vh <= 0) return { width: vw, height: vh };
  const scale = Math.min(vw / nw, vh / nh);
  return { width: nw * scale, height: nh * scale };
}

/**
 * How far the image may be dragged from centre before an edge would come
 * inside the viewport. Zero on an axis the scaled image doesn't overflow —
 * there is nothing hidden to drag into view, so it stays pinned.
 */
export function panBounds(displayed: Size, viewport: Size, scale: number): Offset {
  'worklet';
  return {
    x: Math.max(0, (displayed.width * scale - viewport.width) / 2),
    y: Math.max(0, (displayed.height * scale - viewport.height) / 2),
  };
}

export function clampOffset(
  offset: Offset,
  displayed: Size,
  viewport: Size,
  scale: number,
): Offset {
  'worklet';
  const bounds = panBounds(displayed, viewport, scale);
  // `+ 0` normalises the -0 that clamping a negative drag to a zero bound
  // produces; -0 is a valid translate but an ugly surprise in assertions.
  return {
    x: Math.min(bounds.x, Math.max(-bounds.x, offset.x)) + 0,
    y: Math.min(bounds.y, Math.max(-bounds.y, offset.y)) + 0,
  };
}

/** A live pinch may overshoot the limits slightly, so hitting one feels soft. */
export function softClampScale(scale: number): number {
  'worklet';
  if (!Number.isFinite(scale)) return MIN_SCALE;
  return Math.min(MAX_SCALE * SCALE_OVERSHOOT, Math.max(MIN_SCALE / SCALE_OVERSHOOT, scale));
}

/** A double-tap zooms in from any resting state, and any zoom back out to fit. */
export function nextScaleOnDoubleTap(current: number): number {
  'worklet';
  return current > MIN_SCALE + 0.01 ? MIN_SCALE : DOUBLE_TAP_SCALE;
}

export function isDoubleTap(previousTapAt: number, tapAt: number): boolean {
  return previousTapAt > 0 && tapAt - previousTapAt <= DOUBLE_TAP_MS;
}

/**
 * Offset that keeps the content point under `focal` pinned while the scale
 * changes — what makes a pinch grow the picture under the fingers, and a
 * double-tap zoom into the spot that was tapped, rather than always the centre.
 *
 * `focal` is relative to the viewport centre.
 */
export function offsetForScaleAbout(
  focal: Point,
  offset: Offset,
  fromScale: number,
  toScale: number,
): Offset {
  'worklet';
  if (fromScale <= 0) return offset;
  const ratio = toScale / fromScale;
  return {
    x: focal.x - (focal.x - offset.x) * ratio,
    y: focal.y - (focal.y - offset.y) * ratio,
  };
}

/**
 * Share of a drag that moves the picture on one axis: all of it inside the pan
 * bound, a fraction past it, so reaching an edge resists instead of stopping dead.
 */
export function panResistance(offset: number, bound: number): number {
  'worklet';
  return Math.abs(offset) > bound ? PAST_BOUND_RESISTANCE : 1;
}

/**
 * Offset that puts a point of the picture at the centre of the viewport.
 * `fraction` is where the point sits in the picture, 0–1 on each axis.
 */
export function offsetCenteringPoint(fraction: Point, displayed: Size, scale: number): Offset {
  return {
    x: (0.5 - fraction.x) * displayed.width * scale,
    y: (0.5 - fraction.y) * displayed.height * scale,
  };
}

/**
 * Translate for a picture pinched in place, keeping the point first touched
 * under the fingers as they spread and move. Coordinates are local to the
 * picture's resting frame, whose `center` the scale transform pivots on.
 */
export function inPlaceTranslation(
  focalStart: Point,
  focal: Point,
  center: Point,
  scale: number,
): Offset {
  'worklet';
  return {
    x: focal.x - focalStart.x + (focalStart.x - center.x) * (1 - scale),
    y: focal.y - focalStart.y + (focalStart.y - center.y) * (1 - scale),
  };
}

/** How far the page dims behind a picture pinched in place. */
export function inPlaceBackdropOpacity(scale: number): number {
  'worklet';
  const progress = (scale - MIN_SCALE) / (IN_PLACE_FULL_DIM_SCALE - MIN_SCALE);
  return Math.min(1, Math.max(0, progress)) * IN_PLACE_MAX_DIM;
}

/**
 * Releasing a downward drag dismisses on a long pull or a fast flick — but only
 * at rest scale. Once zoomed in, a downward drag is panning the picture, and
 * dismissing under the user's finger there would be infuriating.
 */
export function shouldDismissOnRelease(dy: number, vy: number, scale: number): boolean {
  'worklet';
  if (scale > MIN_SCALE + 0.01) return false;
  return dy > DISMISS_DISTANCE || vy > DISMISS_VELOCITY;
}

/** Backdrop opacity while dragging down to dismiss: fades out as it goes. */
export function dismissBackdropOpacity(dy: number, viewportHeight: number): number {
  'worklet';
  if (viewportHeight <= 0) return 1;
  const progress = Math.min(1, Math.max(0, dy) / viewportHeight);
  return Math.max(0.3, 1 - progress * 1.4);
}
