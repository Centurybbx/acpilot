import { appendFile } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import Fastify, { type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { WebSocketServer } from 'ws';
import type { ApiResponse } from '@acpilot/shared';
import { getAgents } from './agent/registry.js';
import { refreshToken, verifyToken } from './auth/token.js';
import type { DaemonConfig } from './config.js';
import { EventLog } from './session/event-log.js';
import { SessionManager } from './session/manager.js';
import { WsHandler } from './ws/handler.js';

interface SessionManagerLike {
  create(
    agentId: string,
    cwd: string,
    workspaceType: 'local' | 'worktree'
  ): Promise<unknown>;
  prompt(sessionId: string, prompt: string): Promise<void>;
  cancel(sessionId: string): Promise<void>;
  getLogs(sessionId: string): string[];
  getEventLog(): EventLog;
  handlePermissionResponse(
    sessionId: string,
    requestId: string,
    approved: boolean
  ): Promise<void>;
  tryResumeSession(
    sessionId: string
  ): Promise<'resumed' | 'loaded' | 'unsupported' | 'expired'>;
  listActive(): unknown[];
}

interface CreateServerDeps {
  sessionManager?: SessionManagerLike;
  wsHandler?: WsHandler;
}

function responseOk<T>(data: T): ApiResponse<T> {
  return { ok: true, data };
}

function responseError<T>(error: string): ApiResponse<T> {
  return { ok: false, error };
}

function getBearerToken(request: FastifyRequest): string | null {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }
  return authorization.slice('Bearer '.length);
}

function redactUrl(input: string): string {
  return input
    .replace(/token=[^&]+/gi, 'token=***')
    .replace(/[A-Za-z]:\\[^\s]+/g, '***')
    .replace(/\/Users\/[^\s]+/g, '***');
}

export async function createServer(
  config: DaemonConfig,
  deps: CreateServerDeps = {}
) {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: (_origin, cb) => cb(null, true),
    credentials: true
  });

  await app.register(rateLimit, {
    global: false
  });

  let wsHandler = deps.wsHandler;
  const sessionManager =
    deps.sessionManager ??
    new SessionManager({
      eventLog: new EventLog(),
      processOptions: {
        crashRestartLimit: config.crashRestartLimit,
        sessionIdleTimeoutMs: config.sessionIdleTimeoutMs
      },
      onSessionEvent: (sessionId, message) => {
        wsHandler?.broadcastToSession(sessionId, message);
      }
    });
  wsHandler ??= new WsHandler({
    sessionManager,
    verifyToken: (token) => verifyToken(token, config.tokenSecret)
  });

  app.addHook('onRequest', async (request, reply) => {
    if (request.url.startsWith('/healthz')) {
      return;
    }
    const token = getBearerToken(request);
    if (!token) {
      reply.code(401).send(responseError('missing bearer token'));
      return;
    }
    const verified = verifyToken(token, config.tokenSecret);
    if (!verified.valid) {
      reply.code(401).send(responseError(verified.expired ? 'token expired' : 'invalid token'));
    }
  });

  app.addHook('onResponse', async (request, reply) => {
    const line = `[${new Date().toISOString()}] [${request.method}] [${redactUrl(request.url)}] [${request.ip}] [${reply.statusCode}]\\n`;
    try {
      await appendFile(config.auditLogPath, line, 'utf8');
    } catch {
      app.log.warn('failed to append audit log');
    }
  });

  app.get('/healthz', async () =>
    responseOk({
      status: 'ok',
      uptime: process.uptime(),
      agents: getAgents()
    })
  );

  app.post<{ Body: { token: string } }>('/auth/token/verify', async (request) => {
    const token = request.body?.token ?? getBearerToken(request) ?? '';
    return responseOk(verifyToken(token, config.tokenSecret));
  });

  app.post(
    '/auth/token/refresh',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } }
    },
    async (request, reply) => {
      const oldToken = getBearerToken(request);
      if (!oldToken) {
        reply.code(400);
        return responseError('missing bearer token');
      }
      try {
        return responseOk(refreshToken(oldToken, config.tokenSecret));
      } catch (error) {
        reply.code(401);
        return responseError((error as Error).message);
      }
    }
  );

  app.get('/agents', async () => responseOk(getAgents()));

  app.post<{
    Body: { agentId: string; cwd: string; workspaceType: 'local' | 'worktree' };
  }>(
    '/sessions',
    {
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } }
    },
    async (request, reply) => {
      const { agentId, cwd, workspaceType } = request.body;
      if (!agentId || !cwd || !workspaceType) {
        reply.code(400);
        return responseError('invalid session payload');
      }
      try {
        const session = await sessionManager.create(agentId, cwd, workspaceType);
        return responseOk(session);
      } catch (error) {
        reply.code(500);
        return responseError((error as Error).message);
      }
    }
  );

  app.post<{ Params: { id: string }; Body: { prompt: string } }>(
    '/sessions/:id/prompt',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } }
    },
    async (request, reply) => {
      const prompt = request.body?.prompt;
      if (!prompt) {
        reply.code(400);
        return responseError('prompt is required');
      }
      try {
        await sessionManager.prompt(request.params.id, prompt);
        return responseOk({ accepted: true });
      } catch (error) {
        reply.code(500);
        return responseError((error as Error).message);
      }
    }
  );

  app.post<{ Params: { id: string } }>('/sessions/:id/cancel', async (request, reply) => {
    try {
      await sessionManager.cancel(request.params.id);
      return responseOk({ canceled: true });
    } catch (error) {
      reply.code(500);
      return responseError((error as Error).message);
    }
  });

  app.get<{ Params: { id: string } }>('/sessions/:id/logs', async (request, reply) => {
    try {
      return responseOk(sessionManager.getLogs(request.params.id));
    } catch (error) {
      reply.code(404);
      return responseError((error as Error).message);
    }
  });

  const wss = new WebSocketServer({ noServer: true });
  app.server.on('upgrade', (req: IncomingMessage, socket, head) => {
    if (!req.url?.startsWith('/ws')) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const adapter = {
        send(data: string) {
          ws.send(data);
        },
        close() {
          ws.close();
        },
        on(event: 'message' | 'close', listener: (data: string) => void) {
          if (event === 'message') {
            ws.on('message', (data) => {
              listener(typeof data === 'string' ? data : data.toString());
            });
            return;
          }
          ws.on('close', () => {
            listener('');
          });
        }
      };
      wsHandler.handleConnection(adapter, req);
    });
  });

  app.addHook('onClose', async () => {
    wss.close();
  });

  return app;
}
