import { useState } from 'react'

export default function AvailabilityForm({
  resources = [], sprints = [], onSubmit, onCancel,
  lockDeveloper = false, defaultDeveloperId,
}) {
  const [form, setForm] = useState({
    developer_id: defaultDeveloperId ? String(defaultDeveloperId) : '',
    sprint_id: '',
    leave_days: 0,
    notes: '',
  })
  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const handleSubmit = () => {
    if (!form.developer_id || !form.sprint_id) return
    onSubmit({
      ...form,
      developer_id: Number(form.developer_id),
      sprint_id: Number(form.sprint_id),
      leave_days: Number(form.leave_days) || 0,
    })
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label className="form-label">Resource *</label>
          <select
            className="form-select"
            value={form.developer_id}
            onChange={(e) => update('developer_id', e.target.value)}
            disabled={lockDeveloper}
          >
            <option value="">Select Developer...</option>
            {resources.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          {lockDeveloper && <span className="text-[10px] text-slate-400">Your own leave</span>}
        </div>
        <div className="flex flex-col gap-1">
          <label className="form-label">Sprint / Month *</label>
          <select className="form-select" value={form.sprint_id} onChange={(e) => update('sprint_id', e.target.value)}>
            <option value="">Select Sprint...</option>
            {sprints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="form-label">Leave Days</label>
          <input type="number" min="0" max="31" className="form-input" value={form.leave_days}
            onChange={(e) => update('leave_days', e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="form-label">Notes</label>
          <input className="form-input" placeholder="e.g., Planned vacation" value={form.notes}
            onChange={(e) => update('notes', e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2 mt-5">
        <button className="btn btn-primary" onClick={handleSubmit}>Save Leave</button>
        <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
