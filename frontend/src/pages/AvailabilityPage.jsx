import { useState, useMemo } from 'react'
import useApi from '../hooks/useApi'
import useDropdowns from '../hooks/useDropdowns'
import useProjectDefault from '../hooks/useProjectDefault'
import useAuthStore, { isSelfOnly, isLeadOrAbove } from '../store/useAuthStore'
import { getAvailability, upsertAvailability, deleteAvailability } from '../services/api'
import LoadingSpinner from '../components/common/LoadingSpinner'
import FilterSelect from '../components/common/FilterSelect'
import Modal from '../components/common/Modal'
import AvailabilityForm from '../components/forms/AvailabilityForm'

export default function AvailabilityPage() {
  const { resources, sprints } = useDropdowns()
  const { defaultProjectId, showAllOption, restrictedProjects } = useProjectDefault()
  const user = useAuthStore((s) => s.user)
  const canManage = isLeadOrAbove(user)
  const isDeveloper = isSelfOnly()
  const [projectFilter, setProjectFilter] = useState(defaultProjectId)

  const devParams = isDeveloper && user?.developer_id ? { developer_id: user.developer_id } : undefined

  const { data: records, loading, reload } = useApi(() => getAvailability(devParams), [user?.developer_id])
  const [modalOpen, setModalOpen] = useState(false)

  // Filter records by selected project (match developer to project)
  const filteredRecords = useMemo(() => {
    if (!records) return []
    if (!projectFilter) return records
    // Get developer IDs that belong to the selected project
    const projDevIds = new Set(
      resources.filter(r => (r.project_ids || []).includes(Number(projectFilter))).map(r => r.id)
    )
    return records.filter(r => projDevIds.has(r.developer_id))
  }, [records, projectFilter, resources])

  // Filter resources for the form by selected project
  const filteredResources = useMemo(() => {
    if (!projectFilter) return resources
    return resources.filter(r => (r.project_ids || []).includes(Number(projectFilter)))
  }, [resources, projectFilter])

  const handleSubmit = async (form) => {
    await upsertAvailability(form)
    setModalOpen(false)
    reload()
  }

  const handleDelete = async (id) => {
    await deleteAvailability(id)
    reload()
  }

  const canAddLeave = canManage || (isDeveloper && user?.developer_id)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Leave Tracker</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {isDeveloper ? 'Your leaves that reduce total hours from your capacity' : 'Track leaves that reduce total hours from a resource\'s capacity'}
          </p>
        </div>
        {canAddLeave && <button className="btn btn-primary" onClick={() => setModalOpen(true)}>+ Add Leave</button>}
      </div>

      {!isDeveloper && (
        <div className="flex gap-3 mb-5 p-3.5 bg-white border border-slate-200 rounded-xl">
          <FilterSelect label="Project" value={projectFilter} onChange={setProjectFilter}
            options={restrictedProjects.map((p) => ({ value: p.id, label: p.name }))} showAll={showAllOption} />
        </div>
      )}

      <div className="card">
        {loading ? <LoadingSpinner /> : (
          <table className="data-table">
            <thead>
              <tr>
                {!isDeveloper && <th>Resource</th>}
                <th>Sprint</th>
                <th>Start Date</th>
                <th>End Date</th>
                <th>Days</th>
                <th>Reduced Hours</th>
                <th>Notes</th>
                {canAddLeave && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filteredRecords.length === 0 ? (
                <tr><td colSpan={isDeveloper ? 7 : 8} className="text-center text-slate-400 py-8">No leave records</td></tr>
              ) : filteredRecords.map((r) => (
                <tr key={r.id}>
                  {!isDeveloper && <td className="font-medium">{r.developer_name}</td>}
                  <td>{r.sprint_name}</td>
                  <td>{r.start_date || '\u2014'}</td>
                  <td>{r.end_date || '\u2014'}</td>
                  <td className="font-semibold">{r.leave_days}</td>
                  <td className="font-semibold text-red-600">{r.reduced_hours || (r.leave_days * 8)}h</td>
                  <td className="text-slate-500">{r.notes || '\u2014'}</td>
                  {canAddLeave && (
                    <td>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(r.id)}>Remove</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {canAddLeave && (
        <Modal open={modalOpen} title={isDeveloper ? 'Add My Leave' : 'Set Resource Leave'} onClose={() => setModalOpen(false)}>
          <AvailabilityForm
            resources={filteredResources}
            sprints={sprints}
            onSubmit={handleSubmit}
            onCancel={() => setModalOpen(false)}
            lockDeveloper={isDeveloper}
            defaultDeveloperId={isDeveloper ? user.developer_id : undefined}
          />
        </Modal>
      )}
    </div>
  )
}
