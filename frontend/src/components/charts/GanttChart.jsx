import { PRIORITY_COLORS } from '../../utils/constants'
import { formatShortDate } from '../../utils/formatters'

const BAR_COLORS = {
  'Completed': '#22c55e',
  'In Progress': '#3b82f6',
  'Not Started': '#94a3b8',
  'On Hold': '#f59e0b',
}

export default function GanttChart({ tasks }) {
  if (!tasks || tasks.length === 0) return null

  const starts = tasks.map((t) => new Date(t.start_date).getTime())
  const ends = tasks.map((t) => new Date(t.end_date).getTime())
  const rangeStart = Math.min(...starts)
  const rangeEnd = Math.max(...ends)
  const totalSpan = Math.max(rangeEnd - rangeStart, 1)

  return (
    <div className="space-y-2">
      {tasks.map((t) => {
        const start = new Date(t.start_date).getTime()
        const end = new Date(t.end_date).getTime()
        const leftPct = ((start - rangeStart) / totalSpan) * 100
        const widthPct = Math.max(((end - start) / totalSpan) * 100, 1.5)
        const color = BAR_COLORS[t.status] || '#94a3b8'
        return (
          <div key={t.id} className="flex items-center gap-3 text-xs">
            <div className="w-56 flex-shrink-0 truncate">
              <span className="font-medium text-slate-700">{t.task_code}</span>{' '}
              <span className="text-slate-500">{t.description}</span>
            </div>
            <div className="flex-1 relative h-6 bg-slate-100 rounded-md">
              <div
                className="absolute top-0.5 h-5 rounded-md flex items-center px-2 text-[10px] text-white font-medium overflow-hidden whitespace-nowrap"
                style={{ left: `${leftPct}%`, width: `${widthPct}%`, background: color }}
                title={`${t.description} — ${formatShortDate(t.start_date)} → ${formatShortDate(t.end_date)}`}
              >
                {t.percent_complete}%
              </div>
            </div>
            <div className="w-16 text-right text-slate-400 flex-shrink-0">{t.developer || '—'}</div>
          </div>
        )
      })}
    </div>
  )
}
