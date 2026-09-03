/**
 * B2BService — Händler-Login, Händlerpreise und Bestellübergabe über den
 * oneal-api-v2-BFF (`/v1/b2b/*`), der seinerseits mit Veloconnect 1.1 des
 * O'Neal-B2B-Shops spricht (Post #4851, Section „Veloconnect-Integration").
 *
 * Der Browser sieht nie das Veloconnect-Passwort nach dem Login: der BFF
 * bindet die Credentials an ein kurzlebiges Session-Token, das hier im
 * localStorage liegt. Ohne aktiven BFF (503/404) melden alle Aufrufe einen
 * verständlichen Fehler — die klassische Bestellung bleibt davon unberührt.
 */
import { ONEAL_API_BASE, ONEAL_API_KEY } from '../config/apiConfig';

export interface B2BSession {
  token: string;
  customerNumber: string;
  expiresAt: string; // ISO
}

export interface B2BPrice {
  dealerPrice: number | null;
  rrp: number | null;
  currency: string;
  availabilityCode: string | null;
  availableQuantity: number | null;
  unknown: boolean;
}

export interface B2BOrderLineIn {
  sku: string;
  quantity: number;
}

export interface B2BOrderResult {
  orderId: string | null;
  transactionId: string | null;
  status: 'finished' | 'failed';
  lines: Array<{
    sku: string;
    quantity: number;
    unitPrice: number | null;
    availabilityCode: string | null;
    unknown: boolean;
    replacementSku?: string | null;
  }>;
}

export class B2BError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string,
              public readonly detail?: unknown) {
    super(message);
    this.name = 'B2BError';
  }
}

const SESSION_KEY = 'pf.b2b.session.v1';

export function loadB2BSession(): B2BSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as B2BSession;
    if (!s?.token || !s.customerNumber) return null;
    if (s.expiresAt && Date.parse(s.expiresAt) < Date.now()) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

function storeB2BSession(session: B2BSession | null): void {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch { /* privater Modus o. ä. — Session lebt dann nur im Speicher */ }
}

async function request<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-API-Key': ONEAL_API_KEY,
  };
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  let res: Response;
  try {
    res = await fetch(`${ONEAL_API_BASE}/b2b${path}`, { ...init, headers });
  } catch (e) {
    throw new B2BError(0, 'network', 'Verbindung zum Bestellservice fehlgeschlagen.', e);
  }
  if (res.status === 204) return undefined as T;
  let body: any = null;
  const text = await res.text().catch(() => '');
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  if (!res.ok) {
    const code = body?.error ?? body?.detail?.error ?? (res.status === 404 || res.status === 503
      ? 'b2b_unavailable' : 'http_error');
    const message = describeError(res.status, code, body);
    throw new B2BError(res.status, code, message, body);
  }
  return body as T;
}

function describeError(status: number, code: string, body: any): string {
  switch (code) {
    case 'veloconnect_auth_failed':
      return 'Kundennummer oder Passwort stimmen nicht.';
    case 'b2b_unavailable':
    case 'veloconnect_unavailable':
      return 'Die B2B-Anbindung ist derzeit nicht verfügbar.';
    case 'unknown_items':
      return 'Einige Artikel sind im B2B-Shop unbekannt — Bestellung wurde nicht übergeben.';
    case 'veloconnect_error': {
      const detail = body?.message ?? body?.detail?.message;
      return detail ? `B2B-Shop meldet: ${detail}` : 'Der B2B-Shop hat die Anfrage abgelehnt.';
    }
    default:
      if (status === 401) return 'Sitzung abgelaufen — bitte erneut anmelden.';
      return `Fehler ${status} vom Bestellservice.`;
  }
}

export async function b2bLogin(customerNumber: string, password: string): Promise<B2BSession> {
  const r = await request<{ session_token: string; expires_at: string; customer_number: string }>(
    '/login',
    { method: 'POST', body: JSON.stringify({ customer_number: customerNumber.trim(), password }) },
  );
  const session: B2BSession = {
    token: r.session_token,
    customerNumber: r.customer_number || customerNumber.trim(),
    expiresAt: r.expires_at,
  };
  storeB2BSession(session);
  return session;
}

export async function b2bLogout(session: B2BSession | null): Promise<void> {
  storeB2BSession(null);
  if (!session) return;
  try {
    await request<void>('/logout', { method: 'POST', token: session.token });
  } catch { /* lokal ist die Sitzung ohnehin weg */ }
}

/** Prüft die gespeicherte Sitzung gegen den BFF; null wenn ungültig. */
export async function b2bValidateSession(session: B2BSession): Promise<B2BSession | null> {
  try {
    const r = await request<{ customer_number: string; expires_at: string }>('/session', { token: session.token });
    const fresh = { ...session, customerNumber: r.customer_number, expiresAt: r.expires_at };
    storeB2BSession(fresh);
    return fresh;
  } catch (e) {
    if (e instanceof B2BError && e.status === 401) storeB2BSession(null);
    return e instanceof B2BError && e.status === 401 ? null : session;
  }
}

export async function b2bFetchPrices(session: B2BSession, skus: string[]): Promise<Record<string, B2BPrice>> {
  const unique = Array.from(new Set(skus.filter(Boolean)));
  if (unique.length === 0) return {};
  const out: Record<string, B2BPrice> = {};
  // Vertrag: höchstens 200 SKUs je Aufruf.
  for (let i = 0; i < unique.length; i += 200) {
    const chunk = unique.slice(i, i + 200);
    const r = await request<{ prices: Record<string, any> }>(
      '/prices',
      { method: 'POST', token: session.token, body: JSON.stringify({ skus: chunk }) },
    );
    for (const [sku, p] of Object.entries(r.prices || {})) {
      out[sku] = {
        dealerPrice: toNumber(p?.dealer_price),
        rrp: toNumber(p?.rrp),
        currency: p?.currency || 'EUR',
        availabilityCode: p?.availability_code ?? null,
        availableQuantity: toNumber(p?.available_quantity),
        unknown: Boolean(p?.unknown),
      };
    }
  }
  return out;
}

export async function b2bCreateOrder(
  session: B2BSession,
  lines: B2BOrderLineIn[],
  opts: { note?: string; isTest?: boolean; externalRef?: string } = {},
): Promise<B2BOrderResult> {
  const r = await request<any>(
    '/orders',
    {
      method: 'POST',
      token: session.token,
      body: JSON.stringify({
        lines,
        note: opts.note || undefined,
        is_test: opts.isTest || undefined,
        external_ref: opts.externalRef || undefined,
      }),
    },
  );
  return {
    orderId: r?.order_id ?? null,
    transactionId: r?.transaction_id ?? null,
    status: r?.status === 'finished' ? 'finished' : 'failed',
    lines: Array.isArray(r?.lines)
      ? r.lines.map((l: any) => ({
          sku: String(l?.sku ?? ''),
          quantity: Number(l?.quantity ?? 0),
          unitPrice: toNumber(l?.unit_price),
          availabilityCode: l?.availability_code ?? null,
          unknown: Boolean(l?.unknown),
          replacementSku: l?.replacement_sku ?? null,
        }))
      : [],
  };
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
