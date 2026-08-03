import { useState } from 'react'
import useApi from '../../hooks/useApi'
import { getTaskStatuses, createTaskStatus, updateTaskStatus, deleteTaskStatus } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import Modal from '../../components/common/Modal'
import ConfirmDialog from '../../components/common/ConfirmDialog'

export default function TaskStatusPage() {
  const { data: statuses, loading, reload } = useApi(getTaskStatuses, [])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [toDelete, setToDelete] = useState(null)
  const [toast, setToast] = useState(null)
  const [form, setForm] = useState({ name: '', color: '#4f46e5', sort_order: 0 })
  const [errors, setErrors] = useState({})

  const showToast = (type, text) => {
    setToast({ type, text })
    setTimeout(() => setToast(null), 4000)
  }

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', color: '#4f46e5', sort_order: (statuses?.length || 0) + 1 })
    setErrors({})
    setShowForm(true)
  }

  const openEdit = (status) => {
    setEditing(status)
    setForm({ name: status.name, color: status.color, sort_order: status.sort_order })
    setErrors({})
    setShowForm(true)
  }

  const validate = () => {
    const errs = {}
    if (!form.name.trim()) errs.name = 'Status name is required'
    return errs
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    try {
      const payload = {
        name: form.name.trim(),
        color: form.color,
        sort_order: Number(form.sort_order) || 0,
      }
      if (editing) {
        await updateTaskStatus(editing.id, payload)
        showToast('success', 'Status updated')
      } else {
        await createTaskStatus(payload)
        showToast('success', 'Status created')
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
      await deleteTaskStatus(toDelete.id)
      setToDelete(null)
      showToast('success', 'Status deleted')
      reload()
    } catch (err) {
      showToast('error', err.response?.data?.detail || 'Could not delete')
      setToDelete(null)
    }
  }

  if (loading) return <LoadingSpinner label="Loading task statuses..." />

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Task Status Setup</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Define task statuses that appear in the task creation/edit form.
          </p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ Add Status</button>
      </div>

      {toast && (
        <div className={`mb-4 px-4 py-2 rounded-lg text-sm font-medium ${toast.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {toast.text}
        </div>
      )}

      {/* Table */}
      <div className="card">
        <div className="text-[15px] font-semibold mb-3.5">All Statuses ({statuses?.length ?? 0})</div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Status Name</th>
                <th>Color</th>
                <th>Preview</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {statuses?.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-slate-400 py-6 text-sm">
                    No statuses defined yet. Add one to get started.
                  </td>
                </tr>
              )}
              {statuses?.map((s) => (
                <tr key={s.id}>
                  <td className="text-slate-400 font-medium">{s.sort_order}</td>
                  <td className="font-semibold">{s.name}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <span className="w-4 h-4 rounded" style={{ backgroundColor: s.color }}></span>
                      <span className="text-slate-500 text-xs">{s.color}</span>
                    </div>
                  </td>
                  <td>
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-medium" style={{ backgroundColor: s.color + '20', color: s.color }}>
                      {s.name}
                    </span>
                  </td>
                  <td>
                    <div className="flex gap-1.5">
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(s)}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => setToDelete(s)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit Modal */}
      <Modal open={showForm} title={editing ? `Edit — ${editing.name}` : 'Add Task Status'} onClose={() => setShowForm(false)}>
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-4">
            <div className="flex flex-col gap-1">
              <label className="form-label">Status Name *</label>
              <input className="form-input" placeholder="e.g., In Progress" value={form.name}
                onChange={(e) => update('name', e.target.value)} />
              {errors.name && <span className="text-[11px] text-red-500">{errors.name}</span>}
            </div>
            <div className="flex flex-col gap-1">
              <label className="form-label">Color</label>
              <div className="flex items-center gap-3">
                <input type="color" className="w-10 h-10 rounded cursor-pointer border border-slate-200" value={form.color}
                  onChange={(e) => update('color', e.target.value)} />
                <input className="form-input flex-1" value={form.color}
                  onChange={(e) => update('color', e.target.value)} placeholder="#4f46e5" />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="form-label">Sort Order</label>
              <input type="number" min="0" className="form-input" value={form.sort_order}
                onChange={(e) => update('sort_order', e.target.value)} />
              <span className="text-[10px] text-slate-400">Lower numbers appear first in dropdowns</span>
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
        message={`Delete status "${toDelete?.name}"?`}
        onConfirm={handleDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  )
}
