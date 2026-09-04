import React, { useState, useMemo, useEffect } from 'react'
import useApi from '../../hooks/useApi'
import useDropdowns from '../../hooks/useDropdowns'
import useProjectDefault from '../../hooks/useProjectDefault'
import FilterSelect from '../../components/common/FilterSelect'
import useAppStore from '../../store/useAppStore'
import { getUserSetupList, createUserSetup, updateUserSetup, deleteUserSetup, getSkills, getRoleCapacities, getCapacityByRole, resendWelcomeEmail, getNextResourceCode } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import RoleBadge from '../../components/common/RoleBadge'
import Modal from '../../components/common/Modal'
import ConfirmDialog from '../../components/common/ConfirmDialog'
import { ChevronDown, ChevronRight } from 'lucide-react'

export default function UserSetupPage() {
  const { projects } = useDropdowns()
  const { defaultProjectId, showAllOption, restrictedProjects } = useProjectDefault()
  const [projectFilter, setProjectFilter] = useState(defaultProjectId)
  const bumpRefresh = useAppStore((s) => s.bumpRefresh)
  const { data: users, loading, reload } = useApi(getUserSetupList, [])
  const { data: skillsList } = useApi(getSkills, [])
  const { data: roleCapacities } = useApi(getRoleCapacities, [])
  const [editing, setEditing] = useState(null)

  // Role options come exclusively from the Role Capacity page
  const allRoleOptions = useMemo(() => {
    return (roleCapacities || []).map((rc) => rc.role)
  }, [roleCapacities])

  const [showForm, setShowForm] = useState(false)
  const [toDelete, setToDelete] = useState(null)
  const [toast, setToast] = useState(null)
  const [expandedRow, setExpandedRow] = useState(null)

  const emptyForm = {
    dev_code: '', username: '', full_name: '', email: '',
    pw: 'Ids@1001',
    role: 'Developer', skill: 'Backend', base_capacity: 192, active: true,
    project_ids: [], reporting_to_id: '',
  }
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState({})

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  // When role changes, auto-fill capacity from role_capacities
  const handleRoleChange = async (role) => {
    update('role', role)
    if (!role) return
    // Look up from already-loaded roleCapacities first
    const match = (roleCapacities || []).find((rc) => rc.role === role)
    if (match) {
      update('base_capacity', match.capacity_hours)
    } else {
      // Fallback: fetch from API
      try {
        const result = await getCapacityByRole(role)
        update('base_capacity', result.capacity_hours)
      } catch { /* ignore, keep current value */ }
    }
  }

  const toggleProject = (projectId) => {
    setForm((f) => {
      const ids = f.project_ids.includes(projectId)
        ? f.project_ids.filter((id) => id !== projectId)
        : [...f.project_ids, projectId]
      return { ...f, project_ids: ids }
    })
  }

  const refreshAll = () => { reload(); bumpRefresh() }

  const showToast = (type, text) => {
    setToast({ type, text })
    setTimeout(() => setToast(null), 4000)
  }

  const toggleRow = (id) => setExpandedRow((prev) => (prev === id ? null : id))

  const openCreate = async () => {
    setEditing(null)
    setForm(emptyForm)
    setErrors({})
    setShowForm(true)
    // Auto-fetch next resource code
    try {
      const res = await getNextResourceCode()
      setForm((f) => ({ ...f, dev_code: res.next_code }))
    } catch { /* ignore */ }
  }

  const openEdit = (user) => {
    setEditing(user)
    setForm({
      dev_code: user.dev_code || '',
      username: user.username || '',
      full_name: user.full_name || '',
      email: user.email || '',
      pw: '',
      role: user.role || 'Developer',
      skill: user.skill || 'Backend',
      base_capacity: user.base_capacity ?? 192,
      active: user.active ?? true,
      project_ids: user.project_ids || [],
      reporting_to_id: user.reporting_to_id || '',
    })
    setErrors({})
    setShowForm(true)
  }

  const validate = () => {
    const errs = {}
    if (!form.full_name.trim()) errs.full_name = 'Full name is required'
    if (!form.email.trim()) errs.email = 'Email is required'
    if (!editing) {
      if (!form.username.trim()) errs.username = 'Username is required'
      if (!form.pw.trim()) errs.pw = 'Temp password is required'
      else if (form.pw.length < 6) errs.pw = 'Must be at least 6 characters'
    }
    if (!form.role) errs.role = 'Role is required'
    if (!form.skill) errs.skill = 'Skill is required'
    if (form.project_ids.length === 0) errs.project_ids = 'Assign at least one project'
    return errs
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    try {
      if (editing) {
        await updateUserSetup(editing.id, {
          full_name: form.full_name,
          email: form.email,
          password: form.pw,
          role: form.role,
          skill: form.skill,
          base_capacity: Number(form.base_capacity),
          active: form.active,
          project_ids: form.project_ids,
          reporting_to_id: form.reporting_to_id ? Number(form.reporting_to_id) : null,
        })
        showToast('success', 'User updated successfully')
      } else {
        await createUserSetup({
          dev_code: form.dev_code,
          username: form.username,
          full_name: form.full_name,
          email: form.email,
          password: form.pw,
          role: form.role,
          skill: form.skill,
          base_capacity: Number(form.base_capacity),
          active: form.active,
          project_ids: form.project_ids,
          reporting_to_id: form.reporting_to_id ? Number(form.reporting_to_id) : null,
        })
        showToast('success', 'User created successfully')
      }
      setShowForm(false)
      setEditing(null)
      refreshAll()
    } catch (err) {
      setErrors({ _general: err.response?.data?.detail || 'Could not save user' })
    }
  }

  const handleDelete = async () => {
    await deleteUserSetup(toDelete.id)
    setToDelete(null)
    refreshAll()
    showToast('success', 'User deleted')
  }

  const handleResendEmail = async (user) => {
    try {
      const res = await resendWelcomeEmail(user.id)
      showToast('success', res.message || `Welcome email sent to ${user.email}`)
    } catch (err) {
      showToast('error', err.response?.data?.detail || 'Could not send welcome email')
    }
  }

  // Exclude the user being edited (can't report to yourself)
  const reportingOptions = useMemo(() => {
    const selectedProjects = form.project_ids || []
    return (users || []).filter((u) => {
      // Exclude self when editing
      if (editing && u.id === editing.id) return false
      // If no projects selected yet, show all users
      if (selectedProjects.length === 0) return true
      // Show users who share at least one project
      const uProjects = u.project_ids || []
      return uProjects.some((pid) => selectedProjects.includes(pid))
    })
  }, [users, form.project_ids, editing])

  if (loading) return <LoadingSpinner label="Loading users..." />

  // Build reporting options: users who share at least one project with the user being created/edited
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">User Setup</h2>
          <p className="text-xs text-slate-500 mt-0.5">Create user accounts with developer profiles and project assignments</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ Add User</button>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`mb-4 px-4 py-2 rounded-lg text-sm font-medium ${toast.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {toast.text}
        </div>
      )}

      {/* Project Filter */}
      <div className="flex gap-3 mb-5 p-3.5 bg-white border border-slate-200 rounded-xl">
        <FilterSelect label="Project" value={projectFilter} onChange={setProjectFilter}
          options={restrictedProjects.map((p) => ({ value: p.id, label: p.name }))} showAll={showAllOption} />
      </div>

      {/* Users Table */}
      <div className="card">
        <div className="text-[15px] font-semibold mb-3.5">
          {projectFilter ? `Project Users` : 'All Users'} ({(projectFilter ? users?.filter(u => (u.project_ids || []).includes(Number(projectFilter))) : users)?.length ?? 0})
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-8"></th>
                <th>Code</th>
                <th>Full Name</th>
                <th>Role</th>
                <th>Skill</th>
                <th>Projects</th>
                <th>Capacity</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(projectFilter ? users?.filter(u => (u.project_ids || []).includes(Number(projectFilter))) : users)?.map((u) => {
                const isExpanded = expandedRow === u.id
                const projNames = (u.project_ids || [])
                  .map((pid) => projects.find((p) => p.id === pid)?.name)
                  .filter(Boolean)
                return (
                  <React.Fragment key={u.id}>
                    <tr>
                      <td className="cursor-pointer" onClick={() => toggleRow(u.id)}>
                        {isExpanded
                          ? <ChevronDown size={14} className="text-slate-400" />
                          : <ChevronRight size={14} className="text-slate-400" />}
                      </td>
                      <td className="font-medium">{u.dev_code}</td>
                      <td className="font-semibold">{u.full_name}</td>
                      <td><RoleBadge role={u.role} /></td>
                      <td>{u.skill}</td>
                      <td className="text-xs max-w-[200px] truncate">{projNames.length > 0 ? projNames.join(', ') : 'â€”'}</td>
                      <td>{u.base_capacity} hrs</td>
                      <td>
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${u.active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                          {u.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <div className="flex gap-1.5">
                          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(u)}>Edit</button>
                          <button className="btn btn-danger btn-sm" onClick={() => setToDelete(u)}>Delete</button>
                          {u.email && (
                            <button className="btn btn-sm bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100" onClick={() => handleResendEmail(u)} title="Resend welcome email with new password">📧 Send Mail</button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Expanded "More" row */}
                    {isExpanded && (
                      <tr key={`${u.id}-more`} className="bg-slate-50/80">
                        <td colSpan={9} className="px-6 py-3">
                          <div className="grid grid-cols-4 gap-4">
                            <div>
                              <span className="text-[10px] text-slate-400 font-medium uppercase">Username</span>
                              <div className="text-sm text-slate-700 mt-0.5">{u.username || 'â€”'}</div>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 font-medium uppercase">Email</span>
                              <div className="text-sm text-slate-700 mt-0.5">{u.email || 'â€”'}</div>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 font-medium uppercase">Reporting To</span>
                              <div className="text-sm text-slate-700 mt-0.5">{u.reporting_to_name || 'â€”'}</div>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 font-medium uppercase">Password</span>
                              <div className="text-sm text-slate-500 mt-0.5">â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢</div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit Modal */}
      <Modal open={showForm} title={editing ? `Edit User â€” ${editing.full_name}` : 'Add New User'} onClose={() => setShowForm(false)}>
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="form-label">Resource Code *</label>
              <input className="form-input bg-slate-50" value={form.dev_code}
                readOnly disabled />
              <span className="text-[10px] text-slate-400">Auto-generated (read-only)</span>
            </div>
            <div className="flex flex-col gap-1">
              <label className="form-label">Username *</label>
              <input className="form-input" placeholder="e.g., jane.doe" value={form.username}
                onChange={(e) => update('username', e.target.value)} disabled={!!editing} />
              {errors.username && <span className="text-[11px] text-red-500">{errors.username}</span>}
            </div>
            <div className="flex flex-col gap-1">
              <label className="form-label">Full Name *</label>
              <input className="form-input" placeholder="e.g., Jane Doe" value={form.full_name}
                onChange={(e) => update('full_name', e.target.value)} />
              {errors.full_name && <span className="text-[11px] text-red-500">{errors.full_name}</span>}
            </div>
            <div className="flex flex-col gap-1">
              <label className="form-label">Email *</label>
              <input type="email" className="form-input" placeholder="jane@company.com" value={form.email}
                onChange={(e) => update('email', e.target.value)} />
              {errors.email && <span className="text-[11px] text-red-500">{errors.email}</span>}
            </div>
            {!editing && (
              <div className="flex flex-col gap-1">
                <label className="form-label">Temp Password *</label>
                <input type="password" className="form-input" placeholder="Min 6 characters" value={form.pw}
                  onChange={(e) => update('pw', e.target.value)} />
                {errors.pw && <span className="text-[11px] text-red-500">{errors.pw}</span>}
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label className="form-label">Role *</label>
              <select className="form-select" value={form.role} onChange={(e) => handleRoleChange(e.target.value)}>
                <option value="">Select Role</option>
                {allRoleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              {errors.role && <span className="text-[11px] text-red-500">{errors.role}</span>}
            </div>
            <div className="flex flex-col gap-1">
              <label className="form-label">Skill *</label>
              <select className="form-select" value={form.skill} onChange={(e) => update('skill', e.target.value)}>
                <option value="">Select Skill</option>
                {(skillsList || []).map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
              {errors.skill && <span className="text-[11px] text-red-500">{errors.skill}</span>}
            </div>
            <div className="flex flex-col gap-1">
              <label className="form-label">Reporting To</label>
              <select className="form-select" value={form.reporting_to_id}
                onChange={(e) => update('reporting_to_id', e.target.value)}>
                <option value="">None</option>
                {reportingOptions.map((d) => (
                  <option key={d.id} value={d.id}>{d.full_name} ({d.role})</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="form-label">Capacity (hrs/month) *</label>
              <input type="number" min="1" step="1" className="form-input" placeholder="e.g., 192"
                value={form.base_capacity}
                onChange={(e) => update('base_capacity', e.target.value)} />
              <span className="text-[10px] text-slate-400">Auto-filled from Role Capacity. Override if needed.</span>
            </div>
            <div className="flex flex-col gap-1">
              <label className="form-label">Status *</label>
              <select className="form-select" value={form.active ? 'yes' : 'no'}
                onChange={(e) => update('active', e.target.value === 'yes')}>
                <option value="yes">Active</option>
                <option value="no">Inactive</option>
              </select>
            </div>

            {/* Multi-select Projects */}
            <div className="flex flex-col gap-1 col-span-2">
              <label className="form-label">Assigned Projects *</label>
              <div className="border border-slate-200 rounded-md p-3 max-h-40 overflow-y-auto grid grid-cols-2 gap-2">
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
              {errors.project_ids && <span className="text-[11px] text-red-500">{errors.project_ids}</span>}
            </div>
          </div>

          {errors._general && <div className="text-xs text-red-600 mt-3">{errors._general}</div>}

          <div className="flex gap-2 mt-5">
            <button type="submit" className="btn btn-primary">{editing ? 'Save Changes' : 'Create User'}</button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        message={`Delete user "${toDelete?.full_name}"? This will remove both the developer profile and login account.`}
        onConfirm={handleDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  )
}
