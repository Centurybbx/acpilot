import type { IncomingMessage } from 'node:http';
import type { WsClientMessage, WsMessage } from '@acpilot/shared';

type TokenVerifier = (token: string) => { valid: boolean; expired: boolean };

interface SessionManagerLike {
  handlePermissionResponse(
    sessionId: string,
    requestId: string,
    approved: boolean
  ): Promise<void>;
  getEventLog(): {
    getAfter(sessionId: string, afterSeq: number): Array<{ message: WsMessage }>;
  };
  tryResumeSession(
    sessionId: string
  ): Promise<'resumed' | 'loaded' | 'unsupported' | 'expired'>;
}

interface WsLike {
  send(data: string): void;
  close(): void;
  on(event: 'message' | 'close', listener: (data: string) => void): void;
}

interface ClientContext {
  ws: WsLike;
  authenticated: boolean;
  subscriptions: Set<string>;
}

export interface WsHandlerOptions {
  sessionManager: SessionManagerLike;
  verifyToken: TokenVerifier;
}

export class WsHandler {
  private readonly clients = new Set<ClientContext>();

  constructor(private readonly options: WsHandlerOptions) {}

  handleConnection(ws: WsLike, req: IncomingMessage): void {
    const token = this.readTokenFromUrl(req.url);
    const authenticated = token
      ? this.options.verifyToken(token).valid
      : false;

    if (token && !authenticated) {
      ws.close();
      return;
    }

    const context: ClientContext = {
      ws,
      authenticated,
      subscriptions: new Set<string>()
    };
    this.clients.add(context);

    ws.on('message', (raw: string) => {
      this.handleRawMessage(context, raw);
    });
    ws.on('close', () => {
      this.handleDisconnect(ws);
    });
  }

  broadcastToSession(sessionId: string, message: WsMessage): void {
    const payload = JSON.stringify(message);
    for (const client of this.clients) {
      if (!client.authenticated) {
        continue;
      }
      if (
        client.subscriptions.size === 0 ||
        client.subscriptions.has(sessionId)
      ) {
        client.ws.send(payload);
      }
    }
  }

  async handleClientMessage(ws: WsLike, message: WsClientMessage): Promise<void> {
    const context = [...this.clients].find((item) => item.ws === ws);
    if (!context?.authenticated) {
      return;
    }
    if (message.type === 'permission:response') {
      try {
        await this.options.sessionManager.handlePermissionResponse(
          message.sessionId,
          message.requestId,
          message.approved
        );
      } catch {
        // Ignore permission response failures to avoid dropping the socket.
      }
      context.subscriptions.add(message.sessionId);
      return;
    }
    if (message.type === 'session:resume') {
      context.subscriptions.add(message.sessionId);
      const missed = this.options.sessionManager
        .getEventLog()
        .getAfter(message.sessionId, message.lastSeq);
      for (const event of missed) {
        ws.send(JSON.stringify(event.message));
      }
      let resumeResult: 'resumed' | 'loaded' | 'unsupported' | 'expired' = 'expired';
      try {
        resumeResult = await this.options.sessionManager.tryResumeSession(
          message.sessionId
        );
      } catch {
        resumeResult = 'expired';
      }
      if (resumeResult === 'resumed' || resumeResult === 'loaded') {
        ws.send(
          JSON.stringify({
            type: 'session:restored',
            sessionId: message.sessionId
          } satisfies WsMessage)
        );
        return;
      }
      ws.send(
        JSON.stringify({
          type: 'session:expired',
          sessionId: message.sessionId
        } satisfies WsMessage)
      );
    }
  }

  handleDisconnect(ws: WsLike): void {
    for (const client of this.clients) {
      if (client.ws === ws) {
        this.clients.delete(client);
        break;
      }
    }
  }

  private handleRawMessage(context: ClientContext, raw: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (!context.authenticated) {
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'type' in parsed &&
        (parsed as { type?: string }).type === 'auth' &&
        'token' in parsed &&
        typeof (parsed as { token?: unknown }).token === 'string'
      ) {
        const token = (parsed as { token: string }).token;
        context.authenticated = this.options.verifyToken(token).valid;
      } else {
        context.ws.close();
      }
      return;
    }

    const message = parsed as WsClientMessage;
    if (
      message.type === 'permission:response' ||
      message.type === 'session:resume'
    ) {
      void this.handleClientMessage(context.ws, message).catch(() => {
        // Never let unhandled rejections crash the daemon process.
      });
    }
  }

  private readTokenFromUrl(url?: string): string | null {
    if (!url) {
      return null;
    }
    try {
      const parsed = new URL(url, 'http://localhost');
      return parsed.searchParams.get('token');
    } catch {
      return null;
    }
  }
}
