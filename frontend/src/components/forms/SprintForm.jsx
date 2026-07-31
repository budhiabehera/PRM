import { useState } from 'react'
import useDropdowns from '../../hooks/useDropdowns'

export default function SprintForm({ initial, onSubmit, onCancel }) {
  const { projects } = useDropdowns()
  const [form, setForm] = useState({
    name: initial?.name || '',
    start_date: initial?.start_date || '',
    end_date: initial?.end_date || '',
    status: initial?.status || 'Not Started',
    project_id: initial?.project_id || '',
  })
  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  return (
    <div>
      <div className="grid grid-cols-4 gap-4">
        <div className="flex flex-col gap-1">
          <label className="form-label">Project *</label>
          <select className="form-select" value={form.project_id}
            onChange={(e) => update('project_id', e.target.value)}>
            <option value="">Select Project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="form-label">Sprint Name *</label>
          <input className="form-input" placeholder="e.g., Jan-2027" value={form.name}
            onChange={(e) => update('name', e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="form-label">Start Date *</label>
          <input type="date" className="form-input" value={form.start_date}
            onChange={(e) => update('start_date', e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="form-label">End Date *</label>
          <input type="date" className="form-input" value={form.end_date}
            onChange={(e) => update('end_date', e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2 mt-5">
        <button className="btn btn-primary" onClick={() => onSubmit({
          ...form,
          project_id: form.project_id ? Number(form.project_id) : null,
        })}>Save Sprint</button>
        <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
