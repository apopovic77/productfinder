import {
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
  useRef,
} from 'react';
import type { ProductFinderController } from '../controller/ProductFinderController';
import { VoiceOrb, type VoiceOrbHandle, type VoiceOrbState } from '../../libs/voice-orb-web/dist/index.js';
import {
  ProductFinderRealtimeBffClient,
  ProductFinderRealtimeAuditBuffer,
  ProductFinderRealtimeController,
  createProductFinderSelectionProjection,
  type ProductFinderEntryContext,
  type ProductFinderCartContext,
  type ProductFinderSelectedVariantContext,
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
  focusedProductId: number | null;
  selectedVariant: ProductFinderSelectedVariantContext | null;
  cart: ProductFinderCartContext | null;
  onSelectionProjected(productId: string, count: number): void;
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
  focusedProductId,
  selectedVariant,
  cart,
  onSelectionProjected,
}: ProductFinderRealtimeSurfaceProps) {
  const selectedVariantContext = useMemo<ProductFinderSelectedVariantContext | null>(() => {
    if (!selectedVariant) return null;
    return Object.freeze({
      ...(selectedVariant.size ? { size: selectedVariant.size } : {}),
      ...(selectedVariant.color ? { color: selectedVariant.color } : {}),
    });
  }, [selectedVariant?.color, selectedVariant?.size]);

  const runtime = useMemo(() => {
    const server = new ProductFinderRealtimeBffClient();
    const audit = new ProductFinderRealtimeAuditBuffer(server);
    const controller = new ProductFinderRealtimeController({
      server,
      selectionProjection: createProductFinderSelectionProjection(
        finderController,
        () => server.getSessionId(),
        async (productId, count) => {
          onSelectionProjected(productId, count);
        },
      ),
      audioOwnership: {
        setRealtimeOwned: active => soundService.setRealtimeOwned(active),
      },
      telemetry: {
        info: (event, detail) => {
          console.info(`[productfinder-realtime] ${event}`, detail ?? {});
          audit.recordLifecycle(event, detail);
        },
        error: (event, error, detail) => {
          console.error(`[productfinder-realtime] ${event}`, error, detail ?? {});
          audit.recordError(event, error, detail);
        },
      },
    });
    return { audit, controller };
  }, [finderController, onSelectionProjected]);

  const snapshot = useSyncExternalStore(
    runtime.controller.subscribe,
    runtime.controller.getSnapshot,
    runtime.controller.getSnapshot,
  );

  useEffect(() => {
    const endOnPageHide = () => {
      runtime.audit.flushWithBeacon();
      runtime.controller.close();
    };
    window.addEventListener('pagehide', endOnPageHide);
    return () => {
      window.removeEventListener('pagehide', endOnPageHide);
      runtime.audit.dispose();
      runtime.controller.dispose();
    };
  }, [runtime]);

  useEffect(() => {
    runtime.audit.recordTranscripts(snapshot.transcript);
  }, [runtime, snapshot.transcript]);

  useEffect(() => {
    void runtime.controller.setProductContext(focusedProductId, selectedVariantContext, cart).catch(error => {
      console.error('[productfinder-realtime] realtime.context.update_failed', error);
      runtime.audit.recordError('realtime.context.update_failed', error);
    });
  }, [cart, focusedProductId, runtime, selectedVariantContext]);

  const start = useCallback(() => {
    void runtime.controller.setProductContext(focusedProductId, selectedVariantContext, cart)
      .then(() => runtime.controller.open(context))
      .catch(error => {
        console.error('[productfinder-realtime] realtime.context.open_failed', error);
        runtime.audit.recordError('realtime.context.open_failed', error);
      });
  }, [cart, context, focusedProductId, runtime, selectedVariantContext]);

  const setTalking = useCallback((active: boolean) => {
    if (active) void orbRef.current?.resumeAudio();
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

  // Voice-Orb (CloudV2-Package, q-58d6cad02b87): Zustandsmapping bleibt hier
  // im Finder-Adapter. `ready` = Track stumm -> idle (kein offenes Mikro
  // behaupten); thinking aus responsePending/activeTool/connecting.
  const media = useSyncExternalStore(
    runtime.controller.subscribeMedia,
    runtime.controller.getMediaSnapshot,
    runtime.controller.getMediaSnapshot,
  );
  const orbRef = useRef<VoiceOrbHandle>(null);
  const orbState: VoiceOrbState = (() => {
    if (snapshot.status === 'connecting' || snapshot.responsePending || snapshot.activeTool) return 'thinking';
    if (snapshot.status === 'listening' && snapshot.isMicActive) return 'user_speaking';
    if (snapshot.status === 'speaking') return 'agent_speaking';
    return 'idle';
  })();
  const orbActive = isConnected || snapshot.status === 'connecting';

  return (
    <aside className={`pf-realtime-surface is-${snapshot.status}`} aria-label="Interner Realtime-Produkttest">
      <div className="pf-realtime-heading">
        <span className="pf-realtime-kicker">INTERNAL · TESTPHASE · GESPRÄCH WIRD GESPEICHERT</span>
        {isConnected && (
          <button
            type="button"
            className="pf-realtime-close"
            aria-label="Sprachsitzung beenden"
            onClick={() => {
              runtime.audit.flushWithBeacon();
              runtime.controller.close();
              onClosed?.();
            }}
          >
            <CloseIcon />
          </button>
        )}
      </div>

      <div className="pf-realtime-orb-wrap" aria-hidden="true">
        <VoiceOrb
          ref={orbRef}
          // Owner 2026-08-27: Der Orb ist der Agent, nicht der Kunde - bei der
          // Kundenstimme bleibt er ruhig (nur Zustand user_speaking), kein
          // Mikro-Stream in die Geometrie.
          inputStream={null}
          outputStream={media.output}
          active={orbActive}
          state={orbState}
          className="pf-realtime-orb"
        />
      </div>

      <div className="pf-realtime-status" aria-live="polite">
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
