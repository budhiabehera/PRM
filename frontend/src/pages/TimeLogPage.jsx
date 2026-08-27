import { useState, useEffect, useMemo, useCallback } from 'react'
import { getTimeLogs, createTimeLog, updateTimeLog, deleteTimeLog, getTasks } from '../services/api'
import { ChevronLeft, ChevronRight, Save, MessageSquare, X, Clock } from 'lucide-react'
import useAuthStore from '../store/useAuthStore'

function getMonday(d) {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  date.setDate(diff)
  date.setHours(0, 0, 0, 0)
  return date
}

function addDays(d, n) {
  const date = new Date(d)
  date.setDate(date.getDate() + n)
  return date
}

function formatDate(d) {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatShortDate(d) {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function TimeLogPage() {
  const user = useAuthStore((s) => s.user)
  const [weekStart, setWeekStart] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d })
  const [timeLogs, setTimeLogs] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [notesModal, setNotesModal] = useState(null) // { taskId, dayIndex, notes }
  const [grid, setGrid] = useState({}) // { `${taskId}-${dayIndex}`: { hours, notes, id } }

  const showToast = (type, text) => {
    setToast({ type, text })
    setTimeout(() => setToast(null), 4000)
  }

  // Week days array
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  }, [weekStart])

  const dateFrom = formatDate(weekDays[0])
  const dateTo = formatDate(weekDays[6])

  // Load tasks assigned to the current user
  const loadTasks = useCallback(async () => {
    try {
      const data = await getTasks({ developer_id: user?.developer_id })
      setTasks(data.filter(t => t.status !== 'Completed' && t.status !== 'Cancelled'))
    } catch {
      setTasks([])
    }
  }, [user?.developer_id])

  // Load time logs for current week
  const loadTimeLogs = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getTimeLogs({ date_from: dateFrom, date_to: dateTo })
      setTimeLogs(data)
    } catch {
      setTimeLogs([])
    }
    setLoading(false)
  }, [dateFrom, dateTo])

  useEffect(() => { loadTasks() }, [loadTasks])
  useEffect(() => { loadTimeLogs() }, [loadTimeLogs])

  // Build grid from loaded time logs
  useEffect(() => {
    const newGrid = {}
    timeLogs.forEach((tl) => {
      const dayIndex = weekDays.findIndex(
        (d) => formatDate(d) === tl.date
      )
      if (dayIndex >= 0) {
        const key = `${tl.task_id}-${dayIndex}`
        newGrid[key] = { hours: tl.hours, notes: tl.notes || '', id: tl.id }
      }
    })
    setGrid(newGrid)
  }, [timeLogs, weekDays])

  // Navigate weeks
  const prevWeek = () => setWeekStart(addDays(weekStart, -7))
  const nextWeek = () => setWeekStart(addDays(weekStart, 7))
  const goToday = () => setWeekStart(getMonday(new Date()))

  // Grid cell change
  const handleHoursChange = (taskId, dayIndex, value) => {
    const key = `${taskId}-${dayIndex}`
    const numVal = value === '' ? 0 : parseFloat(value)
    if (isNaN(numVal)) return
    setGrid((prev) => ({
      ...prev,
      [key]: { ...prev[key], hours: numVal, notes: prev[key]?.notes || '' },
    }))
  }

  // Notes
  const handleNotesOpen = (taskId, dayIndex) => {
    const key = `${taskId}-${dayIndex}`
    setNotesModal({ taskId, dayIndex, notes: grid[key]?.notes || '' })
  }

  const handleNotesSave = () => {
    if (!notesModal) return
    const key = `${notesModal.taskId}-${notesModal.dayIndex}`
    setGrid((prev) => ({
      ...prev,
      [key]: { ...prev[key], hours: prev[key]?.hours || 0, notes: notesModal.notes },
    }))
    setNotesModal(null)
  }

  // Totals
  const totalPerDay = useMemo(() => {
    const totals = Array(7).fill(0)
    Object.entries(grid).forEach(([key, val]) => {
      const dayIndex = parseInt(key.split('-').pop())
      totals[dayIndex] += val.hours || 0
    })
    return totals
  }, [grid])

  const totalPerTask = useMemo(() => {
    const totals = {}
    Object.entries(grid).forEach(([key, val]) => {
      const taskId = parseInt(key.split('-')[0])
      totals[taskId] = (totals[taskId] || 0) + (val.hours || 0)
    })
    return totals
  }, [grid])

  const grandTotal = useMemo(() => totalPerDay.reduce((s, v) => s + v, 0), [totalPerDay])

  // Save all
  const handleSave = async () => {
    setSaving(true)
    try {
      const promises = []

      // Process each grid cell
      for (const [key, val] of Object.entries(grid)) {
        const [taskIdStr, dayIndexStr] = key.split('-')
        const taskId = parseInt(taskIdStr)
        const dayIndex = parseInt(dayIndexStr)
        const dateStr = formatDate(weekDays[dayIndex])

        if (val.id && val.hours > 0) {
          // Update existing
          promises.push(updateTimeLog(val.id, { date: dateStr, hours: val.hours, notes: val.notes || null, task_id: taskId }))
        } else if (val.id && val.hours === 0) {
          // Delete if hours set to 0
          promises.push(deleteTimeLog(val.id))
        } else if (!val.id && val.hours > 0) {
          // Create new
          promises.push(createTimeLog({ date: dateStr, hours: val.hours, notes: val.notes || null, task_id: taskId }))
        }
      }

      await Promise.all(promises)
      showToast('success', 'Time logs saved successfully!')
      await loadTimeLogs()
    } catch (err) {
      showToast('error', err.response?.data?.detail || 'Failed to save time logs')
    }
    setSaving(false)
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
          toast.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {toast.text}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Clock size={22} className="text-indigo-500" />
            Time Logs
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Log hours against your assigned tasks</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn btn-primary flex items-center gap-2"
        >
          <Save size={15} />
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* Week navigator */}
      <div className="card p-4 mb-5">
        <div className="flex items-center justify-between">
          <button onClick={prevWeek} className="btn btn-secondary p-2">
            <ChevronLeft size={16} />
          </button>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-slate-700">
              {formatShortDate(weekDays[0])} — {formatShortDate(weekDays[6])}
            </span>
            <button onClick={goToday} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">
              Today
            </button>
          </div>
          <button onClick={nextWeek} className="btn btn-secondary p-2">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Time grid */}
      <div className="card overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-slate-400">Loading...</div>
        ) : tasks.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            No active tasks assigned to you. Tasks will appear here once assigned.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 font-semibold text-slate-600 min-w-[200px]">Task</th>
                {weekDays.map((d, i) => (
                  <th key={i} className="text-center px-2 py-3 font-semibold text-slate-600 min-w-[90px]">
                    <div className="text-xs text-slate-400">{DAY_LABELS[i]}</div>
                    <div className="text-[11px] text-slate-500">{d.getDate()}/{d.getMonth() + 1}</div>
                  </th>
                ))}
                <th className="text-center px-3 py-3 font-semibold text-slate-600 min-w-[70px]">Total</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="px-4 py-2">
                    <div className="font-medium text-slate-700 text-xs">{task.task_code}</div>
                    <div className="text-[11px] text-slate-500 truncate max-w-[220px]" title={task.description}>
                      {task.description}
                    </div>
                  </td>
                  {weekDays.map((_, dayIndex) => {
                    const key = `${task.id}-${dayIndex}`
                    const cellData = grid[key]
                    const hasNotes = cellData?.notes && cellData.notes.length > 0
                    return (
                      <td key={dayIndex} className="px-1 py-2 text-center">
                        <div className="relative inline-flex items-center">
                          <input
                            type="number"
                            min="0"
                            max="24"
                            step="0.25"
                            value={cellData?.hours || ''}
                            onChange={(e) => handleHoursChange(task.id, dayIndex, e.target.value)}
                            placeholder="0"
                            className="form-input w-16 text-center text-xs py-1.5 px-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <button
                            onClick={() => handleNotesOpen(task.id, dayIndex)}
                            className={`absolute -right-5 p-0.5 rounded ${
                              hasNotes ? 'text-indigo-500' : 'text-slate-300 hover:text-slate-500'
                            }`}
                            title="Add notes"
                          >
                            <MessageSquare size={11} />
                          </button>
                        </div>
                      </td>
                    )
                  })}
                  <td className="px-3 py-2 text-center">
                    <span className="font-semibold text-slate-700 text-xs">
                      {(totalPerTask[task.id] || 0).toFixed(1)}h
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t border-slate-200">
                <td className="px-4 py-3 font-semibold text-slate-700 text-xs">Daily Total</td>
                {totalPerDay.map((total, i) => (
                  <td key={i} className="px-2 py-3 text-center">
                    <span className={`font-bold text-xs ${total > 8 ? 'text-amber-600' : 'text-slate-700'}`}>
                      {total.toFixed(1)}h
                    </span>
                  </td>
                ))}
                <td className="px-3 py-3 text-center">
                  <span className="font-bold text-indigo-600 text-sm">{grandTotal.toFixed(1)}h</span>
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Notes Modal */}
      {notesModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setNotesModal(null)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-800">Notes</h3>
              <button onClick={() => setNotesModal(null)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <textarea
              value={notesModal.notes}
              onChange={(e) => setNotesModal({ ...notesModal, notes: e.target.value })}
              placeholder="Add notes for this time entry..."
              className="form-input w-full h-28 resize-none text-sm"
              maxLength={500}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setNotesModal(null)} className="btn btn-secondary text-xs">Cancel</button>
              <button onClick={handleNotesSave} className="btn btn-primary text-xs">Save Notes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
