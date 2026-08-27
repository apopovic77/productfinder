import {
  RealtimeAgentCore,
  createCommandRegistry,
  type AudioOwnershipPort,
  type CommandRegistry,
  type RealtimeAgentCoreSnapshot,
  type SessionHistoryPort,
  type TelemetryPort,
} from '../../../libs/realtime-agent-web-core/dist/index.js';

export const SHOW_PRODUCT_RESULTS_COMMAND = 'show_product_results' as const;

export interface ProductFinderEntryContext {
  brand: string | null;
  /** Explicit authority for a brand-open mint; omitted for gated flows. */
  brand_open?: true;
  language: string;
  collection_year: number;
  entry_selection: Readonly<{
    sport_id: string;
    category_id: string | null;
  }> | null;
}

export interface ProductSelectionProjectionPort {
  /**
   * Resolve and display a server-owned selection. The browser receives no
   * model-generated product IDs; the opaque token remains the trust boundary.
   */
  showSelection(selectionToken: string): void | Promise<void>;
}

export interface ProductFinderRealtimeAdapterOptions {
  selectionProjection: ProductSelectionProjectionPort;
  audioOwnership?: AudioOwnershipPort;
  history?: SessionHistoryPort<ProductFinderEntryContext>;
  telemetry?: TelemetryPort;
}

interface ShowProductResultsArgs {
  selection_token: string;
}

function parseShowProductResultsArgs(value: unknown): ShowProductResultsArgs | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  const token = payload.selection_token;
  if (typeof token !== 'string') return null;
  const normalized = token.trim();
  if (!normalized || normalized.length > 512) return null;
  // A result projection carries exactly one opaque server token. Product IDs,
  // prices and ordering from the model are never accepted as a UI command.
  if ('product_ids' in payload || 'products' in payload || 'price' in payload) return null;
  return { selection_token: normalized };
}

export class ProductFinderRealtimeAdapter {
  readonly registry: CommandRegistry;
  readonly core: RealtimeAgentCore<ProductFinderEntryContext>;
  private readonly unregisterShowResults: () => void;

  constructor(options: ProductFinderRealtimeAdapterOptions) {
    this.registry = createCommandRegistry((command, error) => {
      options.telemetry?.error('productfinder.command.failed', error, { command: command.name });
    });
    this.core = new RealtimeAgentCore<ProductFinderEntryContext>({
      registry: this.registry,
      audioOwnership: options.audioOwnership,
      history: options.history,
      telemetry: options.telemetry,
    });
    this.unregisterShowResults = this.registry.register(
      SHOW_PRODUCT_RESULTS_COMMAND,
      async (rawArgs: unknown) => {
        const args = parseShowProductResultsArgs(rawArgs);
        if (!args) {
          const error = new Error('Invalid show_product_results command payload');
          options.telemetry?.error('productfinder.command.rejected', error, {
            command: SHOW_PRODUCT_RESULTS_COMMAND,
          });
          throw error;
        }
        await options.selectionProjection.showSelection(args.selection_token);
        options.telemetry?.info('productfinder.selection.projected');
      },
    );
  }

  subscribe = (listener: () => void): (() => void) => this.core.subscribe(listener);

  getSnapshot = (): RealtimeAgentCoreSnapshot<ProductFinderEntryContext> => (
    this.core.getSnapshot()
  );

  dispose(): void {
    this.unregisterShowResults();
    this.core.close();
  }
}

export { parseShowProductResultsArgs };
