import { useEffect, useState } from 'react';
import { fetchSessionLogs } from '../../lib/api.js';

interface LogViewerProps {
  token: string;
  sessionId: string;
}

export function LogViewer({ token, sessionId }: LogViewerProps) {
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    void fetchSessionLogs(token, sessionId).then((items) => {
      if (active) {
        setLogs(items);
      }
    });
    return () => {
      active = false;
    };
  }, [sessionId, token]);

  return (
    <div className="space-y-2 p-3">
      <h2 className="text-sm font-semibold text-slate-800">Raw ACP Logs</h2>
      <pre className="max-h-[60vh] overflow-auto rounded-xl bg-slate-900 p-3 text-xs text-slate-100">
        {logs.join('\n')}
      </pre>
    </div>
  );
}
