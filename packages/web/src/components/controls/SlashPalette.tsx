import type { SlashCommand } from '@acpilot/shared';

interface SlashPaletteProps {
  commands: SlashCommand[];
  onSelect: (name: string) => void;
}

export function SlashPalette({ commands, onSelect }: SlashPaletteProps) {
  const uniqueCommands = commands.filter((command, index) => {
    if (!command.name) {
      return false;
    }
    return commands.findIndex((item) => item.name === command.name) === index;
  });

  if (uniqueCommands.length === 0) {
    return null;
  }

  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
      {uniqueCommands.map((command, index) => (
        <button
          key={`${command.name}-${index}`}
          type="button"
          onClick={() => onSelect(command.name)}
          className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700"
        >
          / {command.name}
        </button>
      ))}
    </div>
  );
}
