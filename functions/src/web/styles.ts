import { colors, palette } from '@cultuvilla/shared/design-system';

const c = colors.light;

/**
 * The whole stylesheet, inlined into every page. It is small, and inlining it
 * removes the one render-blocking request between a WhatsApp tap and content —
 * first paint is this site's entire job.
 */
export const STYLES = `
:root{--surface:${c.bg.surface};--card:${c.bg['surface-elevated']};--accent:${c.bg.accent};--on-accent:${c.fg['on-accent']};--text:${c.fg['on-subtle']};--primary:${c.fg.primary};--muted:${palette.sage};--border:${c.border.subtle}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--surface);color:var(--text);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--accent)}
img{max-width:100%;height:auto;display:block}
.wrap{max-width:720px;margin:0 auto;padding:0 16px}
header.site{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0}
header.site .brand{display:flex;align-items:center;gap:8px;color:var(--primary);font-weight:700;font-size:20px;text-decoration:none}
header.site .brand img{width:32px;height:32px}
.cta{display:inline-block;background:var(--accent);color:var(--on-accent);text-decoration:none;font-weight:600;padding:10px 18px;border-radius:999px;border:0;cursor:pointer}
.cta.small{padding:6px 14px;font-size:14px}
.cta.block{display:block;text-align:center;margin:24px 0}
main{padding-bottom:32px}
h1{color:var(--primary);font-size:28px;line-height:1.2;margin:16px 0 8px}
h2{color:var(--primary);font-size:20px;margin:28px 0 12px}
.meta{color:var(--muted);font-size:14px;margin:0 0 12px}
.hero{width:100%;aspect-ratio:3/2;object-fit:cover;border-radius:16px;background:var(--border)}
.escudo{width:72px;height:72px;object-fit:contain}
.body p{margin:0 0 12px;white-space:pre-line}
.facts{list-style:none;padding:0;margin:12px 0}
.facts li{padding:6px 0;border-bottom:1px solid var(--border)}
.cards{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}
.cards a{display:block;background:var(--card);border-radius:12px;overflow:hidden;text-decoration:none;color:var(--text);height:100%}
.cards img{width:100%;aspect-ratio:3/2;object-fit:cover;background:var(--border)}
.cards .t{display:block;padding:8px 12px 2px;font-weight:600;color:var(--primary)}
.cards .s{display:block;padding:0 12px 10px;font-size:14px;color:var(--muted)}
.list{list-style:none;padding:0;margin:0}
.list li{padding:10px 0;border-bottom:1px solid var(--border)}
.more{display:inline-block;margin-top:8px;font-weight:600}
.notice{background:var(--card);border-radius:12px;padding:16px;margin:16px 0}
.stores{display:flex;flex-wrap:wrap;gap:12px;margin:16px 0}
footer.site{border-top:1px solid var(--border);padding:16px 0 32px;font-size:14px;color:var(--muted)}
footer.site a{color:var(--muted);margin-right:12px}
`;
