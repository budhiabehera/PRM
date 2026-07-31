import { useState } from 'react'
import useApi from '../../hooks/useApi'
import { getRoleCapacities, createRoleCapacity, updateRoleCapacity, deleteRoleCapacity } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import Modal from '../../components/common/Modal'
import ConfirmDialog from '../../components/common/ConfirmDialog'

export default function RoleCapacityPage() {
  const { data: roleCapacities, loading, reload } = useApi(getRoleCapacities, [])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [toDelete, setToDelete] = useState(null)
  const [toast, setToast] = useState(null)
  const [form, setForm] = useState({ role: '', capacity_hours: '', description: '' })
  const [errors, setErrors] = useState({})

  const showToast = (type, text) => {
    setToast({ type, text })
    setTimeout(() => setToast(null), 4000)
  }

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const openCreate = () => {
    setEditing(null)
    setForm({ role: '', capacity_hours: '', description: '' })
    setErrors({})
    setShowForm(true)
  }

  const openEdit = (rc) => {
    setEditing(rc)
    setForm({ role: rc.role, capacity_hours: rc.capacity_hours, description: rc.description || '' })
    setErrors({})
    setShowForm(true)
  }

  const validate = () => {
    const errs = {}
    if (!form.role.trim()) errs.role = 'Role is required'
    if (!form.capacity_hours || Number(form.capacity_hours) <= 0) errs.capacity_hours = 'Capacity must be greater than 0'
    return errs
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    try {
      const payload = {
        role: form.role.trim(),
        capacity_hours: Number(form.capacity_hours),
        description: form.description.trim(),
      }
      if (editing) {
        await updateRoleCapacity(editing.id, payload)
        showToast('success', 'Role capacity updated')
      } else {
        await createRoleCapacity(payload)
        showToast('success', 'Role capacity created')
      }
      setShowForm(false)
      setEditing(null)
      reload()
    } catch (err) {
      setErrors({ _general: err.response?.data?.detail || 'Could not save' })
    }
  }

  const handleDelete = async () => {
    try {
      await deleteRoleCapacity(toDelete.id)
      setToDelete(null)
      showToast('success', 'Role capacity deleted')
      reload()
    } catch (err) {
      showToast('error', err.response?.data?.detail || 'Could not delete')
      setToDelete(null)
    }
  }

  if (loading) return <LoadingSpinner label="Loading role capacities..." />

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Role Capacity</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Define default monthly capacity (hours) for each role. This auto-fills capacity in User Setup.
          </p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ Add Role</button>
      </div>

      {toast && (
        <div className={`mb-4 px-4 py-2 rounded-lg text-sm font-medium ${toast.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {toast.text}
        </div>
      )}

      {/* Table */}
      <div className="card">
        <div className="text-[15px] font-semibold mb-3.5">All Role Capacities ({roleCapacities?.length ?? 0})</div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Capacity (hrs/month)</th>
                <th>Description</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {roleCapacities?.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-slate-400 py-6 text-sm">
                    No role capacities defined yet. Add one to get started.
                  </td>
                </tr>
              )}
              {roleCapacities?.map((rc) => (
                <tr key={rc.id}>
                  <td className="font-semibold">{rc.role}</td>
                  <td>
                    <span className="bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full text-xs font-semibold">
                      {rc.capacity_hours} hrs
                    </span>
                  </td>
                  <td className="text-slate-500">{rc.description || '—'}</td>
                  <td>
                    <div className="flex gap-1.5">
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(rc)}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => setToDelete(rc)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info card */}
      <div className="mt-5 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
        <p className="text-xs text-blue-700">
          <strong>How it works:</strong> When you select a role in the User Setup page, the capacity field will
          automatically show the hours defined here. You can still override it manually per user.
        </p>
      </div>

      {/* Create/Edit Modal */}
      <Modal open={showForm} title={editing ? `Edit — ${editing.role}` : 'Add Role Capacity'} onClose={() => setShowForm(false)}>
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-4">
            <div className="flex flex-col gap-1">
              <label className="form-label">Role *</label>
              <input className={`form-input ${editing ? 'bg-slate-50' : ''}`} placeholder="e.g., Developer, Lead, Manager"
                value={form.role} onChange={(e) => update('role', e.target.value)}
                disabled={!!editing} />
              {errors.role && <span className="text-[11px] text-red-500">{errors.role}</span>}
            </div>
            <div className="flex flex-col gap-1">
              <label className="form-label">Capacity (hours/month) *</label>
              <input type="number" step="1" min="1" className="form-input" placeholder="e.g., 192"
                value={form.capacity_hours} onChange={(e) => update('capacity_hours', e.target.value)} />
              {errors.capacity_hours && <span className="text-[11px] text-red-500">{errors.capacity_hours}</span>}
            </div>
            <div className="flex flex-col gap-1">
              <label className="form-label">Description</label>
              <input className="form-input" placeholder="e.g., Full-time developer hours" value={form.description}
                onChange={(e) => update('description', e.target.value)} />
            </div>
          </div>

          {errors._general && <div className="text-xs text-red-600 mt-3">{errors._general}</div>}

          <div className="flex gap-2 mt-5">
            <button type="submit" className="btn btn-primary">{editing ? 'Save Changes' : 'Create'}</button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        message={`Delete capacity for role "${toDelete?.role}"?`}
        onConfirm={handleDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  )
}
