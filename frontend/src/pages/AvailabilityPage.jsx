import { useState } from 'react'
import useApi from '../hooks/useApi'
import useDropdowns from '../hooks/useDropdowns'
import useAuthStore, { isLeadOrAbove } from '../store/useAuthStore'
import { getAvailability, upsertAvailability, deleteAvailability } from '../services/api'
import LoadingSpinner from '../components/common/LoadingSpinner'
import Modal from '../components/common/Modal'
import AvailabilityForm from '../components/forms/AvailabilityForm'

export default function AvailabilityPage() {
  const { resources, sprints } = useDropdowns()
  const user = useAuthStore((s) => s.user)
  const canManage = isLeadOrAbove(user)
  const isDeveloper = user?.role === 'Developer'
  const devParams = isDeveloper && user?.developer_id ? { developer_id: user.developer_id } : undefined

  const { data: records, loading, reload } = useApi(() => getAvailability(devParams), [user?.developer_id])
  const [modalOpen, setModalOpen] = useState(false)

  const handleSubmit = async (form) => {
    await upsertAvailability(form)
    setModalOpen(false)
    reload()
  }

  const handleDelete = async (id) => {
    await deleteAvailability(id)
    reload()
  }

  // Developers can add their own leave; Leads+ can add for anyone
  const canAddLeave = canManage || (isDeveloper && user?.developer_id)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Availability</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {isDeveloper ? 'Your leave days that reduce your net capacity' : 'Leave days that reduce a developer\'s net capacity for a sprint'}
          </p>
        </div>
        {canAddLeave && <button className="btn btn-primary" onClick={() => setModalOpen(true)}>+ Add Leave</button>}
      </div>

      <div className="card">
        {loading ? <LoadingSpinner /> : (
          <table className="data-table">
            <thead>
              <tr>
                {!isDeveloper && <th>Resource</th>}
                <th>Sprint</th>
                <th>Leave Days</th>
                <th>Notes</th>
                {canAddLeave && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr><td colSpan={isDeveloper ? 4 : 5} className="text-center text-slate-400 py-8">No leave records yet</td></tr>
              ) : records.map((r) => (
                <tr key={r.id}>
                  {!isDeveloper && <td className="font-medium">{r.developer_name}</td>}
                  <td>{r.sprint_name}</td>
                  <td>{r.leave_days}</td>
                  <td className="text-slate-500">{r.notes || '—'}</td>
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
            resources={resources}
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
