const capabilities = [
  "Policy-based HTTP monitoring",
  "Idempotent incident creation",
  "Real-time public status pages",
  "Retry-safe subscriber notifications",
];

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-20 text-slate-100">
      <section className="w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-slate-900 shadow-2xl shadow-cyan-950/30">
        <div className="grid gap-12 p-8 sm:p-12 lg:grid-cols-[1.3fr_0.7fr] lg:p-16">
          <div>
            <p className="mb-6 font-mono text-sm font-medium uppercase tracking-[0.24em] text-cyan-400">
              DevRelay
            </p>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-6xl">
              Detect incidents. Coordinate clearly. Communicate reliably.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
              A production-oriented monitoring and incident response platform for small engineering
              teams. DevRelay is currently under active development.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-6">
            <div className="mb-6 flex items-center gap-3">
              <span className="h-3 w-3 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.7)]" />
              <span className="font-medium text-emerald-300">Project foundation operational</span>
            </div>
            <ul className="space-y-4 text-sm text-slate-300">
              {capabilities.map((capability) => (
                <li className="flex gap-3" key={capability}>
                  <span aria-hidden="true" className="text-cyan-400">
                    →
                  </span>
                  {capability}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}
