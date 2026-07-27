import { UTIL_FILL_COLORS } from '../../utils/constants'

export default function UtilizationBar({ pct, status, width = 120 }) {
  const clamped = Math.min(Math.max(pct, 0), 150)
  const color = UTIL_FILL_COLORS[status] || UTIL_FILL_COLORS.idle
  return (
    <div className="bg-slate-200 rounded-full h-1.5 overflow-hidden" style={{ width }}>
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.min(clamped, 100)}%`, background: color }}
      />
    </div>
  )
}
