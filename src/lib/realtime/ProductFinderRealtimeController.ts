import {
  PRODUCT_DETAILS_FUNCTION_OUTPUT_KIND,
  RealtimeBrowserSession,
  type AudioOwnershipPort,
  type RealtimeAgentCoreSnapshot,
  type RealtimeMediaStream,
  type RealtimeMintResult,
  type RealtimePeerConnection,
  type RealtimeRemoteAudio,
  type RealtimeToolCall,
  type RealtimeUsageReport,
  type TelemetryPort,
} from '../../../libs/realtime-agent-web-core/dist/index.js';
import {
  ProductFinderRealtimeAdapter,
  type ProductFinderEntryContext,
  type ProductSelectionProjectionPort,
} from './ProductFinderRealtimeAdapter';

export interface ProductFinderRealtimeServerPort {
  /** BFF-owned mint. No user/host credential is ever passed from this client. */
  mintSession(context: ProductFinderEntryContext): Promise<RealtimeMintResult>;
  /** BFF-owned tool dispatch bound to the minted session. */
  executeTool(call: RealtimeToolCall): Promise<unknown>;
  /** Projects browser focus into the server-owned active session context. */
  updateFocusedProduct(focusedProductId: number | null): Promise<void>;
  /** Browser-safe BFF usage projection; model and voice session stay server-owned. */
  reportUsage(report: RealtimeUsageReport): Promise<unknown>;
  /** Idempotent BFF release for the currently minted browser session. */
  endSession(input: Readonly<{ sessionId: string }>): Promise<unknown>;
}


export interface ProductFinderRealtimeMedia {
  input: MediaStream | null;
  output: MediaStream | null;
}
export interface ProductFinderRealtimeControllerOptions {
  server: ProductFinderRealtimeServerPort;
  selectionProjection: ProductSelectionProjectionPort;
  audioOwnership?: AudioOwnershipPort;
  telemetry?: TelemetryPort;
}

/** Sprachnamen fuer die Begruessungs-Instruktion (Gate-Locale -> Sprache). */
const GREETING_LANGUAGE: Record<string, string> = {
  de: 'Deutsch',
  en: 'Englisch',
  sl: 'Slowenisch',
  it: 'Italienisch',
  es: 'Spanisch',
  fr: 'Französisch',
};

/**
 * Fester Begruessungssatz je Sprache (owner 2026-08-27: Begruessung kam
 * trotz Deutsch auf Englisch). Ein Wortlaut laesst dem Modell keinen Raum,
 * die Sprache zu raten; danach gilt die Persona-Sprachregel von AiApi.
 */
const GREETING_TEXT: Record<string, string> = {
  de: "Hallo! Ich bin der O'Neal Sprachberater. Welches Produkt suchen Sie?",
  en: "Hello! I'm the O'Neal voice advisor. Which product are you looking for?",
  sl: "Pozdravljeni! Sem glasovni svetovalec O'Neal. Kateri izdelek iščete?",
  it: "Ciao! Sono il consulente vocale O'Neal. Quale prodotto stai cercando?",
  es: "¡Hola! Soy el asesor de voz de O'Neal. ¿Qué producto buscas?",
  fr: "Bonjour ! Je suis le conseiller vocal O'Neal. Quel produit cherchez-vous ?",
};

const OPENAI_REALTIME_CALLS_URL = 'https://api.openai.com/v1/realtime/calls';

/**
 * Productfinder host adapter for the shared Realtime browser session.
 *
 * It owns no state machine and no command parser; both live in the shared
 * core. Product-specific authority is limited to BFF ports and the trusted
 * selection projection.
 */
export class ProductFinderRealtimeController {
  private readonly adapter: ProductFinderRealtimeAdapter;
  private readonly session: RealtimeBrowserSession<ProductFinderEntryContext>;
  private readonly server: ProductFinderRealtimeServerPort;

  constructor(options: ProductFinderRealtimeControllerOptions) {
    this.server = options.server;
    this.adapter = new ProductFinderRealtimeAdapter({
      selectionProjection: options.selectionProjection,
      audioOwnership: options.audioOwnership,
      telemetry: options.telemetry,
    });
    this.session = new RealtimeBrowserSession(this.adapter.core, {
      mintSession: context => options.server.mintSession(context),
      executeTool: call => options.server.executeTool(call),
      replaceableToolOutputs: {
        product_details: PRODUCT_DETAILS_FUNCTION_OUTPUT_KIND,
      },
      reportUsage: report => options.server.reportUsage(report),
      endSession: input => options.server.endSession(input),
      acquireMicrophone: async () => navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      }) as unknown as RealtimeMediaStream,
      createPeerConnection: () => new RTCPeerConnection() as unknown as RealtimePeerConnection,
      createRemoteAudio: () => {
        const audio = document.createElement('audio');
        audio.style.display = 'none';
        audio.dataset.role = 'productfinder-realtime-remote-audio';
        return audio as unknown as RealtimeRemoteAudio;
      },
      // Voice-Orb (q-58d6cad02b87): Mikro-/Agent-Stream read-only an die
      // Visualisierung reichen. Der Orb besitzt kein Audio, stoppt nichts.
      onInputStreamChanged: stream => this.setMedia({ input: (stream as unknown as MediaStream | null) ?? null }),
      onOutputStreamChanged: stream => this.setMedia({ output: (stream as unknown as MediaStream | null) ?? null }),
      mountRemoteAudio: audio => document.body.appendChild(audio as unknown as HTMLAudioElement),
      unmountRemoteAudio: audio => (audio as unknown as HTMLAudioElement).remove(),
      // Sprache aus dem Sprach-Gate (owner 2026-08-27): Begruessung und
      // Gespraech in der gewaehlten Sprache, nicht fest Deutsch.
      createOpenGreeting: context => {
        const code = (context?.language ?? 'de').toLowerCase().slice(0, 2);
        const language = GREETING_LANGUAGE[code] ?? GREETING_LANGUAGE.de;
        const text = GREETING_TEXT[code] ?? GREETING_TEXT.de;
        return {
          instructions: `Sprich ab jetzt ausschließlich ${language}. `
            + `Sage jetzt wörtlich und nur diesen Satz: "${text}" `
            + 'Rufe dabei kein Werkzeug auf.',
          delayMs: 250,
        };
      },
      reportError: (event, error, context) => options.telemetry?.error?.(event, error, context),
      reportInfo: (event, context) => options.telemetry?.info?.(event, context),
      exchangeSdp: async ({ offerSdp, clientSecret, model }) => {
        const response = await fetch(
          `${OPENAI_REALTIME_CALLS_URL}?model=${encodeURIComponent(model)}`,
          {
            method: 'POST',
            headers: {
              authorization: `Bearer ${clientSecret}`,
              'content-type': 'application/sdp',
            },
            body: offerSdp,
          },
        );
        if (!response.ok) {
          throw new Error(`realtime_sdp_${response.status}`);
        }
        return response.text();
      },
    });
  }

  subscribe = (listener: () => void): (() => void) => this.adapter.subscribe(listener);

  /** Mikro-/Agent-Streams fuer den Voice-Orb — eigener, kleiner Store neben dem Core-Snapshot. */
  private media: ProductFinderRealtimeMedia = { input: null, output: null };
  private readonly mediaListeners = new Set<() => void>();

  private setMedia(patch: Partial<ProductFinderRealtimeMedia>): void {
    this.media = { ...this.media, ...patch };
    for (const listener of this.mediaListeners) listener();
  }

  subscribeMedia = (listener: () => void): (() => void) => {
    this.mediaListeners.add(listener);
    return () => { this.mediaListeners.delete(listener); };
  };

  getMediaSnapshot = (): ProductFinderRealtimeMedia => this.media;

  getSnapshot = (): RealtimeAgentCoreSnapshot<ProductFinderEntryContext> => (
    this.adapter.getSnapshot()
  );

  open(context: ProductFinderEntryContext): Promise<boolean> {
    return this.session.open(context);
  }

  setPttActive(active: boolean): boolean {
    return this.session.setPttActive(active);
  }

  setFocusedProductId(focusedProductId: number | null): Promise<void> {
    return this.server.updateFocusedProduct(focusedProductId);
  }

  close(): void {
    this.session.close();
  }

  dispose(): void {
    this.session.close();
    this.adapter.dispose();
  }
}
