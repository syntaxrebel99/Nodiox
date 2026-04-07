export default function MarketingPage() {
  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05)_0%,transparent_100%)] pointer-events-none"></div>
      <h1 className="text-7xl font-bold tracking-tighter mb-6 bg-gradient-to-b from-white to-white/40 bg-clip-text text-transparent">
        Nodiox
      </h1>
      <p className="text-xl text-neutral-400 font-light tracking-wide max-w-lg text-center leading-relaxed">
        The complete, enterprise-grade commerce platform designed entirely for Algerian businesses.
      </p>
      <div className="mt-12 flex items-center gap-4">
        <button className="px-6 py-3 bg-white text-black font-medium rounded-full hover:scale-105 transition-transform duration-300">Start Free Trial</button>
        <button className="px-6 py-3 bg-neutral-900 text-white font-medium rounded-full hover:bg-neutral-800 transition-colors">Contact Sales</button>
      </div>
    </div>
  );
}
