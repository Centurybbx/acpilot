import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgentsStore } from '../stores/agents.js';
import { useSessionStore } from '../stores/session.js';

describe('stores', () => {
  beforeEach(() => {
    useAgentsStore.setState({ agents: [], capabilities: new Map() });
    useSessionStore.setState({
      currentSessionId: null,
      sessions: [],
      messages: new Map(),
      pendingPermissions: [],
      lastRestoredSessionId: null,
      lastRestoredAt: null
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches agents into store', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, data: [{ id: 'codex', displayName: 'Codex' }] })
      })
    );

    await useAgentsStore.getState().fetchAgents();

    expect(useAgentsStore.getState().agents).toHaveLength(1);
    expect(useAgentsStore.getState().agents[0]?.id).toBe('codex');
  });

  it('creates session and sends prompt through API', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
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
          }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, data: { accepted: true } })
      });
    vi.stubGlobal('fetch', fetchMock);

    await useSessionStore.getState().createSession('codex', '/tmp/project', 'local');
    expect(useSessionStore.getState().currentSessionId).toBe('s1');
    useSessionStore.getState().updateSessionConfig({ model: 'gpt-4.1' });

    await useSessionStore.getState().sendPrompt('hello');

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/sessions/s1/prompt',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ prompt: 'hello', config: { model: 'gpt-4.1' } })
      })
    );
  });

  it('reconciles optimistic user messages with websocket user events', () => {
    useSessionStore.setState({
      currentSessionId: 's1',
      sessions: [],
      messages: new Map([['s1', []]]),
      pendingPermissions: [],
      lastRestoredSessionId: null,
      lastRestoredAt: null
    });

    useSessionStore.getState().appendUserMessage('s1', 'hello');
    useSessionStore.getState().applyWsMessage({
      type: 'user:message',
      sessionId: 's1',
      seq: 1,
      content: {
        messageId: 'u1',
        content: 'hello'
      }
    });

    expect(useSessionStore.getState().messages.get('s1')).toEqual([
      expect.objectContaining({
        id: 'u1',
        role: 'user',
        content: 'hello',
        optimistic: false
      })
    ]);
  });

  it('replays user messages from websocket history after reload', () => {
    useSessionStore.setState({
      currentSessionId: 's1',
      sessions: [],
      messages: new Map([['s1', []]]),
      pendingPermissions: [],
      lastRestoredSessionId: null,
      lastRestoredAt: null
    });

    useSessionStore.getState().applyWsMessage({
      type: 'user:message',
      sessionId: 's1',
      seq: 1,
      content: {
        messageId: 'u2',
        content: 'restored prompt'
      }
    });

    expect(useSessionStore.getState().messages.get('s1')).toEqual([
      expect.objectContaining({
        id: 'u2',
        role: 'user',
        content: 'restored prompt'
      })
    ]);
  });

  it('merges streaming assistant chunks without duplicating cumulative content', () => {
    useSessionStore.setState({
      currentSessionId: 's1',
      sessions: [],
      messages: new Map([['s1', []]]),
      pendingPermissions: [],
      lastRestoredSessionId: null,
      lastRestoredAt: null
    });

    useSessionStore.getState().appendAgentMessage('s1', '你', true);
    useSessionStore.getState().appendAgentMessage('s1', '你好', true);
    useSessionStore.getState().appendAgentMessage('s1', '你好！', true);

    const messages = useSessionStore.getState().messages.get('s1') ?? [];
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      role: 'assistant',
      content: '你好！'
    });
  });

  it('finalizes streaming assistant messages when a turn completes', () => {
    useSessionStore.setState({
      currentSessionId: 's1',
      sessions: [],
      messages: new Map([['s1', []]]),
      pendingPermissions: [],
      lastRestoredSessionId: null,
      lastRestoredAt: null
    });

    useSessionStore.getState().appendAgentMessage('s1', 'Hello', true);
    useSessionStore.getState().applyWsMessage({
      type: 'agent:turn_complete',
      sessionId: 's1',
      stopReason: 'end_turn'
    });

    expect(useSessionStore.getState().messages.get('s1')).toEqual([
      expect.objectContaining({
        role: 'assistant',
        content: 'Hello',
        isStreaming: false
      })
    ]);
  });

  it('reuses the last streaming assistant bubble for final non-streaming content', () => {
    useSessionStore.setState({
      currentSessionId: 's1',
      sessions: [],
      messages: new Map([['s1', []]]),
      pendingPermissions: [],
      lastRestoredSessionId: null,
      lastRestoredAt: null
    });

    useSessionStore.getState().appendAgentMessage('s1', 'Hel', true);
    useSessionStore.getState().appendAgentMessage('s1', 'Hello', false);

    expect(useSessionStore.getState().messages.get('s1')).toEqual([
      expect.objectContaining({
        role: 'assistant',
        content: 'Hello',
        isStreaming: false
      })
    ]);
  });

  it('hydrates sessions and preserves a visible current session', () => {
    const baseTime = Date.now();
    const sessions = [
      {
        id: 's1',
        agentId: 'codex',
        cwd: '/tmp/project-a',
        workspaceType: 'local' as const,
        status: 'active' as const,
        capabilities: {},
        config: {},
        eventSeq: 0,
        createdAt: baseTime,
        lastActiveAt: baseTime
      },
      {
        id: 's2',
        agentId: 'claude',
        cwd: '/tmp/project-b',
        workspaceType: 'local' as const,
        status: 'active' as const,
        capabilities: {},
        config: {},
        eventSeq: 1,
        createdAt: baseTime + 1,
        lastActiveAt: baseTime + 1
      }
    ];

    (useSessionStore.getState() as { hydrateSessions?: (items: typeof sessions) => void }).hydrateSessions?.(sessions);

    expect(useSessionStore.getState().sessions).toEqual(sessions);
    expect(useSessionStore.getState().currentSessionId).toBe('s1');
    expect(useSessionStore.getState().messages.has('s1')).toBe(true);
    expect(useSessionStore.getState().messages.has('s2')).toBe(true);
  });

  it('lets the UI switch between a session and the new session view', () => {
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
          config: {},
          eventSeq: 0,
          createdAt: Date.now(),
          lastActiveAt: Date.now()
        }
      ],
      messages: new Map([['s1', []]]),
      pendingPermissions: [],
      lastRestoredSessionId: null,
      lastRestoredAt: null
    });

    (useSessionStore.getState() as { selectSession?: (sessionId: string | null) => void }).selectSession?.(null);
    expect(useSessionStore.getState().currentSessionId).toBeNull();

    (useSessionStore.getState() as { selectSession?: (sessionId: string | null) => void }).selectSession?.('s1');
    expect(useSessionStore.getState().currentSessionId).toBe('s1');
  });

  it('tracks restored sessions and expires closed ones from websocket events', () => {
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
          config: {},
          eventSeq: 0,
          createdAt: Date.now(),
          lastActiveAt: Date.now()
        }
      ],
      messages: new Map([['s1', []]]),
      pendingPermissions: [],
      lastRestoredSessionId: null,
      lastRestoredAt: null
    });

    useSessionStore.getState().applyWsMessage({
      type: 'session:restored',
      sessionId: 's1'
    });

    expect(
      (useSessionStore.getState() as { lastRestoredSessionId?: string | null }).lastRestoredSessionId
    ).toBe('s1');
    expect(
      (useSessionStore.getState() as { lastRestoredAt?: number | null }).lastRestoredAt
    ).toBeTypeOf('number');

    useSessionStore.getState().applyWsMessage({
      type: 'session:expired',
      sessionId: 's1'
    });

    expect(useSessionStore.getState().sessions[0]?.status).toBe('closed');
  });

  it('keeps the current session selected when hydrate data still contains it', () => {
    const sessionA = {
      id: 's1',
      agentId: 'codex',
      cwd: '/tmp/project-a',
      workspaceType: 'local' as const,
      status: 'active' as const,
      capabilities: {},
      config: {},
      eventSeq: 0,
      createdAt: Date.now(),
      lastActiveAt: Date.now()
    };
    const sessionB = {
      ...sessionA,
      id: 's2',
      cwd: '/tmp/project-b'
    };

    useSessionStore.setState((state) => ({
      ...state,
      currentSessionId: 's2',
      sessions: [sessionA, sessionB],
      messages: new Map([
        ['s1', []],
        ['s2', []]
      ])
    }));

    useSessionStore.getState().hydrateSessions([sessionA, sessionB]);

    expect(useSessionStore.getState().currentSessionId).toBe('s2');
  });
});
