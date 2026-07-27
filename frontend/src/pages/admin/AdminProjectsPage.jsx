import { useState, useMemo } from 'react'
import useApi from '../../hooks/useApi'
import useAppStore from '../../store/useAppStore'
import useAuthStore from '../../store/useAuthStore'
import { getProjects, getProjectStats, createProject, updateProject, deleteProject } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import KPICard from '../../components/common/KPICard'
import StatusBadge from '../../components/common/StatusBadge'
import ProjectForm from '../../components/forms/ProjectForm'
import Modal from '../../components/common/Modal'
import ConfirmDialog from '../../components/common/ConfirmDialog'
import { formatNumber } from '../../utils/formatters'

export default function AdminProjectsPage() {
  const bumpRefresh = useAppStore((s) => s.bumpRefresh)
  const user = useAuthStore((s) => s.user)
  const { data: stats, loading: l1, reload: reloadStats } = useApi(getProjectStats, [])
  const { data: projects, loading: l2, reload: reloadProjects } = useApi(getProjects, [])
  const [editing, setEditing] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [toDelete, setToDelete] = useState(null)

  const refreshAll = () => { reloadStats(); reloadProjects(); bumpRefresh() }

  const handleSubmit = async (data) => {
    if (editing) await updateProject(editing.id, data)
    else await createProject(data)
    setShowForm(false)
    setEditing(null)
    refreshAll()
  }

  const handleDelete = async () => {
    await deleteProject(toDelete.id)
    setToDelete(null)
    refreshAll()
  }

  // Filter projects by user access (Admin sees all)
  const filteredProjects = useMemo(() => {
    if (!user || user.role === 'Admin') return projects || []
    const userProjectIds = user.project_ids || []
    if (userProjectIds.length === 0) return projects || []
    return (projects || []).filter((p) => userProjectIds.includes(p.id))
  }, [projects, user])

  if (l1 || l2) return <LoadingSpinner label="Loading projects..." />

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Projects</h2>
          <p className="text-xs text-slate-500 mt-0.5">Manage all projects and their module assignments</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true) }}>+ Add Project</button>
      </div>

      <div className="grid grid-cols-4 gap-3.5 mb-6">
        <KPICard label="Total Projects" value={stats.total_projects} />
        <KPICard label="Active" value={stats.active_projects} />
        <KPICard label="Total Tasks" value={stats.total_tasks} />
        <KPICard label="Total Hours" value={formatNumber(stats.total_hours)} />
      </div>

      {showForm && (
        <div className="card">
          <div className="text-[15px] font-semibold mb-4">➕ {editing ? 'Edit Project' : 'Add New Project'}</div>
          <ProjectForm
            initial={editing}
            onSubmit={handleSubmit}
            onCancel={() => { setShowForm(false); setEditing(null) }}
          />
        </div>
      )}

      <div className="card">
        <div className="text-[15px] font-semibold mb-3.5">All Projects</div>
        <table className="data-table">
          <thead>
            <tr><th>Project Name</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {filteredProjects.map((p) => (
              <tr key={p.id}>
                <td className="font-medium">{p.name}</td>
                <td><StatusBadge status={p.status} /></td>
                <td>
                  <div className="flex gap-1.5">
                    <button className="btn btn-secondary btn-sm" onClick={() => { setEditing(p); setShowForm(true) }}>Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={() => setToDelete(p)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!toDelete}
        message={`Delete project "${toDelete?.name}"? This cannot be undone.`}
        onConfirm={handleDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  )
}
