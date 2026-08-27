export default function KPICard({ label, value, sub, tooltip }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 text-center relative group" title={tooltip || ''}>
      <div className="text-2xl font-bold font-mono text-slate-900">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400 mt-1">
        {label}
        {tooltip && <span className="ml-1 text-slate-300 cursor-help">ⓘ</span>}
      </div>
      {sub && <div className="text-[11px] text-slate-500 mt-1">{sub}</div>}
      {tooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-800 text-white text-[11px] rounded-lg whitespace-pre-line max-w-[250px] text-left opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
          {tooltip}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
        </div>
      )}
    </div>
  )
}
