import { useState } from 'react'
import useApi from '../../hooks/useApi'
import useDropdowns from '../../hooks/useDropdowns'
import useAppStore from '../../store/useAppStore'
import { getResources, createResource, updateResource, deleteResource } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import RoleBadge from '../../components/common/RoleBadge'
import Modal from '../../components/common/Modal'
import ConfirmDialog from '../../components/common/ConfirmDialog'
import { ROLE_OPTIONS, SKILL_OPTIONS } from '../../utils/constants'
import { validateResourceForm } from '../../utils/validators'

export default function DeveloperSetupPage() {
  const { projects, allProjects } = useDropdowns()
  const bumpRefresh = useAppStore((s) => s.bumpRefresh)
  const { data: resources, loading, reload } = useApi(getResources, [])
  const [editing, setEditing] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [toDelete, setToDelete] = useState(null)

  // Form state
  const emptyForm = {
    dev_code: '', name: '', role: 'Developer', skill: 'Backend',
    base_capacity: 192, active: true, project_ids: [],
  }
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState({})

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const toggleProject = (projectId) => {
    setForm((f) => {
      const ids = f.project_ids.includes(projectId)
        ? f.project_ids.filter((id) => id !== projectId)
        : [...f.project_ids, projectId]
      return { ...f, project_ids: ids }
    })
  }

  const refreshAll = () => { reload(); bumpRefresh() }

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setErrors({})
    setShowForm(true)
  }

  const openEdit = (dev) => {
    setEditing(dev)
    setForm({
      dev_code: dev.dev_code || '',
      name: dev.name || '',
      role: dev.role || 'Developer',
      skill: dev.skill || 'Backend',
      base_capacity: dev.base_capacity ?? 192,
      active: dev.active ?? true,
      project_ids: dev.project_ids || [],
    })
    setErrors({})
    setShowForm(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validateResourceForm(form)
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    const payload = {
      dev_code: form.dev_code,
      name: form.name,
      role: form.role,
      skill: form.skill,
      base_capacity: Number(form.base_capacity),
      active: form.active,
      project_ids: form.project_ids,
      home_module_id: null,
    }

    try {
      if (editing) await updateResource(editing.id, payload)
      else await createResource(payload)
      setShowForm(false)
      setEditing(null)
      refreshAll()
    } catch (err) {
      setErrors({ _general: err.response?.data?.detail || 'Could not save developer' })
    }
  }

  const handleDelete = async () => {
    await deleteResource(toDelete.id)
    setToDelete(null)
    refreshAll()
  }

  if (loading) return <LoadingSpinner label="Loading developers..." />

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Developer Setup</h2>
          <p className="text-xs text-slate-500 mt-0.5">Create developers and assign them to projects</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ Add Developer</button>
      </div>

      {/* Developer Table */}
      <div className="card">
        <div className="text-[15px] font-semibold mb-3.5">All Developers ({resources?.length ?? 0})</div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Role</th>
                <th>Projects</th>
                <th>Skill</th>
                <th>Capacity</th>
                <th>Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {resources?.map((d) => {
                const projNames = (d.project_ids || [])
                  .map((pid) => allProjects.find((p) => p.id === pid)?.name)
                  .filter(Boolean)
                return (
                  <tr key={d.id}>
                    <td className="font-medium">{d.dev_code}</td>
                    <td className="font-semibold">{d.name}</td>
                    <td><RoleBadge role={d.role} /></td>
                    <td>{projNames.length > 0 ? projNames.join(', ') : '—'}</td>
                    <td>{d.skill}</td>
                    <td>{d.base_capacity} hrs</td>
                    <td>
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${d.active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                        {d.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div className="flex gap-1.5">
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(d)}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => setToDelete(d)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit Developer Modal */}
      <Modal open={showForm} title={editing ? `Edit Developer — ${editing.name}` : 'Add New Developer'} onClose={() => setShowForm(false)}>
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="form-label">Developer Code *</label>
              <input className="form-input" placeholder="e.g., DEV040" value={form.dev_code}
                onChange={(e) => update('dev_code', e.target.value)} />
              {errors.dev_code && <span className="text-[11px] text-red-500">{errors.dev_code}</span>}
            </div>
            <div className="flex flex-col gap-1">
              <label className="form-label">Full Name *</label>
              <input className="form-input" placeholder="e.g., Jane Doe" value={form.name}
                onChange={(e) => update('name', e.target.value)} />
              {errors.name && <span className="text-[11px] text-red-500">{errors.name}</span>}
            </div>
            <div className="flex flex-col gap-1">
              <label className="form-label">Role</label>
              <select className="form-select" value={form.role} onChange={(e) => update('role', e.target.value)}>
                {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="form-label">Skill</label>
              <select className="form-select" value={form.skill} onChange={(e) => update('skill', e.target.value)}>
                {SKILL_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Multi-select Projects */}
            <div className="flex flex-col gap-1 col-span-2">
              <label className="form-label">Assigned Projects</label>
              <div className="border border-slate-200 rounded-md p-3 max-h-40 overflow-y-auto grid grid-cols-2 gap-2">
                {allProjects.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer hover:bg-slate-50 rounded px-1">
                    <input
                      type="checkbox"
                      className="accent-indigo-600 w-4 h-4"
                      checked={form.project_ids.includes(p.id)}
                      onChange={() => toggleProject(p.id)}
                    />
                    {p.name}
                  </label>
                ))}
                {allProjects.length === 0 && <span className="text-xs text-slate-400">No projects available</span>}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="form-label">Capacity (hrs/month)</label>
              <select className="form-select" value={form.base_capacity}
                onChange={(e) => update('base_capacity', e.target.value)}>
                <option value={96}>96 (Lead/Manager)</option>
                <option value={160}>160</option>
                <option value={192}>192 (Full-time)</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="form-label">Status</label>
              <select className="form-select" value={form.active ? 'yes' : 'no'}
                onChange={(e) => update('active', e.target.value === 'yes')}>
                <option value="yes">Active</option>
                <option value="no">Inactive</option>
              </select>
            </div>
          </div>

          {errors._general && <div className="text-xs text-red-600 mt-3">{errors._general}</div>}

          <div className="flex gap-2 mt-5">
            <button type="submit" className="btn btn-primary">{editing ? 'Save Changes' : 'Create Developer'}</button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        message={`Delete developer "${toDelete?.name}"? This cannot be undone.`}
        onConfirm={handleDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  )
}
