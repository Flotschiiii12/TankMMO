import { ClientMessage, ServerMessage } from './protocol.ts';

export interface Transport {
  send(message: ClientMessage): void;
  onMessage(handler: (message: ServerMessage) => void): () => void;
  connect(): Promise<void>;
  disconnect(): void;
  isConnected(): boolean;
}

/**
 * Marked production stub for future remote multi-player server connections via WebSocket.
 */
export class WebSocketTransport implements Transport {
  private url: string;
  private ws: WebSocket | null = null;
  private handlers = new Set<(message: ServerMessage) => void>();
  private connected = false;

  constructor(url = '/api/game/ws') {
    this.url = url;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // When running in real server mode, this connects to the authoritative game server.
        // For local prototype phase, fallback or reject with informative message:
        if (typeof window === 'undefined' || !window.WebSocket) {
          return reject(new Error('WebSocket not supported in environment'));
        }
        // Simulated connection stub
        console.info(`[WebSocketTransport] Connecting to ${this.url} (Remote server stub)...`);
        this.connected = true;
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  send(message: ClientMessage): void {
    if (this.ws && this.connected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  onMessage(handler: (message: ServerMessage) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }
}
