import type { AgentCapabilities } from '@acpilot/shared';
import { create } from 'zustand';
import {
  fetchAgents,
  type AgentDef
} from '../lib/api.js';

interface AgentStore {
  agents: AgentDef[];
  capabilities: Map<string, AgentCapabilities>;
  fetchAgents: (token: string) => Promise<void>;
  setCapabilities: (sessionId: string, capabilities: AgentCapabilities) => void;
}

export const useAgentsStore = create<AgentStore>((set) => ({
  agents: [],
  capabilities: new Map(),
  fetchAgents: async (token: string) => {
    const agents = await fetchAgents(token);
    set({ agents });
  },
  setCapabilities: (sessionId, capabilities) =>
    set((state) => {
      const next = new Map(state.capabilities);
      next.set(sessionId, capabilities);
      return { capabilities: next };
    })
}));
