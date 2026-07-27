import { useState } from 'react'
import { ROLE_OPTIONS, SKILL_OPTIONS } from '../../utils/constants'
import { validateResourceForm } from '../../utils/validators'

export default function ResourceForm({ initial, mainModules = [], onSubmit, onCancel }) {
  const [form, setForm] = useState({
    dev_code: initial?.dev_code || '',
    name: initial?.name || '',
    role: initial?.role || 'Developer',
    home_module_id: initial?.home_module_id || '',
    skill: initial?.skill || 'Backend',
    base_capacity: initial?.base_capacity ?? 192,
    active: initial?.active ?? true,
  })
  const [errors, setErrors] = useState({})

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const handleSubmit = () => {
    const errs = validateResourceForm(form)
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    onSubmit({
      ...form,
      home_module_id: form.home_module_id ? Number(form.home_module_id) : null,
      base_capacity: Number(form.base_capacity),
    })
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-4">
        <div className="flex flex-col gap-1">
          <label className="form-label">Developer ID *</label>
          <input className="form-input" placeholder="e.g., DEV040" value={form.dev_code}
            onChange={(e) => update('dev_code', e.target.value)} />
          {errors.dev_code && <span className="text-[11px] text-red-500">{errors.dev_code}</span>}
        </div>
        <div className="flex flex-col gap-1 col-span-2">
          <label className="form-label">Full Name *</label>
          <input className="form-input" placeholder="e.g., Jane Doe" value={form.name}
            onChange={(e) => update('name', e.target.value)} />
          {errors.name && <span className="text-[11px] text-red-500">{errors.name}</span>}
        </div>
        <div className="flex flex-col gap-1">
          <label className="form-label">Role</label>
          <select className="form-select" value={form.role} onChange={(e) => update('role', e.target.value)}>
            {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="form-label">Home Module</label>
          <select className="form-select" value={form.home_module_id}
            onChange={(e) => update('home_module_id', e.target.value)}>
            <option value="">Select Module...</option>
            {mainModules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="form-label">Key Skill *</label>
          <select className="form-select" value={form.skill} onChange={(e) => update('skill', e.target.value)}>
            {SKILL_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="form-label">Base Capacity (hrs/month) *</label>
          <select className="form-select" value={form.base_capacity}
            onChange={(e) => update('base_capacity', e.target.value)}>
            <option value={96}>96</option>
            <option value={160}>160</option>
            <option value={192}>192</option>
          </select>
          <span className="text-[10px] text-slate-400">96 = Lead/Manager, 192 = Full-time Dev</span>
        </div>
        <div className="flex flex-col gap-1">
          <label className="form-label">Active?</label>
          <select className="form-select" value={form.active ? 'yes' : 'no'}
            onChange={(e) => update('active', e.target.value === 'yes')}>
            <option value="yes">Active</option>
            <option value="no">Inactive</option>
          </select>
        </div>
      </div>
      <div className="flex gap-2 mt-5">
        <button className="btn btn-primary" onClick={handleSubmit}>Save Resource</button>
        <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
