import { useState } from 'react'
import useApi from '../../hooks/useApi'
import useAppStore from '../../store/useAppStore'
import { getWorkTypes, createWorkType, updateWorkType, deleteWorkType } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import WorkTypeForm from '../../components/forms/WorkTypeForm'
import ConfirmDialog from '../../components/common/ConfirmDialog'
import UtilizationBar from '../../components/charts/UtilizationBar'

export default function AdminWorkTypesPage() {
  const bumpRefresh = useAppStore((s) => s.bumpRefresh)
  const { data: workTypes, loading, reload } = useApi(getWorkTypes, [])
  const [editing, setEditing] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [toDelete, setToDelete] = useState(null)

  const refreshAll = () => { reload(); bumpRefresh() }

  const handleSubmit = async (data) => {
    if (editing) await updateWorkType(editing.id, data)
    else await createWorkType(data)
    setShowForm(false)
    setEditing(null)
    refreshAll()
  }

  const handleDelete = async () => {
    await deleteWorkType(toDelete.id)
    setToDelete(null)
    refreshAll()
  }

  if (loading) return <LoadingSpinner label="Loading work types..." />

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Work Types</h2>
          <p className="text-xs text-slate-500 mt-0.5">Define work categories and customer commitment flags</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true) }}>+ Add Work Type</button>
      </div>

      {showForm && (
        <div className="card">
          <div className="text-[15px] font-semibold mb-4">➕ {editing ? 'Edit Work Type' : 'Add New Work Type'}</div>
          <WorkTypeForm initial={editing} onSubmit={handleSubmit} onCancel={() => { setShowForm(false); setEditing(null) }} />
        </div>
      )}

      <div className="card">
        <div className="text-[15px] font-semibold mb-3.5">All Work Types</div>
        <table className="data-table">
          <thead>
            <tr><th>Work Type</th><th>Customer Committed</th><th>Tasks</th><th>Est Hours</th><th>Actual Hours</th><th>Completion</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {workTypes.map((wt) => (
              <tr key={wt.id}>
                <td className="font-semibold">{wt.name}</td>
                <td>{wt.customer_committed ? <span className="badge bg-green-100 text-green-700">Yes</span> : <span className="badge bg-slate-100 text-slate-500">No</span>}</td>
                <td>{wt.tasks}</td>
                <td>{wt.estimated_hours}</td>
                <td>{wt.actual_hours}</td>
                <td><UtilizationBar pct={wt.completion_pct} status={wt.completion_pct >= 90 ? 'healthy' : wt.completion_pct > 0 ? 'under' : 'idle'} /></td>
                <td>
                  <div className="flex gap-1.5">
                    <button className="btn btn-secondary btn-sm" onClick={() => { setEditing(wt); setShowForm(true) }}>Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={() => setToDelete(wt)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!toDelete}
        message={`Delete work type "${toDelete?.name}"?`}
        onConfirm={handleDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  )
}
