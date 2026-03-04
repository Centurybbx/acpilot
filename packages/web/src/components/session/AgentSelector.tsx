import type { AgentDef } from '../../lib/api.js';

interface AgentSelectorProps {
  agents: AgentDef[];
  selectedAgentId: string | null;
  onSelect: (agentId: string) => void;
}

export function AgentSelector({ agents, selectedAgentId, onSelect }: AgentSelectorProps) {
  return (
    <div className="grid gap-2">
      {agents.map((agent) => {
        const selected = agent.id === selectedAgentId;
        return (
          <button
            key={agent.id}
            type="button"
            onClick={() => onSelect(agent.id)}
            className={`rounded-xl border px-3 py-2 text-left ${
              selected
                ? 'border-app-accent bg-blue-50'
                : 'border-slate-200 bg-white'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-800">{agent.displayName}</span>
              {agent.mvpLevel ? (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                  {agent.mvpLevel}
                </span>
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}
