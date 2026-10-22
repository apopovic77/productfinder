/**
 * AI-Explorer — generischer Erkundungstest fuer Web-Apps (owner 2026-10-22).
 *
 * Statt fester Klickskripte laeuft ein Zufallsspaziergang ueber die Aktionen,
 * die ein Adapter fuer die App beschreibt. Nach jedem Schritt liest der Kern
 * den Zustand der App und prueft die Regeln (Invarianten) des Adapters. Bricht
 * eine Regel, wird der Pfad bis dorthin gespeichert, auf die kuerzeste
 * Schrittfolge verkleinert, die den Fehler noch zeigt, und mit Screenshot
 * gemeldet.
 *
 * Adapter-Vertrag (siehe adapters/productfinder.cjs):
 *   name, start(page, base)       Seite laden, bis die App bereit ist
 *   state(page)                    Zustand als JSON (was ein Mensch sieht)
 *   actions: [{ name, weight, available(state), run(page, state, rng) }]
 *     run liefert { label, kind } — kind 'push' (eine Ebene tiefer),
 *     'pop' (eine Ebene zurueck) oder 'same' (Ebene bleibt)
 *   invariants: [{ name, check(ctx) }] — ctx = { prev, next, step, history }
 *     liefert null (in Ordnung) oder einen Text (Verstoss)
 *
 * Aufruf: node core.cjs <adapter> <base-url> [--walks 20] [--steps 25] [--seed 1] [--out dir]
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

function rngFrom(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e9) / 1e9; };
}

function pick(rng, list) {
  const total = list.reduce((sum, item) => sum + (item.weight ?? 1), 0);
  let r = rng() * total;
  for (const item of list) { r -= item.weight ?? 1; if (r <= 0) return item; }
  return list[list.length - 1];
}

function args(argv) {
  const out = { walks: 20, steps: 25, seed: Date.now() % 100000, out: 'explorer-report' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1], i++;
    else (out._ ??= []).push(argv[i]);
  }
  return out;
}

/**
 * Browser-Verlauf generisch pruefen: jeder Eintrag bekommt eine Marke, der
 * Kern merkt sich, was dort zuletzt zu sehen war. Eine Aktion mit
 * { historyBack: true } erwartet danach genau diesen Zustand wieder.
 */
async function tagHistory(page, seen, state, forceNew = false) {
  // forceNew: der Verlauf ist gewachsen. Apps kopieren beim pushState oft den
  // alten Eintrag ({...history.state}) und damit auch die Marke.
  const id = await page.evaluate(([next, force]) => {
    const current = history.state ?? {};
    if (current.__explorerId && !force) return current.__explorerId;
    history.replaceState({ ...current, __explorerId: next }, '');
    return next;
  }, [seen.size + 1, forceNew]);
  seen.set(id, state);
}

const historyLength = page => page.evaluate(() => history.length);

async function currentHistoryId(page) {
  return page.evaluate(() => history.state?.__explorerId ?? null);
}

/** Einen Pfad ausfuehren; replay = feste Schrittfolge (zum Verkleinern). */
async function walk(context, adapter, base, { rng, steps, replay, keepOpen = false }) {
  // Jede Runde eine frische Seite: Browser kappen history.length bei 50, ein
  // geteilter Tab erkennt neue Verlaufseintraege dann nicht mehr.
  const page = await context.newPage();
  const errors = [];
  const onError = e => errors.push(String(e.message || e));
  page.on('pageerror', onError);
  try {
    await adapter.start(page, base);
    let prev = await adapter.state(page);
    const history = [{ action: 'start', kind: 'same', state: prev }];
    const seen = new Map();
    await tagHistory(page, seen, prev);
    const plan = replay ?? Array.from({ length: steps }, () => null);
    for (let i = 0; i < plan.length; i++) {
      const available = adapter.actions.filter(a => a.available(prev));
      if (!available.length) break;
      let action, result;
      const lengthBefore = await historyLength(page);
      if (plan[i]) {
        action = adapter.actions.find(a => a.name === plan[i].action);
        if (!action || !action.available(prev)) continue;
        result = await action.run(page, prev, rng, plan[i].label);
      } else {
        action = pick(rng, available);
        result = await action.run(page, prev, rng);
      }
      if (!result) continue;
      const next = await adapter.state(page);
      const step = { action: action.name, label: result.label, kind: result.kind, state: next };
      if (result.historyBack) step.expected = seen.get(await currentHistoryId(page));
      await tagHistory(page, seen, next, !result.historyBack && (await historyLength(page)) > lengthBefore);
      history.push(step);
      if (errors.length) return { history, violation: { rule: 'Seitenfehler', detail: errors.join(' | ') } };
      for (const rule of adapter.invariants) {
        const detail = rule.check({ prev, next, step, history });
        if (detail) return { history, violation: { rule: rule.name, detail } };
      }
      prev = next;
    }
    return { history, violation: null };
  } finally {
    page.off('pageerror', onError);
    if (!keepOpen) await page.close();
    else walk.lastPage = page;
  }
}

/** Schritte weglassen, solange derselbe Regelverstoss bleibt (Delta-Debugging light). */
async function shrink(context, adapter, base, history, rule) {
  let plan = history.slice(1).map(h => ({ action: h.action, label: h.label }));
  for (let i = plan.length - 2; i >= 0; i--) {
    const candidate = plan.filter((_, j) => j !== i);
    const result = await walk(context, adapter, base, { rng: rngFrom(1), replay: candidate });
    if (result.violation?.rule === rule) plan = candidate;
  }
  return plan;
}

async function main() {
  const opts = args(process.argv.slice(2));
  const [adapterName, base] = opts._ ?? [];
  if (!adapterName || !base) { console.error('Aufruf: node core.cjs <adapter> <base-url> [--walks n] [--steps n] [--seed n]'); process.exit(2); }
  const adapter = require(path.resolve(__dirname, 'adapters', `${adapterName}.cjs`));
  const browser = await chromium.launch({ args: adapter.launchArgs ?? [] });
  const context = await browser.newContext({ viewport: adapter.viewport ?? { width: 1800, height: 970 } });
  fs.mkdirSync(opts.out, { recursive: true });
  const rng = rngFrom(Number(opts.seed));
  const findings = new Map();
  let stepsTotal = 0;
  const t0 = Date.now();
  for (let w = 0; w < Number(opts.walks); w++) {
    const result = await walk(context, adapter, base, { rng, steps: Number(opts.steps) });
    stepsTotal += result.history.length - 1;
    if (!result.violation) { process.stdout.write('.'); continue; }
    const key = `${result.violation.rule}: ${result.violation.detail.slice(0, 120)}`;
    if (findings.has(key)) { process.stdout.write('x'); continue; }
    process.stdout.write('X');
    const minimal = await shrink(context, adapter, base, result.history, result.violation.rule);
    const replay = await walk(context, adapter, base, { rng: rngFrom(1), replay: minimal, keepOpen: true });
    const shot = path.join(opts.out, `finding-${findings.size + 1}.png`);
    await walk.lastPage.screenshot({ path: shot }).catch(() => {});
    await walk.lastPage.close();
    findings.set(key, {
      rule: result.violation.rule,
      detail: (replay.violation ?? result.violation).detail,
      steps: minimal,
      states: replay.history.map(h => ({ action: h.action, label: h.label, state: h.state })),
      screenshot: shot,
    });
  }
  const report = { adapter: adapter.name, base, seed: Number(opts.seed), walks: Number(opts.walks), steps: stepsTotal, seconds: Math.round((Date.now() - t0) / 1000), findings: [...findings.values()] };
  fs.writeFileSync(path.join(opts.out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`\n${report.walks} Spaziergaenge, ${report.steps} Schritte, ${report.seconds} s, ${report.findings.length} Befund(e) -> ${path.join(opts.out, 'report.json')}`);
  for (const f of report.findings) {
    console.log(`\n[${f.rule}] ${f.detail}`);
    f.steps.forEach((s, i) => console.log(`  ${i + 1}. ${s.action}${s.label ? ' ' + s.label : ''}`));
  }
  await browser.close();
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { walk, shrink, rngFrom };
