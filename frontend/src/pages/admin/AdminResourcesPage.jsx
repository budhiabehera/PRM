import { useMemo, useState } from 'react'
import useApi from '../../hooks/useApi'
import useDropdowns from '../../hooks/useDropdowns'
import useAppStore from '../../store/useAppStore'
import { getResources, getResourceStats, createResource, updateResource, deleteResource } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import KPICard from '../../components/common/KPICard'
import RoleBadge from '../../components/common/RoleBadge'
import ResourceForm from '../../components/forms/ResourceForm'
import ConfirmDialog from '../../components/common/ConfirmDialog'
import FilterSelect from '../../components/common/FilterSelect'
import { UTIL_STATUS_COLORS, ROLE_OPTIONS, SKILL_OPTIONS } from '../../utils/constants'
import { formatPercent } from '../../utils/formatters'

export default function AdminResourcesPage() {
  const { mainModules } = useDropdowns()
  const bumpRefresh = useAppStore((s) => s.bumpRefresh)
  const { data: stats, loading: l1, reload: reloadStats } = useApi(getResourceStats, [])
  const [filters, setFilters] = useState({})
  const params = useMemo(() => {
    const p = {}
    if (filters.module_id) p.module_id = filters.module_id
    if (filters.role) p.role = filters.role
    if (filters.skill) p.skill = filters.skill
    return p
  }, [filters])
  const { data: resources, loading: l2, reload: reloadResources } = useApi(() => getResources(params), [JSON.stringify(params)])
  const [editing, setEditing] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [toDelete, setToDelete] = useState(null)

  const refreshAll = () => { reloadStats(); reloadResources(); bumpRefresh() }

  const handleSubmit = async (data) => {
    if (editing) await updateResource(editing.id, data)
    else await createResource(data)
    setShowForm(false)
    setEditing(null)
    refreshAll()
  }

  const handleDelete = async () => {
    await deleteResource(toDelete.id)
    setToDelete(null)
    refreshAll()
  }

  if (l1) return <LoadingSpinner label="Loading resources..." />

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Resources (Developers)</h2>
          <p className="text-xs text-slate-500 mt-0.5">Manage team members, roles, skills, and capacity</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true) }}>+ Add Resource</button>
      </div>

      <div className="grid grid-cols-4 gap-3.5 mb-6">
        <KPICard label="Active Developers" value={stats.active_developers} />
        <KPICard label="Team Capacity" value={stats.team_capacity} />
        <KPICard label="Monthly Hrs" value={stats.monthly_hours} />
        <KPICard label="Avg Utilization" value={formatPercent(stats.avg_utilization)} />
      </div>

      {showForm && (
        <div className="card">
          <div className="text-[15px] font-semibold mb-4">➕ {editing ? 'Edit Resource' : 'Add New Resource'}</div>
          <ResourceForm
            initial={editing}
            mainModules={mainModules}
            onSubmit={handleSubmit}
            onCancel={() => { setShowForm(false); setEditing(null) }}
          />
        </div>
      )}

      <div className="card">
        <div className="flex items-center justify-between mb-3.5">
          <div className="text-[15px] font-semibold">All Resources ({resources?.length ?? 0})</div>
          <div className="flex gap-2">
            <FilterSelect onChange={(v) => setFilters((f) => ({ ...f, module_id: v }))} allLabel="All Modules"
              options={mainModules.map((m) => ({ value: m.id, label: m.name }))} />
            <FilterSelect onChange={(v) => setFilters((f) => ({ ...f, role: v }))} allLabel="All Roles" options={ROLE_OPTIONS} />
            <FilterSelect onChange={(v) => setFilters((f) => ({ ...f, skill: v }))} allLabel="All Skills" options={SKILL_OPTIONS} />
          </div>
        </div>
        {l2 ? <LoadingSpinner /> : (
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th><th>Name</th><th>Role</th><th>Home Module</th><th>Skills</th><th>Capacity</th>
                <th>Active Tasks</th><th>Assigned Hrs</th><th>Utilization</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {resources.map((d) => (
                <tr key={d.id}>
                  <td>{d.dev_code}</td>
                  <td className="font-semibold">{d.name}</td>
                  <td><RoleBadge role={d.role} /></td>
                  <td>{d.home_module || '—'}</td>
                  <td>{d.skill}</td>
                  <td>{d.base_capacity}</td>
                  <td>{d.active_tasks}</td>
                  <td>{d.assigned_hours}</td>
                  <td><span className={UTIL_STATUS_COLORS[d.utilization_status]}>{formatPercent(d.utilization_pct)}</span></td>
                  <td>
                    <div className="flex gap-1.5">
                      <button className="btn btn-secondary btn-sm" onClick={() => { setEditing(d); setShowForm(true) }}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => setToDelete(d)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmDialog
        open={!!toDelete}
        message={`Remove developer "${toDelete?.name}"? This cannot be undone.`}
        onConfirm={handleDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  )
}
