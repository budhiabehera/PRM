import { useState, useEffect, useMemo, useCallback } from 'react'
import { getTimeLogs, createTimeLog, updateTimeLog, deleteTimeLog, getTasks, getDailySummary, triggerHoursCheck } from '../services/api'
import { ChevronLeft, ChevronRight, Save, MessageSquare, X, Clock, Users, Send } from 'lucide-react'
import useAuthStore, { isManagerOrAbove } from '../store/useAuthStore'

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
  const [dailySummary, setDailySummary] = useState([])
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [checkingHours, setCheckingHours] = useState(false)

  const isManager = isManagerOrAbove(user)

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

  // Load daily summary for the week (combines time_logs + task_activities)
  const loadDailySummary = useCallback(async () => {
    setLoadingSummary(true)
    try {
      // Only fetch for today and past dates — skip future dates
      const today = new Date()
      today.setHours(23, 59, 59, 999)
      const promises = weekDays.filter(d => d <= today).map(d => getDailySummary(formatDate(d)))
      const results = await Promise.all(promises)
      setDailySummary(results)
    } catch {
      setDailySummary([])
    }
    setLoadingSummary(false)
  }, [weekDays])

  useEffect(() => { loadDailySummary() }, [loadDailySummary])

  // Check hours handler (Manager/Admin only)
  const handleCheckHours = async () => {
    setCheckingHours(true)
    try {
      const result = await triggerHoursCheck()
      showToast('success', `Checked ${result.developers_checked} developers, ${result.under_hours} under hours, ${result.emails_sent} emails sent`)
    } catch (err) {
      showToast('error', err.response?.data?.detail || 'Failed to check hours')
    }
    setCheckingHours(false)
  }

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

  // Activity hours from daily summary (for current user's footer breakdown)
  const activityHoursPerDay = useMemo(() => {
    const hours = Array(7).fill(0)
    dailySummary.forEach((dayData, dayIndex) => {
      if (!dayData?.developers) return
      const myData = dayData.developers.find(d => d.developer_id === user?.developer_id)
      if (myData) hours[dayIndex] = myData.activity_hours || 0
    })
    return hours
  }, [dailySummary, user?.developer_id])

  const totalActivityHours = useMemo(() => activityHoursPerDay.reduce((s, v) => s + v, 0), [activityHoursPerDay])

  // Summary data for the Daily Hours Summary section
  const summaryData = useMemo(() => {
    const devMap = {}
    dailySummary.forEach((dayData, dayIndex) => {
      if (!dayData?.developers) return
      dayData.developers.forEach(dev => {
        if (!devMap[dev.developer_id]) {
          devMap[dev.developer_id] = {
            developer_id: dev.developer_id,
            developer_name: dev.developer_name,
            days: Array.from({ length: 7 }, () => ({
              total_hours: 0, time_log_hours: 0, activity_hours: 0,
              is_on_leave: false, is_holiday: false
            }))
          }
        }
        devMap[dev.developer_id].days[dayIndex] = {
          total_hours: dev.total_hours || 0,
          time_log_hours: dev.time_log_hours || 0,
          activity_hours: dev.activity_hours || 0,
          is_on_leave: dev.is_on_leave || false,
          is_holiday: dev.is_holiday || false
        }
      })
    })

    let devList = Object.values(devMap)
    if (!isManager) {
      devList = devList.filter(d => d.developer_id === user?.developer_id)
    }
    devList.sort((a, b) => (a.developer_name || '').trim().toLowerCase().localeCompare((b.developer_name || '').trim().toLowerCase()))
    return devList
  }, [dailySummary, isManager, user?.developer_id])

  // Team totals per day for summary section
  const teamTotalPerDay = useMemo(() => {
    const totals = Array(7).fill(0)
    summaryData.forEach(dev => {
      dev.days.forEach((d, i) => { totals[i] += d.total_hours })
    })
    return totals
  }, [summaryData])

  const teamGrandTotal = useMemo(() => teamTotalPerDay.reduce((s, v) => s + v, 0), [teamTotalPerDay])

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
      // Refresh daily summary to reflect new saved hours
      await loadDailySummary()
    } catch (err) {
      showToast('error', err.response?.data?.detail || 'Failed to save time logs')
    }
    setSaving(false)
  }

  // Helper: style a summary cell based on hours / leave / holiday
  const getSummaryCellStyle = (day) => {
    if (day.is_holiday) return { indicator: '🎉', bg: 'bg-blue-50', text: 'text-blue-600', label: 'Holiday' }
    if (day.is_on_leave) return { indicator: '🏖️', bg: 'bg-purple-50', text: 'text-purple-600', label: 'On leave' }
    if (day.total_hours >= 8) return { indicator: '✅', bg: 'bg-emerald-50', text: 'text-emerald-700', label: '' }
    if (day.total_hours > 0) return { indicator: '⚠️', bg: 'bg-amber-50', text: 'text-amber-700', label: '' }
    return { indicator: '', bg: '', text: 'text-slate-400', label: '' }
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
          <p className="text-sm text-slate-500 mt-0.5">View hours logged from task activity — read only</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-secondary btn-sm" onClick={() => window.print()} title="Export to PDF">
            📄 Export PDF
          </button>
          <button
          onClick={handleSave}
          disabled={saving}
          className="btn btn-primary flex items-center gap-2"
        >
          <Save size={15} />
          {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
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
                        <div className="w-16 text-center text-xs py-1.5 px-1">
                          <span className={`font-mono ${
                            (cellData?.hours || 0) > 0 ? 'text-slate-800 font-semibold' : 'text-slate-300'
                          }`}>
                            {cellData?.hours || 0}
                          </span>
                          {hasNotes && (
                            <span className="text-indigo-400 ml-0.5" title={cellData.notes}>💬</span>
                          )}
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
                <td className="px-4 py-3 font-semibold text-slate-700 text-xs">Time Logged</td>
                {totalPerDay.map((total, i) => (
                  <td key={i} className="px-2 py-3 text-center">
                    <span className={`font-bold text-xs ${total > 8 ? 'text-amber-600' : 'text-slate-700'}`}>
                      {total.toFixed(1)}h
                    </span>
                  </td>
                ))}
                <td className="px-3 py-3 text-center">
                  <span className="font-bold text-slate-700 text-xs">{grandTotal.toFixed(1)}h</span>
                </td>
              </tr>
              {totalActivityHours > 0 && (
                <tr className="bg-slate-50/60">
                  <td className="px-4 py-2 text-xs text-slate-500 italic">Activity Hours</td>
                  {activityHoursPerDay.map((h, i) => (
                    <td key={i} className="px-2 py-2 text-center">
                      <span className="text-xs text-slate-500 italic">{h > 0 ? `${h.toFixed(1)}h` : ''}</span>
                    </td>
                  ))}
                  <td className="px-3 py-2 text-center">
                    <span className="text-xs text-slate-500 italic">{totalActivityHours.toFixed(1)}h</span>
                  </td>
                </tr>
              )}
              <tr className="bg-indigo-50/40 border-t border-slate-200">
                <td className="px-4 py-3 font-semibold text-slate-700 text-xs">Daily Total</td>
                {totalPerDay.map((total, i) => {
                  const combined = total + activityHoursPerDay[i]
                  return (
                    <td key={i} className="px-2 py-3 text-center" title={`Logged: ${total.toFixed(1)}h + Activity: ${activityHoursPerDay[i].toFixed(1)}h`}>
                      <span className={`font-bold text-xs ${combined >= 8 ? 'text-emerald-600' : combined > 0 ? 'text-slate-700' : 'text-slate-400'}`}>
                        {combined.toFixed(1)}h
                      </span>
                    </td>
                  )
                })}
                <td className="px-3 py-3 text-center">
                  <span className="font-bold text-indigo-600 text-sm">{(grandTotal + totalActivityHours).toFixed(1)}h</span>
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Daily Hours Summary — Combined time_logs + task_activities */}
      <div className="card mt-5">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-indigo-500" />
            <h2 className="text-sm font-bold text-slate-800">
              📊 Daily Hours Summary — Week of {weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </h2>
          </div>
          {isManager && (
            <button
              onClick={handleCheckHours}
              disabled={checkingHours}
              className="btn btn-secondary flex items-center gap-2 text-xs"
            >
              <Send size={13} />
              {checkingHours ? 'Checking...' : 'Check Hours & Send Reminders'}
            </button>
          )}
        </div>

        {loadingSummary ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading summary...</div>
        ) : summaryData.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            No summary data available for this week.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 min-w-[180px]">Resource</th>
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
                {summaryData.map((dev) => {
                  const weekTotal = dev.days.reduce((s, d) => s + d.total_hours, 0)
                  return (
                    <tr key={dev.developer_id} className="border-b border-slate-100 hover:bg-slate-50/50">
                      <td className="px-4 py-2.5">
                        <span className="font-medium text-slate-700 text-xs">{dev.developer_name}</span>
                      </td>
                      {dev.days.map((day, dayIndex) => {
                        const style = getSummaryCellStyle(day)
                        return (
                          <td key={dayIndex} className={`px-2 py-2.5 text-center ${style.bg}`}>
                            {day.is_holiday ? (
                              <span className="text-sm" title="Holiday">🎉</span>
                            ) : day.is_on_leave ? (
                              <span className="text-sm" title="On leave">🏖️</span>
                            ) : (
                              <div className="flex flex-col items-center">
                                <span className={`font-bold text-xs ${style.text}`}>
                                  {day.total_hours.toFixed(1)} {day.total_hours > 0 && style.indicator}
                                </span>
                                {(day.time_log_hours > 0 || day.activity_hours > 0) && (
                                  <span className="text-[10px] text-slate-400 mt-0.5" title={`Logged: ${day.time_log_hours.toFixed(1)}h + Activity: ${day.activity_hours.toFixed(1)}h`}>
                                    {day.time_log_hours.toFixed(1)}+{day.activity_hours.toFixed(1)}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                        )
                      })}
                      <td className="px-3 py-2.5 text-center">
                        <span className={`font-bold text-xs ${weekTotal >= 40 ? 'text-emerald-600' : 'text-slate-700'}`}>
                          {weekTotal.toFixed(1)}h
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {isManager && summaryData.length > 1 && (
                <tfoot>
                  <tr className="bg-slate-50 border-t border-slate-200">
                    <td className="px-4 py-3 font-semibold text-slate-700 text-xs">Team Total</td>
                    {teamTotalPerDay.map((total, i) => (
                      <td key={i} className="px-2 py-3 text-center">
                        <span className="font-bold text-xs text-slate-700">{total.toFixed(1)}h</span>
                      </td>
                    ))}
                    <td className="px-3 py-3 text-center">
                      <span className="font-bold text-indigo-600 text-sm">{teamGrandTotal.toFixed(1)}h</span>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* Legend */}
        <div className="px-5 py-3 border-t border-slate-100 flex flex-wrap gap-4 text-[11px] text-slate-500">
          <span>✅ ≥ 8h</span>
          <span>⚠️ &lt; 8h (needs attention)</span>
          <span>🏖️ On leave</span>
          <span>🎉 Holiday</span>
          <span className="text-slate-400 italic">Breakdown: logged + activity</span>
        </div>
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
