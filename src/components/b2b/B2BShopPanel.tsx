/**
 * B2BShopPanel — Funktionen des B2B-Shops im Finder (Alex 26.11.2026):
 * offene Aufträge mit Lieferstatus und Paketen (6), Rechnungen und offene
 * Posten (6), Konto mit Kundenklasse und Umsatz (7), Bundles mit Bundle-Preis
 * (2) und das Vororder-Sortiment nach Shop-Gruppen (5).
 *
 * Quelle: oneal-api-v2 /v1/b2b/shop/* (LIUS-Kopie, nur lesend, nur mit
 * Händler-Session). Ändern bleibt im B2B-Shop.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  shopAccount, shopBundles, shopInvoices, shopOrders, shopPreorder,
  type B2BSession, type ShopAccount, type ShopBundle, type ShopInvoice, type ShopOrder, type ShopParcel, type ShopPreorderGroup,
} from '../../services/B2BService';
import { b2bShopTexts, shopDate, shopMoney } from '../../i18n/b2bShop';
import './B2BOrdersPanel.css';
import './B2BShopPanel.css';

export type B2BShopView = 'orders' | 'invoices' | 'account' | 'bundles' | 'preorder';

interface Props {
  session: B2BSession;
  locale: string;
  view: B2BShopView;
  hideDealerPrices: boolean;
  preorderMode: boolean;
  onChangeView: (view: B2BShopView) => void;
  onShowProducts: (productIds: string[], label: string) => void;
  onOpenProduct: (productId: string) => void;
  onAddBundle: (bundle: ShopBundle) => Promise<boolean> | boolean;
  onStartPreorder: () => void;
  onClose: () => void;
}

type Load<T> = { data: T | null; loading: boolean; error: boolean };
const idle = { data: null, loading: false, error: false };

function useLoader<T>(fetcher: () => Promise<T>, deps: unknown[]): [Load<T>, () => void] {
  const [state, setState] = useState<Load<T>>(idle);
  const run = useCallback(() => {
    setState(s => ({ ...s, loading: true, error: false }));
    fetcher().then(data => setState({ data, loading: false, error: false }))
      .catch(() => setState(s => ({ ...s, loading: false, error: true })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return [state, run];
}

function Parcels({ parcels, label }: { parcels: ShopParcel[]; label: string }) {
  if (!parcels.length) return null;
  return (
    <div className="b2bs-parcels">
      <span>{label}:</span>
      {parcels.map(p => <code key={p.parcelNumber}>{p.parcelNumber}</code>)}
    </div>
  );
}

export function B2BShopPanel(props: Props) {
  const { session, locale, view, onChangeView, onClose } = props;
  const t = b2bShopTexts(locale);
  const tabs: Array<[B2BShopView, string]> = [
    ['orders', t.tabOrders], ['invoices', t.tabInvoices], ['account', t.tabAccount],
    ['bundles', t.tabBundles], ['preorder', t.tabPreorder],
  ];
  return (
    <div className="b2b-orders b2bs">
      <div className="cart-header">
        <div className="cart-header-title">
          <h2>{t.title}</h2>
          <span className="cart-header-count">{session.customerNumber}{session.customerClass ? ` · ${session.customerClass}` : ''}</span>
        </div>
        <button className="cart-close" onClick={onClose} aria-label="✕">✕</button>
      </div>
      <div className="b2bs-tabs" role="tablist">
        {tabs.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={view === key}
            className={`b2bs-tab ${view === key ? 'is-active' : ''}`} onClick={() => onChangeView(key)}>{label}</button>
        ))}
      </div>
      <div className="b2b-orders-body">
        {view === 'orders' && <OrdersView {...props} />}
        {view === 'invoices' && <InvoicesView {...props} />}
        {view === 'account' && <AccountView {...props} />}
        {view === 'bundles' && <BundlesView {...props} />}
        {view === 'preorder' && <PreorderView {...props} />}
      </div>
    </div>
  );
}

function Toolbar({ locale, loading, asOf, onRefresh, children }: { locale: string; loading: boolean; asOf: string | null | undefined; onRefresh: () => void; children?: React.ReactNode }) {
  const t = b2bShopTexts(locale);
  return (
    <div className="b2b-orders-toolbar b2bs-toolbar">
      {children}
      <span className="b2bs-asof">{asOf ? t.asOf(new Date(asOf).toLocaleString()) : ''}</span>
      <button type="button" className="cart-b2b-link" onClick={onRefresh} disabled={loading}>{loading ? t.loading : t.refresh}</button>
    </div>
  );
}

function OrdersView({ session, locale, hideDealerPrices, onOpenProduct }: Props) {
  const t = b2bShopTexts(locale);
  const [status, setStatus] = useState<'open' | 'all'>('open');
  const [limit, setLimit] = useState(25);
  const [state, reload] = useLoader(() => shopOrders(session, status, limit), [session.token, status, limit]);
  const [openNo, setOpenNo] = useState<number | null>(null);
  const orders: ShopOrder[] = state.data?.orders ?? [];
  return (
    <>
      <Toolbar locale={locale} loading={state.loading} asOf={state.data?.dataAsOf} onRefresh={reload}>
        <div className="b2bs-seg">
          <button type="button" className={status === 'open' ? 'is-active' : ''} onClick={() => { setStatus('open'); setLimit(25); }}>{t.showOpen}</button>
          <button type="button" className={status === 'all' ? 'is-active' : ''} onClick={() => { setStatus('all'); setLimit(25); }}>{t.showAll}</button>
        </div>
      </Toolbar>
      {state.error && <div className="cart-order-status cart-order-error">{t.error}</div>}
      {!state.error && state.data && orders.length === 0 && <div className="b2b-orders-empty">{t.none}</div>}
      {orders.map(o => {
        const open = openNo === o.orderNumber;
        return (
          <section key={o.orderNumber} className={`b2b-order ${open ? 'open' : ''} is-${o.status}`}>
            <button type="button" className="b2b-order-head" onClick={() => setOpenNo(open ? null : o.orderNumber)} aria-expanded={open}>
              <div className="b2b-order-when"><strong>{shopDate(o.orderDate, locale)}</strong><span>{t.order}</span></div>
              <div className="b2b-order-ids">
                <strong>{o.orderNumber}</strong>
                <span>{o.customerReference ? t.yourRef(o.customerReference) : ''}{o.invoiceNumbers.length ? ` · ${t.invoice} ${o.invoiceNumbers.join(', ')}` : ''}</span>
              </div>
              <div className="b2b-order-meta">
                <span className={`b2b-order-status b2bs-st-${o.status}`}>{t.orderStatus[o.status] ?? o.status}</span>
                {o.isPreorder && <span className="b2b-order-flag">{t.preorder}</span>}
                {o.isOnline && <span className="b2b-order-flag">{t.online}</span>}
              </div>
              <div className="b2b-order-sum">
                <strong>{hideDealerPrices ? '' : shopMoney(o.netTotal, locale)}</strong>
                <span>{o.openQuantity > 0 ? t.openQty(o.openQuantity) : `${o.lines.length} Pos.`}</span>
              </div>
            </button>
            {open && (
              <div className="b2b-order-detail">
                <div className="b2b-order-facts">
                  {o.requestedDelivery && <span>{t.requested}: <strong>{shopDate(o.requestedDelivery, locale)}</strong></span>}
                  {o.confirmedDelivery && <span>{t.confirmed}: <strong>{shopDate(o.confirmedDelivery, locale)}</strong></span>}
                </div>
                <table className="cart-confirmation-table">
                  <thead><tr>
                    <th>{t.colArticle}</th><th>{t.colName}</th><th className="num">{t.colQty}</th>
                    <th className="num">{t.colDelivered}</th><th className="num">{t.colOpen}</th><th>{t.colDate}</th>
                    {!hideDealerPrices && <th className="num">{t.colPrice}</th>}
                  </tr></thead>
                  <tbody>
                    {o.lines.map((l, i) => (
                      <tr key={`${l.position}-${i}`} className={l.openQuantity > 0 ? 'b2bs-line-open' : ''}>
                        <td>{l.productId ? <button type="button" className="b2bs-link" onClick={() => onOpenProduct(l.productId!)}>{l.sku}</button> : l.sku}</td>
                        <td>{l.name}</td>
                        <td className="num">{l.quantity}</td>
                        <td className="num">{l.delivered}</td>
                        <td className="num">{l.openQuantity || ''}</td>
                        <td>{l.openQuantity > 0 ? (l.backorderNote || shopDate(l.confirmedDelivery || l.requestedDelivery, locale)) : ''}</td>
                        {!hideDealerPrices && <td className="num">{shopMoney(l.unitPrice, locale)}{l.discountPercent ? ` −${l.discountPercent}%` : ''}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Parcels parcels={o.parcels} label={t.parcels} />
              </div>
            )}
          </section>
        );
      })}
      {state.data && state.data.total > orders.length && (
        <button type="button" className="cart-b2b-link b2bs-more" onClick={() => setLimit(l => Math.min(100, l + 25))} disabled={state.loading || limit >= 100}>{t.more}</button>
      )}
    </>
  );
}

function InvoicesView({ session, locale }: Props) {
  const t = b2bShopTexts(locale);
  const [status, setStatus] = useState<'open' | 'all'>('all');
  const [limit, setLimit] = useState(25);
  const [state, reload] = useLoader(() => shopInvoices(session, status, limit), [session.token, status, limit]);
  const invoices: ShopInvoice[] = state.data?.invoices ?? [];
  return (
    <>
      <Toolbar locale={locale} loading={state.loading} asOf={state.data?.dataAsOf} onRefresh={reload}>
        <div className="b2bs-seg">
          <button type="button" className={status === 'open' ? 'is-active' : ''} onClick={() => { setStatus('open'); setLimit(25); }}>{t.showOpen}</button>
          <button type="button" className={status === 'all' ? 'is-active' : ''} onClick={() => { setStatus('all'); setLimit(25); }}>{t.showAll}</button>
        </div>
      </Toolbar>
      {state.data && (
        <div className="b2bs-kpis">
          <div><span>{t.openSum}</span><strong>{shopMoney(state.data.openGross, locale)}</strong><em>{state.data.openCount}</em></div>
          <div className={state.data.overdueGross > 0 ? 'is-warn' : ''}><span>{t.overdueSum}</span><strong>{shopMoney(state.data.overdueGross, locale)}</strong></div>
        </div>
      )}
      {state.error && <div className="cart-order-status cart-order-error">{t.error}</div>}
      {!state.error && state.data && invoices.length === 0 && <div className="b2b-orders-empty">{t.none}</div>}
      {invoices.length > 0 && (
        <table className="cart-confirmation-table b2bs-invoices">
          <thead><tr><th>{t.invoice}</th><th>{t.colDate}</th><th className="num">brutto</th><th>Status</th></tr></thead>
          <tbody>
            {invoices.map((i, idx) => (
              <tr key={`${i.invoiceNumber}-${idx}`} className={`b2bs-inv-${i.status}`}>
                <td><strong>{i.invoiceNumber ?? '–'}</strong>{i.parcels.length > 0 && <div className="b2bs-sub">{i.parcels.map(p => p.parcelNumber).join(', ')}</div>}</td>
                <td>{shopDate(i.invoiceDate, locale)}<div className="b2bs-sub">{i.status === 'paid' ? (i.paidAt ? t.paidOn(shopDate(i.paidAt, locale)) : '') : t.due(shopDate(i.dueDate, locale))}</div></td>
                <td className="num">{shopMoney(i.grossTotal, locale)}</td>
                <td><span className={`b2bs-pill b2bs-inv-pill-${i.status}`}>{t.invoiceStatus[i.status]}</span>{i.dunningLevel ? <div className="b2bs-sub">{t.dunning(i.dunningLevel)}</div> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {state.data && state.data.total > invoices.length && (
        <button type="button" className="cart-b2b-link b2bs-more" onClick={() => setLimit(l => Math.min(100, l + 25))} disabled={state.loading || limit >= 100}>{t.more}</button>
      )}
    </>
  );
}

function AccountView({ session, locale, onChangeView }: Props) {
  const t = b2bShopTexts(locale);
  const [state, reload] = useLoader<ShopAccount>(() => shopAccount(session), [session.token]);
  const a = state.data;
  const maxMonth = Math.max(1, ...(a?.revenue.flatMap(y => y.months.map(m => m.netRevenue)) ?? [1]));
  return (
    <>
      <Toolbar locale={locale} loading={state.loading} asOf={a?.dataAsOf} onRefresh={reload}>
        <a className="cart-b2b-link" href="https://www.oneal-b2b.com/shop/" target="_blank" rel="noopener noreferrer">{t.changeInShop}</a>
      </Toolbar>
      {state.error && <div className="cart-order-status cart-order-error">{t.error}</div>}
      {a && (
        <>
          <div className="b2bs-kpis">
            <div><span>{t.customerClass}</span><strong>{a.customerClass || '–'}</strong></div>
            <button type="button" onClick={() => onChangeView('orders')}><span>{t.menuOrders}</span><strong>{a.openOrders}</strong></button>
            <button type="button" onClick={() => onChangeView('invoices')} className={a.overdueGross > 0 ? 'is-warn' : ''}>
              <span>{t.openSum}</span><strong>{shopMoney(a.openGross, locale)}</strong>{a.overdueGross > 0 && <em>{t.overdueSum} {shopMoney(a.overdueGross, locale)}</em>}
            </button>
          </div>
          <h3 className="b2bs-h">{t.revenue}</h3>
          {a.revenue.length === 0 && <div className="b2b-orders-empty">{t.none}</div>}
          {a.revenue.map(y => (
            <div key={y.fiscalYear} className="b2bs-year">
              <div className="b2bs-year-head"><span>{t.fiscalYear(y.fiscalYear)}</span><strong>{shopMoney(y.netRevenue, locale)}</strong></div>
              <div className="b2bs-bars" role="img" aria-label={`${t.revenue} ${y.fiscalYear}`}>
                {y.months.map(m => (
                  <div key={m.month} className="b2bs-bar" title={`${shopDate(m.month, locale)}: ${shopMoney(m.netRevenue, locale)} · ${t.invoicesCount(m.invoiceCount)}`}>
                    <div className="b2bs-bar-fill" style={{ height: `${Math.max(2, (m.netRevenue / maxMonth) * 100)}%` }} />
                    <span>{new Date(`${m.month}T00:00:00`).toLocaleDateString(undefined, { month: 'narrow' })}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {a.deliveryAddresses.length > 0 && <h3 className="b2bs-h">{t.addresses}</h3>}
          <div className="b2bs-cards">
            {a.deliveryAddresses.map((d, i) => (
              <div key={i} className="b2bs-card">{d.lines.map((l, j) => <div key={j}>{l}</div>)}<div>{d.street}</div><div>{[d.postalCode, d.city].filter(Boolean).join(' ')}</div></div>
            ))}
          </div>
          {a.contacts.length > 0 && <h3 className="b2bs-h">{t.contacts}</h3>}
          <div className="b2bs-cards">
            {a.contacts.map((c, i) => (
              <div key={i} className="b2bs-card">
                <strong>{[c.salutation, c.firstName, c.lastName].filter(Boolean).join(' ')}</strong>
                {c.role && <div>{c.role}</div>}
                {c.phone && <div>{c.phone}</div>}
                {c.email && <div><a href={`mailto:${c.email}`}>{c.email}</a></div>}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function BundlesView({ session, locale, hideDealerPrices, onAddBundle, onShowProducts, onOpenProduct }: Props) {
  const t = b2bShopTexts(locale);
  const [state, reload] = useLoader(() => shopBundles(session), [session.token]);
  const [added, setAdded] = useState<Record<number, boolean>>({});
  const [query, setQuery] = useState('');
  const bundles = (state.data?.bundles ?? []).filter(b => !query || `${b.name} ${b.description ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  const ids = Array.from(new Set(bundles.flatMap(b => b.items.map(i => i.productId).filter((x): x is string => !!x))));
  return (
    <>
      <Toolbar locale={locale} loading={state.loading} asOf={state.data?.dataAsOf} onRefresh={reload}>
        <input className="b2bs-search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="…" aria-label="Suche" />
        {ids.length > 0 && <button type="button" className="cart-b2b-link" onClick={() => onShowProducts(ids, t.menuBundles)}>{t.show} ({ids.length})</button>}
      </Toolbar>
      <div className="cart-checkout-muted b2bs-hint">{t.bundleHint}</div>
      {state.error && <div className="cart-order-status cart-order-error">{t.error}</div>}
      {!state.error && state.data && bundles.length === 0 && <div className="b2b-orders-empty">{t.none}</div>}
      {bundles.map(b => (
        <section key={b.bundleNumber} className="b2bs-bundle">
          <div className="b2bs-bundle-head">
            <div>
              <strong>{b.name.replace(/^BUNDLE:\s*/i, '')}</strong>
              <div className="b2bs-sub">{b.description}</div>
            </div>
            <div className="b2bs-bundle-price">
              {!hideDealerPrices && <div><span>{t.dealer}</span><strong>{shopMoney(b.dealerTotal, locale)}</strong></div>}
              <div><span>{t.rrp}</span><strong>{shopMoney(b.rrpTotal, locale)}</strong></div>
            </div>
          </div>
          <ul className="b2bs-bundle-items">
            {b.items.map(i => (
              <li key={i.sku}>
                {i.productId ? <button type="button" className="b2bs-link" onClick={() => onOpenProduct(i.productId!)}>{i.sku}</button> : <span>{i.sku}</span>}
                <span>{i.quantity}× {i.name ?? t.notInFinder}{i.color ? ` · ${i.color}` : ''}{i.size ? ` · ${i.size}` : ''}</span>
                <span className={`b2bs-stock ${(i.stockAvailable ?? 0) > 0 ? 'is-ok' : 'is-no'}`}>{i.stockAvailable === null ? '' : t.stock(i.stockAvailable)}</span>
              </li>
            ))}
          </ul>
          <button type="button" className="cart-b2b-link b2bs-add" disabled={!!added[b.bundleNumber]}
            onClick={() => { void Promise.resolve(onAddBundle(b)).then(ok => { if (ok) setAdded(a => ({ ...a, [b.bundleNumber]: true })); }); }}>
            {added[b.bundleNumber] ? t.bundleAdded : t.addBundle}
          </button>
        </section>
      ))}
    </>
  );
}

function PreorderView({ session, locale, preorderMode, onShowProducts, onStartPreorder }: Props) {
  const t = b2bShopTexts(locale);
  const [state, reload] = useLoader(() => shopPreorder(session), [session.token]);
  const groups: ShopPreorderGroup[] = state.data?.groups ?? [];
  const english = !locale.startsWith('de');
  const all = Array.from(new Set(groups.flatMap(g => g.productIds)));
  return (
    <>
      <Toolbar locale={locale} loading={state.loading} asOf={state.data?.dataAsOf} onRefresh={reload}>
        {all.length > 0 && <button type="button" className="cart-b2b-link" onClick={() => onShowProducts(all, t.menuPreorder)}>{t.show} ({all.length})</button>}
      </Toolbar>
      <div className="cart-checkout-muted b2bs-hint">{t.preorderIntro}</div>
      {preorderMode
        ? <div className="cart-order-status b2bs-ok">{t.preorderActive}</div>
        : <button type="button" className="cart-b2b-link b2bs-add" onClick={onStartPreorder}>{t.preorderStart}</button>}
      {state.error && <div className="cart-order-status cart-order-error">{t.error}</div>}
      <div className="b2bs-groups">
        {groups.map(g => (
          <button key={g.id} type="button" className="b2bs-group" onClick={() => onShowProducts(g.productIds, `${t.menuPreorder} · ${english && g.nameEn ? g.nameEn : g.name}`)}>
            <strong>{english && g.nameEn ? g.nameEn : g.name}</strong>
            <span>{t.products(g.productIds.length)}</span>
          </button>
        ))}
      </div>
    </>
  );
}
