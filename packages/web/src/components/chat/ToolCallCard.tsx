import { useState } from 'react';
import type { ToolCallInfo } from '@acpilot/shared';

interface ToolCallCardProps {
  toolCall: ToolCallInfo;
}

export function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-xs text-slate-700">
      <div className="flex items-center justify-between">
        <span className="font-medium">Tool Call: {toolCall.name}</span>
        <button
          type="button"
          className="rounded border border-slate-300 px-2 py-0.5"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Hide details' : 'Show details'}
        </button>
      </div>

      {expanded ? (
        <pre className="mt-2 overflow-auto rounded bg-slate-900 p-2 text-[11px] text-slate-100">
{JSON.stringify({ input: toolCall.input, output: toolCall.output }, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
