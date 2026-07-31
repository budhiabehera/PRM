import { useState, useEffect } from 'react'
import { getTaskActivities, createTaskActivity, deleteTaskActivity } from '../services/api'
import { formatShortDate } from '../utils/formatters'

export default function TaskActivityPanel({ task, user, onUpdate }) {
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    activity_date: new Date().toISOString().split('T')[0],
    description: '',
    hours_spent: '',
    percentage: '',
  })
  const [error, setError] = useState('')

  const loadActivities = async () => {
    try {
      const data = await getTaskActivities(task.id)
      setActivities(data)
    } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => {
    loadActivities()
  }, [task.id])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.description.trim()) { setError('Please enter activity description'); return }
    try {
      await createTaskActivity({
        task_id: task.id,
        developer_id: user?.developer_id || null,
        activity_date: form.activity_date,
        description: form.description.trim(),
        hours_spent: Number(form.hours_spent) || 0,
        percentage: Number(form.percentage) || 0,
      })
      setForm({ activity_date: new Date().toISOString().split('T')[0], description: '', hours_spent: '', percentage: '' })
      setShowForm(false)
      loadActivities()
      if (onUpdate) onUpdate()
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not save activity')
    }
  }

  const handleDelete = async (id) => {
    await deleteTaskActivity(id)
    loadActivities()
    if (onUpdate) onUpdate()
  }

  const formatDateTime = (dt) => {
    if (!dt) return ''
    const d = new Date(dt)
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })
  }

  return (
    <div className="mt-3 pt-3 border-t border-slate-200">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Task Activity Log</span>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? 'Cancel' : '+ Add Activity'}
        </button>
      </div>

      {/* Add Activity Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-lg p-3 mb-3">
          <div className="grid grid-cols-4 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-500 font-medium">Date *</label>
              <input type="date" className="form-input text-xs" value={form.activity_date} max={new Date().toISOString().split('T')[0]}
                onChange={(e) => setForm((f) => ({ ...f, activity_date: e.target.value }))} required />
            </div>
            <div className="flex flex-col gap-1 col-span-2">
              <label className="text-[10px] text-slate-500 font-medium">What was done *</label>
              <input className="form-input text-xs" placeholder="e.g., Completed API integration"
                value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} required />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-500 font-medium">Hours Spent</label>
              <input type="number" step="0.5" min="0" className="form-input text-xs" placeholder="e.g., 4"
                value={form.hours_spent} onChange={(e) => setForm((f) => ({ ...f, hours_spent: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-500 font-medium">Task % Complete</label>
              <input type="number" min="0" max="100" className="form-input text-xs" placeholder="e.g., 75"
                value={form.percentage} onChange={(e) => setForm((f) => ({ ...f, percentage: e.target.value }))} />
            </div>
            <div className="flex items-end col-span-3">
              <button type="submit" className="btn btn-primary btn-sm">Save Activity</button>
            </div>
          </div>
          {error && <div className="text-[11px] text-red-600 mt-2">{error}</div>}
        </form>
      )}

      {/* Activity List */}
      {loading ? (
        <div className="text-xs text-slate-400 py-2">Loading activities...</div>
      ) : activities.length === 0 ? (
        <div className="text-xs text-slate-400 py-2">No activity logged yet</div>
      ) : (
        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {activities.map((a) => (
            <div key={a.id} className="flex items-center justify-between bg-white border border-slate-100 rounded-lg px-3 py-2 text-xs">
              <div className="flex items-center gap-3">
                <span className="text-slate-400 font-medium w-16">{formatShortDate(a.activity_date)}</span>
                <span className="text-slate-700">{a.description}</span>
                {a.created_by_name && (
                  <span className="text-slate-400">— by {a.created_by_name}</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {a.created_at && (
                  <span className="text-slate-400 text-[10px]">{formatDateTime(a.created_at)}</span>
                )}
                {a.hours_spent > 0 && <span className="text-slate-500">{a.hours_spent}h</span>}
                {a.percentage > 0 && (
                  <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full text-[10px] font-medium">
                    {a.percentage}%
                  </span>
                )}
                <button className="text-red-400 hover:text-red-600 text-[11px]" onClick={() => handleDelete(a.id)}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
