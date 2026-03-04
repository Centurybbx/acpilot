import { describe, expect, it, vi } from 'vitest';
import type { AcpEvent, AcpResponse, AgentCapabilities, Session } from '@acpilot/shared';
import { EventLog } from '../src/session/event-log.js';
import { SessionManager, type AgentRuntime } from '../src/session/manager.js';

function makeRuntime() {
  const capabilities: AgentCapabilities = {
    configOptions: [{ name: 'model', type: 'enum', values: ['gpt-5'] }],
    commands: [{ name: 'fix' }]
  };

  const runtime: AgentRuntime = {
    bridge: {
      initialize: vi.fn().mockResolvedValue(capabilities),
      sessionNew: vi.fn().mockResolvedValue({ sessionId: 'remote-session-1' }),
      sessionPrompt: vi.fn().mockResolvedValue(undefined),
      sessionCancel: vi.fn().mockResolvedValue(undefined),
      respondPermission: vi.fn().mockResolvedValue(undefined),
      request: vi.fn().mockResolvedValue({ jsonrpc: '2.0', id: 1 } as AcpResponse),
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
    const wsEvents: Array<{ sessionId: string; type: string }> = [];

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
    expect(runtime.bridge.initialize).toHaveBeenCalled();
    expect(runtime.bridge.sessionNew).toHaveBeenCalledWith('/tmp/project', {});

    await manager.prompt(session.id, 'hello');
    expect(runtime.bridge.sessionPrompt).toHaveBeenCalledWith('remote-session-1', 'hello');

    await manager.handlePermissionResponse(session.id, 'perm-1', true);
    expect(runtime.bridge.respondPermission).toHaveBeenCalledWith('perm-1', true);

    expect(eventLog.getLatestSeq(session.id)).toBeGreaterThan(0);
    expect(wsEvents.some((evt) => evt.type === 'agent:status')).toBe(true);
  });

  it('converts ACP events to websocket events', async () => {
    const runtime = makeRuntime();
    const eventLog = new EventLog();
    let eventHandler: ((evt: AcpEvent) => void) | undefined;
    const outbound: unknown[] = [];

    runtime.bridge.onEvent = vi.fn((handler: (evt: AcpEvent) => void) => {
      eventHandler = handler;
    });

    const manager = new SessionManager({
      eventLog,
      createRuntime: vi.fn().mockResolvedValue(runtime),
      onSessionEvent: (_sessionId, message) => {
        outbound.push(message);
      }
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
    const pushed = outbound.find(
      (message) =>
        typeof message === 'object' &&
        message !== null &&
        'type' in message &&
        (message as { type: string }).type === 'agent:message'
    ) as { type: 'agent:message'; seq: number } | undefined;
    expect(pushed?.seq).toBeGreaterThan(0);
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

  it('initializes one runtime only once for multiple sessions', async () => {
    const runtime = makeRuntime();
    const manager = new SessionManager({
      eventLog: new EventLog(),
      createRuntime: vi.fn().mockResolvedValue(runtime)
    });

    await manager.create('codex', '/tmp/project-a', 'local');
    await manager.create('codex', '/tmp/project-b', 'local');

    expect(runtime.bridge.initialize).toHaveBeenCalledTimes(1);
  });

  it('deduplicates runtime startup under concurrent session creation', async () => {
    const runtime = makeRuntime();
    const createRuntime = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return runtime;
    });

    const manager = new SessionManager({
      eventLog: new EventLog(),
      createRuntime
    });

    await Promise.all([
      manager.create('codex', '/tmp/project', 'local'),
      manager.create('codex', '/tmp/project', 'local')
    ]);

    expect(createRuntime).toHaveBeenCalledTimes(1);
  });

  it('tries ACP resume/load based on capabilities', async () => {
    const runtime = makeRuntime();
    runtime.bridge.initialize = vi.fn().mockResolvedValue({
      supportsResume: true
    });

    const manager = new SessionManager({
      eventLog: new EventLog(),
      createRuntime: vi.fn().mockResolvedValue(runtime)
    });

    const session = await manager.create('codex', '/tmp/project', 'local');
    runtime.process.status = 'crashed';
    const resumed = await manager.tryResumeSession(session.id);
    expect(resumed).toBe('resumed');
    expect(runtime.bridge.request).toHaveBeenCalledWith('session/resume', {
      sessionId: 'remote-session-1',
      cwd: '/tmp/project',
      mcpServers: []
    });

    runtime.bridge.request = vi.fn().mockResolvedValue({ ok: true });
    runtime.bridge.initialize = vi.fn().mockResolvedValue({
      supportsLoad: true
    });
    const manager2 = new SessionManager({
      eventLog: new EventLog(),
      createRuntime: vi.fn().mockResolvedValue(runtime)
    });
    const session2 = await manager2.create('codex', '/tmp/project2', 'local');
    runtime.process.status = 'crashed';
    const loaded = await manager2.tryResumeSession(session2.id);
    expect(loaded).toBe('loaded');
    expect(runtime.bridge.request).toHaveBeenCalledWith('session/load', {
      sessionId: 'remote-session-1',
      cwd: '/tmp/project2',
      mcpServers: []
    });
  });

  it('treats active in-memory sessions as already resumed', async () => {
    const runtime = makeRuntime();
    runtime.bridge.initialize = vi.fn().mockResolvedValue({
      supportsResume: true,
      supportsLoad: true
    });
    const manager = new SessionManager({
      eventLog: new EventLog(),
      createRuntime: vi.fn().mockResolvedValue(runtime)
    });

    const session = await manager.create('codex', '/tmp/project', 'local');
    const result = await manager.tryResumeSession(session.id);

    expect(result).toBe('resumed');
    expect(runtime.bridge.request).not.toHaveBeenCalledWith(
      'session/resume',
      expect.anything()
    );
    expect(runtime.bridge.request).not.toHaveBeenCalledWith(
      'session/load',
      expect.anything()
    );
  });
});
