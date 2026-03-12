import { FileText, Sparkles, Terminal } from 'lucide-react';

export function HomeView() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-4 py-8">
      {/* Hero Icon */}
      <div className="relative flex items-center justify-center">
        <div className="flex h-32 w-32 items-center justify-center rounded-3xl bg-blue-50">
          <Sparkles className="h-16 w-16 text-blue-500" />
        </div>
      </div>

      {/* Hero Text */}
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

      {/* Action Cards */}
      <div className="grid w-full max-w-lg grid-cols-2 gap-4">
        <button
          type="button"
          className="group flex flex-col items-start gap-4 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm transition-all hover:border-slate-200 hover:shadow-md active:scale-[0.98]"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-100">
            <Terminal size={20} />
          </div>
          <span className="font-semibold text-slate-900">Debug CLI</span>
        </button>

        <button
          type="button"
          className="group flex flex-col items-start gap-4 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm transition-all hover:border-slate-200 hover:shadow-md active:scale-[0.98]"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 transition-colors group-hover:bg-emerald-100">
            <FileText size={20} />
          </div>
          <span className="font-semibold text-slate-900">Write Docs</span>
        </button>
      </div>
    </div>
  );
}
