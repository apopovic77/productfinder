import {
  RealtimeBrowserSession,
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
        return audio as unknown as RealtimeRemoteAudio;
      },
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
