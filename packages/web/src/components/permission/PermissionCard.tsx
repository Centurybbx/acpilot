import type { PermissionRequest } from '@acpilot/shared';

interface PermissionCardProps {
  request: PermissionRequest;
  response?: 'allowed' | 'denied';
  onRespond: (approved: boolean) => void;
}

export function PermissionCard({ request, response, onRespond }: PermissionCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
        <span>🔒</span>
        <span>Permission Required</span>
      </div>
      <p className="text-sm text-slate-600">{request.description}</p>
      {request.filePath ? (
        <div className="mt-2 rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700">
          {request.filePath}
        </div>
      ) : null}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={Boolean(response)}
          onClick={() => onRespond(true)}
          className="flex-1 rounded-lg bg-app-accent px-2 py-1.5 text-sm font-medium text-white disabled:opacity-60"
        >
          Allow
        </button>
        <button
          type="button"
          disabled={Boolean(response)}
          onClick={() => onRespond(false)}
          className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-60"
        >
          Deny
        </button>
      </div>
      {response ? (
        <p className="mt-2 text-xs text-slate-500">
          {response === 'allowed' ? 'Permission allowed' : 'Permission denied'}
        </p>
      ) : null}
    </div>
  );
}
