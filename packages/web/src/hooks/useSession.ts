import { useSessionStore } from '../stores/session.js';

export function useSession() {
  return useSessionStore();
}
