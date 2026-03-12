import { appendFile } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import Fastify, { type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { WebSocketServer } from 'ws';
import type {
  ApiResponse,
  PairingChallenge,
  TrustedDevice
} from '@acpilot/shared';
import { getAgents } from './agent/registry.js';
import {
  DeviceAuthManager,
  type DeviceVerificationResult
} from './auth/device.js';
import type { DaemonConfig } from './config.js';
import { EventLog } from './session/event-log.js';
import { SessionManager } from './session/manager.js';
import { WsHandler } from './ws/handler.js';

const DEVICE_ID_COOKIE = 'acpilot_device_id';
const DEVICE_SECRET_COOKIE = 'acpilot_device_secret';
const DEVICE_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

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
  authManager?: DeviceAuthManager;
}

function responseOk<T>(data: T): ApiResponse<T> {
  return { ok: true, data };
}

function responseError<T>(error: string): ApiResponse<T> {
  return { ok: false, error };
}

function serializeCookie(name: string, value: string, maxAgeSeconds: number): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAgeSeconds}`
  ].join('; ');
}

function clearCookie(name: string): string {
  return [
    `${name}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0'
  ].join('; ');
}

function setDeviceCookies(
  reply: { header: (name: string, value: string[]) => void },
  deviceId: string,
  deviceSecret: string
): void {
  reply.header('set-cookie', [
    serializeCookie(DEVICE_ID_COOKIE, deviceId, DEVICE_COOKIE_MAX_AGE_SECONDS),
    serializeCookie(
      DEVICE_SECRET_COOKIE,
      deviceSecret,
      DEVICE_COOKIE_MAX_AGE_SECONDS
    )
  ]);
}

function clearDeviceCookies(reply: { header: (name: string, value: string[]) => void }): void {
  reply.header('set-cookie', [
    clearCookie(DEVICE_ID_COOKIE),
    clearCookie(DEVICE_SECRET_COOKIE)
  ]);
}

function parseCookies(request: FastifyRequest): Map<string, string> {
  const cookieHeader = request.headers.cookie;
  const cookies = new Map<string, string>();
  if (!cookieHeader) {
    return cookies;
  }
  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rest] = part.trim().split('=');
    if (!rawName || rest.length === 0) {
      continue;
    }
    cookies.set(rawName, decodeURIComponent(rest.join('=')));
  }
  return cookies;
}

function readDeviceCredentials(request: FastifyRequest): {
  deviceId?: string;
  deviceSecret?: string;
} {
  const cookies = parseCookies(request);
  const headerDeviceId = request.headers['x-acpilot-device-id'];
  const headerDeviceSecret = request.headers['x-acpilot-device-secret'];
  return {
    deviceId:
      typeof headerDeviceId === 'string'
        ? headerDeviceId
        : cookies.get(DEVICE_ID_COOKIE),
    deviceSecret:
      typeof headerDeviceSecret === 'string'
        ? headerDeviceSecret
        : cookies.get(DEVICE_SECRET_COOKIE)
  };
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
  const authManager =
    deps.authManager ??
    new DeviceAuthManager({
      storePath: config.authStorePath,
      pairingCodeTtlMs: config.pairingCodeTtlMs
    });

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
    verifySession: async (credentials) => {
      if (!credentials.deviceId || !credentials.deviceSecret) {
        return { valid: false, revoked: false };
      }
      const verified = await authManager.verifyDeviceSession(
        credentials.deviceId,
        credentials.deviceSecret
      );
      return {
        valid: verified.valid,
        revoked: verified.revoked
      };
    }
  });

  async function verifyCurrentDevice(
    request: FastifyRequest
  ): Promise<DeviceVerificationResult> {
    const { deviceId, deviceSecret } = readDeviceCredentials(request);
    if (!deviceId || !deviceSecret) {
      return { valid: false, revoked: false };
    }
    return authManager.verifyDeviceSession(deviceId, deviceSecret);
  }

  app.addHook('onRequest', async (request, reply) => {
    if (
      request.url.startsWith('/healthz') ||
      request.url.startsWith('/auth/state') ||
      request.url.startsWith('/auth/pair/start') ||
      request.url.startsWith('/auth/pair/complete') ||
      request.url.startsWith('/auth/logout')
    ) {
      return;
    }

    const verified = await verifyCurrentDevice(request);
    if (!verified.valid) {
      clearDeviceCookies(reply);
      reply.code(401).send(responseError(verified.revoked ? 'device revoked' : 'device auth required'));
      return;
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

  app.get('/auth/state', async (request) => {
    return responseOk(await authManager.getAuthState(readDeviceCredentials(request)));
  });

  app.post<{ Body: { deviceName?: string } }>(
    '/auth/pair/start',
    {
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } }
    },
    async (request, reply) => {
      const trustedDeviceCount = await authManager.getTrustedDeviceCount();
      if (trustedDeviceCount > 0) {
        const verified = await verifyCurrentDevice(request);
        if (!verified.valid) {
          reply.code(403);
          return responseError('pairing requires a trusted device');
        }
      }

      const challenge = await authManager.createPairingChallenge(
        request.body?.deviceName
      );
      return responseOk<PairingChallenge>(challenge);
    }
  );

  app.post<{
    Body: { challengeId: string; code: string; deviceName?: string };
  }>(
    '/auth/pair/complete',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } }
    },
    async (request, reply) => {
      const trustedDeviceCount = await authManager.getTrustedDeviceCount();
      if (trustedDeviceCount > 0) {
        const verified = await verifyCurrentDevice(request);
        if (!verified.valid) {
          reply.code(403);
          return responseError('pairing requires a trusted device');
        }
      }

      const { challengeId, code, deviceName } = request.body ?? {};
      if (!challengeId || !code) {
        reply.code(400);
        return responseError('challengeId and code are required');
      }
      try {
        const completion = await authManager.completePairing(
          challengeId,
          code,
          deviceName
        );
        setDeviceCookies(reply, completion.device.id, completion.deviceSecret);
        return responseOk({ device: completion.device });
      } catch (error) {
        reply.code(400);
        return responseError((error as Error).message);
      }
    }
  );

  app.post('/auth/logout', async (_request, reply) => {
    clearDeviceCookies(reply);
    return responseOk({ loggedOut: true });
  });

  app.get('/auth/devices', async () => {
    return responseOk(await authManager.getTrustedDevices());
  });

  app.post<{ Params: { id: string } }>(
    '/auth/devices/:id/revoke',
    async (request, reply) => {
      try {
        const revoked = await authManager.revokeDevice(request.params.id);
        return responseOk<TrustedDevice>(revoked);
      } catch (error) {
        reply.code(404);
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
