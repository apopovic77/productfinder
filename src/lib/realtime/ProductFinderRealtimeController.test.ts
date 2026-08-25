import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('./ProductFinderRealtimeController.ts', import.meta.url),
  'utf8',
);

describe('ProductFinderRealtimeController contract', () => {
  it('uses the shared browser session instead of a second state/controller implementation', () => {
    expect(source).toContain('new RealtimeBrowserSession(this.adapter.core');
    expect(source).not.toContain('private status:');
    expect(source).not.toContain('extractAppCommand(');
  });

  it('keeps credentials behind the injected BFF port', () => {
    expect(source).toContain('options.server.mintSession(context)');
    expect(source).toContain('options.server.executeTool(call)');
    expect(source).not.toContain('VITE_AI_API_KEY');
    expect(source).not.toContain("'/ai/realtime/token'");
  });
});
