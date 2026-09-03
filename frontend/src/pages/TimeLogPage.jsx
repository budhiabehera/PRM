import { useState, useEffect, useMemo, useCallback } from 'react'
import { getTimeLogs, createTimeLog, updateTimeLog, deleteTimeLog, getTasks, getDailySummary, triggerHoursCheck } from '../services/api'
import { ChevronLeft, ChevronRight, Save, MessageSquare, X, Clock, Users, Send } from 'lucide-react'
import useAuthStore, { isManagerOrAbove, isSelfOnly } from '../store/useAuthStore'
import LoadingSpinner from '../components/common/LoadingSpinner'

function getSunday(d) {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day
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

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function getSummaryCellStyle(day) {
  if (day.is_holiday || day.is_on_leave) {
    return { bg: 'bg-slate-50', text: 'text-slate-400', indicator: '' }
  }
  if (day.total_hours >= 8) {
    return { bg: 'bg-emerald-50/60', text: 'text-emerald-700', indicator: '✓' }
  }
  if (day.total_hours > 0) {
    return { bg: 'bg-amber-50/60', text: 'text-amber-700', indicator: '⚠' }
  }
  return { bg: '', text: 'text-slate-400', indicator: '' }
}

export default function TimeLogPage() {
  const user = useAuthStore((s) => s.user)
  const [weekStart, setWeekStart] = useState(() => getSunday(new Date()))
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
      const devId = isSelfOnly() ? user?.developer_id : undefined
      const promises = weekDays.filter(d => d <= today).map(d => getDailySummary(formatDate(d), devId))
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
  const goToday = () => setWeekStart(getSunday(new Date()))

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

  const handleExportPDF = () => {
    const now = new Date()
    const generated = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    const weekLabel = `${formatShortDate(weekDays[0])} — ${formatShortDate(weekDays[6])}`

    const buildTable = (headers, rows) => {
      const ths = headers.map(h => `<th>${h}</th>`).join('')
      const trs = rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')
      return `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`
    }

    // Task rows
    const taskHeaders = ['Task', ...DAY_LABELS.map((lbl, i) => `${lbl} ${weekDays[i].getDate()}/${weekDays[i].getMonth()+1}`), 'Total']
    const taskRows = tasks.map(task => {
      const dayCells = weekDays.map((_, i) => {
        const key = `${task.id}-${i}`
        const h = grid[key]?.hours || 0
        return h > 0 ? `<strong>${h}</strong>` : '<span style="color:#cbd5e1">0</span>'
      })
      return [`<strong>${task.task_code}</strong><br><span style="font-size:10px;color:#64748b">${task.description || ''}</span>`, ...dayCells, `<strong>${(totalPerTask[task.id] || 0).toFixed(1)}h</strong>`]
    })

    // Footer: Daily Total
    const totalRow = ['<strong>Daily Total</strong>', ...totalPerDay.map(t => `<strong style="color:${t > 0 ? '#4f46e5' : '#94a3b8'}">${t.toFixed(1)}h</strong>`), `<strong style="color:#4f46e5">${grandTotal.toFixed(1)}h</strong>`]
    taskRows.push(totalRow)

    const html = `<!DOCTYPE html><html><head><title>Time Logs Report</title><style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; color: #1e293b; font-size: 12px; }
      h1 { font-size: 20px; margin-bottom: 2px; }
      .subtitle { font-size: 12px; color: #64748b; margin-bottom: 20px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
      th { padding: 6px 10px; border-bottom: 2px solid #cbd5e1; font-size: 11px; text-transform: uppercase; color: #475569; text-align: center; }
      th:first-child { text-align: left; }
      td { padding: 6px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; text-align: center; }
      td:first-child { text-align: left; }
      .generated { margin-top: 24px; font-size: 10px; color: #94a3b8; }
      @media print { body { padding: 0; } }
    </style></head><body>
      <h1>Time Logs Report</h1>
      <div class="subtitle">Week: ${weekLabel} | Generated on ${generated}</div>
      ${buildTable(taskHeaders, taskRows)}
      <div class="generated">PRM Report — ${generated}</div>
      <script>window.onload = function() { window.print(); }<\/script>
    </body></html>`

    const w = window.open('', '_blank')
    if (w) { w.document.write(html); w.document.close() }
  }

  const handleExportSummaryPDF = () => {
    if (summaryData.length === 0) return
    const now = new Date()
    const generated = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    const weekLabel = `${formatShortDate(weekDays[0])} — ${formatShortDate(weekDays[6])}`

    const dayHeaders = weekDays.map((d, i) => {
      const isWE = d.getDay() === 0 || d.getDay() === 6
      return isWE ? `<span style="color:#f87171">${DAY_LABELS[i]}<br>${d.getDate()}/${d.getMonth()+1}</span>` : `${DAY_LABELS[i]}<br>${d.getDate()}/${d.getMonth()+1}`
    })
    const headers = ['Resource', ...dayHeaders, 'Total']

    const rows = summaryData.map(dev => {
      const weekTotal = dev.days.reduce((s, d) => s + d.total_hours, 0)
      const dayCells = dev.days.map(day => {
        if (day.is_holiday) return '<span title="Holiday">🎉</span>'
        if (day.is_on_leave) return '<span title="On Leave">🏖️</span>'
        const h = day.total_hours
        if (h >= 8) return `<strong style="color:#059669">${h.toFixed(1)} ✓</strong>`
        if (h > 0) return `<strong style="color:#d97706">${h.toFixed(1)} ⚠</strong>`
        return '<span style="color:#cbd5e1">0.0</span>'
      })
      const totalStyle = weekTotal >= 40 ? 'color:#059669;font-weight:bold' : 'font-weight:bold'
      return [`<strong>${dev.developer_name}</strong>`, ...dayCells, `<span style="${totalStyle}">${weekTotal.toFixed(1)}h</span>`]
    })

    // Team total row
    const teamWeekTotal = teamTotalPerDay.reduce((s, t) => s + t, 0)
    const teamRow = ['<strong>Team Total</strong>', ...teamTotalPerDay.map(t =>
      `<strong style="color:${t > 0 ? '#4f46e5' : '#94a3b8'}">${t.toFixed(1)}h</strong>`
    ), `<strong style="color:#4f46e5">${teamWeekTotal.toFixed(1)}h</strong>`]
    rows.push(teamRow)

    const ths = headers.map(h => `<th>${h}</th>`).join('')
    const trs = rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')
    const table = `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`

    const html = `<!DOCTYPE html><html><head><title>Daily Hours Summary</title><style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; color: #1e293b; font-size: 12px; }
      h1 { font-size: 20px; margin-bottom: 2px; }
      .subtitle { font-size: 12px; color: #64748b; margin-bottom: 20px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
      th { padding: 8px 10px; border-bottom: 2px solid #cbd5e1; font-size: 11px; text-transform: uppercase; color: #475569; text-align: center; background: #f8fafc; }
      th:first-child { text-align: left; }
      td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; text-align: center; }
      td:first-child { text-align: left; }
      tr:last-child td { border-top: 2px solid #cbd5e1; background: #f8fafc; }
      .generated { margin-top: 24px; font-size: 10px; color: #94a3b8; }
      @media print { body { padding: 0; } }
    </style></head><body>
      <h1>📊 Daily Hours Summary</h1>
      <div class="subtitle">Week: ${weekLabel} | ${summaryData.length} Resources | Generated on ${generated}</div>
      ${table}
      <div class="generated">PRM Report — ${generated}</div>
      <script>window.onload = function() { window.print(); }<\/script>
    </body></html>`

    const w = window.open('', '_blank')
    if (w) { w.document.write(html); w.document.close() }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">⏱️ Time Logs</h2>
          <p className="text-xs text-slate-500 mt-0.5">Hours logged from task activity log — read only</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-secondary px-5 py-2 text-sm flex items-center gap-2 whitespace-nowrap" onClick={handleExportPDF} title="Export to PDF">📄 Export PDF</button>
        </div>
      </div>

      {/* Week Navigation */}
      <div className="card mb-5">
        <div className="flex items-center justify-between py-3 px-5">
          <button onClick={() => setWeekStart(prev => addDays(prev, -7))} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
            <ChevronLeft size={20} className="text-slate-600" />
          </button>
          <div className="text-center">
            <span className="text-sm font-semibold text-slate-700">
              {formatShortDate(weekDays[0])} — {formatShortDate(weekDays[6])}
            </span>
            {formatDate(weekStart) === formatDate(new Date()) && <span className="ml-2 text-indigo-600 font-medium text-xs">This Week</span>}
          </div>
          <button onClick={() => setWeekStart(prev => addDays(prev, 7))} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
            <ChevronRight size={20} className="text-slate-600" />
          </button>
        </div>
      </div>

      {/* Time Log Grid */}
      <div className="card">
        {loading ? (
          <LoadingSpinner label="Loading time logs..." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left px-4 py-3 font-semibold text-slate-600 min-w-[200px]">Task</th>
                {weekDays.map((d, i) => (
                  <th key={i} className={`text-center px-2 py-3 font-semibold min-w-[65px] ${d.getDay() === 0 || d.getDay() === 6 ? 'text-red-400 bg-red-50/40' : 'text-slate-600'}`}>
                    <div>{DAY_LABELS[i]}</div>
                    <div className="text-[10px] font-normal">{d.getDate()}/{d.getMonth()+1}</div>
                  </th>
                ))}
                <th className="text-center px-3 py-3 font-semibold text-slate-600">Total</th>
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
              <tr className="bg-indigo-50/40 border-t border-slate-200">
                <td className="px-4 py-3 font-semibold text-slate-700 text-xs">Daily Total</td>
                {totalPerDay.map((total, i) => (
                  <td key={i} className="px-2 py-3 text-center">
                    <span className={`font-bold text-xs ${total >= 8 ? 'text-green-600' : total > 0 ? 'text-indigo-600' : 'text-slate-300'}`}>
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

      {/* Daily Hours Summary — Combined time_logs + task_activities */}
      <div className="card mt-5">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-indigo-500" />
            <h2 className="text-sm font-bold text-slate-800">
              📊 Daily Hours Summary — Week of {weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {summaryData.length > 0 && (
              <button className="btn btn-secondary px-5 py-2 text-sm flex items-center gap-2 whitespace-nowrap" onClick={handleExportSummaryPDF} title="Export Summary to PDF">
                📄 Export PDF
              </button>
            )}
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
                    <th key={i} className={`text-center px-2 py-3 font-semibold min-w-[90px] ${d.getDay() === 0 || d.getDay() === 6 ? 'bg-red-50/60 text-red-400' : 'text-slate-600'}`}>
                      <div className={`text-xs ${d.getDay() === 0 || d.getDay() === 6 ? 'text-red-400' : 'text-slate-400'}`}>{DAY_LABELS[i]}</div>
                      <div className={`text-[11px] ${d.getDay() === 0 || d.getDay() === 6 ? 'text-red-300' : 'text-slate-500'}`}>{d.getDate()}/{d.getMonth() + 1}</div>
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
                        const isWeekend = weekDays[dayIndex]?.getDay() === 0 || weekDays[dayIndex]?.getDay() === 6
                        return (
                          <td key={dayIndex} className={`px-2 py-2.5 text-center ${isWeekend ? 'bg-red-50/40' : style.bg}`}>
                            {day.is_holiday ? (
                              <span className="text-sm" title="Holiday">🎉</span>
                            ) : day.is_on_leave ? (
                              <span className="text-sm" title="On leave">🏖️</span>
                            ) : (
                              <div className="flex flex-col items-center">
                                <span className={`font-bold text-xs ${style.text}`}>
                                  {day.total_hours.toFixed(1)} {day.total_hours > 0 && style.indicator}
                                </span>
                                
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
                      <td key={i} className={`px-2 py-3 text-center ${weekDays[i]?.getDay() === 0 || weekDays[i]?.getDay() === 6 ? 'bg-red-50/40' : ''}`}>
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