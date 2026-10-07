/**
 * Escape a string for interpolation into HTML text or a double-quoted
 * attribute. One helper for both positions: over-escaping `"` in text content
 * is harmless, while under-escaping it in an attribute is an injection.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
