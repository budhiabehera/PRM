import useApi from '../hooks/useApi'
import { getUtilizationGrid } from '../services/api'
import LoadingSpinner from '../components/common/LoadingSpinner'
import { UTIL_STATUS_COLORS } from '../utils/constants'
import { formatPercent } from '../utils/formatters'

export default function UtilizationPage() {
  const { data, loading } = useApi(getUtilizationGrid, [])
  if (loading) return <LoadingSpinner label="Loading utilization grid..." />

  const { sprints, rows } = data

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900">Utilization</h2>
        <p className="text-xs text-slate-500 mt-0.5">Developer × Month utilization grid (leave-adjusted net capacity)</p>
      </div>

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th className="sticky left-0 bg-white">Developer</th>
              <th>Role</th>
              <th>Module</th>
              {sprints.map((m) => <th key={m} className="text-center">{m}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.developer_id}>
                <td className="font-medium sticky left-0 bg-white">{row.developer_name}</td>
                <td>{row.role}</td>
                <td>{row.module || '—'}</td>
                {row.cells.map((cell) => (
                  <td key={cell.sprint_id} className="text-center">
                    <span className={UTIL_STATUS_COLORS[cell.status]}>{formatPercent(cell.utilization_pct)}</span>
                    <div className="text-[10px] text-slate-400">{cell.allocated_hours}/{cell.capacity}h</div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-4 mt-4 text-[11px] text-slate-500">
        <span><span className="text-red-600 font-semibold">■</span> Over-allocated (&gt;100%)</span>
        <span><span className="text-green-700 font-semibold">■</span> Healthy (60–100%)</span>
        <span><span className="text-amber-600 font-semibold">■</span> Under-utilized (1–59%)</span>
        <span><span className="text-slate-400 font-semibold">■</span> Idle (0%)</span>
      </div>
    </div>
  )
}
