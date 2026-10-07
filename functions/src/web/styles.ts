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
header.site nav{display:flex;align-items:center;gap:16px}
.cta.small{white-space:nowrap}
header.site .brand{flex:none}
@media (max-width:420px){header.site .brand span{display:none}}
header.site nav>a:not(.cta){color:var(--primary);font-weight:600;text-decoration:none}
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

/**
 * The home page only: full-bleed bands, a display face and the bunting. Kept
 * apart so every other page stays the small reading column it is. Gloock is
 * self-hosted under /brand (OFL, licence beside it) so no visitor's IP reaches
 * a third-party font host.
 */
export const LANDING_STYLES = `
@font-face{font-family:Gloock;src:url(/brand/gloock-latin.woff2) format("woff2");font-display:swap}
.landing{--display:Gloock,Georgia,"Times New Roman",serif;--olive:${palette.olive};--clay:${palette.clay};--peach:${palette.peach};--band-muted:#d4d6c6;padding-bottom:0}
.landing .in{max-width:1080px;margin:0 auto;padding:0 16px}
.landing h1,.landing h2,.landing h3{font-family:var(--display);font-weight:400;line-height:1.05;text-wrap:balance;color:inherit;margin:0}
.landing h2{font-size:clamp(28px,4.4vw,40px)}
.landing h3{font-size:24px}
.landing p{margin:0}
.landing .eyebrow{font-size:12px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
.landing .lead{font-size:18px;color:var(--text);max-width:36em}
.landing .band{background:var(--olive);color:var(--surface)}
.landing .band .lead,.landing .band .muted{color:var(--band-muted)}
.landing .band .eyebrow{color:var(--clay)}
.landing .blk{padding:72px 0}
.landing .head{display:grid;gap:12px;margin-bottom:36px;max-width:40em}
.landing .cta.block{display:inline-block;margin:0}
.landing .ghost{display:inline-block;padding:10px 18px;border-radius:999px;border:1.5px solid var(--border);color:var(--primary);font-weight:600;text-decoration:none}
.bunting{display:block;width:100%;height:48px}
.bunting .flag{transform-box:fill-box;transform-origin:50% 0;animation:sway 4s ease-in-out infinite}
.bunting .flag:nth-child(even){animation-delay:-2s}
@keyframes sway{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}
@keyframes scroll{to{transform:translateX(-50%)}}
@media (prefers-reduced-motion:reduce){.bunting .flag,.landing .strip-track{animation:none}}
.landing .top{display:grid;grid-template-columns:1.1fr .9fr;gap:48px;align-items:center;padding:8px 16px 64px}
.landing .top h1{font-size:clamp(40px,7vw,76px);color:var(--primary);margin:14px 0 18px}
.landing .top h1 em{font-style:normal;color:var(--accent)}
.landing .top.single{grid-template-columns:1fr;padding-bottom:48px}
.landing .top.single .lead{max-width:40em}
@media (max-width:820px){.landing .top{grid-template-columns:1fr}}
.landing .phone{justify-self:center;display:block;width:min(300px,100%);aspect-ratio:9/18.5;background:#1d2117;border-radius:40px;padding:10px;box-shadow:0 30px 60px -20px rgba(63,70,53,.45);transform:rotate(2deg);text-decoration:none;color:var(--text)}
.landing .screen{display:flex;flex-direction:column;height:100%;border-radius:31px;background:var(--surface);overflow:hidden}
.landing .ph-head{display:flex;align-items:center;gap:10px;padding:22px 16px 8px}
.landing .ph-escudo{width:34px;height:40px;object-fit:contain;flex:none}
.landing .ph-head b{display:block;font-family:var(--display);font-weight:400;font-size:20px;line-height:1;color:var(--primary)}
.landing .ph-head small{font-size:11px;color:var(--muted)}
.landing .ph-sec{display:block;padding:8px 16px 0;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--primary)}
.landing .ph-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:6px 16px 2px}
.landing .mini{display:block;background:var(--card);border-radius:10px;overflow:hidden;min-width:0}
.landing .mini img{width:100%;aspect-ratio:4/3;object-fit:cover;background:var(--border)}
.landing .mini .t{display:block;padding:5px 7px 0;font-size:11px;font-weight:600;line-height:1.25;color:var(--primary);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.landing .mini .s{display:block;padding:1px 7px 6px;font-size:10px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.landing .ph-word{display:block;margin:10px 16px 0;padding:9px 11px;border-radius:12px;background:var(--olive);color:var(--surface)}
.landing .ph-word small{display:block;font-size:9px;letter-spacing:.12em;text-transform:uppercase;opacity:.8}
.landing .ph-word b{display:block;font-family:var(--display);font-weight:400;font-size:18px}
.landing .ph-word span{display:block;font-size:10px;opacity:.9}
.landing .ph-tabs{margin-top:auto;display:flex;justify-content:space-around;padding:10px 0 14px;border-top:1px solid var(--border)}
.landing .ph-tabs i{width:22px;height:4px;border-radius:2px;background:var(--muted)}
.landing .ph-tabs i:first-child{background:var(--accent)}
.landing .teaser{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:20px;padding-top:28px;padding-bottom:28px;border-top:1px solid var(--border);border-bottom:1px solid var(--border)}
.landing .pillars ul{color:var(--surface)}
.landing .band .pillar b{color:var(--surface)}
.landing .actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px;align-items:center}
.landing .fine{margin-top:14px;font-size:14px;color:var(--muted)}
.landing .strip{border-top:1px solid var(--border);border-bottom:1px solid var(--border);overflow:hidden;padding:14px 0}
.landing .strip-track{display:flex;gap:36px;width:max-content;animation:scroll 40s linear infinite}
.landing .strip span{font-family:var(--display);font-size:22px;white-space:nowrap;color:var(--muted)}
.landing .split{display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center}
.landing .split .lead+.lead{margin-top:14px}
.landing .mosaic{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:10px}
.landing .mosaic li{position:relative;border-radius:14px;overflow:hidden;aspect-ratio:1}
.landing .mosaic li:nth-child(2),.landing .mosaic li:nth-child(3){transform:translateY(18px)}
.landing .mosaic img{width:100%;height:100%;object-fit:cover}
.landing .mosaic span{position:absolute;left:0;right:0;bottom:0;padding:28px 12px 10px;font-family:var(--display);font-size:clamp(18px,2.4vw,26px);color:#fff;background:linear-gradient(transparent,rgba(30,34,24,.75))}
.landing .pillar img{width:100%;aspect-ratio:3/2;object-fit:cover;border-radius:12px;margin-bottom:6px}
.landing .card img.cover{width:calc(100% + 48px);max-width:none;margin:-24px -24px 6px;aspect-ratio:8/5;object-fit:cover}
.landing .card{overflow:hidden}
.landing .banner img{width:100%;aspect-ratio:1600/615;object-fit:cover;border-radius:18px;margin-bottom:56px}
.landing .night{background:linear-gradient(rgba(38,43,30,.78),rgba(38,43,30,.86)),url(/brand/landing/verbena-noche.webp) center/cover}
.landing .unique{list-style:none;margin:0;padding:0}
.landing .unique li{font-family:var(--display);font-size:clamp(32px,5vw,52px);line-height:1.15;color:var(--primary)}
.landing .unique li:nth-child(odd){color:var(--accent)}
@media (max-width:820px){.landing .split{grid-template-columns:1fr;gap:28px}}
.landing .shelf{margin-top:40px}
.landing .shelf-head{display:flex;justify-content:space-between;align-items:baseline;gap:16px;margin-bottom:14px}
.landing .shelf-head a{color:var(--clay);font-weight:600;white-space:nowrap}
.landing .shelf .cards{grid-template-columns:none;grid-auto-flow:column;grid-auto-columns:minmax(190px,230px);overflow-x:auto;padding-bottom:8px;scroll-snap-type:x proximity}
.landing .shelf .cards li{scroll-snap-align:start}
.landing .shelf.posters .cards img{aspect-ratio:3/4}
.landing .word{display:grid;gap:6px;background:rgba(249,240,232,.08);border:1px solid rgba(249,240,232,.18);border-radius:16px;padding:20px 22px;margin-top:40px;max-width:40em}
.landing .word a{font-family:var(--display);font-size:30px;color:var(--surface);text-decoration:none}
.landing .pillars{display:grid;grid-template-columns:repeat(3,1fr);gap:32px}
.landing .pillar{display:grid;gap:10px;align-content:start;padding-top:18px;border-top:2px solid var(--accent)}
.landing .pillar b{font-family:var(--display);font-weight:400;font-size:36px;line-height:1;color:var(--primary)}
.landing .pillar ul{margin:4px 0 0;padding-left:18px}
@media (max-width:820px){.landing .pillars{grid-template-columns:1fr}}
.landing .aud{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}
.landing .card{background:var(--card);border:1px solid var(--border);border-radius:18px;padding:24px;display:grid;gap:10px;align-content:start;min-width:0}
.landing .tag{justify-self:start;font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px;background:var(--surface);color:var(--accent)}
.landing .card.amb{grid-column:1/-1;background:var(--accent);border-color:var(--accent);color:var(--on-accent);grid-template-columns:1.2fr 1fr;gap:24px;align-items:center}
.landing .card.amb .muted{color:var(--on-accent);opacity:.92}
.landing .card.amb .tag{background:rgba(255,255,255,.18);color:var(--on-accent)}
.landing .url{font:500 14px/1.5 ui-monospace,Menlo,Consolas,monospace;background:rgba(255,255,255,.16);border-radius:12px;padding:14px 16px;overflow-x:auto;white-space:nowrap}
.landing .url a{color:inherit}
@media (max-width:820px){.landing .aud,.landing .card.amb{grid-template-columns:1fr}}
.landing .card .muted{color:var(--text)}
.landing .villages{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.landing .villages a{display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--card);border-radius:12px;text-decoration:none;color:var(--primary);font-weight:600;height:100%}
.landing .villages img{width:32px;height:38px;object-fit:contain;flex:none}
.landing .villages small{display:block;font-weight:400;font-size:12px;color:var(--muted)}
.landing .steps{display:grid;grid-template-columns:repeat(3,1fr);gap:32px;counter-reset:s}
.landing .step{display:grid;gap:8px;align-content:start}
.landing .step::before{counter-increment:s;content:counter(s);font-family:var(--display);font-size:52px;line-height:1;color:var(--accent)}
@media (max-width:820px){.landing .steps{grid-template-columns:1fr}}
.landing .price{display:grid;grid-template-columns:auto 1fr;gap:40px;align-items:center}
.landing .price .big{font-family:var(--display);font-size:clamp(72px,14vw,128px);line-height:.9;color:var(--clay)}
@media (max-width:820px){.landing .price{grid-template-columns:1fr;gap:16px}}
.landing .faq{display:grid;gap:10px;max-width:46em}
.landing .faq details{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:16px 20px}
.landing .faq summary{cursor:pointer;font-weight:600;color:var(--primary)}
.landing .faq details p{margin-top:10px}
.landing .final{text-align:center;display:grid;justify-items:center;gap:18px}
.landing .final h2{font-size:clamp(36px,6vw,60px)}
.landing .store{display:inline-flex;flex-direction:column;align-items:flex-start;padding:10px 20px;border-radius:14px;background:var(--surface);color:var(--primary);text-decoration:none;line-height:1.2}
.landing .store small{font-size:12px;color:var(--text)}
.landing .store b{font-size:18px}
.landing .final .stores{justify-content:center}
`;
