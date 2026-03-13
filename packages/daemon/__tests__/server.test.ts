import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer } from '../src/server.js';
import { loadConfig } from '../src/config.js';
import { DeviceAuthManager } from '../src/auth/device.js';

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
    const config = createTestConfig();
    const authManager = new DeviceAuthManager({
      storePath: config.authStorePath,
      pairingCodeTtlMs: config.pairingCodeTtlMs
    });
    const app = await createServer(config, { authManager });

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
    expect(challenge.code).toBeUndefined();
    const code = authManager.getChallengeCode(challenge.challengeId);
    expect(code).toBeDefined();

    const completed = await app.inject({
      method: 'POST',
      url: '/auth/pair/complete',
      payload: {
        challengeId: challenge.challengeId,
        code,
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
    const config = createTestConfig();
    const authManager = new DeviceAuthManager({
      storePath: config.authStorePath,
      pairingCodeTtlMs: config.pairingCodeTtlMs
    });
    const app = await createServer(config, { authManager });

    const started = await app.inject({
      method: 'POST',
      url: '/auth/pair/start',
      payload: { deviceName: 'Tablet' }
    });
    const challenge = started.json().data;
    const code = authManager.getChallengeCode(challenge.challengeId);
    const completed = await app.inject({
      method: 'POST',
      url: '/auth/pair/complete',
      payload: {
        challengeId: challenge.challengeId,
        code,
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

  it('allows re-pairing via terminal code when cookies are lost', async () => {
    const config = createTestConfig();
    const authManager = new DeviceAuthManager({
      storePath: config.authStorePath,
      pairingCodeTtlMs: config.pairingCodeTtlMs
    });
    const app = await createServer(config, { authManager });

    // Bootstrap first device
    const started = await app.inject({
      method: 'POST',
      url: '/auth/pair/start',
      payload: { deviceName: 'Phone' }
    });
    const challenge = started.json().data;
    const bootstrapCode = authManager.getChallengeCode(challenge.challengeId);
    await app.inject({
      method: 'POST',
      url: '/auth/pair/complete',
      payload: {
        challengeId: challenge.challengeId,
        code: bootstrapCode,
        deviceName: 'Phone'
      }
    });

    // Simulate a browser that lost its cookies (no cookie header)
    const recoveryStart = await app.inject({
      method: 'POST',
      url: '/auth/pair/start',
      payload: { deviceName: 'Phone Recovered' }
    });
    expect(recoveryStart.statusCode).toBe(200);
    const recoveryChallenge = recoveryStart.json().data;
    expect(recoveryChallenge.code).toBeUndefined();
    expect(recoveryChallenge.challengeId).toBeDefined();

    // Bad code is rejected
    const badComplete = await app.inject({
      method: 'POST',
      url: '/auth/pair/complete',
      payload: {
        challengeId: recoveryChallenge.challengeId,
        code: '000000',
        deviceName: 'Phone Recovered'
      }
    });
    expect(badComplete.statusCode).toBe(400);

    // Retrieve the real code from the auth manager (simulates reading terminal)
    const realCode = authManager.getChallengeCode(recoveryChallenge.challengeId);
    expect(realCode).toBeDefined();

    // Complete re-pairing with the correct terminal code.
    const goodComplete = await app.inject({
      method: 'POST',
      url: '/auth/pair/complete',
      payload: {
        challengeId: recoveryChallenge.challengeId,
        code: realCode,
        deviceName: 'Phone Recovered'
      }
    });
    expect(goodComplete.statusCode).toBe(200);
    expect(goodComplete.json().data.device.name).toBe('Phone Recovered');

    // Verify cookies are set
    const recoveredCookies = extractCookieHeader(
      goodComplete.headers['set-cookie'] as string[]
    );
    expect(recoveredCookies).toContain('acpilot_device_id=');
    expect(recoveredCookies).toContain('acpilot_device_secret=');

    // Verify auth state is paired with new cookies
    const state = await app.inject({
      method: 'GET',
      url: '/auth/state',
      headers: { cookie: recoveredCookies }
    });
    expect(state.json().data.paired).toBe(true);

    // Verify protected routes are accessible
    const agents = await app.inject({
      method: 'GET',
      url: '/agents',
      headers: { cookie: recoveredCookies }
    });
    expect(agents.statusCode).toBe(200);

    await app.close();
  });

  it('allows unauthenticated pairing for a new device with the current terminal code', async () => {
    const config = createTestConfig();
    const authManager = new DeviceAuthManager({
      storePath: config.authStorePath,
      pairingCodeTtlMs: config.pairingCodeTtlMs
    });
    const app = await createServer(config, { authManager });

    // Bootstrap first device
    const started = await app.inject({
      method: 'POST',
      url: '/auth/pair/start',
      payload: { deviceName: 'Phone' }
    });
    const challenge = started.json().data;
    const bootstrapCode = authManager.getChallengeCode(challenge.challengeId);
    const completed = await app.inject({
      method: 'POST',
      url: '/auth/pair/complete',
      payload: {
        challengeId: challenge.challengeId,
        code: bootstrapCode,
        deviceName: 'Phone'
      }
    });
    const cookieHeader = extractCookieHeader(
      completed.headers['set-cookie'] as string[]
    );

    // Any browser can start a new terminal-approved pairing request.
    const secondStart = await app.inject({
      method: 'POST',
      url: '/auth/pair/start',
      payload: { deviceName: 'Tablet' }
    });
    expect(secondStart.statusCode).toBe(200);
    const secondChallenge = secondStart.json().data;
    const secondCode = authManager.getChallengeCode(secondChallenge.challengeId);
    expect(secondCode).toBeDefined();

    const unauthComplete = await app.inject({
      method: 'POST',
      url: '/auth/pair/complete',
      payload: {
        challengeId: secondChallenge.challengeId,
        code: secondCode,
        deviceName: 'Tablet'
      }
    });
    expect(unauthComplete.statusCode).toBe(200);
    expect(unauthComplete.json().data.device.name).toBe('Tablet');

    const allDevices = await app.inject({
      method: 'GET',
      url: '/auth/devices',
      headers: { cookie: cookieHeader }
    });
    expect(allDevices.json().data).toHaveLength(2);

    await app.close();
  });

  it('invalidates older pairing challenges when a new request is created', async () => {
    const config = createTestConfig();
    const authManager = new DeviceAuthManager({
      storePath: config.authStorePath,
      pairingCodeTtlMs: config.pairingCodeTtlMs
    });
    const app = await createServer(config, { authManager });

    const firstStart = await app.inject({
      method: 'POST',
      url: '/auth/pair/start',
      payload: { deviceName: 'First Phone' }
    });
    const firstChallenge = firstStart.json().data;
    const firstCode = authManager.getChallengeCode(firstChallenge.challengeId);

    const secondStart = await app.inject({
      method: 'POST',
      url: '/auth/pair/start',
      payload: { deviceName: 'Second Phone' }
    });
    const secondChallenge = secondStart.json().data;
    const secondCode = authManager.getChallengeCode(secondChallenge.challengeId);

    const firstComplete = await app.inject({
      method: 'POST',
      url: '/auth/pair/complete',
      payload: {
        challengeId: firstChallenge.challengeId,
        code: firstCode,
        deviceName: 'First Phone'
      }
    });
    expect(firstComplete.statusCode).toBe(400);

    const secondComplete = await app.inject({
      method: 'POST',
      url: '/auth/pair/complete',
      payload: {
        challengeId: secondChallenge.challengeId,
        code: secondCode,
        deviceName: 'Second Phone'
      }
    });
    expect(secondComplete.statusCode).toBe(200);

    await app.close();
  });

  it('delegates session endpoints to session manager for trusted devices', async () => {
    const config = createTestConfig();
    const authManager = new DeviceAuthManager({
      storePath: config.authStorePath,
      pairingCodeTtlMs: config.pairingCodeTtlMs
    });
    const mockSession = {
      id: 's1',
      agentId: 'codex',
      cwd: '/tmp/project',
      workspaceType: 'local',
      status: 'active',
      capabilities: {},
      config: { model: 'gpt-5' },
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

    const app = await createServer(config, {
      authManager,
      sessionManager: sessionManager as never
    });

    const started = await app.inject({
      method: 'POST',
      url: '/auth/pair/start',
      payload: { deviceName: 'Laptop' }
    });
    const challenge = started.json().data;
    const code = authManager.getChallengeCode(challenge.challengeId);
    const completed = await app.inject({
      method: 'POST',
      url: '/auth/pair/complete',
      payload: {
        challengeId: challenge.challengeId,
        code,
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
      payload: { prompt: 'hello', config: { model: 'gpt-4.1' } }
    });
    expect(prompted.statusCode).toBe(200);
    expect(sessionManager.prompt).toHaveBeenCalledWith('s1', 'hello', { model: 'gpt-4.1' });

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

    const sessions = await app.inject({
      method: 'GET',
      url: '/sessions',
      headers: { cookie: cookieHeader }
    });
    expect(sessions.statusCode).toBe(200);
    expect(sessions.json().data).toEqual([mockSession]);
    expect(sessionManager.listActive).toHaveBeenCalled();

    await app.close();
  });
});
