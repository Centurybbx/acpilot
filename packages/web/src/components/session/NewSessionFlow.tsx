import { useEffect, useMemo, useState } from 'react';
import { FileText, Terminal } from 'lucide-react';
import { sendWsMessage } from '../../lib/api.js';
import { useConnectionStore } from '../../stores/connection.js';
import { useAgentsStore } from '../../stores/agents.js';
import { useSessionStore } from '../../stores/session.js';
import { AgentSelector } from './AgentSelector.js';
import { WorkspaceSelector } from './WorkspaceSelector.js';

const STARTER_PROMPTS = {
  debug: 'Help me debug this CLI issue. Reproduce the problem, inspect the relevant code path, explain the root cause, and propose or apply a fix.',
  docs: 'Help me write documentation for this project. First inspect the current codebase structure, then draft clear documentation that explains setup, architecture, and the main workflows.'
} as const;

export function NewSessionFlow() {
  const [agentId, setAgentId] = useState<string | null>(null);
  const [cwd, setCwd] = useState('');
  const [workspaceType, setWorkspaceType] = useState<'local' | 'worktree'>('local');
  const [starterPrompt, setStarterPrompt] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const agents = useAgentsStore((state) => state.agents);
  const fetchAgents = useAgentsStore((state) => state.fetchAgents);
  const createSession = useSessionStore((state) => state.createSession);
  const sendPrompt = useSessionStore((state) => state.sendPrompt);
  const socket = useConnectionStore((state) => state.socket);

  useEffect(() => {
    void fetchAgents();
  }, [fetchAgents]);

  const canCreate = useMemo(() => Boolean(agentId && cwd.trim()), [agentId, cwd]);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-center gap-4 px-4 py-6">
      <h1 className="text-xl font-semibold text-slate-900">New Session</h1>

      <AgentSelector
        agents={agents}
        selectedAgentId={agentId}
        onSelect={(id) => setAgentId(id)}
      />

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          className="group flex flex-col items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:shadow"
          onClick={() => setStarterPrompt(STARTER_PROMPTS.debug)}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Terminal size={18} />
          </div>
          <span className="font-semibold text-slate-900">Debug CLI</span>
        </button>

        <button
          type="button"
          className="group flex flex-col items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:shadow"
          onClick={() => setStarterPrompt(STARTER_PROMPTS.docs)}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <FileText size={18} />
          </div>
          <span className="font-semibold text-slate-900">Write Docs</span>
        </button>
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
          if (!agentId || !cwd.trim()) {
            return;
          }
          setIsCreating(true);
          try {
            await createSession(agentId, cwd.trim(), workspaceType);
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
