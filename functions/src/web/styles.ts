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
header.site .brand .mark{width:32px;height:32px}
header.site nav{display:flex;align-items:center;gap:16px}
.cta.small{white-space:nowrap}
header.site .brand{flex:none}
header.site .wordmark{width:auto;height:20px}
@media (max-width:420px){header.site .mark{display:none}header.site .wordmark{height:15px}}
@media (max-width:540px){header.site nav .wide{display:none}}
@media (max-width:380px){header.site,header.site nav{gap:10px}header.site .wordmark{height:13px}header.site nav>a:not(.cta){font-size:14px}header.site .cta.small{padding:6px 10px;font-size:13px}}
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
@font-face{font-family:Figtree;src:url(/brand/figtree-latin.woff2) format("woff2");font-weight:300 900;font-display:swap}
body{font-family:Figtree,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
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
@media (min-width:821px){.landing .intro{padding-top:56px}}
.landing .intro{position:relative;margin:0;justify-self:center;display:grid;justify-items:center;gap:14px}
.landing .intro-phone{display:block;width:min(290px,78vw);aspect-ratio:9/18.6;padding:10px;background:#1d2117;border-radius:42px;box-shadow:0 30px 60px -20px rgba(63,70,53,.5);position:relative}
.landing .intro-phone video{display:block;width:100%;height:100%;object-fit:cover;border-radius:32px;background:var(--surface)}
.landing .sound{position:absolute;right:22px;bottom:22px;width:40px;height:40px;padding:9px;border:0;border-radius:50%;background:rgba(29,33,23,.72);color:#fff;cursor:pointer}
.landing .sound svg{display:block;width:100%;height:100%}
.landing .sound .wave,.landing .sound.on .off{display:none}
.landing .sound.on .wave{display:inline}
.landing .pillars ul{color:var(--surface)}
.landing .band .pillar b{color:var(--surface)}
.landing .actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px;align-items:center}
.landing .fine{margin-top:14px;font-size:14px;color:var(--muted)}
.landing .strip{border-top:1px solid var(--border);border-bottom:1px solid var(--border);overflow:hidden;padding:14px 0}
.landing .strip-track{display:flex;gap:56px;width:max-content;animation:scroll 40s linear infinite}
.landing .strip span{font-family:var(--display);font-size:22px;white-space:nowrap;color:var(--muted)}
.landing .split{display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center}
.landing .split .lead+.lead{margin-top:14px}
.landing .mosaic{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:10px}
.landing .mosaic li{position:relative;border-radius:14px;overflow:hidden;aspect-ratio:1}
.landing .mosaic img{width:100%;height:100%;object-fit:cover}
.landing .mosaic span{position:absolute;left:0;right:0;bottom:0;padding:28px 12px 10px;font-family:var(--display);font-size:clamp(18px,2.4vw,26px);color:#fff;background:linear-gradient(transparent,rgba(30,34,24,.75))}
.landing .pillar img{width:100%;aspect-ratio:3/2;object-fit:cover;border-radius:12px;margin-bottom:6px}
.landing .banner img{width:100%;aspect-ratio:1600/615;object-fit:cover;border-radius:18px;margin-bottom:56px}
.landing .wr-split{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:56px;align-items:center}
.landing .wr-split .lead{margin:14px 0 0}
@media (max-width:820px){.landing .wr-split{grid-template-columns:1fr;gap:28px}}
.landing .wr{display:grid;justify-items:center;gap:12px}
.landing .wr-phone{width:min(300px,80vw);padding:12px 10px;background:#1d2117;border-radius:42px;box-shadow:0 30px 60px -20px rgba(63,70,53,.5)}
.landing .wr-track{display:flex;aspect-ratio:9/16;overflow-x:auto;scroll-snap-type:x mandatory;border-radius:32px;scrollbar-width:none;background:#1d2117}
.landing .wr-track::-webkit-scrollbar{display:none}
.landing .wr-track img{flex:0 0 100%;width:100%;height:100%;object-fit:cover;scroll-snap-align:center}
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
.landing .villages{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.landing .villages a{display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--card);border-radius:12px;text-decoration:none;color:var(--primary);font-weight:600;height:100%}
.landing .villages img{width:32px;height:38px;object-fit:contain;flex:none}
.landing .villages small{display:block;font-weight:400;font-size:12px;color:var(--muted)}
.landing .steps{display:grid;grid-template-columns:repeat(3,1fr);gap:32px;counter-reset:s;list-style:none;margin:0;padding:0}
.landing .step{display:grid;gap:8px;align-content:start}
.landing .step::before{counter-increment:s;content:counter(s);font-family:var(--display);font-size:52px;line-height:1;color:var(--accent)}
@media (max-width:820px){.landing .steps{grid-template-columns:1fr}}
.landing .amb{background:var(--accent);color:var(--on-accent)}
.landing .amb .eyebrow{color:var(--on-accent);opacity:.8}
.landing .amb .lead{color:var(--on-accent);opacity:.92}
.landing .amb .cta{margin-top:6px;background:var(--surface);color:var(--accent)}
.landing .amb .head{margin:0}
.landing .losing{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.landing .losing li{position:relative;border-radius:18px;overflow:hidden;aspect-ratio:4/5}
.landing .losing img{width:100%;height:100%;object-fit:cover}
.landing .losing span{position:absolute;left:0;right:0;bottom:0;padding:48px 18px 16px;font-family:var(--display);font-size:clamp(20px,2.2vw,26px);line-height:1.15;color:#fff;background:linear-gradient(transparent,rgba(30,34,24,.8))}
.landing .losing-end{margin-top:28px;max-width:40em}
@media (max-width:820px){.landing .losing{grid-template-columns:1fr}.landing .losing li{aspect-ratio:3/2}}
.landing .amb .lead b{font-weight:600}
.landing .amb-photo{width:100%;aspect-ratio:3/2;object-fit:cover;border-radius:20px}
.landing .price{display:grid;grid-template-columns:auto 1fr;gap:40px;align-items:center}
.landing .price .big{font-family:var(--display);font-size:clamp(72px,14vw,128px);line-height:.9;color:var(--clay)}
@media (max-width:820px){.landing .price{grid-template-columns:1fr;gap:16px}}
.landing .faq{display:grid;gap:10px;max-width:46em}
.landing .faq details{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:16px 20px}
.landing .faq summary{cursor:pointer;font-weight:600;color:var(--primary)}
.landing .faq details p{margin-top:10px}
.landing .final{text-align:center;display:grid;justify-items:center;gap:18px}
.landing .final h2{font-size:clamp(36px,6vw,60px)}
.landing .store{display:inline-flex;align-items:center;gap:12px;padding:10px 20px 10px 16px;border-radius:14px;background:var(--surface);color:var(--primary);text-decoration:none;line-height:1.2}
.landing .store svg{width:26px;height:26px;flex:none}
.landing .store span{display:grid;text-align:left}
.landing .store small{font-size:12px;color:var(--text)}
.landing .store b{font-size:18px}
.landing .final .stores{justify-content:center}
`;
