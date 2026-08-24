import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
await p.goto('http://localhost:4199/?lang=de&brand=O%27Neal&sport=moto&category=mx-helmets'); await p.waitForTimeout(8000);
const hdrClick = async (name) => { const hs = await p.evaluate(() => window.__pfController.layoutService.getGroupHeaders().map(h=>[h.key, Math.round(h.x+h.width/2), Math.round(h.y+h.height/2)])); const t = hs.find(h=>h[0]===name); await p.mouse.click(t[1], 48+t[2]); await p.waitForTimeout(2800); };
await hdrClick('8SRS');
const hit = await p.evaluate(() => { const c = window.__pfController; for (let y=120;y<820;y+=15) for (let x=60;x<1500;x+=20) { const pr=c.hitTest(x,y); if (pr) return {x,y}; } return null; });
await p.mouse.click(hit.x+20, hit.y+30); await p.waitForTimeout(2500);
console.log(await p.evaluate(() => [...document.querySelectorAll('.pf-hero-arrow')].map(a => ({ cls: a.className, disabled: a.disabled, opacity: getComputedStyle(a).opacity, bg: getComputedStyle(a).backgroundColor, z: getComputedStyle(a).zIndex, rect: Math.round(a.getBoundingClientRect().right) }))));
// scrim overlap?
console.log('scrim:', await p.evaluate(() => { const s = document.querySelector('.pf-hero-dock-scrim'); return s ? { z: getComputedStyle(s).zIndex, w: s.getBoundingClientRect().width } : null; }));
await b.close();
