/**
 * Adapter Produktfinder fuer den AI-Explorer.
 *
 * Aktionen bilden ab, was ein Haendler tut (Gruppe oeffnen, zurueck, Ansicht
 * wechseln, Dimension waehlen, Produkt oeffnen, suchen). Den Zustand liefert
 * App.traceSnapshot (derselbe wie im Klickprotokoll). Die Regeln sind die
 * Festlegungen des Owners aus den Tests vom 21./22.10.2026.
 */
const LAUNCH_HOST = 'productfinder.oneal.arkturian.com';
const SEARCH_TERMS = ['neon', 'helm', 'black', 'kini', 'jersey', 'boot'];

async function settle(page) {
  // Warten bis der Zustand zwei Abfragen lang gleich bleibt (Animationen, Daten)
  let last = '';
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(180);
    const now = await page.evaluate(() => JSON.stringify(window.__pfApp?.traceSnapshot?.() ?? null)).catch(() => '');
    if (now && now === last) return;
    last = now;
  }
}

async function call(page, fn, arg) {
  await page.evaluate(fn, arg);
  await settle(page);
}

const norm = label => String(label).toLowerCase().split(',').map(s => s.trim()).sort().join(',');

/** Zustand vor dem passenden "push" zu einem "pop" (Stapel ueber die Historie). */
function stateBeforePush(history) {
  const stack = [];
  for (let i = 1; i < history.length - 1; i++) {
    const h = history[i];
    if (h.kind === 'push') stack.push(history[i - 1].state);
    if (h.kind === 'pop') stack.pop();
    // Browser-Zurueck folgt dem Verlauf, nicht der Ebenen-Tiefe: ab hier
    // weiss der Stapel nicht mehr, was "eine Ebene hoeher" ist.
    if (h.kind === 'history') stack.length = 0;
  }
  return stack.pop();
}

module.exports = {
  name: 'productfinder',
  launchArgs: [`--host-resolver-rules=MAP ${LAUNCH_HOST} 127.0.0.1`],
  viewport: { width: 1800, height: 970 },

  async start(page, base) {
    // ?trace=0: die eigenen Laeufe nicht ins Klickprotokoll schreiben
    await page.goto(`${base}?lang=de&trace=0`, { waitUntil: 'load' });
    const entry = page.getByText('Alle Produkte').first();
    await entry.waitFor({ timeout: 30000 });
    await entry.click();
    await page.waitForFunction(() => !!window.__pfController?.getCurrentBuckets?.().length, null, { timeout: 30000 });
    await settle(page);
  },

  async state(page) {
    return page.evaluate(() => {
      const app = window.__pfApp, c = window.__pfController;
      const s = app.traceSnapshot();
      const nodes = c.layoutService.getEngine().all();
      const W = window.innerWidth;
      s.outsideX = nodes.filter(n => n.opacity?.targetValue !== 0 && (n.posX.targetValue < -2 || n.posX.targetValue + n.width.targetValue > W + 2)).length;
      s.canPivot = c.canShowPivotColumns();
      s.dims = c.getAvailablePivotDimensions();
      s.bucketLabels = c.getCurrentBuckets().filter(b => !b.isUnknown).map(b => b.label);
      // Runde Symbolknoepfe, die die globale Button-Regel verzerrt (Oval statt Kreis)
      s.distortedRound = [...document.querySelectorAll('button, a.pf-header-btn')].filter(el => {
        if (el.closest('.pf-view-switch')) return false;
        const cs = getComputedStyle(el), r = el.getBoundingClientRect();
        if (!r.width || cs.display === 'none' || cs.visibility === 'hidden') return false;
        const round = cs.borderRadius.includes('50%') || parseFloat(cs.borderRadius) >= r.height / 2 - 1;
        return round && r.height <= 48 && r.width <= 60 && Math.abs(r.width - r.height) > 1.5 && !/[A-Za-z]{3}/.test(el.textContent || '');
      }).map(el => `${String(el.className).split(' ')[0] || el.tagName} ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`);
      return s;
    });
  },

  actions: [
    {
      name: 'drill', weight: 5,
      available: s => !s.product && s.bucketLabels.length >= 2,
      async run(page, s, rng, label) {
        const target = label ?? s.bucketLabels[Math.floor(rng() * s.bucketLabels.length)];
        if (!s.bucketLabels.includes(target)) return null;
        await call(page, l => { window.__pfController.drillDownPivot(l); window.__pfApp.syncPivotUI(); }, target);
        return { label: target, kind: 'push' };
      },
    },
    {
      name: 'crumbBack', weight: 2,
      available: s => !s.product && s.crumbs.length > 1,
      async run(page) {
        await call(page, () => { const c = window.__pfController.getPivotBreadcrumbs(); window.__pfApp.handleBreadcrumbClick(c.length - 2); });
        return { kind: 'pop' };
      },
    },
    {
      name: 'browserBack', weight: 2,
      available: s => !s.product && !s.search && s.crumbs.length > 1,
      async run(page) {
        await page.goBack();
        await settle(page);
        return { kind: 'history', historyBack: true };
      },
    },
    {
      name: 'viewPivot', weight: 2,
      available: s => !s.product && s.view === 'grouped' && s.canPivot,
      async run(page) {
        await page.locator('button[title="Pivot-Spalten"]').click();
        await settle(page);
        return { kind: 'same' };
      },
    },
    {
      name: 'viewGrouped', weight: 2,
      available: s => !s.product && s.view === 'pivot',
      async run(page) {
        await page.locator('button[title="Grouped View"]').click();
        await settle(page);
        return { kind: 'same' };
      },
    },
    {
      name: 'dimension', weight: 3,
      available: s => !s.product && s.dims.filter(d => d !== s.dimension).length > 0,
      async run(page, s, rng, label) {
        const options = s.dims.filter(d => d !== s.dimension);
        const dim = label ?? options[Math.floor(rng() * options.length)];
        if (!options.includes(dim)) return null;
        await call(page, d => window.__pfApp.handleDimensionClick(d), dim);
        return { label: dim, kind: 'same' };
      },
    },
    {
      name: 'openProduct', weight: 1,
      available: s => !s.product && s.products > 0,
      async run(page, s, rng, label) {
        const id = await page.evaluate(([want, r]) => {
          const list = window.__pfController.getDisplayOrder();
          const p = want ? list.find(x => String(x.id) === want) : list[Math.floor(r * list.length)];
          if (p) window.__pfApp.openProductDetails(p);
          return p ? String(p.id) : null;
        }, [label ?? null, rng()]);
        if (!id) return null;
        await settle(page);
        return { label: id, kind: 'same' };
      },
    },
    {
      name: 'closeProduct', weight: 3,
      available: s => !!s.product,
      async run(page) {
        await page.keyboard.press('Escape');
        await settle(page);
        return { kind: 'same' };
      },
    },
    {
      name: 'search', weight: 1,
      available: s => !s.product && !s.search,
      async run(page, s, rng, label) {
        const term = label ?? SEARCH_TERMS[Math.floor(rng() * SEARCH_TERMS.length)];
        await call(page, t => window.__pfApp.applySearchFilter(t), term);
        return { label: term, kind: 'same' };
      },
    },
    {
      name: 'clearSearch', weight: 1,
      available: s => !s.product && !!s.search,
      async run(page) {
        await call(page, () => window.__pfApp.clearSearchFilter());
        return { kind: 'same' };
      },
    },
  ],

  invariants: [
    {
      name: 'Browser-Zurueck zeigt den vorigen Eintrag',
      check({ step }) {
        if (!step.expected) return null;
        const a = step.expected, b = step.state;
        const diff = ['crumbs', 'dimension', 'view', 'search'].filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
        return diff.length ? diff.map(k => `${k} erwartet ${JSON.stringify(a[k])}, ist ${JSON.stringify(b[k])}`).join(', ') : null;
      },
    },
    {
      name: 'Zurueck stellt die Ebene wieder her',
      check({ step, history }) {
        if (step.kind !== 'pop') return null;
        const before = stateBeforePush(history);
        if (!before) return null;
        const a = before, b = step.state;
        const diff = ['crumbs', 'dimension', 'view'].filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
        return diff.length ? `nach ${step.action}: ${diff.map(k => `${k} ${JSON.stringify(a[k])} -> ${JSON.stringify(b[k])}`).join(', ')}` : null;
      },
    },
    {
      name: 'Dimensionswechsel behaelt die Ansicht',
      check({ prev, step }) {
        if (step.action !== 'dimension') return null;
        if (!['grouped', 'pivot'].includes(prev.view) || !['grouped', 'pivot'].includes(step.state.view)) return null;
        return prev.view !== step.state.view ? `${prev.view} -> ${step.state.view} bei Dimension ${step.label}` : null;
      },
    },
    {
      name: 'Ansicht-Knopf wirkt',
      check({ step }) {
        if (step.action === 'viewPivot' && step.state.view !== 'pivot') return `Spalten gewaehlt, sichtbar: ${step.state.view}`;
        if (step.action === 'viewGrouped' && !['grouped', 'hero'].includes(step.state.view)) return `Gruppen gewaehlt, sichtbar: ${step.state.view}`;
        return null;
      },
    },
    {
      name: 'Kategorie-Ebene mit nur einer Gruppe',
      check({ step }) {
        const s = step.state;
        return s.dimension === '__taxonomy__' && s.groupCount === 1 && s.products > 1 ? `nur "${s.groups[0]}" auf ${s.crumbs.join(' > ')}` : null;
      },
    },
    {
      name: 'Doppelte Gruppen',
      check({ step }) {
        const seen = new Map();
        for (const label of step.state.bucketLabels) {
          const key = norm(label);
          if (seen.has(key)) return `"${seen.get(key)}" und "${label}" auf ${step.state.crumbs.join(' > ')} (${step.state.dimension})`;
          seen.set(key, label);
        }
        return null;
      },
    },
    {
      name: 'Produkte ragen seitlich aus der Seite',
      check({ step }) {
        const s = step.state;
        // Hero: Nachbarn liegen als Karussell absichtlich halb ausserhalb
        if (s.view === 'hero' || s.product) return null;
        return s.outsideX > 0 ? `${s.outsideX} Produkte ausserhalb der Breite, ${s.view}, ${s.crumbs.join(' > ')}` : null;
      },
    },
    {
      name: 'Outfit nur bei Smart Search',
      check({ step }) {
        return step.state.view === 'outfit' && !step.state.smartSearch ? `Outfit-Layout ohne Smart Search (${step.state.search ?? ''})` : null;
      },
    },
    {
      name: 'Runde Knoepfe sind rund',
      check({ step }) {
        return step.state.distortedRound?.length ? step.state.distortedRound.join(', ') : null;
      },
    },
    {
      name: 'Leere Ebene',
      check({ step }) {
        return step.state.products === 0 ? `0 Produkte auf ${step.state.crumbs.join(' > ')}` : null;
      },
    },
  ],
};
