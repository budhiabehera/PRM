import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import useApi from '../hooks/useApi'
import useAuthStore from '../store/useAuthStore'
import { getMyDashboardSummary } from '../services/api'
import KPICard from '../components/common/KPICard'
import LoadingSpinner from '../components/common/LoadingSpinner'
import { PRIORITY_COLORS } from '../utils/constants'

export default function MyDashboardPage() {
  const user = useAuthStore((s) => s.user)

  const { data, loading, error } = useApi(() => getMyDashboardSummary(), [user?.developer_id])

  if (loading || !data) return <LoadingSpinner label="Loading your dashboard..." />
  if (error) return <div className="text-red-600 text-sm p-4">Failed to load dashboard data.</div>

  const { summary, upcoming_deadlines, workload_by_project, recent_activity } = data

  return (
    <div>
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
        <h2 className="text-xl font-bold text-slate-900">My Dashboard</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Your personal task overview, upcoming deadlines, and workload
        </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => window.print()} title="Export to PDF">
          📄 Export PDF
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3.5 mb-6">
        <KPICard label="Total Assigned" value={summary.total} tooltip="All tasks assigned to you (regardless of status)" />
        <KPICard label="In Progress" value={summary.in_progress} tooltip="Tasks currently with status 'Inprogress'" />
        <KPICard label="Completed" value={summary.completed} tooltip="Tasks with status 'Completed'" />
        <KPICard
          label="Overdue"
          value={summary.overdue}
          sub={summary.overdue > 0 ? 'Needs attention' : null}
          tooltip="Tasks past their end date that are not yet completed"
        />
      </div>

      {/* Upcoming Deadlines + Workload Chart */}
      <div className="grid grid-cols-[1.2fr_1fr] gap-5 mb-5">
        {/* Upcoming Deadlines */}
        <div className="card">
          <div className="text-[15px] font-semibold mb-3.5">Upcoming Deadlines</div>
          {upcoming_deadlines.length === 0 ? (
            <p className="text-sm text-slate-400">No tasks due in the next 7 days 🎉</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Description</th>
                  <th>Priority</th>
                  <th>Due Date</th>
                </tr>
              </thead>
              <tbody>
                {upcoming_deadlines.map((t) => (
                  <tr key={t.id}>
                    <td className="font-mono text-xs font-medium">{t.task_code}</td>
                    <td className="max-w-[200px] truncate" title={t.description}>
                      {t.description}
                    </td>
                    <td>
                      <PriorityBadge priority={t.priority} />
                    </td>
                    <td className="text-xs whitespace-nowrap">{formatDate(t.end_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Workload by Project */}
        <div className="card">
          <div className="text-[15px] font-semibold mb-3.5">My Workload</div>
          {workload_by_project.length === 0 ? (
            <p className="text-sm text-slate-400">No active tasks assigned</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={workload_by_project} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="project"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tickLine={false}
                  label={{ value: 'Hours', angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: '#94a3b8' } }}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                  formatter={(value) => [`${value} hrs`, 'Est. Hours']}
                />
                <Bar dataKey="hours" fill="#4f46e5" radius={[4, 4, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card">
        <div className="text-[15px] font-semibold mb-3.5">Recent Activity</div>
        {recent_activity.length === 0 ? (
          <p className="text-sm text-slate-400">No recent activity entries</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Task</th>
                <th>Description</th>
                <th>Hours</th>
              </tr>
            </thead>
            <tbody>
              {recent_activity.map((a) => (
                <tr key={a.id}>
                  <td className="text-xs whitespace-nowrap">{formatDate(a.activity_date)}</td>
                  <td className="font-mono text-xs font-medium">{a.task_code}</td>
                  <td className="max-w-[300px] truncate" title={a.description}>
                    {a.description}
                  </td>
                  <td className="font-mono text-xs">{a.hours_spent}h</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// --- Helper Components ---

function PriorityBadge({ priority }) {
  const cls = PRIORITY_COLORS[priority] || 'bg-slate-100 text-slate-600'
  return <span className={`badge ${cls}`}>{priority}</span>
}

function formatDate(isoStr) {
  if (!isoStr) return '—'
  const d = new Date(isoStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
