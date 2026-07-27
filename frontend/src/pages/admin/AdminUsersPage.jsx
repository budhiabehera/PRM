import { useState } from 'react'
import useApi from '../../hooks/useApi'
import useDropdowns from '../../hooks/useDropdowns'
import { getUsers, createUser, deleteUser, updateUser } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import RoleBadge from '../../components/common/RoleBadge'
import ConfirmDialog from '../../components/common/ConfirmDialog'
import useAuthStore from '../../store/useAuthStore'

const ROLES = ['Admin', 'Manager', 'Lead', 'Developer']

export default function AdminUsersPage() {
  const currentUser = useAuthStore((s) => s.user)
  const { resources, projects } = useDropdowns()
  const { data: users, loading, reload } = useApi(getUsers, [])
  const [toDelete, setToDelete] = useState(null)
  const [editUser, setEditUser] = useState(null)
  const [form, setForm] = useState({
    username: '',
    password: '',
    full_name: '',
    email: '',
    role: 'Developer',
    developer_id: '',
    project_ids: [],
  })
  const [editForm, setEditForm] = useState({
    full_name: '',
    email: '',
    role: 'Developer',
    developer_id: '',
    project_ids: [],
  })
  const [error, setError] = useState('')
  const [editError, setEditError] = useState('')

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }))
  const updateEdit = (key, value) => setEditForm((f) => ({ ...f, [key]: value }))

  const toggleProject = (projectId) => {
    setForm((f) => {
      const ids = f.project_ids.includes(projectId)
        ? f.project_ids.filter((id) => id !== projectId)
        : [...f.project_ids, projectId]
      return { ...f, project_ids: ids }
    })
  }

  const toggleEditProject = (projectId) => {
    setEditForm((f) => {
      const ids = f.project_ids.includes(projectId)
        ? f.project_ids.filter((id) => id !== projectId)
        : [...f.project_ids, projectId]
      return { ...f, project_ids: ids }
    })
  }

  const openEdit = (user) => {
    setEditUser(user)
    setEditForm({
      full_name: user.full_name || '',
      email: user.email || '',
      role: user.role,
      developer_id: user.developer_id || '',
      project_ids: user.project_ids || [],
    })
    setEditError('')
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await createUser({
        ...form,
        developer_id: form.developer_id ? Number(form.developer_id) : null,
        project_ids: form.project_ids,
      })
      setForm({
        username: '',
        password: '',
        full_name: '',
        email: '',
        role: 'Developer',
        developer_id: '',
        project_ids: [],
      })
      reload()
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not create user')
    }
  }

  const handleUpdate = async (e) => {
    e.preventDefault()
    setEditError('')
    try {
      await updateUser(editUser.id, {
        ...editForm,
        developer_id: editForm.developer_id ? Number(editForm.developer_id) : null,
      })
      setEditUser(null)
      reload()
    } catch (err) {
      setEditError(err.response?.data?.detail || 'Could not update user')
    }
  }

  const handleDelete = async () => {
    await deleteUser(toDelete.id)
    setToDelete(null)
    reload()
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900">User Accounts</h2>
        <p className="text-xs text-slate-500 mt-0.5">Admin-only: manage login accounts and roles</p>
      </div>

      {/* Create User Form */}
      <div className="card">
        <div className="text-[15px] font-semibold mb-4">➕ Add New User</div>
        <form onSubmit={handleCreate} className="grid grid-cols-3 gap-4">
          <div className="flex flex-col gap-1">
            <label className="form-label">Username *</label>
            <input className="form-input" value={form.username} onChange={(e) => update('username', e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1">
            <label className="form-label">Full Name *</label>
            <input className="form-input" value={form.full_name} onChange={(e) => update('full_name', e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1">
            <label className="form-label">Email</label>
            <input type="email" className="form-input" placeholder="user@example.com" value={form.email} onChange={(e) => update('email', e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="form-label">Temporary Password *</label>
            <input type="password" className="form-input" value={form.password} onChange={(e) => update('password', e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1">
            <label className="form-label">Role *</label>
            <select className="form-select" value={form.role} onChange={(e) => update('role', e.target.value)}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="form-label">Linked Developer (optional)</label>
            <select className="form-select" value={form.developer_id} onChange={(e) => update('developer_id', e.target.value)}>
              <option value="">None</option>
              {resources.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>

          {/* Multi-select Projects */}
          <div className="flex flex-col gap-1 col-span-2">
            <label className="form-label">Assigned Projects</label>
            <div className="border border-slate-200 rounded-md p-3 max-h-36 overflow-y-auto grid grid-cols-2 gap-2">
              {projects.map((p) => (
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
              {projects.length === 0 && <span className="text-xs text-slate-400">No projects available</span>}
            </div>
          </div>

          <div className="flex items-end">
            <button type="submit" className="btn btn-primary">Create User</button>
          </div>
          {error && <div className="col-span-3 text-xs text-red-600">{error}</div>}
        </form>
      </div>

      {/* Users Table */}
      <div className="card">
        <div className="text-[15px] font-semibold mb-3.5">All Users</div>
        {loading ? <LoadingSpinner /> : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Full Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Projects</th>
                <th>Linked Developer</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="font-medium">{u.username}</td>
                  <td>{u.full_name}</td>
                  <td className="text-slate-500 text-xs">{u.email || '—'}</td>
                  <td><RoleBadge role={u.role} /></td>
                  <td>
                    {u.project_ids && u.project_ids.length > 0
                      ? u.project_ids.map((pid) => projects.find((p) => p.id === pid)?.name || pid).join(', ')
                      : '—'}
                  </td>
                  <td>{resources.find((d) => d.id === u.developer_id)?.name || '—'}</td>
                  <td className="flex gap-2">
                    <button className="btn btn-sm btn-secondary" onClick={() => openEdit(u)}>Edit</button>
                    {u.id !== currentUser?.id && (
                      <button className="btn btn-danger btn-sm" onClick={() => setToDelete(u)}>Delete</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit User Modal */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">Edit User — {editUser.username}</h3>
              <button className="text-slate-400 hover:text-slate-600 text-xl" onClick={() => setEditUser(null)}>×</button>
            </div>
            <form onSubmit={handleUpdate} className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="form-label">Full Name *</label>
                <input className="form-input" value={editForm.full_name} onChange={(e) => updateEdit('full_name', e.target.value)} required />
              </div>
              <div className="flex flex-col gap-1">
                <label className="form-label">Email</label>
                <input type="email" className="form-input" value={editForm.email} onChange={(e) => updateEdit('email', e.target.value)} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="form-label">Role *</label>
                <select className="form-select" value={editForm.role} onChange={(e) => updateEdit('role', e.target.value)}>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="form-label">Linked Developer</label>
                <select className="form-select" value={editForm.developer_id} onChange={(e) => updateEdit('developer_id', e.target.value)}>
                  <option value="">None</option>
                  {resources.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>

              {/* Multi-select Projects */}
              <div className="flex flex-col gap-1 col-span-2">
                <label className="form-label">Assigned Projects</label>
                <div className="border border-slate-200 rounded-md p-3 max-h-44 overflow-y-auto grid grid-cols-2 gap-2">
                  {projects.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer hover:bg-slate-50 rounded px-1">
                      <input
                        type="checkbox"
                        className="accent-indigo-600 w-4 h-4"
                        checked={editForm.project_ids.includes(p.id)}
                        onChange={() => toggleEditProject(p.id)}
                      />
                      {p.name}
                    </label>
                  ))}
                  {projects.length === 0 && <span className="text-xs text-slate-400">No projects available</span>}
                </div>
              </div>

              {editError && <div className="col-span-2 text-xs text-red-600">{editError}</div>}

              <div className="col-span-2 flex justify-end gap-3 mt-2">
                <button type="button" className="btn btn-secondary" onClick={() => setEditUser(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!toDelete}
        message={`Delete user "${toDelete?.username}"? They will no longer be able to log in.`}
        onConfirm={handleDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  )
}
