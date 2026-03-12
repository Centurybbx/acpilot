import { useEffect, useMemo, useState } from 'react';
import { useAgentsStore } from '../../stores/agents.js';
import { useSessionStore } from '../../stores/session.js';
import { AgentSelector } from './AgentSelector.js';
import { WorkspaceSelector } from './WorkspaceSelector.js';

export function NewSessionFlow() {
  const [agentId, setAgentId] = useState<string | null>(null);
  const [cwd, setCwd] = useState('');
  const [workspaceType, setWorkspaceType] = useState<'local' | 'worktree'>('local');
  const [isCreating, setIsCreating] = useState(false);

  const agents = useAgentsStore((state) => state.agents);
  const fetchAgents = useAgentsStore((state) => state.fetchAgents);
  const createSession = useSessionStore((state) => state.createSession);

  useEffect(() => {
    void fetchAgents();
  }, [fetchAgents]);

  const canCreate = useMemo(() => Boolean(agentId && cwd.trim()), [agentId, cwd]);

  return (
    <div className="mx-auto flex h-dvh w-full max-w-2xl flex-col justify-center gap-4 px-4">
      <h1 className="text-xl font-semibold text-slate-900">New Session</h1>

      <AgentSelector
        agents={agents}
        selectedAgentId={agentId}
        onSelect={(id) => setAgentId(id)}
      />

      <WorkspaceSelector
        cwd={cwd}
        workspaceType={workspaceType}
        onCwdChange={setCwd}
        onWorkspaceTypeChange={setWorkspaceType}
      />

      <button
        type="button"
        disabled={!canCreate || isCreating}
        onClick={async () => {
          if (!agentId || !cwd.trim()) {
            return;
          }
          setIsCreating(true);
          try {
            await createSession(agentId, cwd.trim(), workspaceType);
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
