import useApi from '../../hooks/useApi'
import { getProjectProgressReport } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import UtilizationBar from '../../components/charts/UtilizationBar'
import { formatNumber } from '../../utils/formatters'

export default function ProjectProgressPage() {
  const { data: rows, loading } = useApi(getProjectProgressReport, [])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
        <h2 className="text-xl font-bold text-slate-900">Project Progress</h2>
        <p className="text-xs text-slate-500 mt-0.5">Completion status and hours by project</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => window.print()} title="Export to PDF">
          📄 Export PDF
        </button>
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Project</th><th>Status</th><th>Total Tasks</th><th>Completed</th><th>In Progress</th>
                <th>Not Started</th><th>% Complete</th><th>Est Hrs</th><th>Actual Hrs</th><th>Remaining Hrs</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.project_id}>
                  <td>
                    <div className="font-semibold">{r.project}</div>
                    <div className="text-[10px] text-slate-400">{r.code}</div>
                  </td>
                  <td>{r.status}</td>
                  <td>{r.total_tasks}</td>
                  <td className="text-green-700">{r.completed}</td>
                  <td className="text-blue-700">{r.in_progress}</td>
                  <td className="text-slate-400">{r.not_started}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <UtilizationBar pct={r.pct_complete} status={r.pct_complete >= 90 ? 'healthy' : r.pct_complete > 0 ? 'under' : 'idle'} width={80} />
                      <span className="text-xs font-medium">{r.pct_complete}%</span>
                    </div>
                  </td>
                  <td>{formatNumber(r.estimated_hours)}</td>
                  <td>{formatNumber(r.actual_hours)}</td>
                  <td>{formatNumber(r.remaining_hours)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
