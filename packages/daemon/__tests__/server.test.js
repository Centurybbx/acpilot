import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateToken } from '../src/auth/token.js';
import { createServer } from '../src/server.js';
import { loadConfig } from '../src/config.js';
describe('daemon server', () => {
    const config = loadConfig({
        ACPILOT_TOKEN_SECRET: 'server-secret',
        ACPILOT_AUDIT_LOG_PATH: '/tmp/acpilot-audit-test.log'
    });
    afterEach(async () => {
        vi.restoreAllMocks();
    });
    it('allows /healthz without token and protects other routes', async () => {
        const app = await createServer(config);
        const health = await app.inject({ method: 'GET', url: '/healthz' });
        expect(health.statusCode).toBe(200);
        const agentsDenied = await app.inject({ method: 'GET', url: '/agents' });
        expect(agentsDenied.statusCode).toBe(401);
        const token = generateToken(config.tokenSecret).token;
        const agents = await app.inject({
            method: 'GET',
            url: '/agents',
            headers: { authorization: `Bearer ${token}` }
        });
        expect(agents.statusCode).toBe(200);
        const body = agents.json();
        expect(body.ok).toBe(true);
        expect(body.data).toHaveLength(3);
        await app.close();
    });
    it('verifies and refreshes tokens', async () => {
        const app = await createServer(config);
        const token = generateToken(config.tokenSecret).token;
        const verifyRes = await app.inject({
            method: 'POST',
            url: '/auth/token/verify',
            headers: { authorization: `Bearer ${token}` },
            payload: { token }
        });
        expect(verifyRes.statusCode).toBe(200);
        expect(verifyRes.json().data.valid).toBe(true);
        const refreshRes = await app.inject({
            method: 'POST',
            url: '/auth/token/refresh',
            headers: { authorization: `Bearer ${token}` }
        });
        expect(refreshRes.statusCode).toBe(200);
        expect(refreshRes.json().data.token).not.toBe(token);
        await app.close();
    });
    it('delegates session endpoints to session manager', async () => {
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
            getEventLog: vi.fn(),
            get: vi.fn(),
            listActive: vi.fn().mockReturnValue([mockSession])
        };
        const app = await createServer(config, { sessionManager: sessionManager });
        const token = generateToken(config.tokenSecret).token;
        const created = await app.inject({
            method: 'POST',
            url: '/sessions',
            headers: { authorization: `Bearer ${token}` },
            payload: { agentId: 'codex', cwd: '/tmp/project', workspaceType: 'local' }
        });
        expect(created.statusCode).toBe(200);
        expect(sessionManager.create).toHaveBeenCalledWith('codex', '/tmp/project', 'local');
        const prompted = await app.inject({
            method: 'POST',
            url: '/sessions/s1/prompt',
            headers: { authorization: `Bearer ${token}` },
            payload: { prompt: 'hello', config: { model: 'gpt-4.1' } }
        });
        expect(prompted.statusCode).toBe(200);
        expect(sessionManager.prompt).toHaveBeenCalledWith('s1', 'hello', { model: 'gpt-4.1' });
        const canceled = await app.inject({
            method: 'POST',
            url: '/sessions/s1/cancel',
            headers: { authorization: `Bearer ${token}` }
        });
        expect(canceled.statusCode).toBe(200);
        expect(sessionManager.cancel).toHaveBeenCalledWith('s1');
        const logs = await app.inject({
            method: 'GET',
            url: '/sessions/s1/logs',
            headers: { authorization: `Bearer ${token}` }
        });
        expect(logs.statusCode).toBe(200);
        expect(logs.json().data).toEqual(['line']);
        await app.close();
    });
});
