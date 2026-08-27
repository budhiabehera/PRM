import { useState, useRef, useEffect, useMemo } from 'react'

/**
 * Multi-select dropdown with checkboxes.
 * Props:
 *   label       - Label text above the dropdown
 *   options     - Array of { value, label } or plain strings
 *   selected    - Array of selected values (controlled)
 *   onChange    - Called with updated array of selected values
 *   allLabel    - Placeholder text when everything is selected (default: "All")
 *   sorted      - Whether to sort options alphabetically (default: true)
 */
export default function MultiSelect({ label, options, selected = [], onChange, allLabel = 'All', sorted = true }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Close on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Normalize and sort options
  const normalizedOptions = useMemo(() => {
    const opts = options.map((opt) => {
      if (typeof opt === 'string') return { value: opt, label: opt }
      return { value: String(opt.value), label: opt.label ?? String(opt.value) }
    })
    if (!sorted) return opts
    return opts.sort((a, b) => (a.label || '').trim().toLowerCase().localeCompare((b.label || '').trim().toLowerCase()))
  }, [options, sorted])

  const selectedSet = useMemo(() => new Set(selected.map(String)), [selected])

  const allValues = useMemo(() => normalizedOptions.map((o) => o.value), [normalizedOptions])
  const isAllSelected = selected.length === 0 || selected.length === normalizedOptions.length

  const toggleValue = (val) => {
    const valStr = String(val)
    const next = selectedSet.has(valStr)
      ? selected.filter((v) => String(v) !== valStr)
      : [...selected, valStr]
    // If all are now selected, reset to empty (= All)
    if (next.length === normalizedOptions.length) {
      onChange([])
    } else {
      onChange(next)
    }
  }

  const toggleAll = () => {
    if (isAllSelected) {
      // Uncheck All → deselect everything (show none)
      onChange(['__none__'])
    } else {
      // Check All → select all (show everyone)
      onChange([])
    }
  }

  // Display text
  const displayText = useMemo(() => {
    if (selected.length === 0) return allLabel
    if (selected.length === 1 && selected[0] === '__none__') return 'None selected'
    if (selected.length === 1) {
      const opt = normalizedOptions.find((o) => o.value === selected[0])
      return opt ? opt.label : allLabel
    }
    if (selected.length === normalizedOptions.length) return allLabel
    return `${selected.length} selected`
  }, [selected, normalizedOptions, allLabel])

  return (
    <div className="flex flex-col gap-1 relative" ref={ref}>
      {label && <span className="text-[10px] uppercase tracking-wide text-slate-400 font-medium">{label}</span>}
      <button
        type="button"
        className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-slate-50 min-w-[150px] text-left focus:outline-none focus:border-indigo-500 flex items-center justify-between gap-2"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="truncate">{displayText}</span>
        <svg className={`w-3 h-3 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-slate-200 rounded-lg shadow-lg py-1 max-h-60 overflow-y-auto min-w-[180px]">
          {/* All option */}
          <label className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-xs">
            <input
              type="checkbox"
              checked={isAllSelected}
              onChange={toggleAll}
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="font-medium text-slate-600">{allLabel}</span>
          </label>
          <div className="border-t border-slate-100 my-1" />
          {normalizedOptions.map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-xs">
              <input
                type="checkbox"
                checked={isAllSelected || selectedSet.has(opt.value)}
                onChange={() => {
                  if (isAllSelected && selected.length === 0) {
                    // Was "All" — user unchecks one: select all except this one
                    onChange(allValues.filter((v) => v !== opt.value))
                  } else if (selected[0] === '__none__') {
                    // Was "None" — user checks one
                    onChange([opt.value])
                  } else {
                    toggleValue(opt.value)
                  }
                }}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-slate-700">{opt.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
