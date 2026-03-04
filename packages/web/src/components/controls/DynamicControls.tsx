import type { AgentCapabilities, ConfigOption } from '@acpilot/shared';

interface DynamicControlsProps {
  capabilities?: AgentCapabilities;
  values: Record<string, string | boolean>;
  onChange: (name: string, value: string | boolean) => void;
}

function renderOption(
  option: ConfigOption,
  value: string | boolean,
  onChange: (name: string, value: string | boolean) => void
) {
  if (option.type === 'boolean') {
    return (
      <label key={option.name} className="flex items-center gap-2 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(option.name, event.target.checked)}
        />
        {option.name}
      </label>
    );
  }

  const values = option.values ?? [];
  return (
    <label key={option.name} className="flex items-center gap-1 text-xs text-slate-600">
      <span>{option.name}</span>
      <select
        className="rounded border border-slate-300 bg-white px-1 py-0.5 text-xs"
        value={String(value ?? option.default ?? values[0] ?? '')}
        onChange={(event) => onChange(option.name, event.target.value)}
      >
        {values.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </label>
  );
}

export function DynamicControls({ capabilities, values, onChange }: DynamicControlsProps) {
  const options = capabilities?.configOptions;
  if (!options || options.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.map((option) => renderOption(option, values[option.name] ?? option.default ?? '', onChange))}
    </div>
  );
}
