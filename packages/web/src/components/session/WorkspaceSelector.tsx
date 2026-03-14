interface WorkspaceSelectorProps {
  cwd: string;
  workspaceType: 'local' | 'worktree';
  onCwdChange: (cwd: string) => void;
  onWorkspaceTypeChange: (workspaceType: 'local' | 'worktree') => void;
}

export function WorkspaceSelector({
  cwd,
  workspaceType,
  onCwdChange,
  onWorkspaceTypeChange
}: WorkspaceSelectorProps) {
  return (
    <div className="grid gap-2">
      <label className="grid gap-1 text-sm text-slate-700">
        Workspace Path
        <input
          value={cwd}
          onChange={(event) => onCwdChange(event.target.value)}
          placeholder="/Users/you/project"
          className="rounded-lg border border-slate-300 px-3 py-2"
        />
        <span className="text-xs text-slate-500">The last workspace path is remembered on this device.</span>
      </label>

      <label className="grid gap-1 text-sm text-slate-700">
        Workspace Type
        <select
          value={workspaceType}
          onChange={(event) => onWorkspaceTypeChange(event.target.value as 'local' | 'worktree')}
          className="rounded-lg border border-slate-300 px-3 py-2"
        >
          <option value="local">local</option>
          <option value="worktree">worktree</option>
        </select>
      </label>
    </div>
  );
}
