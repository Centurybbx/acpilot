import { accessSync, constants, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

export interface AgentDef {
  id: string;
  displayName: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  mvpLevel: 'ga' | 'beta';
  available: boolean;
  unavailableReason?: string;
}

interface AgentTemplate {
  id: string;
  displayName: string;
  mvpLevel: 'ga' | 'beta';
  resolveCommand: () => { command: string; args: string[] };
}

interface StoredAgentOverride {
  command?: string;
  args?: string[];
}

type AgentStoreData = Record<string, StoredAgentOverride>;

const CODEX_COMMAND = process.env.ACPILOT_CODEX_COMMAND?.trim();
const CLAUDE_COMMAND = process.env.ACPILOT_CLAUDE_COMMAND?.trim();
const COPILOT_COMMAND = process.env.ACPILOT_COPILOT_COMMAND?.trim() || 'copilot';
const require = createRequire(import.meta.url);

let configuredAgentStorePath = 'acpilot-agents.json';
let storedOverrides: AgentStoreData = {};
let storeLoaded = false;

function resolvePackageBin(
  packageName: string,
  binaryName: string
): string | null {
  try {
    const packageJsonPath = require.resolve(`${packageName}/package.json`);
    const packageJson = JSON.parse(
      readFileSync(packageJsonPath, 'utf8')
    ) as {
      bin?: string | Record<string, string>;
    };
    if (!packageJson.bin) {
      return null;
    }

    const relativeBin =
      typeof packageJson.bin === 'string'
        ? packageJson.bin
        : packageJson.bin[binaryName] ??
          Object.values(packageJson.bin)[0];
    if (!relativeBin) {
      return null;
    }
    return path.resolve(path.dirname(packageJsonPath), relativeBin);
  } catch {
    return null;
  }
}

function fileExists(target: string): boolean {
  try {
    accessSync(target, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveCommandOnPath(command: string): string | null {
  const pathValue = process.env.PATH;
  if (!pathValue) {
    return null;
  }

  for (const segment of pathValue.split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(segment, command);
    if (fileExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

function lookupCommandOnPath(command: string): boolean {
  return Boolean(resolveCommandOnPath(command));
}

function normalizePersistedCommand(command: string): string {
  if (!command.trim()) {
    return command;
  }

  if (path.isAbsolute(command) || command.includes(path.sep)) {
    return command;
  }

  return resolveCommandOnPath(command) ?? command;
}

function commandLooksUsable(command: string): boolean {
  if (!command.trim()) {
    return false;
  }

  if (path.isAbsolute(command) || command.includes(path.sep)) {
    return fileExists(command);
  }

  return lookupCommandOnPath(command);
}

async function persistStore(storePath: string, data: AgentStoreData): Promise<void> {
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(data, null, 2), 'utf8');
}

async function loadStore(storePath: string): Promise<AgentStoreData> {
  try {
    const contents = await readFile(storePath, 'utf8');
    const parsed = JSON.parse(contents) as AgentStoreData;
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch {
    await persistStore(storePath, {});
    return {};
  }
}

function isEnvConfigured(agentId: string): boolean {
  if (agentId === 'codex') {
    return Boolean(CODEX_COMMAND);
  }

  if (agentId === 'claude') {
    return Boolean(CLAUDE_COMMAND);
  }

  if (agentId === 'copilot') {
    return Boolean(process.env.ACPILOT_COPILOT_COMMAND?.trim());
  }

  return false;
}

const CODEX_LOCAL_BIN = resolvePackageBin(
  '@zed-industries/codex-acp',
  'codex-acp'
);
const CLAUDE_LOCAL_BIN = resolvePackageBin(
  '@zed-industries/claude-agent-acp',
  'claude-agent-acp'
);

const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: 'codex',
    displayName: 'Codex',
    mvpLevel: 'ga',
    resolveCommand: () => ({
      command: CODEX_COMMAND ?? (CODEX_LOCAL_BIN ? process.execPath : 'codex-acp'),
      args: CODEX_COMMAND ? [] : CODEX_LOCAL_BIN ? [CODEX_LOCAL_BIN] : []
    })
  },
  {
    id: 'claude',
    displayName: 'Claude',
    mvpLevel: 'beta',
    resolveCommand: () => ({
      command: CLAUDE_COMMAND ?? (CLAUDE_LOCAL_BIN ? process.execPath : 'npx'),
      args: CLAUDE_COMMAND
        ? []
        : CLAUDE_LOCAL_BIN
          ? [CLAUDE_LOCAL_BIN]
          : ['@zed-industries/claude-agent-acp']
    })
  },
  {
    id: 'copilot',
    displayName: 'Copilot',
    mvpLevel: 'beta',
    resolveCommand: () => ({
      command: COPILOT_COMMAND,
      args: ['--acp', '--stdio']
    })
  }
];

function resolveAgent(template: AgentTemplate): AgentDef {
  const stored = storedOverrides[template.id];
  const resolved = template.resolveCommand();
  const command = stored?.command?.trim() || resolved.command;
  const args = Array.isArray(stored?.args) ? stored.args : resolved.args;
  const available = commandLooksUsable(command);

  return {
    id: template.id,
    displayName: template.displayName,
    command,
    args,
    mvpLevel: template.mvpLevel,
    available,
    unavailableReason: available ? undefined : `Agent command not found: ${command}`
  };
}

export async function initializeAgentRegistry(storePath: string): Promise<void> {
  configuredAgentStorePath = storePath;
  storedOverrides = await loadStore(storePath);

  const nextOverrides = { ...storedOverrides };
  let changed = false;

  for (const template of AGENT_TEMPLATES) {
    const resolved = template.resolveCommand();
    const current = nextOverrides[template.id];
    const currentCommand = current?.command?.trim();
    const shouldRefresh =
      isEnvConfigured(template.id) ||
      !currentCommand ||
      !commandLooksUsable(currentCommand);

    if (!shouldRefresh) {
      continue;
    }

    const nextValue = {
      command: normalizePersistedCommand(resolved.command),
      args: resolved.args
    };

    if (
      current?.command !== nextValue.command ||
      JSON.stringify(current?.args ?? []) !== JSON.stringify(nextValue.args)
    ) {
      nextOverrides[template.id] = nextValue;
      changed = true;
    }
  }

  storedOverrides = nextOverrides;
  storeLoaded = true;

  if (changed) {
    await persistStore(configuredAgentStorePath, storedOverrides);
  }
}

export function getAgents(): AgentDef[] {
  if (!storeLoaded) {
    storedOverrides = {};
  }

  return AGENT_TEMPLATES.map(resolveAgent);
}

export function getAgent(id: string): AgentDef | undefined {
  return getAgents().find((agent) => agent.id === id);
}
