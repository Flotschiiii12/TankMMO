import { afterEach, describe, expect, it, vi } from 'vitest';
import { OnlineGameClient } from '../src/net/onlineClient.ts';
import { createDefaultProfile } from '../src/save/profile.ts';

class HangingWebSocket {
  static instances: HangingWebSocket[] = [];
  static OPEN = 1;
  readyState = 0;
  closeCount = 0;

  constructor(_url: string) {
    HangingWebSocket.instances.push(this);
  }

  send(_message: string): void {}
  close(): void { this.closeCount++; }
}

describe('online client connection timeout', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    HangingWebSocket.instances = [];
  });

  it('rejects and closes a socket that never opens', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', HangingWebSocket);
    const client = new OnlineGameClient('ws://example.invalid', 'account.secret', createDefaultProfile());

    const connecting = client.connect();
    const rejection = expect(connecting).rejects.toThrow('connection_timeout');
    await vi.advanceTimersByTimeAsync(12_000);

    await rejection;
    expect(HangingWebSocket.instances).toHaveLength(1);
    expect(HangingWebSocket.instances[0]?.closeCount).toBe(1);
    client.disconnect();
  });
});
