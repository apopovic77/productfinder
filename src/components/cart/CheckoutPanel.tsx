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

interface CheckoutPanelProps {
  customerNumber: string;
  testMode: boolean;
  positions: number;
  pieces: number;
  dealerTotal: number | null;
  submitting: boolean;
  error: string | null;
  onSubmit: (options: CheckoutOptions) => void;
  onBack: () => void;
}

const money = (v: number | null) => (v === null ? '–' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(v));

export function CheckoutPanel({ customerNumber, testMode, positions, pieces, dealerTotal, submitting, error, onSubmit, onBack }: CheckoutPanelProps) {
  const [asap, setAsap] = useState(true);
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [freightFree, setFreightFree] = useState(false);
  const [preorder, setPreorder] = useState(false);
  const [agb, setAgb] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const canSubmit = agb && !submitting && positions > 0 && (asap || !!date) && (!preorder || !!date);

  return (
    <form
      className="cart-checkout"
      onSubmit={e => { e.preventDefault(); if (canSubmit) onSubmit({ deliveryDate: asap ? null : date, note: note.trim(), customerOrderNumber: orderNumber.trim(), freightFree, preorder }); }}
    >
      <div className="cart-checkout-grid">
        <section className="cart-checkout-block">
          <h3>Lieferung</h3>
          <label className="cart-checkout-radio">
            <input type="radio" name="termin" checked={asap} onChange={() => setAsap(true)} /> So früh wie möglich
          </label>
          <label className="cart-checkout-radio">
            <input type="radio" name="termin" checked={!asap} onChange={() => setAsap(false)} /> Zum Wunschtermin
            <input type="date" className="cart-checkout-input cart-checkout-date" min={today} value={date} onChange={e => { setDate(e.target.value); setAsap(false); }} disabled={submitting} />
          </label>
          <label className="cart-checkout-check">
            <input type="checkbox" checked={freightFree} onChange={e => setFreightFree(e.target.checked)} /> Frachtfrei liefern <span className="cart-checkout-muted">(einmal pro Woche möglich)</span>
          </label>
          <label className="cart-checkout-check">
            <input type="checkbox" checked={preorder} onChange={e => { setPreorder(e.target.checked); if (e.target.checked) setAsap(false); }} /> Als Vororder 2027 <span className="cart-checkout-muted">(Wunschtermin erforderlich)</span>
          </label>
          <div className="cart-checkout-muted">Lieferadresse: wie im B2B-Shop hinterlegt.</div>
        </section>

        <section className="cart-checkout-block">
          <h3>Angaben</h3>
          <label className="cart-checkout-label">Ihre Bestellnummer
            <input className="cart-checkout-input" value={orderNumber} onChange={e => setOrderNumber(e.target.value)} maxLength={60} disabled={submitting} placeholder="optional" />
          </label>
          <label className="cart-checkout-label">Anmerkungen zur Bestellung
            <textarea className="cart-checkout-input cart-checkout-textarea" value={note} onChange={e => setNote(e.target.value)} maxLength={1200} rows={4} disabled={submitting} placeholder="optional" />
          </label>
        </section>

        <section className="cart-checkout-block cart-checkout-summary">
          <h3>Zusammenfassung</h3>
          <div className="cart-checkout-row"><span>Kunde</span><strong>{customerNumber}</strong></div>
          <div className="cart-checkout-row"><span>Positionen</span><strong>{positions} · {pieces} Stk.</strong></div>
          <div className="cart-checkout-row"><span>Summe Händler-EK (netto)</span><strong>{money(dealerTotal)}</strong></div>
          <div className="cart-checkout-muted">Frachtkosten und MwSt. berechnet der B2B-Shop bei der Auftragsbestätigung.</div>
          {testMode && <div className="cart-checkout-test">TESTMODUS — die Bestellung wird als Testbestellung übergeben und nicht ausgeführt.</div>}
          <label className="cart-checkout-check cart-checkout-agb">
            <input type="checkbox" checked={agb} onChange={e => setAgb(e.target.checked)} />
            <span>Ich habe die <a href="https://www.oneal-b2b.com/shop/?content=agb" target="_blank" rel="noopener noreferrer">Händler-AGB</a> gelesen und akzeptiere sie.</span>
          </label>
          {error && <div className="cart-order-status cart-order-error">{error}</div>}
          <div className="cart-checkout-actions">
            <button type="button" className="cart-b2b-link" onClick={onBack} disabled={submitting}>← Zurück zum Warenkorb</button>
            <button type="submit" className="cart-upload-btn" disabled={!canSubmit}>
              {submitting ? 'Wird übergeben …' : (testMode ? 'Testbestellung an B2B-Shop übergeben' : 'Kostenpflichtig an B2B-Shop übergeben')}
            </button>
          </div>
        </section>
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
