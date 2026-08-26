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
  /** Datenkanal der laufenden Sitzung — fuer PTT-Commit (turn_detection=null). */
  private channel: RTCDataChannel | null = null;
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
      createPeerConnection: () => {
        const peer = new RTCPeerConnection();
        // Owner 2026-08-26: „Warum stellt sich der Agent nicht vor?" — der
        // Core fordert beim Oeffnen keine Antwort an, er wartet auf PTT.
        // Bis das im Shared Core landet, haengen wir uns per addEventListener
        // (ueberlebt das onopen des Cores) an den Datenkanal und stossen
        // genau eine Begruessung an.
        const createDataChannel = peer.createDataChannel.bind(peer);
        peer.createDataChannel = ((label: string, init?: RTCDataChannelInit) => {
          const channel = createDataChannel(label, init);
          this.channel = channel;
          channel.addEventListener('open', () => {
            window.setTimeout(() => {
              try {
                channel.send(JSON.stringify({
                  type: 'response.create',
                  response: {
                    instructions: 'Begrüße den Kunden jetzt in ein bis zwei kurzen Sätzen auf Deutsch: '
                      + 'Stell dich als O\'Neal Sprachberater vor und frag, welches Produkt er sucht. '
                      + 'Rufe dabei kein Werkzeug auf.',
                  },
                }));
              } catch (error) {
                options.telemetry?.error?.('realtime.greeting.failed', error);
              }
            }, 250);
          }, { once: true });
          return channel;
        }) as typeof peer.createDataChannel;
        return peer as unknown as RealtimePeerConnection;
      },
      createRemoteAudio: () => {
        // Owner 2026-08-26 (media 120859): Verbindung stand, aber kein Ton.
        // Ein abgekoppeltes <audio> mit autoplay spielt einen MediaStream in
        // Safari nicht ab — es muss im DOM haengen, playsInline sein und
        // play() explizit bekommen, sobald der Track da ist. Ein
        // Autoplay-Verbot landet als Fehler im Log statt in Stille.
        const audio = document.createElement('audio');
        audio.setAttribute('playsinline', '');
        audio.style.display = 'none';
        audio.dataset.role = 'productfinder-realtime-remote-audio';
        document.body.appendChild(audio);
        audio.addEventListener('loadedmetadata', () => {
          audio.play().catch(error => {
            options.telemetry?.error?.('realtime.audio.play_failed', error, { name: (error as Error)?.name });
          });
        });
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
    const accepted = this.session.setPttActive(active);
    if (!accepted) return false;
    // AiApi mintet PTT-Sitzungen mit turn_detection=null — der Server
    // schliesst keinen Turn von selbst. Die Tschepp-App sendet deshalb
    // beim Loslassen commit + response.create; der Shared Core tut das
    // (noch) nicht. Owner 2026-08-26: „ich druecke, aber es kommt nie an".
    const channel = this.channel;
    if (!channel || channel.readyState !== 'open') return accepted;
    try {
      if (active) {
        channel.send(JSON.stringify({ type: 'input_audio_buffer.clear' }));
      } else {
        // Letzte Audio-Frames noch ankommen lassen, dann Turn schliessen.
        window.setTimeout(() => {
          if (channel.readyState !== 'open') return;
          channel.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
          channel.send(JSON.stringify({ type: 'response.create' }));
        }, 150);
      }
    } catch (error) {
      console.error('[productfinder-realtime] realtime.ptt.commit_failed', error);
    }
    return accepted;
  }

  close(): void {
    this.session.close();
  }

  dispose(): void {
    this.session.close();
    this.adapter.dispose();
  }
}
