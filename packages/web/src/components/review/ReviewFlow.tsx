import { useState } from 'react';

export interface ReviewChange {
  id: string;
  path: string;
  additions: number;
  deletions: number;
  unifiedDiff: string;
}

interface ReviewFlowProps {
  changes: ReviewChange[];
  onDecision: (changeId: string, decision: 'accept' | 'reject') => void;
}

export function ReviewFlow({ changes, onDecision }: ReviewFlowProps) {
  const [selected, setSelected] = useState<string | null>(changes[0]?.id ?? null);

  const active = changes.find((change) => change.id === selected) ?? changes[0];

  if (!active) {
    return null;
  }

  return (
    <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3">
      <h3 className="text-sm font-semibold text-slate-800">Review Changes</h3>

      <div className="grid gap-1">
        {changes.map((change) => (
          <button
            key={change.id}
            type="button"
            className={`rounded-lg px-2 py-1 text-left text-xs ${
              change.id === active.id ? 'bg-blue-50 text-blue-700' : 'bg-slate-50 text-slate-700'
            }`}
            onClick={() => setSelected(change.id)}
          >
            {change.path} (+{change.additions}/-{change.deletions})
          </button>
        ))}
      </div>

      <pre className="max-h-64 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] text-slate-100">
        {active.unifiedDiff}
      </pre>

      <div className="flex gap-2">
        <button
          type="button"
          className="flex-1 rounded-lg bg-app-accent px-3 py-1.5 text-xs font-semibold text-white"
          onClick={() => onDecision(active.id, 'accept')}
        >
          Accept
        </button>
        <button
          type="button"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
          onClick={() => onDecision(active.id, 'reject')}
        >
          Reject
        </button>
      </div>
    </section>
  );
}
