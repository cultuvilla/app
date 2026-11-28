/**
 * Shrink-to-fit sizing for single-line button labels.
 *
 * `adjustsFontSizeToFit` would be the obvious answer, but RN-Web does not
 * implement it (see ScreenTitle) and degrades to an ellipsis — and a truncated
 * label on a button is worse than a small one. So we measure the label at its
 * base size and scale it down by the ratio instead, which behaves identically
 * on native and on the web export.
 */

/** Never shrink a label below 75% of its base size — past that it stops reading as a button. */
export const MIN_LABEL_SCALE = 0.75;

export interface FittedLabel {
  /** Font size to render at. */
  fontSize: number;
  /**
   * Whether the label fits on one line at `fontSize`. When false the caller
   * must let it wrap: clipping or ellipsizing a button label loses meaning.
   */
  fitsOneLine: boolean;
}

/**
 * @param naturalWidth width the label occupies unconstrained at `baseFontSize`, or null while unmeasured
 * @param availableWidth content width the label has to live in, or null while unmeasured
 */
export function fitLabel(
  naturalWidth: number | null,
  availableWidth: number | null,
  baseFontSize: number,
  minScale: number = MIN_LABEL_SCALE,
): FittedLabel {
  if (
    naturalWidth == null ||
    availableWidth == null ||
    naturalWidth <= 0 ||
    availableWidth <= 0 ||
    naturalWidth <= availableWidth
  ) {
    return { fontSize: baseFontSize, fitsOneLine: true };
  }
  const required = availableWidth / naturalWidth;
  return {
    fontSize: baseFontSize * Math.max(required, minScale),
    fitsOneLine: required >= minScale,
  };
}
