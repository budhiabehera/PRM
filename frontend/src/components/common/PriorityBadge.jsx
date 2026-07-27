import { PRIORITY_COLORS } from '../../utils/constants'

export default function PriorityBadge({ priority }) {
  const cls = PRIORITY_COLORS[priority] || 'bg-slate-100 text-slate-600'
  return <span className={`badge ${cls}`}>{priority}</span>
}
