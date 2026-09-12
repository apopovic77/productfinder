/**
 * B2BLoginDialog — Händler-Anmeldung als eigener Dialog (owner 2026-09-11:
 * „Login raus aus dem Warenkorb, rein in den Header"). Kundennummer + Shop-
 * Passwort gehen an den BFF (`/v1/b2b/login`); das Passwort bleibt nie im
 * State. Angemeldet zeigt der Dialog Kunde + Testmodus und bietet Abmelden.
 */
import { useEffect, useState } from 'react';
import './B2BLoginDialog.css';

export interface B2BLoginDialogProps {
  open: boolean;
  customerNumber: string | null;
  loginPending: boolean;
  loginError: string | null;
  testMode: boolean;
  onLogin: (customerNumber: string, password: string) => void;
  onLogout: () => void;
  onClose: () => void;
  onOpenCart?: () => void;
}

export function B2BLoginDialog({
  open, customerNumber, loginPending, loginError, testMode, onLogin, onLogout, onClose, onOpenCart,
}: B2BLoginDialogProps) {
  const [number, setNumber] = useState('');
  const [password, setPassword] = useState('');

  // Passwort nach erfolgreichem Login sofort vergessen.
  useEffect(() => { if (customerNumber) setPassword(''); }, [customerNumber]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="pf-b2b-dialog-backdrop" onClick={onClose} role="presentation">
      <div className="pf-b2b-dialog" role="dialog" aria-modal="true" aria-label="Händler-Login" onClick={e => e.stopPropagation()}>
        <div className="pf-b2b-dialog-head">
          <div>
            <div className="pf-b2b-dialog-kicker">B2B-Shop</div>
            <h2 className="pf-b2b-dialog-title">{customerNumber ? 'Händlerkonto' : 'Händler-Login'}</h2>
          </div>
          <button type="button" className="pf-b2b-dialog-close" onClick={onClose} aria-label="Schließen">✕</button>
        </div>

        {customerNumber ? (
          <div className="pf-b2b-dialog-body">
            <div className="pf-b2b-dialog-row"><span>Kundennummer</span><strong>{customerNumber}</strong></div>
            <div className="pf-b2b-dialog-row"><span>Preise</span><strong>Händlerpreise aktiv</strong></div>
            {testMode && (
              <div className="pf-b2b-dialog-note">
                Testmodus: Bestellungen gehen als Testbestellung an den B2B-Shop und werden dort nicht ausgeführt.
              </div>
            )}
            <div className="pf-b2b-dialog-actions">
              {onOpenCart && (
                <button type="button" className="pf-b2b-dialog-primary" onClick={() => { onClose(); onOpenCart(); }}>
                  Zur Bestellübersicht
                </button>
              )}
              <button type="button" className="pf-b2b-dialog-secondary" onClick={onLogout}>Abmelden</button>
            </div>
          </div>
        ) : (
          <form
            className="pf-b2b-dialog-body"
            onSubmit={e => { e.preventDefault(); if (number.trim() && password) onLogin(number, password); }}
          >
            <p className="pf-b2b-dialog-intro">
              Mit deinen Zugangsdaten vom O'Neal-B2B-Shop anmelden. Danach siehst du deine Händlerpreise und
              kannst den Warenkorb direkt in den Shop übergeben.
            </p>
            <label className="pf-b2b-dialog-label">
              Kundennummer
              <input
                className="pf-b2b-dialog-input"
                inputMode="numeric"
                autoComplete="username"
                autoFocus
                value={number}
                onChange={e => setNumber(e.target.value)}
                disabled={loginPending}
              />
            </label>
            <label className="pf-b2b-dialog-label">
              Passwort (wie im B2B-Shop)
              <input
                className="pf-b2b-dialog-input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={loginPending}
              />
            </label>
            {loginError && <div className="pf-b2b-dialog-error" role="alert">{loginError}</div>}
            <div className="pf-b2b-dialog-actions">
              <button type="submit" className="pf-b2b-dialog-primary" disabled={loginPending || !number.trim() || !password}>
                {loginPending ? 'Anmelden …' : 'Anmelden'}
              </button>
              <a className="pf-b2b-dialog-link" href="https://www.oneal-b2b.com/shop/?content=reset" target="_blank" rel="noopener noreferrer">
                Passwort vergessen?
              </a>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
