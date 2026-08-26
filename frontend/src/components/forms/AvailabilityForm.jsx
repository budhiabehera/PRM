import { useState, useMemo } from 'react'

function countWorkingDays(start, end) {
  if (!start || !end) return 0
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  if (e < s) return 0
  let count = 0
  const current = new Date(s)
  while (current <= e) {
    const dow = current.getDay() // 0=Sun, 6=Sat
    if (dow !== 0 && dow !== 6) count++
    current.setDate(current.getDate() + 1)
  }
  return count
}

export default function AvailabilityForm({
  resources = [], sprints = [], onSubmit, onCancel,
  lockDeveloper = false, defaultDeveloperId,
}) {
  const [form, setForm] = useState({
    developer_id: defaultDeveloperId ? String(defaultDeveloperId) : '',
    sprint_id: '',
    start_date: new Date().toISOString().slice(0, 10),
    end_date: '',
    notes: '',
  })
  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const leaveDays = useMemo(() => countWorkingDays(form.start_date, form.end_date), [form.start_date, form.end_date])
  const reducedHours = leaveDays * 8

  const handleSubmit = () => {
    if (!form.developer_id || !form.sprint_id) return
    if (!form.start_date || !form.end_date) return
    onSubmit({
      developer_id: Number(form.developer_id),
      sprint_id: Number(form.sprint_id),
      start_date: form.start_date,
      end_date: form.end_date,
      leave_days: leaveDays,
      notes: form.notes,
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
            <option value="">Select Resource...</option>
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
          <label className="form-label">Start Date *</label>
          <input type="date" className="form-input" value={form.start_date}
            onChange={(e) => update('start_date', e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="form-label">End Date *</label>
          <input type="date" className="form-input" value={form.end_date}
            onChange={(e) => update('end_date', e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="form-label">Leave Days (auto-calculated)</label>
          <input type="number" className="form-input bg-slate-50" value={leaveDays} readOnly disabled />
          <span className="text-[10px] text-slate-400">Weekdays only (Sat/Sun excluded)</span>
        </div>
        <div className="flex flex-col gap-1">
          <label className="form-label">Reduced Hours</label>
          <input className="form-input bg-slate-50 font-semibold text-red-600" value={`${reducedHours}h`} readOnly disabled />
          <span className="text-[10px] text-slate-400">{leaveDays} days × 8 hrs/day</span>
        </div>
        <div className="flex flex-col gap-1 col-span-2">
          <label className="form-label">Notes</label>
          <input className="form-input" placeholder="e.g., Planned vacation, Medical leave" value={form.notes}
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
