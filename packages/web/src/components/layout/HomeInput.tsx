import { ArrowUp, Image as ImageIcon } from 'lucide-react';
import { useState } from 'react';

interface HomeInputProps {
  onSend: (text: string) => Promise<void>;
}

export function HomeInput({ onSend }: HomeInputProps) {
  const [value, setValue] = useState('');

  return (
    <div className="w-full max-w-2xl px-4 pb-6 pt-2">
      <div className="relative flex items-center rounded-[2rem] border border-slate-200 bg-white px-2 py-2 shadow-sm focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
        <button
          type="button"
          className="flex h-10 w-10 flex-none items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <ImageIcon size={20} />
        </button>

        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (value.trim()) {
                onSend(value);
                setValue('');
              }
            }
          }}
          placeholder="Ask ACpilot anything..."
          className="flex-1 bg-transparent px-2 py-3 text-sm outline-none placeholder:text-slate-400"
        />

        <button
          type="button"
          disabled={!value.trim()}
          onClick={() => {
            if (value.trim()) {
              onSend(value);
              setValue('');
            }
          }}
          className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-blue-500 text-white shadow-md transition-all hover:bg-blue-600 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
        >
          <ArrowUp size={20} />
        </button>
      </div>
    </div>
  );
}
