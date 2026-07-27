import { useState } from 'react'

export default function SprintForm({ initial, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    start_date: initial?.start_date || '',
    end_date: initial?.end_date || '',
    status: initial?.status || 'Not Started',
  })
  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  return (
    <div>
      <div className="grid grid-cols-3 gap-4">
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
        <button className="btn btn-primary" onClick={() => onSubmit(form)}>Save Sprint</button>
        <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
