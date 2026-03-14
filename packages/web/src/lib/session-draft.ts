export const NEW_SESSION_DRAFT_STORAGE_KEY = 'acpilot:new-session-draft';

export interface NewSessionDraft {
  agentId: string | null;
  cwd: string;
  workspaceType: 'local' | 'worktree';
}

const DEFAULT_DRAFT: NewSessionDraft = {
  agentId: null,
  cwd: '',
  workspaceType: 'local'
};

function getBrowserStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const storage = window.localStorage;
  if (
    !storage ||
    typeof storage.getItem !== 'function' ||
    typeof storage.setItem !== 'function'
  ) {
    return null;
  }

  return storage;
}

function isWorkspaceType(value: unknown): value is NewSessionDraft['workspaceType'] {
  return value === 'local' || value === 'worktree';
}

export function loadNewSessionDraft(): NewSessionDraft {
  const storage = getBrowserStorage();
  if (!storage) {
    return DEFAULT_DRAFT;
  }

  try {
    const raw = storage.getItem(NEW_SESSION_DRAFT_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_DRAFT;
    }

    const parsed = JSON.parse(raw) as Partial<NewSessionDraft>;
    return {
      agentId: typeof parsed.agentId === 'string' ? parsed.agentId : null,
      cwd: typeof parsed.cwd === 'string' ? parsed.cwd : '',
      workspaceType: isWorkspaceType(parsed.workspaceType)
        ? parsed.workspaceType
        : 'local'
    };
  } catch {
    return DEFAULT_DRAFT;
  }
}

export function saveNewSessionDraft(draft: NewSessionDraft): void {
  const storage = getBrowserStorage();
  if (!storage) {
    return;
  }

  storage.setItem(NEW_SESSION_DRAFT_STORAGE_KEY, JSON.stringify(draft));
}
