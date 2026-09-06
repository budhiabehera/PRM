import { useMemo, useState } from 'react'
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

  const handleExportPDF = () => {
    const now = new Date()
    const generated = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

    const buildTable = (headers, rows) => {
      const ths = headers.map(h => `<th>${h}</th>`).join('')
      const trs = rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')
      return `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`
    }

    const fmtDate = (isoStr) => {
      if (!isoStr) return '—'
      const d = new Date(isoStr + 'T00:00:00')
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }

    let deadlinesHtml = ''
    if (upcoming_deadlines.length > 0) {
      deadlinesHtml = `<div class="section"><div class="section-title">Upcoming Deadlines</div>${buildTable(
        ['Task', 'Description', 'Priority', 'Due Date'],
        upcoming_deadlines.map(t => [t.task_code, t.description || '—', `<span class="badge">${t.priority}</span>`, fmtDate(t.end_date)])
      )}</div>`
    }

    let activityHtml = ''
    if (recent_activity.length > 0) {
      // Group activities by task_code for print
      const groupMap = {}
      for (const a of recent_activity) {
        const key = a.task_code || 'Unknown'
        if (!groupMap[key]) groupMap[key] = { task_code: key, task_description: a.task_description || '', activities: [], total: 0 }
        groupMap[key].activities.push(a)
        groupMap[key].total += a.hours_spent || 0
      }
      const groups = Object.values(groupMap)
      activityHtml = `<div class="section"><div class="section-title">Recent Activity</div>`
      for (const g of groups) {
        activityHtml += `<div style="margin-bottom:12px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">`
        activityHtml += `<div style="background:#f8fafc;padding:8px 12px;font-size:12px;display:flex;justify-content:space-between;align-items:center;">`
        activityHtml += `<span><b style="color:#4f46e5;font-family:monospace;">${g.task_code}</b> &nbsp; ${g.task_description}</span>`
        activityHtml += `<span><b>${g.total}h</b> (${g.activities.length} ${g.activities.length === 1 ? 'entry' : 'entries'})</span></div>`
        activityHtml += buildTable(['Date', 'Description', 'Hours'],
          g.activities.map(a => [fmtDate(a.activity_date), a.description || '—', `${a.hours_spent}h`])
        )
        activityHtml += `</div>`
      }
      activityHtml += `</div>`
    }

    const html = `<!DOCTYPE html><html><head><title>My Dashboard Report</title><style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; color: #1e293b; font-size: 12px; }
      h1 { font-size: 20px; margin-bottom: 2px; }
      .subtitle { font-size: 12px; color: #64748b; margin-bottom: 20px; }
      .kpi-row { display: flex; gap: 12px; margin-bottom: 24px; }
      .kpi-card { flex: 1; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; text-align: center; }
      .kpi-value { font-size: 22px; font-weight: 700; color: #1e293b; }
      .kpi-label { font-size: 10px; text-transform: uppercase; color: #64748b; margin-top: 4px; }
      .section { margin-bottom: 24px; }
      .section-title { font-size: 14px; font-weight: 600; margin-bottom: 8px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
      th { padding: 6px 10px; border-bottom: 2px solid #cbd5e1; font-size: 11px; text-transform: uppercase; color: #475569; text-align: left; }
      td { padding: 6px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 8px; font-size: 10px; font-weight: 600; }
      .generated { margin-top: 24px; font-size: 10px; color: #94a3b8; }
      @media print { body { padding: 0; } }
    </style></head><body>
      <h1>My Dashboard Report</h1>
      <div class="subtitle">${user?.name || 'User'} | Generated on ${generated}</div>
      <div class="kpi-row">
        <div class="kpi-card"><div class="kpi-value">${summary.total}</div><div class="kpi-label">Total Assigned</div></div>
        <div class="kpi-card"><div class="kpi-value">${summary.in_progress}</div><div class="kpi-label">In Progress</div></div>
        <div class="kpi-card"><div class="kpi-value">${summary.completed}</div><div class="kpi-label">Completed</div></div>
        <div class="kpi-card"><div class="kpi-value" style="color:${summary.overdue > 0 ? '#dc2626' : '#1e293b'}">${summary.overdue}</div><div class="kpi-label">Overdue</div></div>
      </div>
      ${deadlinesHtml}
      ${activityHtml}
      <div class="generated">PRM Report — ${generated}</div>
      <script>window.onload = function() { window.print(); }<\/script>
    </body></html>`

    const printWindow = window.open('', '_blank')
    printWindow.document.write(html)
    printWindow.document.close()
  }

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
        <button className="btn btn-secondary px-5 py-2 text-sm flex items-center gap-2 whitespace-nowrap" onClick={handleExportPDF} title="Export to PDF">
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
      <GroupedActivity activities={recent_activity} />
    </div>
  )
}

// --- Helper Components ---

function GroupedActivity({ activities }) {
  const [expanded, setExpanded] = useState({})

  // Group activities by task_code
  const grouped = useMemo(() => {
    const map = {}
    for (const a of activities) {
      const key = a.task_code || 'Unknown'
      if (!map[key]) {
        map[key] = {
          task_code: key,
          task_description: a.task_description || a.description || '',
          activities: [],
          total_hours: 0,
        }
      }
      map[key].activities.push(a)
      map[key].total_hours += a.hours_spent || 0
    }
    // Sort groups by latest activity date (most recent first)
    return Object.values(map).sort((a, b) => {
      const dateA = a.activities[0]?.activity_date || ''
      const dateB = b.activities[0]?.activity_date || ''
      return dateB.localeCompare(dateA)
    })
  }, [activities])

  const toggle = (code) => setExpanded((prev) => ({ ...prev, [code]: !prev[code] }))

  // Auto-expand all groups on first render
  useMemo(() => {
    const init = {}
    grouped.forEach((g) => { init[g.task_code] = true })
    setExpanded(init)
  }, [grouped.length])

  if (activities.length === 0) {
    return (
      <div className="card">
        <div className="text-[15px] font-semibold mb-3.5">Recent Activity</div>
        <p className="text-sm text-slate-400">No recent activity entries</p>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="text-[15px] font-semibold mb-3.5">Recent Activity</div>
      <div className="flex flex-col gap-2">
        {grouped.map((group) => (
          <div key={group.task_code} className="border border-slate-200 rounded-lg overflow-hidden">
            {/* Group Header — clickable */}
            <button
              className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
              onClick={() => toggle(group.task_code)}
            >
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-slate-400">{expanded[group.task_code] ? '▼' : '▶'}</span>
                <span className="font-mono text-sm font-semibold text-indigo-600">{group.task_code}</span>
                <span className="text-sm text-slate-600 truncate max-w-[300px]">{group.task_description}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500">{group.activities.length} {group.activities.length === 1 ? 'entry' : 'entries'}</span>
                <span className="font-mono text-sm font-semibold text-slate-700">{group.total_hours}h</span>
              </div>
            </button>
            {/* Activity Rows */}
            {expanded[group.task_code] && (
              <div className="divide-y divide-slate-100">
                {group.activities.map((a) => (
                  <div key={a.id} className="flex items-center px-4 py-2 text-sm">
                    <span className="w-24 text-xs text-slate-500 whitespace-nowrap">{formatDate(a.activity_date)}</span>
                    <span className="flex-1 text-slate-700 truncate" title={a.description}>{a.description}</span>
                    <span className="font-mono text-xs text-slate-600 ml-4">{a.hours_spent}h</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function PriorityBadge({ priority }) {
  const cls = PRIORITY_COLORS[priority] || 'bg-slate-100 text-slate-600'
  return <span className={`badge ${cls}`}>{priority}</span>
}

function formatDate(isoStr) {
  if (!isoStr) return '—'
  const d = new Date(isoStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
