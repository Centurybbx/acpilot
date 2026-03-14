import { Sparkles } from 'lucide-react';

export function HomeView() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-4 py-8">
      <div className="relative flex items-center justify-center">
        <div className="flex h-32 w-32 items-center justify-center rounded-3xl bg-blue-50">
          <Sparkles className="h-16 w-16 text-blue-500" />
        </div>
      </div>

      <div className="space-y-4 text-center">
        <h1 className="text-3xl font-bold text-slate-900 md:text-4xl">
          How can I help you
          <br />
          today?
        </h1>
        <p className="mx-auto max-w-md text-sm text-slate-500">
          Ask ACpilot to help you with your code,
          <br />
          documentation, or local terminal commands.
        </p>
      </div>

      <div className="max-w-md text-center text-sm text-slate-500">
        Start a session to continue. ACpilot remembers your last workspace on this device.
      </div>
    </div>
  );
}
