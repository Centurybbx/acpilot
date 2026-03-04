import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

export interface AgentDef {
  id: string;
  displayName: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  mvpLevel: 'ga' | 'beta';
}

const CODEX_COMMAND = process.env.ACPILOT_CODEX_COMMAND?.trim();
const CLAUDE_COMMAND = process.env.ACPILOT_CLAUDE_COMMAND?.trim();
const COPILOT_COMMAND = process.env.ACPILOT_COPILOT_COMMAND?.trim() || 'copilot';
const require = createRequire(import.meta.url);

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

const CODEX_LOCAL_BIN = resolvePackageBin(
  '@zed-industries/codex-acp',
  'codex-acp'
);
const CLAUDE_LOCAL_BIN = resolvePackageBin(
  '@zed-industries/claude-agent-acp',
  'claude-agent-acp'
);

export const AGENT_REGISTRY: AgentDef[] = [
  {
    id: 'codex',
    displayName: 'Codex',
    command: CODEX_COMMAND ?? (CODEX_LOCAL_BIN ? process.execPath : 'codex-acp'),
    args: CODEX_COMMAND ? [] : CODEX_LOCAL_BIN ? [CODEX_LOCAL_BIN] : [],
    mvpLevel: 'ga'
  },
  {
    id: 'claude',
    displayName: 'Claude',
    command: CLAUDE_COMMAND ?? (CLAUDE_LOCAL_BIN ? process.execPath : 'npx'),
    args: CLAUDE_COMMAND
      ? []
      : CLAUDE_LOCAL_BIN
        ? [CLAUDE_LOCAL_BIN]
        : ['@zed-industries/claude-agent-acp'],
    mvpLevel: 'beta'
  },
  {
    id: 'copilot',
    displayName: 'Copilot',
    command: COPILOT_COMMAND,
    args: ['--acp', '--stdio'],
    mvpLevel: 'beta'
  }
];

export function getAgents(): AgentDef[] {
  return AGENT_REGISTRY;
}

export function getAgent(id: string): AgentDef | undefined {
  return AGENT_REGISTRY.find((agent) => agent.id === id);
}
