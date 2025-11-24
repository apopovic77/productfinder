import { SyncOrchestrator } from './SyncOrchestrator';

async function main() {
  try {
    console.log('[ShopifySync] Starting full sync...');
    const orchestrator = new SyncOrchestrator();
    const stats = await orchestrator.runFullSync();
    console.log(`[ShopifySync] Finished: ${stats.products} products in ${stats.durationMs}ms`);
    process.exitCode = 0;
  } catch (error) {
    console.error('[ShopifySync] Sync failed:', error);
    process.exitCode = 1;
  }
}

void main();

