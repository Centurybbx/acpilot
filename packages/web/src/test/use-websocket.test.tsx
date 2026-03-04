import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWebSocket } from '../hooks/useWebSocket.js';
import { useConnectionStore } from '../stores/connection.js';
import { useSessionStore } from '../stores/session.js';

class FakeWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static instances: FakeWebSocket[] = [];

  public readyState = FakeWebSocket.CONNECTING;
  public sent: string[] = [];
  private listeners: Record<string, Array<(event?: { data: string }) => void>> = {};

  constructor(public readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, handler: (event?: { data: string }) => void) {
    this.listeners[type] = this.listeners[type] ?? [];
    this.listeners[type].push(handler);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.emit('close');
  }

  emit(type: string, payload?: { data: string }) {
    for (const handler of this.listeners[type] ?? []) {
      handler(payload);
    }
  }
}

function Harness() {
  useWebSocket('token-1');
  return null;
}

describe('useWebSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket as never);

    const messages = new Map();
    messages.set('s1', []);

    useSessionStore.setState({
      currentSessionId: 's1',
      sessions: [
        {
          id: 's1',
          agentId: 'codex',
          cwd: '/tmp/project',
          workspaceType: 'local',
          status: 'active',
          capabilities: {},
          eventSeq: 2,
          createdAt: Date.now(),
          lastActiveAt: Date.now()
        }
      ],
      messages,
      pendingPermissions: []
    });
    useConnectionStore.setState({
      status: 'disconnected',
      reconnectProgress: 0,
      lastSeqMap: new Map([['s1', 2]])
    });
  });

  it('dispatches websocket messages and reconnects with resume', async () => {
    render(<Harness />);

    const first = FakeWebSocket.instances[0]!;
    expect(first.url).toContain('/ws?token=token-1');

    first.readyState = FakeWebSocket.OPEN;
    first.emit('open');

    first.emit('message', {
      data: JSON.stringify({
        type: 'agent:message',
        sessionId: 's1',
        seq: 3,
        content: { role: 'assistant', content: 'stream', isStreaming: true }
      })
    });

    expect(useSessionStore.getState().messages.get('s1')).toHaveLength(1);

    first.emit('close');
    expect(useConnectionStore.getState().status).toBe('reconnecting');

    vi.advanceTimersByTime(1000);
    const second = FakeWebSocket.instances[1]!;
    second.readyState = FakeWebSocket.OPEN;
    second.emit('open');

    expect(second.sent.some((item) => item.includes('session:resume'))).toBe(true);
    expect(second.sent.some((item) => item.includes('"lastSeq":3'))).toBe(true);
  });
});
