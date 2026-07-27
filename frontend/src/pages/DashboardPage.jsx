import useApi from '../hooks/useApi'
import {
  getKpis, getStatusBreakdown, getProjectBreakdown, getWorkTypeBreakdown,
  getModuleBreakdown, getSubModuleBreakdown, getMonthlyUtilization,
} from '../services/api'
import KPICard from '../components/common/KPICard'
import LoadingSpinner from '../components/common/LoadingSpinner'
import StatusDonut from '../components/charts/StatusDonut'
import MonthlyTrend from '../components/charts/MonthlyTrend'
import StatusBadge from '../components/common/StatusBadge'
import { formatNumber, formatPercent } from '../utils/formatters'

export default function DashboardPage() {
  const { data: kpis, loading: l1 } = useApi(getKpis, [])
  const { data: statusData, loading: l2 } = useApi(getStatusBreakdown, [])
  const { data: projectData, loading: l3 } = useApi(getProjectBreakdown, [])
  const { data: workTypeData, loading: l4 } = useApi(getWorkTypeBreakdown, [])
  const { data: moduleData, loading: l5 } = useApi(getModuleBreakdown, [])
  const { data: subModuleData, loading: l6 } = useApi(getSubModuleBreakdown, [])
  const { data: monthlyData, loading: l7 } = useApi(getMonthlyUtilization, [])

  const loading = l1 || l2 || l3 || l4 || l5 || l6 || l7
  if (loading) return <LoadingSpinner label="Loading dashboard..." />

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900">Dashboard</h2>
        <p className="text-xs text-slate-500 mt-0.5">Program-wide KPIs across projects, modules, and sprints</p>
      </div>

      <div className="grid grid-cols-5 gap-3.5 mb-6">
        <KPICard label="Total Developers" value={kpis.total_developers} />
        <KPICard label="Total Tasks" value={kpis.total_tasks} />
        <KPICard label="Total Est. Hours" value={formatNumber(kpis.total_estimated_hours)} />
        <KPICard label="Customer Committed" value={kpis.customer_committed_tasks} />
        <KPICard label="Cross-Month Tasks" value={kpis.cross_month_tasks} />
      </div>

      <div className="grid grid-cols-[1.4fr_1fr] gap-5">
        <div className="card">
          <div className="text-[15px] font-semibold mb-3.5">Tasks by Status</div>
          <table className="data-table">
            <thead><tr><th>Status</th><th>Count</th><th>Est Hrs</th></tr></thead>
            <tbody>
              {statusData.map((row) => (
                <tr key={row.status}>
                  <td><StatusBadge status={row.status} /></td>
                  <td>{row.count}</td>
                  <td>{formatNumber(row.estimated_hours)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className="text-[15px] font-semibold mb-3.5">Status Distribution</div>
          <StatusDonut data={statusData} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div className="card">
          <div className="text-[15px] font-semibold mb-3.5">Tasks by Project</div>
          <table className="data-table">
            <thead><tr><th>Project</th><th>Tasks</th><th>Est Hrs</th><th>Remaining</th></tr></thead>
            <tbody>
              {projectData.map((row) => (
                <tr key={row.project}>
                  <td className="font-medium">{row.project}</td>
                  <td>{row.tasks}</td>
                  <td>{formatNumber(row.estimated_hours)}</td>
                  <td>{formatNumber(row.remaining_hours)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className="text-[15px] font-semibold mb-3.5">Hours by Work Type</div>
          <table className="data-table">
            <thead><tr><th>Work Type</th><th>Committed?</th><th>Tasks</th><th>Est</th><th>Actual</th></tr></thead>
            <tbody>
              {workTypeData.map((row) => (
                <tr key={row.work_type}>
                  <td className="font-medium">{row.work_type}</td>
                  <td>{row.customer_committed ? <span className="badge bg-green-100 text-green-700">Yes</span> : <span className="badge bg-slate-100 text-slate-500">No</span>}</td>
                  <td>{row.tasks}</td>
                  <td>{formatNumber(row.estimated_hours)}</td>
                  <td>{formatNumber(row.actual_hours)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div className="card">
          <div className="text-[15px] font-semibold mb-3.5">Tasks by Main Module</div>
          <table className="data-table">
            <thead><tr><th>Module</th><th>Devs</th><th>Tasks</th><th>Est Hrs</th></tr></thead>
            <tbody>
              {moduleData.map((row) => (
                <tr key={row.module}>
                  <td className="font-medium">{row.module}</td>
                  <td>{row.developers}</td>
                  <td>{row.tasks}</td>
                  <td>{formatNumber(row.estimated_hours)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className="text-[15px] font-semibold mb-3.5">Tasks by Sub Module</div>
          <table className="data-table">
            <thead><tr><th>Sub Module</th><th>Main Module</th><th>Tasks</th><th>Est Hrs</th></tr></thead>
            <tbody>
              {subModuleData.map((row) => (
                <tr key={row.sub_module}>
                  <td className="font-medium">{row.sub_module}</td>
                  <td>{row.main_module}</td>
                  <td>{row.tasks}</td>
                  <td>{formatNumber(row.estimated_hours)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="text-[15px] font-semibold mb-3.5">Monthly Utilization Summary</div>
        <MonthlyTrend data={monthlyData} />
        <table className="data-table mt-4">
          <thead><tr><th>Month</th><th>Alloc Hrs</th><th>Net Cap</th><th>Util %</th><th>Over</th><th>Healthy</th><th>Idle</th></tr></thead>
          <tbody>
            {monthlyData.map((row) => (
              <tr key={row.month}>
                <td className="font-medium">{row.month}</td>
                <td>{formatNumber(row.allocated_hours)}</td>
                <td>{formatNumber(row.net_capacity)}</td>
                <td>{formatPercent(row.utilization_pct)}</td>
                <td className="text-red-600">{row.over_count}</td>
                <td className="text-green-700">{row.healthy_count}</td>
                <td className="text-slate-400">{row.idle_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
