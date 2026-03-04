import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { EventLog } from '../src/session/event-log.js';
import { WsHandler } from '../src/ws/handler.js';

class FakeSocket extends EventEmitter {
  public messages: string[] = [];
  public closed = false;

  send(data: string) {
    this.messages.push(data);
  }

  close() {
    this.closed = true;
  }
}

describe('ws handler', () => {
  it('replays missed events on session resume', async () => {
    const eventLog = new EventLog();
    eventLog.append('s1', {
      type: 'agent:status',
      sessionId: 's1',
      status: 'active'
    });

    const manager = {
      handlePermissionResponse: vi.fn().mockResolvedValue(undefined),
      getEventLog: () => eventLog,
      tryResumeSession: vi.fn().mockResolvedValue('resumed')
    };

    const handler = new WsHandler({
      sessionManager: manager as never,
      verifyToken: () => ({ valid: true, expired: false })
    });

    const ws = new FakeSocket();
    handler.handleConnection(ws as never, { url: '/ws?token=abc' } as never);

    ws.emit('message', JSON.stringify({ type: 'session:resume', sessionId: 's1', lastSeq: 0 }));
    await Promise.resolve();
    expect(ws.messages.length).toBeGreaterThanOrEqual(1);
    expect(JSON.parse(ws.messages[0]!).type).toBe('agent:status');
    expect(manager.tryResumeSession).toHaveBeenCalledWith('s1');
    const restored = ws.messages
      .map((item) => JSON.parse(item))
      .find((item) => item.type === 'session:restored');
    expect(restored?.sessionId).toBe('s1');
  });

  it('forwards permission responses to session manager', async () => {
    const manager = {
      handlePermissionResponse: vi.fn().mockResolvedValue(undefined),
      getEventLog: () => new EventLog(),
      tryResumeSession: vi.fn().mockResolvedValue('unsupported')
    };

    const handler = new WsHandler({
      sessionManager: manager as never,
      verifyToken: () => ({ valid: true, expired: false })
    });

    const ws = new FakeSocket();
    handler.handleConnection(ws as never, { url: '/ws?token=abc' } as never);

    ws.emit(
      'message',
      JSON.stringify({
        type: 'permission:response',
        sessionId: 's1',
        requestId: 'p1',
        approved: true
      })
    );

    await Promise.resolve();
    expect(manager.handlePermissionResponse).toHaveBeenCalledWith('s1', 'p1', true);
  });

  it('does not crash when resume fails and reports session expired', async () => {
    const manager = {
      handlePermissionResponse: vi.fn().mockResolvedValue(undefined),
      getEventLog: () => new EventLog(),
      tryResumeSession: vi.fn().mockRejectedValue(new Error('resume failed'))
    };

    const handler = new WsHandler({
      sessionManager: manager as never,
      verifyToken: () => ({ valid: true, expired: false })
    });

    const ws = new FakeSocket();
    handler.handleConnection(ws as never, { url: '/ws?token=abc' } as never);

    ws.emit(
      'message',
      JSON.stringify({ type: 'session:resume', sessionId: 's1', lastSeq: 0 })
    );

    await Promise.resolve();
    await Promise.resolve();
    const expired = ws.messages
      .map((item) => JSON.parse(item))
      .find((item) => item.type === 'session:expired');
    expect(expired?.sessionId).toBe('s1');
  });
});
