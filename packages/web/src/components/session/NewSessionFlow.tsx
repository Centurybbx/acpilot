import { useEffect, useMemo, useState } from 'react';
import { sendWsMessage } from '../../lib/api.js';
import {
  loadNewSessionDraft,
  saveNewSessionDraft
} from '../../lib/session-draft.js';
import { useConnectionStore } from '../../stores/connection.js';
import { useAgentsStore } from '../../stores/agents.js';
import { useSessionStore } from '../../stores/session.js';
import { WorkspaceSelector } from './WorkspaceSelector.js';

export function NewSessionFlow() {
  const [initialDraft] = useState(() => loadNewSessionDraft());
  const [agentId, setAgentId] = useState<string | null>(initialDraft.agentId);
  const [cwd, setCwd] = useState(initialDraft.cwd);
  const [workspaceType, setWorkspaceType] = useState<'local' | 'worktree'>(
    initialDraft.workspaceType
  );
  const [starterPrompt, setStarterPrompt] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const agents = useAgentsStore((state) => state.agents);
  const fetchAgents = useAgentsStore((state) => state.fetchAgents);
  const createSession = useSessionStore((state) => state.createSession);
  const sendPrompt = useSessionStore((state) => state.sendPrompt);
  const socket = useConnectionStore((state) => state.socket);
  const availableAgents = useMemo(
    () => agents.filter((agent) => agent.available !== false),
    [agents]
  );

  useEffect(() => {
    void fetchAgents();
  }, [fetchAgents]);

  useEffect(() => {
    if (agents.length === 0) {
      return;
    }

    if (availableAgents.length === 0) {
      setAgentId(null);
      return;
    }

    setAgentId((currentAgentId) => {
      if (
        currentAgentId &&
        availableAgents.some((agent) => agent.id === currentAgentId)
      ) {
        return currentAgentId;
      }

      return availableAgents[0]?.id ?? null;
    });
  }, [agents, availableAgents]);

  useEffect(() => {
    saveNewSessionDraft({ agentId, cwd, workspaceType });
  }, [agentId, cwd, workspaceType]);

  const selectedAgent = useMemo(
    () => availableAgents.find((agent) => agent.id === agentId) ?? null,
    [agentId, availableAgents]
  );
  const canCreate = useMemo(() => Boolean(selectedAgent && cwd.trim()), [selectedAgent, cwd]);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-center gap-4 px-4 py-6">
      <h1 className="text-xl font-semibold text-slate-900">New Session</h1>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
          Engine
        </div>
        {selectedAgent ? (
          <div className="mt-2 flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-slate-900">{selectedAgent.displayName}</div>
              <div className="text-sm text-slate-500">Auto-selected and remembered on this device.</div>
            </div>
            {selectedAgent.mvpLevel ? (
              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-slate-500 shadow-sm">
                {selectedAgent.mvpLevel}
              </span>
            ) : null}
          </div>
        ) : (
          <div className="mt-2 text-sm text-amber-700">
            No local engine is available yet. Start the daemon with a configured agent first.
          </div>
        )}
      </div>

      <WorkspaceSelector
        cwd={cwd}
        workspaceType={workspaceType}
        onCwdChange={setCwd}
        onWorkspaceTypeChange={setWorkspaceType}
      />

      <label className="grid gap-1 text-sm text-slate-700">
        Starter Prompt
        <textarea
          value={starterPrompt}
          onChange={(event) => setStarterPrompt(event.target.value)}
          placeholder="Optional: send a starter prompt right after the session is created"
          className="min-h-28 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-app-accent"
        />
      </label>

      <button
        type="button"
        disabled={!canCreate || isCreating}
        onClick={async () => {
          if (!selectedAgent || !cwd.trim()) {
            return;
          }
          setIsCreating(true);
          try {
            const nextCwd = cwd.trim();

            saveNewSessionDraft({
              agentId: selectedAgent.id,
              cwd: nextCwd,
              workspaceType
            });

            await createSession(selectedAgent.id, nextCwd, workspaceType);
            const currentSessionId = useSessionStore.getState().currentSessionId;
            if (currentSessionId) {
              sendWsMessage(socket, {
                type: 'session:subscribe',
                sessionId: currentSessionId
              });
            }
            if (starterPrompt.trim()) {
              await sendPrompt(starterPrompt.trim());
            }
          } finally {
            setIsCreating(false);
          }
        }}
        className="rounded-xl bg-app-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {isCreating ? 'Creating...' : 'Create Session'}
      </button>
    </div>
  );
}
