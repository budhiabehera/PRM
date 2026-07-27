import { useState } from 'react'
import useApi from '../../hooks/useApi'
import useAppStore from '../../store/useAppStore'
import { getSprints, createSprint, updateSprint } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import StatusBadge from '../../components/common/StatusBadge'
import SprintForm from '../../components/forms/SprintForm'
import { formatDate, formatNumber, formatPercent } from '../../utils/formatters'

export default function AdminSprintsPage() {
  const bumpRefresh = useAppStore((s) => s.bumpRefresh)
  const { data: sprints, loading, reload } = useApi(getSprints, [])
  const [editing, setEditing] = useState(null)
  const [showForm, setShowForm] = useState(false)

  const refreshAll = () => { reload(); bumpRefresh() }

  const handleSubmit = async (data) => {
    if (editing) await updateSprint(editing.id, data)
    else await createSprint(data)
    setShowForm(false)
    setEditing(null)
    refreshAll()
  }

  if (loading) return <LoadingSpinner label="Loading sprints..." />

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Sprint Management</h2>
          <p className="text-xs text-slate-500 mt-0.5">Configure monthly sprints (Jul–Dec 2026)</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true) }}>+ Add Sprint</button>
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
              <th>Sprint</th><th>Start</th><th>End</th><th>Duration</th><th>Tasks</th>
              <th>Alloc Hrs</th><th>Net Capacity</th><th>Utilization</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sprints.map((s) => (
              <tr key={s.id}>
                <td className="font-semibold">{s.name}</td>
                <td>{formatDate(s.start_date)}</td>
                <td>{formatDate(s.end_date)}</td>
                <td>{s.duration_days} days</td>
                <td>{s.task_count}</td>
                <td>{formatNumber(s.allocated_hours)}</td>
                <td>{formatNumber(s.net_capacity)}</td>
                <td className={s.utilization_pct > 0 ? 'text-amber-700 font-semibold' : 'text-slate-400'}>
                  {formatPercent(s.utilization_pct)}
                </td>
                <td><StatusBadge status={s.status} /></td>
                <td>
                  <button className="btn btn-secondary btn-sm" onClick={() => { setEditing(s); setShowForm(true) }}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
