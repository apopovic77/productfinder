/**
 * Klickprotokoll fuer Tests (owner 2026-10-22): mit ?trace=1 schreibt der
 * Finder jede Aktion (Klick, Taste, Browser-Zurueck) und den Zustand kurz
 * danach mit und schickt beides an oneal-api-v2 (/pf-trace). Der Tester
 * nennt danach nur noch die Sitzungs-ID statt Screenshots zu machen.
 *
 * Erfasst wird generisch an document/window, nicht je Handler: neue Knoepfe
 * sind ohne Zutun dabei. ?trace=0 schaltet es fuer den Tab wieder ab.
 */
import { ONEAL_API_BASE, ONEAL_API_KEY } from '../config/apiConfig';

type Snapshot = () => Record<string, unknown>;

const STORAGE_KEY = 'pf-trace-session';
const SETTLE_MS = 700;
const FLUSH_MS = 2000;

let session = '';
let seq = 0;
let buffer: Record<string, unknown>[] = [];
let snapshot: Snapshot = () => ({});
let flushTimer: number | undefined;

function readSession(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('trace') === '0') { sessionStorage.removeItem(STORAGE_KEY); return ''; }
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
    if (params.get('trace') !== '1') return '';
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    const id = `${stamp}-${Math.random().toString(36).slice(2, 6)}`;
    sessionStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    return '';
  }
}

function flush(keepalive = false): void {
  if (!session || !buffer.length) return;
  const events = buffer;
  buffer = [];
  void fetch(`${ONEAL_API_BASE}/pf-trace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': ONEAL_API_KEY },
    body: JSON.stringify({ session, events }),
    keepalive,
  }).catch(() => { /* Testhilfe: ein verlorenes Paket stoert den Finder nicht */ });
}

function push(type: string, detail: Record<string, unknown>): void {
  if (!session) return;
  const entry: Record<string, unknown> = { seq: ++seq, t: new Date().toISOString(), type, ...detail };
  window.setTimeout(() => {
    try { entry.state = snapshot(); } catch (error) { entry.state = { error: String(error) }; }
    buffer.push(entry);
    if (buffer.length >= 20) flush();
    else { window.clearTimeout(flushTimer); flushTimer = window.setTimeout(() => flush(), FLUSH_MS); }
  }, SETTLE_MS);
}

/** Was wurde angeklickt: Text, aria-label oder title des naechsten Bedienelements. */
function describe(target: EventTarget | null, event?: MouseEvent): Record<string, unknown> {
  const el = target instanceof Element ? target : null;
  if (!el) return {};
  if (el.tagName === 'CANVAS' && event) return { target: 'canvas', x: Math.round(event.clientX), y: Math.round(event.clientY) };
  const control = el.closest('button, a, input, select, [role="button"], [role="option"], label') ?? el;
  const text = (control.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return {
    target: control.tagName.toLowerCase(),
    text: text || undefined,
    label: control.getAttribute('aria-label') || control.getAttribute('title') || undefined,
    cls: (control.getAttribute('class') || '').split(/\s+/).slice(0, 3).join(' ') || undefined,
  };
}

// Sofort beim Laden lesen: das Einstiegs-Gate ersetzt die URL, bevor die
// App startet, und ?trace=1 waere dann schon weg.
const primedSession = typeof window !== 'undefined' ? readSession() : '';

export function isPfTraceActive(): boolean {
  return !!session;
}

export function pfTraceSession(): string {
  return session;
}

/** Eigene Markierung des Testers ("hier stimmt etwas nicht"). */
export function pfTraceMark(note = ''): void {
  push('mark', { note });
}

export function initPfTrace(getSnapshot: Snapshot): void {
  if (typeof window === 'undefined' || session) return;
  session = primedSession || readSession();
  if (!session) return;
  snapshot = getSnapshot;
  push('start', { url: window.location.href, ua: navigator.userAgent });
  document.addEventListener('click', event => push('click', describe(event.target, event)), true);
  document.addEventListener('keydown', event => {
    if (!['Enter', 'Escape', 'ArrowLeft', 'ArrowRight', 'Backspace'].includes(event.key)) return;
    push('key', { key: event.key, shift: event.shiftKey || undefined, ...describe(event.target) });
  }, true);
  document.addEventListener('change', event => {
    const el = event.target as HTMLInputElement | HTMLSelectElement | null;
    push('change', { ...describe(el), value: el && 'value' in el ? String(el.value).slice(0, 60) : undefined });
  }, true);
  window.addEventListener('popstate', () => push('back', { url: window.location.href }));
  let resizeTimer: number | undefined;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => push('resize', {}), 400);
  });
  window.addEventListener('pagehide', () => flush(true));
}
