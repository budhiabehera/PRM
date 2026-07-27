import { useState } from 'react'
import useApi from '../../hooks/useApi'
import useDropdowns from '../../hooks/useDropdowns'
import { getUsers, createUser, deleteUser } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import RoleBadge from '../../components/common/RoleBadge'
import ConfirmDialog from '../../components/common/ConfirmDialog'
import useAuthStore from '../../store/useAuthStore'

const ROLES = ['Admin', 'Manager', 'Lead', 'Developer']

export default function AdminUsersPage() {
  const currentUser = useAuthStore((s) => s.user)
  const { resources } = useDropdowns()
  const { data: users, loading, reload } = useApi(getUsers, [])
  const [toDelete, setToDelete] = useState(null)
  const [form, setForm] = useState({ username: '', password: '', full_name: '', role: 'Developer', developer_id: '' })
  const [error, setError] = useState('')

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const handleCreate = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await createUser({ ...form, developer_id: form.developer_id ? Number(form.developer_id) : null })
      setForm({ username: '', password: '', full_name: '', role: 'Developer', developer_id: '' })
      reload()
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not create user')
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
          <div className="flex items-end">
            <button type="submit" className="btn btn-primary">Create User</button>
          </div>
          {error && <div className="col-span-3 text-xs text-red-600">{error}</div>}
        </form>
      </div>

      <div className="card">
        <div className="text-[15px] font-semibold mb-3.5">All Users</div>
        {loading ? <LoadingSpinner /> : (
          <table className="data-table">
            <thead><tr><th>Username</th><th>Full Name</th><th>Role</th><th>Linked Developer</th><th>Actions</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="font-medium">{u.username}</td>
                  <td>{u.full_name}</td>
                  <td><RoleBadge role={u.role} /></td>
                  <td>{resources.find((d) => d.id === u.developer_id)?.name || '—'}</td>
                  <td>
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

      <ConfirmDialog
        open={!!toDelete}
        message={`Delete user "${toDelete?.username}"? They will no longer be able to log in.`}
        onConfirm={handleDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  )
}
