import { useState } from 'react'
import { toDateInput } from '../../utils/formatters'
import { validateProjectForm } from '../../utils/validators'

const STATUS_OPTIONS = ['Active', 'Inactive', 'Planning', 'Completed']

export default function ProjectForm({ initial, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    code: initial?.code || '',
    status: initial?.status || 'Active',
    start_date: toDateInput(initial?.start_date) || '',
    end_date: toDateInput(initial?.end_date) || '',
    description: initial?.description || '',
    hours_check_enabled: initial?.hours_check_enabled || false,
  })
  const [errors, setErrors] = useState({})

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const handleSubmit = () => {
    const errs = validateProjectForm(form)
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    onSubmit({
      ...form,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
    })
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label className="form-label">Project Name *</label>
          <input className="form-input" placeholder="e.g., FX FOM" value={form.name}
            onChange={(e) => update('name', e.target.value)} />
          {errors.name && <span className="text-[11px] text-red-500">{errors.name}</span>}
        </div>
        <div className="flex flex-col gap-1">
          <label className="form-label">Project Code *</label>
          <input className="form-input" placeholder="e.g., FXFOM" value={form.code}
            onChange={(e) => update('code', e.target.value)} />
          {errors.code && <span className="text-[11px] text-red-500">{errors.code}</span>}
        </div>
        <div className="flex flex-col gap-1">
          <label className="form-label">Status</label>
          <select className="form-select" value={form.status} onChange={(e) => update('status', e.target.value)}>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="form-label">Start Date</label>
          <input type="date" className="form-input" value={form.start_date}
            onChange={(e) => update('start_date', e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="form-label">End Date</label>
          <input type="date" className="form-input" value={form.end_date}
            onChange={(e) => update('end_date', e.target.value)} />
        </div>
        <div className="flex flex-col gap-1 col-span-2">
          <label className="form-label">Description</label>
          <textarea className="form-textarea" placeholder="Brief project description..." value={form.description}
            onChange={(e) => update('description', e.target.value)} />
        </div>
        <div className="flex items-center gap-2 col-span-2 mt-1">
          <input
            type="checkbox"
            id="hours_check_enabled"
            checked={form.hours_check_enabled}
            onChange={(e) => update('hours_check_enabled', e.target.checked)}
          />
          <label htmlFor="hours_check_enabled" className="text-sm text-slate-700">
            Enable daily hours check email <span className="text-slate-400">(sends reminder per configured schedule if resource logs below threshold — see Settings)</span>
          </label>
        </div>
      </div>
      <div className="flex gap-2 mt-5">
        <button className="btn btn-primary" onClick={handleSubmit}>Save Project</button>
        <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
