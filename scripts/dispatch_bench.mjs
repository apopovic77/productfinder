#!/usr/bin/env node
/**
 * dispatch_bench.mjs — measure end-to-end agent dispatch latency per phase.
 *
 * Usage:
 *   node --experimental-eventsource scripts/dispatch_bench.mjs "rote MX Helme"
 *   node --experimental-eventsource scripts/dispatch_bench.mjs "blaue MTB Helme für Erwachsene" --agent OnealProductSearch
 *
 * Phases reported (relative to t0 = before POST):
 *   t_post    : HTTP roundtrip POST → {id, status:"pending"}
 *   t_first   : first SSE event (typically "processing")
 *   t_done    : SSE event "status: done"
 *   t_parse   : JSON.parse of the response payload
 *
 * This is the proof-of-concept for the frontend integration. The browser will
 * use the same fetch + EventSource flow.
 */

const DISPATCH_BASE = process.env.DISPATCH_BASE
  || 'https://cloud-api.oneal.arkturian.com/api/queue';

const args = process.argv.slice(2);
let agent = 'OnealProductSearch';
let userId = 'bench-cli';
let query = '';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--agent') agent = args[++i];
  else if (args[i] === '--user') userId = args[++i];
  else if (!query) query = args[i];
}
if (!query) {
  console.error('usage: node --experimental-eventsource dispatch_bench.mjs "<query>" [--agent NAME]');
  process.exit(2);
}

if (typeof EventSource === 'undefined') {
  console.error('EventSource missing. Re-run with: node --experimental-eventsource ...');
  process.exit(2);
}

const fmt = (ms) => `${(ms / 1000).toFixed(2)}s`;
const log = (label, ms, extra = '') => {
  const bar = '█'.repeat(Math.min(60, Math.round(ms / 250)));
  console.log(`  ${label.padEnd(10)} ${fmt(ms).padStart(8)}  ${bar} ${extra}`);
};

console.log(`\n→ agent  : ${agent}`);
console.log(`→ query  : "${query}"`);
console.log(`→ base   : ${DISPATCH_BASE}\n`);

const t0 = performance.now();

const postUrl = `${DISPATCH_BASE}/${encodeURIComponent(agent)}/message`;
const postRes = await fetch(postUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    text: query,
    user_id: userId,
    reply_context: { raw_output: true },
  }),
});
if (!postRes.ok) {
  console.error(`POST failed: ${postRes.status} ${await postRes.text()}`);
  process.exit(1);
}
const { id } = await postRes.json();
const tPost = performance.now() - t0;
log('POST', tPost, `→ id=${id}`);

const streamUrl = `${DISPATCH_BASE}/${encodeURIComponent(agent)}/message/${id}/stream`;
const es = new EventSource(streamUrl);

let firstEventAt = null;
let lastStatus = null;

const finalPayload = await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => {
    es.close();
    reject(new Error('timeout 120s'));
  }, 120_000);

  es.onmessage = (event) => {
    const now = performance.now() - t0;
    if (firstEventAt === null) {
      firstEventAt = now;
      log('SSE-OPEN', now, '← first event');
    }
    let payload;
    try { payload = JSON.parse(event.data); } catch { return; }
    if (payload.status && payload.status !== lastStatus) {
      log(payload.status, now, lastStatus ? `(prev: ${lastStatus})` : '');
      lastStatus = payload.status;
    }
    if (payload.status === 'done') {
      clearTimeout(timeout);
      es.close();
      resolve(payload.response ?? '');
    } else if (payload.status === 'error') {
      clearTimeout(timeout);
      es.close();
      reject(new Error(payload.message || 'agent error'));
    }
  };

  es.onerror = (e) => {
    clearTimeout(timeout);
    es.close();
    reject(new Error('SSE connection error'));
  };
});

const tDone = performance.now() - t0;

function extractFirstJsonObject(text) {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (esc) { esc = false; continue; }
    if (inStr) { if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return text.substring(start, i + 1); }
  }
  return null;
}

function unwrapEnvelope(obj) {
  if (!obj || obj.type !== 'response' || typeof obj.content !== 'string') return obj;
  let content = obj.content.trim();
  const fence = content.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) content = fence[1].trim();
  else if (content.toLowerCase().startsWith('json\n')) content = content.slice(5).trim();
  try { return JSON.parse(content); } catch {}
  const block = extractFirstJsonObject(content);
  if (block) try { return JSON.parse(block); } catch {}
  return obj;
}

const tParseStart = performance.now();
let parsed = null;
let parseStrategy = 'direct';
try {
  parsed = JSON.parse(finalPayload);
} catch {
  const block = extractFirstJsonObject(finalPayload);
  if (block) {
    try { parsed = JSON.parse(block); parseStrategy = 'extracted'; } catch {}
  }
}
if (parsed && parsed.type === 'response') {
  parsed = unwrapEnvelope(parsed);
  parseStrategy = parseStrategy === 'extracted' ? 'extracted+unwrap' : 'unwrap';
}
const tParse = performance.now() - tParseStart;

console.log('');
console.log('─── Summary ──────────────────────────────────────────');
log('total', tDone);
console.log(`  parse     ${fmt(tParse).padStart(8)}  (${parseStrategy})`);
console.log('');
if (parsed && Array.isArray(parsed.ids)) {
  console.log(`✓ ids     : ${parsed.ids.length}`);
  console.log(`✓ explain : ${parsed.explanation || '(empty)'}`);
  if (parsed.ids.length) console.log(`  sample  : [${parsed.ids.slice(0, 8).join(', ')}${parsed.ids.length > 8 ? ', …' : ''}]`);
} else {
  console.log('✗ payload was not a valid {ids,explanation} object');
  console.log('  raw (first 300 chars):', finalPayload.slice(0, 300));
}

console.log('\n─── Phases ───────────────────────────────────────────');
console.log(`  enqueue       : ${fmt(tPost)}    (POST → id=${id})`);
console.log(`  worker→tmux   : ${fmt(firstEventAt - tPost)}    (POST done → first SSE event)`);
console.log(`  agent work    : ${fmt(tDone - firstEventAt)}    (first event → done)`);
console.log(`  total wall    : ${fmt(tDone)}`);
console.log('');
