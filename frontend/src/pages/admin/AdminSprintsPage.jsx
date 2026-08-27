import { useState, useMemo } from 'react'
import useApi from '../../hooks/useApi'
import useDropdowns from '../../hooks/useDropdowns'
import useProjectDefault from '../../hooks/useProjectDefault'
import useAppStore from '../../store/useAppStore'
import { getSprints, createSprint, updateSprint } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import StatusBadge from '../../components/common/StatusBadge'
import FilterSelect from '../../components/common/FilterSelect'
import SprintForm from '../../components/forms/SprintForm'
import { formatDate, formatNumber, formatPercent } from '../../utils/formatters'

export default function AdminSprintsPage() {
  const { projects } = useDropdowns()
  const { defaultProjectId, showAllOption, restrictedProjects } = useProjectDefault()
  const bumpRefresh = useAppStore((s) => s.bumpRefresh)
  const { data: sprints, loading, reload } = useApi(getSprints, [])
  const [editing, setEditing] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [projectFilter, setProjectFilter] = useState(defaultProjectId)

  const refreshAll = () => { reload(); bumpRefresh() }

  const handleSubmit = async (data) => {
    if (editing) await updateSprint(editing.id, data)
    else await createSprint(data)
    setShowForm(false)
    setEditing(null)
    refreshAll()
  }

  // Project options for filter
  const projectOptions = useMemo(() =>
    restrictedProjects.map((p) => ({ value: String(p.id), label: p.name })),
    [restrictedProjects]
  )

  if (loading) return <LoadingSpinner label="Loading sprints..." />

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Sprint Management</h2>
          <p className="text-xs text-slate-500 mt-0.5">Configure monthly sprints (Jul–Dec 2026)</p>
        </div>
        <div className="flex items-center gap-3">
          <FilterSelect
            label="Project"
            options={projectOptions}
            value={projectFilter}
            onChange={setProjectFilter}
            showAll={showAllOption}
            allLabel="All"
          />
          <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true) }}>+ Add Sprint</button>
        </div>
      </div>

      {showForm && (
        <div className="card">
          <div className="text-[15px] font-semibold mb-4">➕ {editing ? 'Edit Sprint' : 'Add New Sprint'}</div>
          <SprintForm initial={editing} onSubmit={handleSubmit} onCancel={() => { setShowForm(false); setEditing(null) }} />
        </div>
      )}

      <div className="card">
        <div className="text-[15px] font-semibold mb-3.5">All Sprints</div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Sprint</th><th>Project</th><th>Start</th><th>End</th><th>Duration</th>
              <th title="Number of tasks assigned to this sprint">Tasks</th>
              <th title="Sum of estimated hours for all sprint tasks">Alloc Hrs</th>
              <th title="Sum of project developers' monthly capacity minus leave deductions. Formula: Σ(base_capacity - (base_capacity/22 × leave_days))">Net Capacity</th>
              <th title="(Allocated Hours ÷ Net Capacity) × 100%">Utilization</th>
              <th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sprints
            .filter((s) => !projectFilter || !s.project_id || String(s.project_id) === projectFilter)
            .map((s) => {
              // If project filter is set, recalculate task/hour counts for that project
              const filteredTasks = projectFilter
                ? (s.tasks_by_project?.[projectFilter] || { count: 0, hours: 0 })
                : null
              const taskCount = filteredTasks ? filteredTasks.count : s.task_count
              const allocHours = filteredTasks ? filteredTasks.hours : s.allocated_hours
              const utilPct = filteredTasks
                ? (s.net_capacity > 0 ? round((allocHours / s.net_capacity) * 100) : 0)
                : s.utilization_pct

              return (
                <tr key={s.id}>
                  <td className="font-semibold">{s.name}</td>
                  <td className="text-xs text-slate-600">{s.project_name || '—'}</td>
                  <td>{formatDate(s.start_date)}</td>
                  <td>{formatDate(s.end_date)}</td>
                  <td>{s.duration_days} days</td>
                  <td>{taskCount}</td>
                  <td>{formatNumber(allocHours)}</td>
                  <td>{formatNumber(s.net_capacity)}</td>
                  <td className={s.utilization_pct > 0 ? 'text-amber-700 font-semibold' : 'text-slate-400'}>
                    {formatPercent(filteredTasks ? utilPct : s.utilization_pct)}
                  </td>
                  <td><StatusBadge status={s.status} /></td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setEditing(s); setShowForm(true) }}>Edit</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function round(v) { return Math.round(v) }
