import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadAnkiApiKey } from './anki-auth.js';
import { AnkiConnectClient } from './anki-connect.js';
import { createSatServer } from './server.js';
import { MAX_PENDING_PREVIEWS, PREVIEW_TTL_MINUTES, PreviewStore } from './sat/preview-store.js';
import { SatService } from './sat/service.js';

async function main(): Promise<void> {
  const apiKey = await loadAnkiApiKey();
  const service = new SatService({
    anki: new AnkiConnectClient(apiKey ? { apiKey } : {}),
    previews: new PreviewStore({
      ttlMs: PREVIEW_TTL_MINUTES * 60_000,
      maxEntries: MAX_PENDING_PREVIEWS,
    }),
  });
  await createSatServer(service).connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  console.error('anki-sat-mcp: failed to start:', error);
  process.exit(1);
});
