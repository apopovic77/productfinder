import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto('http://localhost:4199/?lang=de&brand=O%27Neal&sport=moto&category=mx-helmets', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6500);
// Klick auf C-SRS Bucket (3 Produkte) — Position aus frueherem Root-Shot: ~x=1120? Besser via Histogramm: C-SRS weit rechts. Wir loggen einfach die Zeitreihe des Kamera-Offsets + erster Node nach Klick auf Bucket-Reihe unten.
await page.screenshot({ path: '.a0.png' });
// Bucket-Labels unten ~y=823; C-SRS bei ~x=1035 (aus 120646-aehnlicher Anordnung)
const series = [];
const sample = () => page.evaluate(() => {
  const c = document.querySelector('.pf-canvas');
  return (window).__pfSample ? (window).__pfSample() : null;
});
// injizierter Sampler via Layout-Hook gibt es nicht — sample per pixel unmoeglich; stattdessen: nach Klick 15x alle 80ms die __pfLay Historie + einen Marker
await page.mouse.click(1035, 823);
for (let i = 0; i < 15; i++) {
  await page.waitForTimeout(80);
}
console.log('frames:', JSON.stringify(await page.evaluate(() => { const b=(window).__pfF||[]; const t0=b.length?b[0].t:0; return b.filter((r,i)=>i%4===0).map(r=>({dt:(r.t-t0)|0, oy:r.oy, ny:r.ny, nty:r.nty, sy:Math.round(r.ny*r.s+r.oy)})); })));
console.log('lay:', JSON.stringify(await page.evaluate(() => (window).__pfLay), null, 0));
console.log('crumbs:', await page.evaluate(() => document.querySelector('.pf-header-breadcrumbs')?.innerText.slice(0,70).replace(/\n/g,' ')));
await page.screenshot({ path: '.a1.png' });
await browser.close();
