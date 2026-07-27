import { useState } from 'react'

export default function WorkTypeForm({ initial, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    customer_committed: initial?.customer_committed ?? false,
    color: initial?.color || '#4f46e5',
  })
  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  return (
    <div>
      <div className="grid grid-cols-3 gap-4">
        <div className="flex flex-col gap-1">
          <label className="form-label">Work Type Name *</label>
          <input className="form-input" placeholder="e.g., Bug Fix" value={form.name}
            onChange={(e) => update('name', e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="form-label">Customer Committed? *</label>
          <select className="form-select" value={form.customer_committed ? 'yes' : 'no'}
            onChange={(e) => update('customer_committed', e.target.value === 'yes')}>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
          <span className="text-[10px] text-slate-400">Committed = billable / SLA-bound</span>
        </div>
        <div className="flex flex-col gap-1">
          <label className="form-label">Color Code</label>
          <input type="color" className="form-input h-10 p-1" value={form.color}
            onChange={(e) => update('color', e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2 mt-5">
        <button className="btn btn-primary" onClick={() => onSubmit(form)}>Save Work Type</button>
        <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
