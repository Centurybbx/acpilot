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
      pendingPermissions: []
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

    await useSessionStore.getState().sendPrompt('hello');

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/sessions/s1/prompt',
      expect.objectContaining({
        method: 'POST'
      })
    );
  });

  it('merges streaming assistant chunks without duplicating cumulative content', () => {
    useSessionStore.setState({
      currentSessionId: 's1',
      sessions: [],
      messages: new Map([['s1', []]]),
      pendingPermissions: []
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
});
