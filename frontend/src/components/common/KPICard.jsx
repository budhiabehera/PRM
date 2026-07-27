export default function KPICard({ label, value, sub }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
      <div className="text-2xl font-bold font-mono text-slate-900">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400 mt-1">{label}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-1">{sub}</div>}
    </div>
  )
}
