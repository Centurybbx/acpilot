import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer } from '../src/server.js';
import { loadConfig } from '../src/config.js';

function createTestConfig() {
  return loadConfig({
    ACPILOT_AUTH_STORE_PATH: `/tmp/acpilot-auth-test-${Date.now()}-${Math.random()}.json`,
    ACPILOT_AUDIT_LOG_PATH: '/tmp/acpilot-audit-test.log'
  });
}

function extractCookieHeader(setCookie: string[]): string {
  return setCookie.map((cookie) => cookie.split(';', 1)[0]).join('; ');
}

describe('daemon server', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it('bootstraps a trusted device and protects core routes', async () => {
    const app = await createServer(createTestConfig());

    const health = await app.inject({ method: 'GET', url: '/healthz' });
    expect(health.statusCode).toBe(200);

    const beforePairing = await app.inject({ method: 'GET', url: '/auth/state' });
    expect(beforePairing.statusCode).toBe(200);
    expect(beforePairing.json().data).toMatchObject({
      paired: false,
      bootstrapRequired: true,
      trustedDeviceCount: 0
    });

    const agentsDenied = await app.inject({ method: 'GET', url: '/agents' });
    expect(agentsDenied.statusCode).toBe(401);

    const started = await app.inject({
      method: 'POST',
      url: '/auth/pair/start',
      payload: { deviceName: 'Phone' }
    });
    expect(started.statusCode).toBe(200);
    const challenge = started.json().data;

    const completed = await app.inject({
      method: 'POST',
      url: '/auth/pair/complete',
      payload: {
        challengeId: challenge.challengeId,
        code: challenge.code,
        deviceName: 'Phone'
      }
    });
    expect(completed.statusCode).toBe(200);
    expect(completed.json().data.device.name).toBe('Phone');

    const cookies = completed.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
    const agents = await app.inject({
      method: 'GET',
      url: '/agents',
      cookies: Object.fromEntries(
        completed.cookies.map((cookie) => [cookie.name, cookie.value])
      )
    });
    expect(cookies).toContain('acpilot_device_id=');
    expect(agents.statusCode).toBe(200);
    expect(agents.json().data).toHaveLength(3);

    await app.close();
  });

  it('exposes device auth state, logout, and revoke flows', async () => {
    const app = await createServer(createTestConfig());

    const started = await app.inject({
      method: 'POST',
      url: '/auth/pair/start',
      payload: { deviceName: 'Tablet' }
    });
    const challenge = started.json().data;
    const completed = await app.inject({
      method: 'POST',
      url: '/auth/pair/complete',
      payload: {
        challengeId: challenge.challengeId,
        code: challenge.code,
        deviceName: 'Tablet'
      }
    });

    const cookieHeader = extractCookieHeader(completed.headers['set-cookie'] as string[]);

    const state = await app.inject({
      method: 'GET',
      url: '/auth/state',
      headers: { cookie: cookieHeader }
    });
    expect(state.statusCode).toBe(200);
    expect(state.json().data.paired).toBe(true);

    const devices = await app.inject({
      method: 'GET',
      url: '/auth/devices',
      headers: { cookie: cookieHeader }
    });
    expect(devices.statusCode).toBe(200);
    const deviceId = devices.json().data[0].id;

    const revoked = await app.inject({
      method: 'POST',
      url: `/auth/devices/${deviceId}/revoke`,
      headers: { cookie: cookieHeader }
    });
    expect(revoked.statusCode).toBe(200);
    expect(revoked.json().data.revokedAt).toBeTypeOf('number');

    const denied = await app.inject({
      method: 'GET',
      url: '/agents',
      headers: { cookie: cookieHeader }
    });
    expect(denied.statusCode).toBe(401);

    const logoutRes = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { cookie: cookieHeader }
    });
    expect(logoutRes.statusCode).toBe(200);

    await app.close();
  });

  it('delegates session endpoints to session manager for trusted devices', async () => {
    const mockSession = {
      id: 's1',
      agentId: 'codex',
      cwd: '/tmp/project',
      workspaceType: 'local',
      status: 'active',
      capabilities: {},
      eventSeq: 0,
      createdAt: Date.now(),
      lastActiveAt: Date.now()
    };

    const sessionManager = {
      create: vi.fn().mockResolvedValue(mockSession),
      prompt: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn().mockResolvedValue(undefined),
      getLogs: vi.fn().mockReturnValue(['line']),
      handlePermissionResponse: vi.fn().mockResolvedValue(undefined),
      tryResumeSession: vi.fn().mockResolvedValue('unsupported'),
      getEventLog: vi.fn(),
      get: vi.fn(),
      listActive: vi.fn().mockReturnValue([mockSession])
    };

    const app = await createServer(createTestConfig(), {
      sessionManager: sessionManager as never
    });

    const started = await app.inject({
      method: 'POST',
      url: '/auth/pair/start',
      payload: { deviceName: 'Laptop' }
    });
    const challenge = started.json().data;
    const completed = await app.inject({
      method: 'POST',
      url: '/auth/pair/complete',
      payload: {
        challengeId: challenge.challengeId,
        code: challenge.code,
        deviceName: 'Laptop'
      }
    });
    const cookieHeader = extractCookieHeader(completed.headers['set-cookie'] as string[]);

    const created = await app.inject({
      method: 'POST',
      url: '/sessions',
      headers: { cookie: cookieHeader },
      payload: { agentId: 'codex', cwd: '/tmp/project', workspaceType: 'local' }
    });
    expect(created.statusCode).toBe(200);
    expect(sessionManager.create).toHaveBeenCalledWith('codex', '/tmp/project', 'local');

    const prompted = await app.inject({
      method: 'POST',
      url: '/sessions/s1/prompt',
      headers: { cookie: cookieHeader },
      payload: { prompt: 'hello' }
    });
    expect(prompted.statusCode).toBe(200);
    expect(sessionManager.prompt).toHaveBeenCalledWith('s1', 'hello');

    const canceled = await app.inject({
      method: 'POST',
      url: '/sessions/s1/cancel',
      headers: { cookie: cookieHeader }
    });
    expect(canceled.statusCode).toBe(200);
    expect(sessionManager.cancel).toHaveBeenCalledWith('s1');

    const logs = await app.inject({
      method: 'GET',
      url: '/sessions/s1/logs',
      headers: { cookie: cookieHeader }
    });
    expect(logs.statusCode).toBe(200);
    expect(logs.json().data).toEqual(['line']);

    await app.close();
  });
});
