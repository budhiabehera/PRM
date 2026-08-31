import { useMemo } from 'react'

export default function FilterSelect({ label, value, onChange, options, allLabel = 'All', sorted = true, showAll = true }) {
  // Normalize value to string for <select> comparison (option values are always strings in DOM)
  const normalizedValue = value != null ? String(value) : ''

  // Sort options alphabetically by label (case-insensitive) unless sorted=false
  const sortedOptions = useMemo(() => {
    if (!sorted) return options
    return [...options].sort((a, b) => {
      const labelA = (a.label ?? a ?? '').toString().trim().toLowerCase()
      const labelB = (b.label ?? b ?? '').toString().trim().toLowerCase()
      return labelA.localeCompare(labelB)
    })
  }, [options, sorted])

  return (
    <div className="flex flex-col gap-1">
      {label && <span className="text-[10px] uppercase tracking-wide text-slate-400 font-medium">{label}</span>}
      <select
        className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-slate-50 min-w-[130px] focus:outline-none focus:border-indigo-500"
        value={normalizedValue}
        onChange={(e) => onChange(e.target.value || '')}
      >
        {showAll && <option value="">{allLabel}</option>}
        {sortedOptions.map((opt) => {
          const optValue = opt.value != null ? String(opt.value) : String(opt)
          const optLabel = opt.label ?? opt.name ?? optValue
          return (
            <option key={optValue} value={optValue}>
              {optLabel}
            </option>
          )
        })}
      </select>
    </div>
  )
}
