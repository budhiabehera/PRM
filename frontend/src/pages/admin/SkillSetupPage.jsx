import { useState } from 'react'
import useApi from '../../hooks/useApi'
import { getSkills, createSkill, updateSkill, deleteSkill } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import Modal from '../../components/common/Modal'
import ConfirmDialog from '../../components/common/ConfirmDialog'

export default function SkillSetupPage() {
  const { data: skills, loading, reload } = useApi(getSkills, [])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [toDelete, setToDelete] = useState(null)
  const [form, setForm] = useState({ name: '', description: '' })
  const [error, setError] = useState('')

  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', description: '' })
    setError('')
    setShowForm(true)
  }

  const openEdit = (skill) => {
    setEditing(skill)
    setForm({ name: skill.name, description: skill.description || '' })
    setError('')
    setShowForm(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.name.trim()) { setError('Skill name is required'); return }
    try {
      if (editing) {
        await updateSkill(editing.id, form)
      } else {
        await createSkill(form)
      }
      setShowForm(false)
      setEditing(null)
      reload()
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not save skill')
    }
  }

  const handleDelete = async () => {
    await deleteSkill(toDelete.id)
    setToDelete(null)
    reload()
  }

  if (loading) return <LoadingSpinner label="Loading skills..." />

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Skill Setup</h2>
          <p className="text-xs text-slate-500 mt-0.5">Manage skills that can be assigned to resources</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ Add Skill</button>
      </div>

      <div className="card">
        <div className="text-[15px] font-semibold mb-3.5">All Skills ({skills?.length ?? 0})</div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Skill Name</th>
              <th>Description</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {skills?.map((s) => (
              <tr key={s.id}>
                <td className="font-semibold">{s.name}</td>
                <td className="text-slate-500 text-xs">{s.description || '—'}</td>
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

      {/* Create/Edit Modal */}
      <Modal open={showForm} title={editing ? `Edit Skill — ${editing.name}` : 'Add New Skill'} onClose={() => setShowForm(false)}>
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="form-label">Skill Name *</label>
              <input className="form-input" placeholder="e.g., React, Python, DevOps" value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="form-label">Description</label>
              <input className="form-input" placeholder="Optional description" value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
          {error && <div className="text-xs text-red-600 mt-3">{error}</div>}
          <div className="flex gap-2 mt-5">
            <button type="submit" className="btn btn-primary">{editing ? 'Save Changes' : 'Create Skill'}</button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        message={`Delete skill "${toDelete?.name}"?`}
        onConfirm={handleDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  )
}
