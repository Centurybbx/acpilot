import { useMemo, useState } from 'react';
import { useAgentsStore } from '../../stores/agents.js';
import { useSessionStore } from '../../stores/session.js';
import { DynamicControls } from '../controls/DynamicControls.js';
import { SlashPalette } from '../controls/SlashPalette.js';

interface ChatInputProps {
  onSend: (prompt: string) => Promise<void>;
  onCancel: () => void;
}

export function ChatInput({ onSend, onCancel }: ChatInputProps) {
  const [value, setValue] = useState('');

  const currentSessionId = useSessionStore((state) => state.currentSessionId);
  const sessionConfig = useSessionStore((state) =>
    state.sessions.find((session) => session.id === state.currentSessionId)?.config ?? {}
  );
  const updateSessionConfig = useSessionStore((state) => state.updateSessionConfig);
  const capabilities = useAgentsStore((state) =>
    currentSessionId ? state.capabilities.get(currentSessionId) : undefined
  );
  const normalizedCapabilities = useMemo(() => {
    if (!capabilities) {
      return undefined;
    }
    if (capabilities.configOptions?.length) {
      return capabilities;
    }
    if (capabilities.modes?.length) {
      return {
        ...capabilities,
        configOptions: [
          {
            name: 'mode',
            type: 'enum' as const,
            values: capabilities.modes.map((mode) => mode.name),
            default: capabilities.modes[0]?.name
          }
        ]
      };
    }
    return capabilities;
  }, [capabilities]);

  const commands = capabilities?.commands ?? [];

  const canSend = value.trim().length > 0;

  const placeholder = useMemo(() => 'Ask ACpilot anything...', []);

  return (
    <div className="border-t border-slate-200 bg-white px-3 pb-3 pt-2">
      <SlashPalette
        commands={commands}
        onSelect={(name) => {
          setValue(`/${name}`);
        }}
      />

      <div className="mt-2">
        <DynamicControls
          capabilities={normalizedCapabilities}
          values={sessionConfig}
          onChange={(name, nextValue) => {
            updateSessionConfig({ [name]: nextValue });
          }}
        />
      </div>

      <div className="mt-2 flex items-end gap-2">
        <textarea
          value={value}
          placeholder={placeholder}
          className="max-h-36 min-h-10 flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-app-accent"
          onChange={(event) => {
            setValue(event.target.value);
          }}
          onKeyDown={async (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              if (!canSend) {
                return;
              }
              const text = value.trim();
              setValue('');
              await onSend(text);
            }
          }}
        />
        <button
          type="button"
          className="rounded-full bg-app-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={!canSend}
          onClick={async () => {
            if (!canSend) {
              return;
            }
            const text = value.trim();
            setValue('');
            await onSend(text);
          }}
        >
          ➤
        </button>
        <button
          type="button"
          className="rounded-full border border-slate-300 px-3 py-2 text-sm text-slate-700"
          onClick={onCancel}
        >
          Stop
        </button>
      </div>
    </div>
  );
}
