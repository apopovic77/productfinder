/**
 * B2BOrdersPanel — „Meine Bestellungen" (owner 2026-09-15): alle Aufträge, die
 * dieser Kunde über den Productfinder an den B2B-Shop übergeben hat. Quelle ist
 * das BFF-Audit (`GET /v1/b2b/orders`, Vertrag 1.2, Issue #1896) — Veloconnect
 * selbst kennt keine Historie, Lieferstatus und Shop-Aufträge bleiben im Shop.
 */
import { useEffect, useState } from 'react';
import type { B2BStoredOrder } from '../../services/B2BService';
import './B2BOrdersPanel.css';

interface B2BOrdersPanelProps {
  customerNumber: string;
  orders: B2BStoredOrder[] | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpenCart: () => void;
  onClose: () => void;
}

const money = (v: number | null | undefined, currency = 'EUR') =>
  v === null || v === undefined ? '–' : new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(v);

const STATUS_LABEL: Record<B2BStoredOrder['status'], string> = {
  finished: 'Übergeben',
  failed: 'Nicht übergeben',
  uncertain: 'In Prüfung',
};

export function B2BOrdersPanel({ customerNumber, orders, loading, error, onRefresh, onOpenCart, onClose }: B2BOrdersPanelProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => { if (orders === null && !loading && !error) onRefresh(); }, [orders, loading, error, onRefresh]);

  return (
    <div className="b2b-orders">
      <div className="cart-header">
        <div className="cart-header-title">
          <h2>Meine Bestellungen</h2>
          <span className="cart-header-count">Kunde {customerNumber}{orders && !error ? ` · ${orders.length} ${orders.length === 1 ? 'Auftrag' : 'Aufträge'}` : ''}</span>
        </div>
        <button className="cart-close" onClick={onClose} aria-label="Schließen">✕</button>
      </div>

      <div className="b2b-orders-toolbar">
        <button type="button" className="cart-b2b-link" onClick={onOpenCart}>← Zur Bestellübersicht</button>
        <button type="button" className="cart-b2b-link" onClick={onRefresh} disabled={loading}>{loading ? 'Lädt …' : 'Aktualisieren'}</button>
        <a className="cart-b2b-link" href="https://www.oneal-b2b.com/shop/?content=offen" target="_blank" rel="noopener noreferrer">Offene Aufträge im B2B-Shop ↗</a>
      </div>

      <div className="b2b-orders-body">
        {error && <div className="cart-order-status cart-order-error">{error}</div>}
        {!error && orders && orders.length === 0 && (
          <div className="b2b-orders-empty">Noch keine Bestellung über den Productfinder übergeben.</div>
        )}
        {orders && orders.map(o => {
          const open = openId === o.orderNumber;
          const when = new Date(o.createdAt);
          return (
            <section key={o.orderNumber} className={`b2b-order ${open ? 'open' : ''} is-${o.status}`}>
              <button type="button" className="b2b-order-head" onClick={() => setOpenId(open ? null : o.orderNumber)} aria-expanded={open}>
                <div className="b2b-order-when">
                  <strong>{when.toLocaleDateString('de-DE')}</strong>
                  <span>{when.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="b2b-order-ids">
                  <strong>{o.orderId ?? o.orderNumber}</strong>
                  <span>{o.orderId ? `Finder ${o.orderNumber}` : 'kein Shop-Auftrag'}{o.customerOrderNumber ? ` · Ihre Nr. ${o.customerOrderNumber}` : ''}</span>
                </div>
                <div className="b2b-order-meta">
                  <span className={`b2b-order-status is-${o.status}`}>{STATUS_LABEL[o.status]}</span>
                  {o.isTest && <span className="b2b-order-test">TEST</span>}
                  {o.preorder && <span className="b2b-order-flag">Vororder</span>}
                  {o.freightFree && <span className="b2b-order-flag">frachtfrei</span>}
                </div>
                <div className="b2b-order-sum">
                  <strong>{money(o.totalNet)}</strong>
                  <span>{o.lines.reduce((a, l) => a + l.quantity, 0)} Stk. · {o.lines.length} Pos.</span>
                </div>
              </button>
              {open && (
                <div className="b2b-order-detail">
                  <div className="b2b-order-facts">
                    <span>Liefertermin: <strong>{o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString('de-DE') : 'so früh wie möglich'}</strong></span>
                    {o.transactionId && <span>Transaktion: <strong>{o.transactionId}</strong></span>}
                    {o.note && <span>Anmerkung: <strong>{o.note}</strong></span>}
                  </div>
                  <table className="cart-confirmation-table">
                    <thead><tr><th>Art.-Nr.</th><th>Artikel</th><th>Größe</th><th className="num">Stk.</th><th className="num">EK</th></tr></thead>
                    <tbody>
                      {o.lines.map(l => (
                        <tr key={l.sku}>
                          <td>{l.sku}</td>
                          <td>{l.productName ?? ''}{l.color ? ` ${l.color}` : ''}</td>
                          <td>{l.size ?? ''}</td>
                          <td className="num">{l.quantity}</td>
                          <td className="num">{money(l.unitPrice, l.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr><td colSpan={4}>Summe Händler-EK (netto)</td><td className="num">{money(o.totalNet)}</td></tr></tfoot>
                  </table>
                  {o.status === 'uncertain' && (
                    <div className="cart-checkout-muted">Die Übergabe wird vom Innendienst geprüft — bitte nicht erneut senden.</div>
                  )}
                  {o.status === 'failed' && (
                    <div className="cart-checkout-muted">Der Shop hat diese Übergabe abgelehnt; es ist kein Auftrag entstanden.</div>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
