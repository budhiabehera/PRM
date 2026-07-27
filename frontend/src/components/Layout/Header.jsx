export default function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 h-14 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between px-8 z-50">
      <h1 className="text-[17px] font-semibold flex items-center gap-2.5">
        FX Resource & Sprint Dashboard
        <span className="text-[10px] bg-indigo-600 px-2.5 py-0.5 rounded-full font-normal">
          50-dev team · Jul–Dec 2026
        </span>
      </h1>
      <div className="flex items-center gap-4 text-xs">
        <div className="bg-white/10 px-3.5 py-1.5 rounded-full">👤 Admin — Budhia Behra</div>
      </div>
    </header>
  )
}
