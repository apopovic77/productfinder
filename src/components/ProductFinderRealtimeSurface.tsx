import {
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
  useRef,
} from 'react';
import type { ProductFinderController } from '../controller/ProductFinderController';
import {
  ProductFinderRealtimeBffClient,
  ProductFinderRealtimeController,
  createProductFinderSelectionProjection,
  type ProductFinderEntryContext,
} from '../lib/realtime';
import { soundService } from '../services/SoundService';
import './ProductFinderRealtimeSurface.css';

interface ProductFinderRealtimeSurfaceProps {
  /** Sitzung sofort beim Einblenden starten (Header-Button, owner 2026-08-27). */
  autoStart?: boolean;
  /** Vom Nutzer per X geschlossen — der Host blendet die Flaeche aus. */
  onClosed?: () => void;
  finderController: ProductFinderController;
  context: ProductFinderEntryContext;
}

const STATUS_LABELS = {
  idle: 'Bereit für den internen Test',
  connecting: 'Verbindung wird aufgebaut …',
  ready: 'Zum Sprechen gedrückt halten',
  speaking: 'Antwort läuft',
  listening: 'Ich höre zu …',
  error: 'Verbindung nicht verfügbar',
  closed: 'Sitzung beendet',
} as const;

function MicrophoneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M8.5 21h7" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m7 7 10 10M17 7 7 17" />
    </svg>
  );
}

export function ProductFinderRealtimeSurface({
  finderController,
  context,
  autoStart = false,
  onClosed,
}: ProductFinderRealtimeSurfaceProps) {
  const runtime = useMemo(() => {
    const server = new ProductFinderRealtimeBffClient();
    const controller = new ProductFinderRealtimeController({
      server,
      selectionProjection: createProductFinderSelectionProjection(
        finderController,
        () => server.getSessionId(),
      ),
      audioOwnership: {
        setRealtimeOwned: active => soundService.setRealtimeOwned(active),
      },
      telemetry: {
        info: (event, detail) => console.info(`[productfinder-realtime] ${event}`, detail ?? {}),
        error: (event, error, detail) => console.error(
          `[productfinder-realtime] ${event}`,
          error,
          detail ?? {},
        ),
      },
    });
    return { controller };
  }, [finderController]);

  const snapshot = useSyncExternalStore(
    runtime.controller.subscribe,
    runtime.controller.getSnapshot,
    runtime.controller.getSnapshot,
  );

  useEffect(() => {
    const endOnPageHide = () => runtime.controller.close();
    window.addEventListener('pagehide', endOnPageHide);
    return () => {
      window.removeEventListener('pagehide', endOnPageHide);
      runtime.controller.dispose();
    };
  }, [runtime]);

  const start = useCallback(() => {
    void runtime.controller.open(context);
  }, [context, runtime]);

  const setTalking = useCallback((active: boolean) => {
    runtime.controller.setPttActive(active);
  }, [runtime]);

  const isConnected = ['ready', 'speaking', 'listening'].includes(snapshot.status);
  const canStart = ['idle', 'closed', 'error'].includes(snapshot.status);

  // Header-Button: keine zweite Klickstufe — die Karte erscheint und die
  // Sitzung startet sofort (Mikrofon-Freigabe kommt vom Browser).
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoStart || autoStarted.current || !canStart) return;
    autoStarted.current = true;
    start();
  }, [autoStart, canStart, start]);
  const latestTranscript = [...snapshot.transcript]
    .reverse()
    .find(entry => !entry.partial && entry.text.trim());

  return (
    <aside className={`pf-realtime-surface is-${snapshot.status}`} aria-label="Interner Realtime-Produkttest">
      <div className="pf-realtime-heading">
        <span className="pf-realtime-kicker">INTERNAL · READ ONLY</span>
        {isConnected && (
          <button
            type="button"
            className="pf-realtime-close"
            aria-label="Sprachsitzung beenden"
            onClick={() => { runtime.controller.close(); onClosed?.(); }}
          >
            <CloseIcon />
          </button>
        )}
      </div>

      <div className="pf-realtime-status" aria-live="polite">
        <span className="pf-realtime-status-dot" />
        <span>{STATUS_LABELS[snapshot.status]}</span>
      </div>

      {snapshot.activeTool && (
        <div className="pf-realtime-tool">Suche wird aktualisiert …</div>
      )}

      {latestTranscript && (
        <p className="pf-realtime-transcript">
          <span>{latestTranscript.speaker === 'user' ? 'DU' : 'BERATER'}</span>
          {latestTranscript.text}
        </p>
      )}

      {snapshot.errorMessage && (
        <p className="pf-realtime-error" role="alert">{snapshot.errorMessage}</p>
      )}

      {canStart ? (
        <button type="button" className="pf-realtime-start" onClick={start}>
          <MicrophoneIcon />
          Sprachberater starten
        </button>
      ) : (
        <button
          type="button"
          className="pf-realtime-ptt"
          disabled={!isConnected}
          aria-pressed={snapshot.isMicActive}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setTalking(true);
          }}
          onPointerUp={() => setTalking(false)}
          onPointerCancel={() => setTalking(false)}
          onLostPointerCapture={() => setTalking(false)}
          onKeyDown={(event) => {
            if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
              event.preventDefault();
              setTalking(true);
            }
          }}
          onKeyUp={(event) => {
            if (event.key === ' ' || event.key === 'Enter') {
              event.preventDefault();
              setTalking(false);
            }
          }}
        >
          <MicrophoneIcon />
          {snapshot.isMicActive ? 'Loslassen zum Senden' : 'Gedrückt halten und sprechen'}
        </button>
      )}
    </aside>
  );
}
