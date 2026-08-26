import {
  RealtimeBrowserSession,
  type AudioOwnershipPort,
  type RealtimeAgentCoreSnapshot,
  type RealtimeMediaStream,
  type RealtimeMintResult,
  type RealtimePeerConnection,
  type RealtimeRemoteAudio,
  type RealtimeToolCall,
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
}

export interface ProductFinderRealtimeControllerOptions {
  server: ProductFinderRealtimeServerPort;
  selectionProjection: ProductSelectionProjectionPort;
  audioOwnership?: AudioOwnershipPort;
  telemetry?: TelemetryPort;
}

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

  constructor(options: ProductFinderRealtimeControllerOptions) {
    this.adapter = new ProductFinderRealtimeAdapter({
      selectionProjection: options.selectionProjection,
      audioOwnership: options.audioOwnership,
      telemetry: options.telemetry,
    });
    this.session = new RealtimeBrowserSession(this.adapter.core, {
      mintSession: context => options.server.mintSession(context),
      executeTool: call => options.server.executeTool(call),
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
      mountRemoteAudio: audio => document.body.appendChild(audio as unknown as HTMLAudioElement),
      unmountRemoteAudio: audio => (audio as unknown as HTMLAudioElement).remove(),
      createOpenGreeting: () => ({
        instructions: 'Begrüße den Kunden jetzt in ein bis zwei kurzen Sätzen auf Deutsch: '
          + 'Stell dich als O\'Neal Sprachberater vor und frag, welches Produkt er sucht. '
          + 'Rufe dabei kein Werkzeug auf.',
        delayMs: 250,
      }),
      reportError: (event, error, context) => options.telemetry?.error?.(event, error, context),
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

  getSnapshot = (): RealtimeAgentCoreSnapshot<ProductFinderEntryContext> => (
    this.adapter.getSnapshot()
  );

  open(context: ProductFinderEntryContext): Promise<boolean> {
    return this.session.open(context);
  }

  setPttActive(active: boolean): boolean {
    return this.session.setPttActive(active);
  }

  close(): void {
    this.session.close();
  }

  dispose(): void {
    this.session.close();
    this.adapter.dispose();
  }
}
