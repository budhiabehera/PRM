import { useState } from 'react'
import { STATUS_OPTIONS } from '../../utils/constants'

export default function QuickTaskUpdateForm({ task, onSubmit, onCancel }) {
  const [status, setStatus] = useState(task.status)
  const [actualHours, setActualHours] = useState(task.actual_hours)

  return (
    <div>
      <p className="text-xs text-slate-500 mb-4">
        As a Developer you can update the status and actual hours logged on your own tasks.
        Other fields (priority, dates, assignment) require a Lead, Manager, or Admin.
      </p>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label className="form-label">Status</label>
          <select className="form-select" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="form-label">Actual Hours</label>
          <input type="number" className="form-input" value={actualHours} onChange={(e) => setActualHours(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2 mt-5">
        <button className="btn btn-primary" onClick={() => onSubmit({ status, actual_hours: Number(actualHours) || 0 })}>
          Save Update
        </button>
        <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
