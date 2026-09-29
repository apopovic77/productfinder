/**
 * CheckoutPanel — eigener Übergabe-Schritt vor dem B2B-Shop (owner 2026-09-11,
 * Post #4969): Wunschliefertermin, Bemerkung, eigene Bestellnummer, frachtfrei,
 * Vororder und AGB — so wie die Kasse des Shops, damit der Händler nichts
 * vermisst. Fracht und MwSt. rechnet der Shop; wir raten sie nicht.
 */
import { useState } from 'react';

export interface CheckoutOptions {
  /** ISO-Datum (YYYY-MM-DD) oder null = „so früh wie möglich". */
  deliveryDate: string | null;
  note: string;
  customerOrderNumber: string;
  freightFree: boolean;
  preorder: boolean;
}

export interface OrderConfirmation {
  orderId: string | null;
  transactionId: string | null;
  customerNumber: string;
  isTest: boolean;
  submittedAt: string;
  options: CheckoutOptions;
  lines: Array<{ sku: string; quantity: number; unitPrice: number | null; name?: string; size?: string }>;
  dealerTotal: number | null;
}

/** Kompakte Zeile fuer die Zusammenfassung (Bild, Name, Groessen, EK). */
export interface CheckoutLine {
  id: string;
  name: string;
  color?: string;
  imageUrl?: string;
  sizes: Record<string, number>;
  unitPrice: number | null;
}

interface CheckoutPanelProps {
  customerNumber: string;
  testMode: boolean;
  positions: number;
  pieces: number;
  dealerTotal: number | null;
  lines?: CheckoutLine[];
  /** Positionen, die der Shop nicht kennt — die Übergabe bleibt gesperrt, bis sie entfernt sind. */
  notOrderable?: Array<{ itemId: string; name: string; size: string | null; sku: string | null }>;
  submitting: boolean;
  error: string | null;
  onSubmit: (options: CheckoutOptions) => void;
  onBack: () => void;
}

const money = (v: number | null) => (v === null ? '–' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(v));

const Icon = {
  truck: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17.5" cy="17.5" r="1.8"/></svg>,
  calendar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>,
  doc: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/></svg>,
  cart: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4h2l2.4 11h10.2L20 8H6.2"/><circle cx="9" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/></svg>,
  pin: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/></svg>,
  send: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 11.5 21 3l-6.5 18-3-7.5z"/></svg>,
};

/**
 * Checkout nach dem Entwurf vom 2026-09-29 (gpt-image-2, media 128488):
 * Schrittanzeige, Liefer-Kacheln statt Radio-Punkten, Zusammenfassung mit
 * Artikeln rechts und grossem Uebergabe-Knopf.
 */
export function CheckoutPanel({ customerNumber, testMode, positions, pieces, dealerTotal, lines = [], notOrderable = [], submitting, error, onSubmit, onBack }: CheckoutPanelProps) {
  const [asap, setAsap] = useState(true);
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [freightFree, setFreightFree] = useState(false);
  const [preorder, setPreorder] = useState(false);
  const [agb, setAgb] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const blocked = notOrderable.length > 0;
  const needsDate = !asap || preorder;
  const canSubmit = agb && !submitting && !blocked && positions > 0 && (asap || !!date) && (!preorder || !!date);
  const hint = blocked ? 'Nicht bestellbare Positionen entfernen'
    : positions === 0 ? 'Warenkorb ist leer'
    : needsDate && !date ? 'Bitte Wunschtermin wählen'
    : !agb ? 'Bitte Händler-AGB bestätigen' : null;

  return (
    <form
      className="cart-checkout co"
      onSubmit={e => { e.preventDefault(); if (canSubmit) onSubmit({ deliveryDate: asap ? null : date, note: note.trim(), customerOrderNumber: orderNumber.trim(), freightFree, preorder }); }}
    >
      <ol className="co-steps" aria-label="Bestellschritte">
        <li className="is-done"><button type="button" onClick={onBack} disabled={submitting}><span className="co-step-num">1</span><span className="co-step-label">Warenkorb</span> <span aria-hidden="true">✓</span></button></li>
        <li className="is-active" aria-current="step"><span className="co-step-num">2</span><span className="co-step-label">Lieferung &amp; Angaben</span></li>
        <li><span className="co-step-num">3</span><span className="co-step-label">Übergabe</span></li>
      </ol>

      <div className="co-grid">
        <div className="co-main">
          <section className="co-card">
            <header className="co-card-head">
              <span className="co-card-icon">{Icon.truck}</span>
              <div><h3>Lieferung</h3><p>Wählen Sie die gewünschte Lieferart für Ihre Bestellung.</p></div>
            </header>
            <div className="co-tiles">
              <label className={`co-tile ${asap && !preorder ? 'is-selected' : ''} ${preorder ? 'is-disabled' : ''}`}>
                <input type="radio" name="termin" checked={asap && !preorder} disabled={preorder} onChange={() => setAsap(true)} />
                <span className="co-tile-icon">{Icon.truck}</span>
                <span className="co-tile-text"><strong>So früh wie möglich</strong><small>Lieferung schnellstmöglich an die hinterlegte Adresse.</small></span>
              </label>
              <label className={`co-tile ${!asap || preorder ? 'is-selected' : ''}`}>
                <input type="radio" name="termin" checked={!asap || preorder} onChange={() => setAsap(false)} />
                <span className="co-tile-icon">{Icon.calendar}</span>
                <span className="co-tile-text">
                  <strong>Zum Wunschtermin</strong><small>Wählen Sie Ihren gewünschten Liefertermin.</small>
                  <input type="date" className="co-input co-date" min={today} value={date} onChange={e => { setDate(e.target.value); setAsap(false); }} onClick={() => setAsap(false)} disabled={submitting} aria-label="Wunschtermin" />
                </span>
              </label>
            </div>
            <label className="co-switch">
              <input type="checkbox" role="switch" checked={freightFree} onChange={e => setFreightFree(e.target.checked)} />
              <span className="co-switch-track" aria-hidden="true" />
              <span className="co-switch-text"><strong>Frachtfrei liefern</strong><small>Einmal pro Woche möglich.</small></span>
            </label>
            <label className="co-switch">
              <input type="checkbox" role="switch" checked={preorder} onChange={e => { setPreorder(e.target.checked); if (e.target.checked) setAsap(false); }} />
              <span className="co-switch-track" aria-hidden="true" />
              <span className="co-switch-text"><strong>Als Vororder 2027</strong><small>Wird als Vororder erfasst — Wunschtermin erforderlich.</small></span>
            </label>
            <div className="co-address"><span className="co-inline-icon">{Icon.pin}</span>Lieferadresse: wie im B2B-Shop hinterlegt</div>
          </section>

          <section className="co-card">
            <header className="co-card-head">
              <span className="co-card-icon">{Icon.doc}</span>
              <div><h3>Angaben</h3><p>Zusätzliche Informationen zu Ihrer Bestellung.</p></div>
            </header>
            <label className="co-field"><span>Ihre Bestellnummer <em>(optional)</em></span>
              <input className="co-input" value={orderNumber} onChange={e => setOrderNumber(e.target.value)} maxLength={60} disabled={submitting} placeholder="z. B. PO-4711" />
            </label>
            <label className="co-field"><span>Anmerkungen zur Bestellung <em>(optional)</em></span>
              <textarea className="co-input co-textarea" value={note} onChange={e => setNote(e.target.value)} maxLength={1200} rows={3} disabled={submitting} placeholder="z. B. Kommission, besondere Hinweise" />
              <span className="co-counter">{note.length} / 1200</span>
            </label>
          </section>
        </div>

        <aside className="co-card co-summary">
          <header className="co-card-head co-summary-head">
            <span className="co-card-icon">{Icon.cart}</span>
            <div><h3>Zusammenfassung</h3></div>
          </header>
          {lines.length > 0 && (
            <ul className="co-lines">
              {lines.map(line => {
                const qty = Object.values(line.sizes).reduce((a, b) => a + (b || 0), 0);
                return (
                  <li key={line.id} className="co-line">
                    <div className="co-line-img">{line.imageUrl ? <img src={line.imageUrl} alt="" loading="lazy" /> : null}</div>
                    <div className="co-line-body">
                      <strong className="co-line-name">{line.name}</strong>
                      {line.color && <span className="co-line-color">{line.color}</span>}
                      <div className="co-chips">
                        {Object.entries(line.sizes).filter(([, q]) => q > 0).map(([size, q]) => (
                          <span key={size} className="co-chip">{size} × {q}</span>
                        ))}
                      </div>
                      <div className="co-line-prices">
                        <span>EK {money(line.unitPrice)}</span>
                        <strong>{money(line.unitPrice === null ? null : line.unitPrice * qty)}</strong>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="co-rows">
            <div className="co-row"><span>Kunde</span><strong>{customerNumber}</strong></div>
            <div className="co-row"><span>Positionen</span><strong>{positions} · {pieces} Stk.</strong></div>
          </div>
          <div className="co-total"><span>Summe Händler-EK (netto)</span><strong>{money(dealerTotal)}</strong></div>
          <div className="co-muted">Frachtkosten und MwSt. berechnet der B2B-Shop bei der Auftragsbestätigung.</div>
          {testMode && (
            <div className="co-test"><span className="co-test-icon" aria-hidden="true">!</span><span><strong>TESTMODUS</strong> — die Bestellung wird als Testbestellung übergeben und nicht ausgeführt.</span></div>
          )}
          {blocked && (
            <div className="cart-order-status cart-order-error" role="alert">
              <strong>Nicht über den B2B-Shop bestellbar:</strong>
              <ul className="cart-checkout-blocklist">
                {notOrderable.map(n => (
                  <li key={`${n.itemId}-${n.size ?? ''}`}>{n.name}{n.size ? ` · ${n.size}` : ''}{n.sku ? ` (${n.sku})` : ''}</li>
                ))}
              </ul>
              Diese Positionen kennt der Shop derzeit nicht (z. B. Auslaufmodell oder noch nicht freigeschaltet). Bitte im Warenkorb entfernen, dann kann übergeben werden.
            </div>
          )}
          <label className="co-agb">
            <input type="checkbox" checked={agb} onChange={e => setAgb(e.target.checked)} />
            <span>Ich habe die <a href="https://www.oneal-b2b.com/shop/?content=agb" target="_blank" rel="noopener noreferrer">Händler-AGB</a> gelesen und akzeptiere sie.</span>
          </label>
          {error && <div className="cart-order-status cart-order-error">{error}</div>}
          <button type="submit" className="co-submit" disabled={!canSubmit}>
            <span className="co-submit-icon">{Icon.send}</span>
            {submitting ? 'Wird übergeben …' : (testMode ? 'Testbestellung an B2B-Shop übergeben' : 'Kostenpflichtig an B2B-Shop übergeben')}
          </button>
          {hint && !submitting && <div className="co-hint">{hint}</div>}
          <button type="button" className="co-back" onClick={onBack} disabled={submitting}>← Zurück zum Warenkorb</button>
        </aside>
      </div>
    </form>
  );
}

export function OrderConfirmationView({ confirmation, onNewOrder }: { confirmation: OrderConfirmation; onNewOrder: () => void }) {
  const when = new Date(confirmation.submittedAt);
  return (
    <div className="cart-confirmation">
      <div className="cart-confirmation-head">
        <div className="cart-confirmation-check">✓</div>
        <div>
          <h3>{confirmation.isTest ? 'Testbestellung an den B2B-Shop übergeben' : 'Bestellung an den B2B-Shop übergeben'}</h3>
          <div className="cart-checkout-muted">
            {when.toLocaleString('de-DE')} · Kunde {confirmation.customerNumber}
            {confirmation.options.customerOrderNumber ? ` · Ihre Bestellnummer ${confirmation.options.customerOrderNumber}` : ''}
          </div>
        </div>
      </div>
      <div className="cart-confirmation-ids">
        <div className="cart-checkout-row"><span>Shop-Auftrag</span><strong>{confirmation.orderId ?? '–'}</strong></div>
        <div className="cart-checkout-row"><span>Transaktion</span><strong>{confirmation.transactionId ?? '–'}</strong></div>
        <div className="cart-checkout-row"><span>Liefertermin</span><strong>{confirmation.options.deliveryDate ? new Date(confirmation.options.deliveryDate).toLocaleDateString('de-DE') : 'so früh wie möglich'}{confirmation.options.preorder ? ' · Vororder' : ''}{confirmation.options.freightFree ? ' · frachtfrei' : ''}</strong></div>
      </div>
      <table className="cart-confirmation-table">
        <thead><tr><th>Art.-Nr.</th><th>Artikel</th><th>Größe</th><th className="num">Stk.</th><th className="num">EK</th></tr></thead>
        <tbody>
          {confirmation.lines.map(l => (
            <tr key={l.sku}><td>{l.sku}</td><td>{l.name ?? ''}</td><td>{l.size ?? ''}</td><td className="num">{l.quantity}</td><td className="num">{money(l.unitPrice)}</td></tr>
          ))}
        </tbody>
        <tfoot><tr><td colSpan={4}>Summe Händler-EK (netto)</td><td className="num">{money(confirmation.dealerTotal)}</td></tr></tfoot>
      </table>
      <div className="cart-checkout-actions">
        <a className="cart-b2b-link" href="https://www.oneal-b2b.com/shop/?content=offen" target="_blank" rel="noopener noreferrer">Offene Aufträge im B2B-Shop ↗</a>
        <button type="button" className="cart-upload-btn" onClick={onNewOrder}>Neue Bestellung</button>
      </div>
    </div>
  );
}
