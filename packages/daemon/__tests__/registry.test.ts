import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  getAgents,
  initializeAgentRegistry
} from '../src/agent/registry.js';

describe('agent registry', () => {
  it('persists detected agent commands during initialization', async () => {
    const storePath = `/tmp/acpilot-agents-test-${Date.now()}-${Math.random()}.json`;

    await initializeAgentRegistry(storePath);

    const stored = JSON.parse(await readFile(storePath, 'utf8')) as Record<
      string,
      { command?: string; args?: string[] }
    >;

    expect(Object.keys(stored)).toEqual(expect.arrayContaining(['codex', 'claude', 'copilot']));

    const agents = getAgents();
    expect(agents).toHaveLength(3);
    expect(agents[0]).toMatchObject({
      id: expect.any(String),
      command: expect.any(String),
      available: expect.any(Boolean)
    });
  });
});
