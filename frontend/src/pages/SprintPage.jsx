import { useMemo, useState } from 'react'
import useApi from '../hooks/useApi'
import { getSprints, getTasks } from '../services/api'
import LoadingSpinner from '../components/common/LoadingSpinner'
import StatusBadge from '../components/common/StatusBadge'
import PriorityBadge from '../components/common/PriorityBadge'
import { formatNumber, formatPercent, formatShortDate } from '../utils/formatters'

export default function SprintPage() {
  const { data: sprints, loading: sprintsLoading } = useApi(getSprints, [])
  const [selectedId, setSelectedId] = useState(null)

  const activeSprintId = selectedId || sprints?.find((s) => s.status === 'Active')?.id || sprints?.[0]?.id
  const activeSprint = sprints?.find((s) => s.id === activeSprintId)

  const { data: tasks, loading: tasksLoading } = useApi(
    () => (activeSprintId ? getTasks({ sprint_id: activeSprintId }) : Promise.resolve([])),
    [activeSprintId]
  )

  const committed = useMemo(() => tasks?.filter((t) => t.customer_committed).length || 0, [tasks])
  const internal = useMemo(() => tasks?.filter((t) => !t.customer_committed).length || 0, [tasks])

  if (sprintsLoading) return <LoadingSpinner label="Loading sprints..." />

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Sprint View</h2>
          <p className="text-xs text-slate-500 mt-0.5">Monthly sprint drill-down with task detail</p>
        </div>
        <select
          className="form-select max-w-[160px]"
          value={activeSprintId || ''}
          onChange={(e) => setSelectedId(Number(e.target.value))}
        >
          {sprints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {activeSprint && (
        <div className="bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl px-7 py-5 text-white mb-6 flex justify-between items-center">
          <div>
            <h3 className="text-lg font-bold mb-1">Sprint: {activeSprint.name}</h3>
            <p className="text-xs opacity-85">
              {formatShortDate(activeSprint.start_date)} – {formatShortDate(activeSprint.end_date)} ·
              {' '}{activeSprint.task_count} tasks · {formatNumber(activeSprint.allocated_hours)} hrs allocated
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold font-mono">{formatPercent(activeSprint.utilization_pct)}</div>
            <div className="text-[11px] opacity-80">Team Utilization</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3.5 mb-6">
        <div className="card text-center !mb-0">
          <div className="text-2xl font-bold font-mono">{committed}</div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400 mt-1">Customer Committed</div>
        </div>
        <div className="card text-center !mb-0">
          <div className="text-2xl font-bold font-mono">{internal}</div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400 mt-1">Internal / Non-Committed</div>
        </div>
        <div className="card text-center !mb-0">
          <div className="text-2xl font-bold font-mono">{activeSprint?.net_capacity ? formatNumber(activeSprint.net_capacity) : '—'}</div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400 mt-1">Net Capacity (hrs)</div>
        </div>
      </div>

      <div className="card">
        <div className="text-[15px] font-semibold mb-3.5">Sprint Tasks — {activeSprint?.name}</div>
        {tasksLoading ? <LoadingSpinner /> : (
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th><th>Task</th><th>Sub Module</th><th>Developer</th><th>Work Type</th>
                <th>Priority</th><th>Status</th><th>Est</th><th>Actual</th><th>%</th>
              </tr>
            </thead>
            <tbody>
              {tasks?.map((t) => (
                <tr key={t.id}>
                  <td className="font-medium">{t.task_code}</td>
                  <td className="max-w-xs truncate">{t.description}</td>
                  <td>{t.sub_module_name || '—'}</td>
                  <td>{t.developer_name || '—'}</td>
                  <td>{t.work_type_name || '—'}</td>
                  <td><PriorityBadge priority={t.priority} /></td>
                  <td><StatusBadge status={t.status} /></td>
                  <td>{t.estimated_hours}</td>
                  <td>{t.actual_hours}</td>
                  <td>{t.percent_complete}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
