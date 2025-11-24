import { setTimeout as delay } from 'node:timers/promises';

export async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await delay(ms);
}

export function maskToken(token: string): string {
  if (token.length <= 8) return '*'.repeat(token.length);
  return `${token.slice(0, 4)}***${token.slice(-4)}`;
}

