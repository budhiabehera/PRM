import { STATUS_COLORS } from '../../utils/constants'

export default function StatusBadge({ status }) {
  const cls = STATUS_COLORS[status] || 'bg-slate-100 text-slate-600'
  return <span className={`badge ${cls}`}>{status}</span>
}
