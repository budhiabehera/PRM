import { useMemo, useState } from 'react'
import useApi from '../hooks/useApi'
import useDropdowns from '../hooks/useDropdowns'
import useProjectDefault from '../hooks/useProjectDefault'
import { getSprints, getTasks } from '../services/api'
import LoadingSpinner from '../components/common/LoadingSpinner'
import StatusBadge from '../components/common/StatusBadge'
import PriorityBadge from '../components/common/PriorityBadge'
import { formatNumber, formatPercent, formatShortDate } from '../utils/formatters'

export default function SprintPage() {
  const { projects } = useDropdowns()
  const { data: sprints, loading: sprintsLoading } = useApi(getSprints, [])
  const { defaultProjectId, showAllOption, restrictedProjects } = useProjectDefault()
  const [selectedProject, setSelectedProject] = useState(defaultProjectId)
  const [selectedId, setSelectedId] = useState(null)

  // Filter sprints by project if selected
  const filteredSprints = useMemo(() => {
    if (!sprints) return []
    if (!selectedProject) return sprints
    return sprints.filter((s) => !s.project_id || s.project_id === Number(selectedProject))
  }, [sprints, selectedProject])

  const activeSprintId = selectedId || filteredSprints?.find((s) => s.status === 'Active')?.id || filteredSprints?.[0]?.id
  const activeSprint = filteredSprints?.find((s) => s.id === activeSprintId)

  // Pass project_id to task query
  const taskParams = useMemo(() => {
    const p = {}
    if (activeSprintId) p.sprint_id = activeSprintId
    if (selectedProject) p.project_id = selectedProject
    return p
  }, [activeSprintId, selectedProject])

  const { data: tasks, loading: tasksLoading } = useApi(
    () => (activeSprintId ? getTasks(taskParams) : Promise.resolve([])),
    [JSON.stringify(taskParams)]
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
        <div className="flex items-center gap-2">
          <select
            className="form-select min-w-[140px]"
            value={selectedProject}
            onChange={(e) => { setSelectedProject(e.target.value); setSelectedId(null) }}
          >
            {showAllOption && <option value="">All Projects</option>}
            {restrictedProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select
            className="form-select min-w-[200px]"
            value={activeSprintId || ''}
            onChange={(e) => setSelectedId(Number(e.target.value))}
          >
            {filteredSprints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      {activeSprint && (
        <div className="bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl px-7 py-5 text-white mb-6 flex justify-between items-center">
          <div>
            <h3 className="text-lg font-bold mb-1">Sprint: {activeSprint.name}</h3>
            <p className="text-xs opacity-85">
              {formatShortDate(activeSprint.start_date)} – {formatShortDate(activeSprint.end_date)} ·{' '}
              <span title="Total tasks assigned to this sprint">{activeSprint.task_count} tasks</span> · <span title="Sum of estimated_hours for all tasks in this sprint">{formatNumber(activeSprint.allocated_hours)} hrs allocated</span>
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold font-mono" title="(Allocated Hours ÷ Net Capacity) × 100%">{formatPercent(activeSprint.utilization_pct)}</div>
            <div className="text-[11px] opacity-80" title="(Allocated Hours ÷ Net Capacity) × 100%">Team Utilization ⓘ</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3.5 mb-6">
        <div className="card text-center !mb-0">
          <div className="text-2xl font-bold font-mono">{committed}</div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400 mt-1" title="Tasks marked as delivery-committed to customers">Customer Committed ⓘ</div>
        </div>
        <div className="card text-center !mb-0">
          <div className="text-2xl font-bold font-mono">{internal}</div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400 mt-1" title="Tasks not committed to external customers">Internal / Non-Committed ⓘ</div>
        </div>
        <div className="card text-center !mb-0">
          <div className="text-2xl font-bold font-mono">{activeSprint?.net_capacity ? formatNumber(activeSprint.net_capacity) : '—'}</div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400 mt-1" title="Team capacity adjusted for leave. Formula: Σ(base_capacity - (base_capacity/22 × leave_days)) for all project developers">Net Capacity (hrs) ⓘ</div>
        </div>
      </div>

      <div className="card">
        <div className="text-[15px] font-semibold mb-3.5">Sprint Tasks — {activeSprint?.name}</div>
        {tasksLoading ? <LoadingSpinner /> : (
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th><th>Task</th><th>Sub Module</th><th>Resource</th><th>Work Type</th><th>Priority</th><th>Status</th>
                <th title="Estimated hours for the task">Est</th><th title="Hours logged via activity entries">Actual</th><th title="Task completion percentage (from latest activity log)">%</th>
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
