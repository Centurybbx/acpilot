import type { IncomingMessage } from 'node:http';
import type { WsClientMessage, WsMessage } from '@acpilot/shared';

type SessionVerifier = (credentials: {
  deviceId?: string;
  deviceSecret?: string;
}) => Promise<{ valid: boolean; revoked: boolean }>;

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
  verifySession: SessionVerifier;
}

export class WsHandler {
  private readonly clients = new Set<ClientContext>();

  constructor(private readonly options: WsHandlerOptions) {}

  handleConnection(ws: WsLike, req: IncomingMessage): void {
    void this.handleInitialConnection(ws, req);
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
      void this.authenticateOverMessage(context, parsed);
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

  private async handleInitialConnection(
    ws: WsLike,
    req: IncomingMessage
  ): Promise<void> {
    const credentials = this.readCredentials(req);
    const authenticated = credentials
      ? (await this.options.verifySession(credentials)).valid
      : false;

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

    if (credentials && !authenticated) {
      ws.close();
    }
  }

  private async authenticateOverMessage(
    context: ClientContext,
    parsed: unknown
  ): Promise<void> {
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('type' in parsed) ||
      (parsed as { type?: string }).type !== 'auth'
    ) {
      context.ws.close();
      return;
    }

    const authMessage = parsed as {
      deviceId?: unknown;
      deviceSecret?: unknown;
    };
    const deviceId =
      typeof authMessage.deviceId === 'string'
        ? authMessage.deviceId
        : undefined;
    const deviceSecret =
      typeof authMessage.deviceSecret === 'string'
        ? authMessage.deviceSecret
        : undefined;
    const result = await this.options.verifySession({
      deviceId,
      deviceSecret
    });
    context.authenticated = result.valid;
    if (!result.valid) {
      context.ws.close();
    }
  }

  private readCredentials(req: IncomingMessage): {
    deviceId?: string;
    deviceSecret?: string;
  } | null {
    const cookieHeader = req.headers.cookie;
    const cookies = new Map<string, string>();
    if (cookieHeader) {
      for (const part of cookieHeader.split(';')) {
        const [rawName, ...rest] = part.trim().split('=');
        if (!rawName || rest.length === 0) {
          continue;
        }
        cookies.set(rawName, decodeURIComponent(rest.join('=')));
      }
    }

    const headerDeviceId = req.headers['x-acpilot-device-id'];
    const headerDeviceSecret = req.headers['x-acpilot-device-secret'];
    const deviceId =
      typeof headerDeviceId === 'string'
        ? headerDeviceId
        : cookies.get('acpilot_device_id');
    const deviceSecret =
      typeof headerDeviceSecret === 'string'
        ? headerDeviceSecret
        : cookies.get('acpilot_device_secret');

    if (!deviceId || !deviceSecret) {
      return null;
    }
    return { deviceId, deviceSecret };
  }
}
