import crypto from 'node:crypto';
import { DEFAULT_DAEMON_HOST, DEFAULT_DAEMON_PORT } from '@acpilot/shared';

export interface DaemonConfig {
  port: number;
  host: string;
  tokenSecret: string;
  agentConcurrencyLimit: number;
  sessionIdleTimeoutMs: number;
  crashRestartLimit: number;
  auditLogPath: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): DaemonConfig {
  return {
    port: Number(env.ACPILOT_PORT ?? DEFAULT_DAEMON_PORT),
    host: env.ACPILOT_HOST ?? DEFAULT_DAEMON_HOST,
    tokenSecret: env.ACPILOT_TOKEN_SECRET ?? crypto.randomBytes(32).toString('hex'),
    agentConcurrencyLimit: Number(env.ACPILOT_AGENT_CONCURRENCY_LIMIT ?? 2),
    sessionIdleTimeoutMs: Number(env.ACPILOT_SESSION_IDLE_TIMEOUT_MS ?? 30 * 60 * 1000),
    crashRestartLimit: Number(env.ACPILOT_CRASH_RESTART_LIMIT ?? 3),
    auditLogPath: env.ACPILOT_AUDIT_LOG_PATH ?? 'acpilot-audit.log'
  };
}
