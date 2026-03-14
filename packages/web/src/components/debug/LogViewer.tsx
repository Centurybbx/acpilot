import { useEffect, useState } from 'react';
import { fetchSessionLogs } from '../../lib/api.js';

interface LogViewerProps {
  sessionId: string;
}

export function LogViewer({ sessionId }: LogViewerProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadLogs = async () => {
      try {
        const items = await fetchSessionLogs(sessionId);
        if (!active) {
          return;
        }
        setLogs(items);
        setError(null);
      } catch (nextError) {
        if (!active) {
          return;
        }
        setError((nextError as Error).message);
      }
    };

    void loadLogs();
    const timer = window.setInterval(() => {
      void loadLogs();
    }, 1000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [sessionId]);

  return (
    <div className="space-y-2 p-3">
      <h2 className="text-sm font-semibold text-slate-800">Raw ACP Logs</h2>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      <pre className="max-h-[60vh] overflow-auto rounded-xl bg-slate-900 p-3 text-xs text-slate-100">
        {logs.length > 0 ? logs.join('\n') : 'Waiting for ACP logs...'}
      </pre>
    </div>
  );
}
