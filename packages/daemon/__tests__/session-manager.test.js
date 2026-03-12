import { describe, expect, it, vi } from 'vitest';
import { EventLog } from '../src/session/event-log.js';
import { SessionManager } from '../src/session/manager.js';
function makeRuntime() {
    const capabilities = {
        configOptions: [
            { name: 'model', type: 'enum', values: ['gpt-5', 'gpt-4.1'] },
            { name: 'search', type: 'boolean' }
        ],
        modes: [{ name: 'auto' }, { name: 'manual' }],
        commands: [{ name: 'fix' }]
    };
    const runtime = {
        bridge: {
            initialize: vi.fn().mockResolvedValue(capabilities),
            sessionNew: vi.fn().mockResolvedValue({ sessionId: 'remote-session-1' }),
            sessionPrompt: vi.fn().mockResolvedValue(undefined),
            sessionSetConfigOption: vi.fn().mockResolvedValue(undefined),
            sessionSetMode: vi.fn().mockResolvedValue(undefined),
            sessionCancel: vi.fn().mockResolvedValue(undefined),
            request: vi.fn().mockResolvedValue({ jsonrpc: '2.0', id: 1 }),
            onEvent: vi.fn(),
            getRawLogs: vi.fn(() => ['stderr'])
        },
        process: {
            agentId: 'codex',
            status: 'running',
            start: vi.fn().mockResolvedValue(undefined),
            stop: vi.fn().mockResolvedValue(undefined),
            acquireSession: vi.fn(),
            releaseSession: vi.fn(),
            resetFuse: vi.fn()
        }
    };
    return runtime;
}
describe('session manager', () => {
    it('creates sessions, forwards prompts, and handles permission responses', async () => {
        const runtime = makeRuntime();
        const eventLog = new EventLog();
        const wsEvents = [];
        const manager = new SessionManager({
            eventLog,
            createRuntime: vi.fn().mockResolvedValue(runtime),
            onSessionEvent: (sessionId, message) => {
                wsEvents.push({ sessionId, type: message.type });
            }
        });
        const session = await manager.create('codex', '/tmp/project', 'local');
        expect(session.agentId).toBe('codex');
        expect(session.status).toBe('active');
        expect(session.config).toEqual({ model: 'gpt-5', search: false, mode: 'auto' });
        expect(runtime.bridge.initialize).toHaveBeenCalled();
        expect(runtime.bridge.sessionNew).toHaveBeenCalledWith('/tmp/project', {});
        expect(runtime.bridge.sessionSetConfigOption).toHaveBeenCalledWith('remote-session-1', 'model', 'gpt-5');
        expect(runtime.bridge.sessionSetConfigOption).toHaveBeenCalledWith('remote-session-1', 'search', false);
        expect(runtime.bridge.sessionSetMode).toHaveBeenCalledWith('remote-session-1', 'auto');
        await manager.prompt(session.id, 'hello', {
            model: 'gpt-4.1',
            search: true,
            mode: 'manual'
        });
        expect(runtime.bridge.sessionPrompt).toHaveBeenCalledWith('remote-session-1', 'hello');
        expect(runtime.bridge.sessionSetConfigOption).toHaveBeenCalledWith('remote-session-1', 'model', 'gpt-4.1');
        expect(runtime.bridge.sessionSetConfigOption).toHaveBeenCalledWith('remote-session-1', 'search', true);
        expect(runtime.bridge.sessionSetMode).toHaveBeenCalledWith('remote-session-1', 'manual');
        await manager.handlePermissionResponse(session.id, 'perm-1', true);
        expect(runtime.bridge.request).toHaveBeenCalledWith('permission/response', {
            sessionId: 'remote-session-1',
            requestId: 'perm-1',
            approved: true
        });
        expect(eventLog.getLatestSeq(session.id)).toBeGreaterThan(0);
        expect(wsEvents.some((evt) => evt.type === 'agent:status')).toBe(true);
    });
    it('converts ACP events to websocket events', async () => {
        const runtime = makeRuntime();
        const eventLog = new EventLog();
        let eventHandler;
        runtime.bridge.onEvent = vi.fn((handler) => {
            eventHandler = handler;
        });
        const manager = new SessionManager({
            eventLog,
            createRuntime: vi.fn().mockResolvedValue(runtime)
        });
        const session = await manager.create('codex', '/tmp/project', 'local');
        eventHandler?.({
            jsonrpc: '2.0',
            method: 'session/message',
            params: { sessionId: 'remote-session-1', content: 'delta', isStreaming: true }
        });
        eventHandler?.({
            jsonrpc: '2.0',
            method: 'permission/request',
            params: { sessionId: 'remote-session-1', id: 'p1', description: 'write file', action: 'write' }
        });
        const messages = eventLog.getAfter(session.id, 0).map((item) => item.message.type);
        expect(messages).toContain('agent:message');
        expect(messages).toContain('permission:request');
    });
    it('returns logs and active sessions', async () => {
        const runtime = makeRuntime();
        const manager = new SessionManager({
            eventLog: new EventLog(),
            createRuntime: vi.fn().mockResolvedValue(runtime)
        });
        const session = await manager.create('codex', '/tmp/project', 'local');
        const active = manager.listActive();
        expect(active).toHaveLength(1);
        expect(active[0]?.id).toBe(session.id);
        expect(manager.getLogs(session.id)).toEqual(['stderr']);
        await manager.close(session.id);
        expect(manager.listActive()).toHaveLength(0);
    });
    it('throws for unknown sessions', async () => {
        const manager = new SessionManager({
            eventLog: new EventLog(),
            createRuntime: vi.fn().mockResolvedValue(makeRuntime())
        });
        await expect(manager.prompt('missing', 'x')).rejects.toThrow(/session not found/i);
    });
});
