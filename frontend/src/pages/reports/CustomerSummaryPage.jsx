import useApi from '../../hooks/useApi'
import { getCustomerSummaryReport } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import UtilizationBar from '../../components/charts/UtilizationBar'
import { formatNumber } from '../../utils/formatters'

export default function CustomerSummaryPage() {
  const { data: rows, loading } = useApi(getCustomerSummaryReport, [])

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900">Customer Summary</h2>
        <p className="text-xs text-slate-500 mt-0.5">Task volume and hours by customer/property — who the team is spending time on</p>
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Customer</th><th>Total Tasks</th><th>Completed</th><th>Customer Committed</th>
                <th>% Complete</th><th>Est Hrs</th><th>Actual Hrs</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.customer}>
                  <td className="font-semibold">{r.customer}</td>
                  <td>{r.total_tasks}</td>
                  <td className="text-green-700">{r.completed}</td>
                  <td>{r.committed_tasks}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <UtilizationBar pct={r.pct_complete} status={r.pct_complete >= 90 ? 'healthy' : r.pct_complete > 0 ? 'under' : 'idle'} width={80} />
                      <span className="text-xs font-medium">{r.pct_complete}%</span>
                    </div>
                  </td>
                  <td>{formatNumber(r.estimated_hours)}</td>
                  <td>{formatNumber(r.actual_hours)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <div className="text-center py-10 text-sm text-slate-400">No customer/property data on any tasks yet.</div>
          )}
        </div>
      )}
    </div>
  )
}
