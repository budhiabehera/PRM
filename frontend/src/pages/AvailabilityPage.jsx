import { useState } from 'react'
import useApi from '../hooks/useApi'
import useDropdowns from '../hooks/useDropdowns'
import { getAvailability, upsertAvailability, deleteAvailability } from '../services/api'
import LoadingSpinner from '../components/common/LoadingSpinner'
import Modal from '../components/common/Modal'
import AvailabilityForm from '../components/forms/AvailabilityForm'

export default function AvailabilityPage() {
  const { resources, sprints } = useDropdowns()
  const { data: records, loading, reload } = useApi(getAvailability, [])
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Availability</h2>
          <p className="text-xs text-slate-500 mt-0.5">Leave days that reduce a developer's net capacity for a sprint</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModalOpen(true)}>+ Set Leave</button>
      </div>

      <div className="card">
        {loading ? <LoadingSpinner /> : (
          <table className="data-table">
            <thead><tr><th>Developer</th><th>Sprint</th><th>Leave Days</th><th>Notes</th><th>Actions</th></tr></thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium">{r.developer_name}</td>
                  <td>{r.sprint_name}</td>
                  <td>{r.leave_days}</td>
                  <td className="text-slate-500">{r.notes || '—'}</td>
                  <td>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(r.id)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={modalOpen} title="Set Developer Leave" onClose={() => setModalOpen(false)}>
        <AvailabilityForm resources={resources} sprints={sprints} onSubmit={handleSubmit} onCancel={() => setModalOpen(false)} />
      </Modal>
    </div>
  )
}
