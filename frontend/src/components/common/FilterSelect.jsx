export default function FilterSelect({ label, value, onChange, options, allLabel = 'All' }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <span className="text-[10px] uppercase tracking-wide text-slate-400 font-medium">{label}</span>}
      <select
        className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-slate-50 min-w-[130px] focus:outline-none focus:border-indigo-500"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{allLabel}</option>
        {options.map((opt) => (
          <option key={opt.value ?? opt} value={opt.value ?? opt}>
            {opt.label ?? opt}
          </option>
        ))}
      </select>
    </div>
  )
}
