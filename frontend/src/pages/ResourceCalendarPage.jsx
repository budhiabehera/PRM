import { useState, useEffect, useMemo } from 'react'
import { getResourceCalendar, getProjects } from '../services/api'
import useDropdowns from '../hooks/useDropdowns'
import useProjectDefault from '../hooks/useProjectDefault'
import useAuthStore, { isSelfOnly } from '../store/useAuthStore'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import LoadingSpinner from '../components/common/LoadingSpinner'
import FilterSelect from '../components/common/FilterSelect'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate()
}

function getBarWidth(hours, capacity) {
  if (capacity === 0) return 0
  return Math.min((hours / capacity) * 100, 100)
}

function getWeekNumber(d) {
  const date = new Date(d)
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7))
  const week1 = new Date(date.getFullYear(), 0, 4)
  return 1 + Math.round(((date - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
}

export default function ResourceCalendarPage() {
  const today = new Date()
  const user = useAuthStore((s) => s.user)
  const isDeveloper = isSelfOnly()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [projects, setProjects] = useState([])
  const { defaultProjectId, showAllOption, restrictedProjects: rpProjects } = useProjectDefault()
  const [projectFilter, setProjectFilter] = useState(defaultProjectId)
  const [resourceFilter, setResourceFilter] = useState(isDeveloper && user?.developer_id ? String(user.developer_id) : '')
  const [viewMode, setViewMode] = useState('month') // 'day', 'week', 'month'
  const [selectedDay, setSelectedDay] = useState(today.getDate())
  const [selectedWeekStart, setSelectedWeekStart] = useState(null)
  const [expandedResource, setExpandedResource] = useState(null)
  const [selectedCell, setSelectedCell] = useState(null)

  const { resources: allResources } = useDropdowns()

  useEffect(() => {
    getProjects().then(setProjects).catch(() => {})
  }, [])

  // Initialize week start to current week's Sunday (Sun-Sat week)
  useEffect(() => {
    const ref = (year === today.getFullYear() && month === today.getMonth() + 1)
      ? new Date(year, month - 1, today.getDate())
      : new Date(year, month - 1, 1)
    // Find Sunday: getDay() returns 0=Sun, so Sunday = ref - getDay()
    const sunday = new Date(ref)
    sunday.setDate(ref.getDate() - ref.getDay())
    // If Sunday is in previous month and we're viewing current month, start from day 1
    if (sunday.getMonth() + 1 !== month || sunday.getFullYear() !== year) {
      setSelectedWeekStart(1)
    } else {
      setSelectedWeekStart(sunday.getDate())
    }
  }, [month, year])

  const loadData = async () => {
    setLoading(true)
    try {
      const params = { year, month }
      if (isDeveloper && user?.developer_id) params.developer_id = user.developer_id
      if (projectFilter) params.project_id = projectFilter
      const result = await getResourceCalendar(params)
      setData(result)
    } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [year, month, projectFilter])

  const daysInMonth = getDaysInMonth(year, month)

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(year - 1) }
    else setMonth(month - 1)
  }
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(year + 1) }
    else setMonth(month + 1)
  }

  // Determine which days to show based on view mode
  // Compute the Sunday date for the current week view (Sun-Sat week)
  const weekSunday = useMemo(() => {
    if (viewMode !== 'week') return null
    const start = selectedWeekStart || 1
    const clampedDay = Math.min(Math.max(start, 1), daysInMonth)
    const d = new Date(year, month - 1, clampedDay)
    // Find Sunday: go back by getDay() days
    const sun = new Date(d)
    sun.setDate(d.getDate() - d.getDay())
    return sun
  }, [viewMode, selectedWeekStart, year, month, daysInMonth])

  const visibleDays = useMemo(() => {
    const days = []
    if (viewMode === 'day') {
      days.push(Math.min(selectedDay, daysInMonth))
    } else if (viewMode === 'week' && weekSunday) {
      // Generate 7 days from Monday, but only include days that belong to the current month
      for (let i = 0; i < 7; i++) {
        const d = new Date(weekSunday)
        d.setDate(weekSunday.getDate() + i)
        if (d.getMonth() + 1 === month && d.getFullYear() === year) {
          days.push(d.getDate())
        }
      }
      // If no days from current month (week is entirely in prev/next month), show first/last week
      if (days.length === 0) {
        for (let d = 1; d <= Math.min(7, daysInMonth); d++) days.push(d)
      }
    } else {
      for (let d = 1; d <= daysInMonth; d++) {
        days.push(d)
      }
    }
    return days
  }, [viewMode, selectedDay, weekSunday, daysInMonth, month, year])

  // Day headers for visible days
  const dayHeaders = useMemo(() => {
    return visibleDays.map((d) => {
      const dt = new Date(year, month - 1, d)
      const dow = dt.getDay() // 0=Sun, 6=Sat
      return {
        day: d,
        dow,
        isWeekend: dow === 0 || dow === 6,
        label: DAY_ABBR[dow],
      }
    })
  }, [visibleDays, year, month])

  // Filter resources
  const filteredResources = useMemo(() => {
    if (!data) return []
    let resources = data.resources
    if (resourceFilter) {
      resources = resources.filter((r) => r.developer_id === Number(resourceFilter))
    }
    return resources
  }, [data, resourceFilter])

  const handleExportPDF = () => {
    const now = new Date()
    const generated = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    const projectName = projectFilter ? (projects.find(p => String(p.id) === String(projectFilter))?.name || '') : 'All Projects'

    const buildTable = (headers, rows) => {
      const ths = headers.map(h => `<th>${h}</th>`).join('')
      const trs = rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')
      return `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`
    }

    const headers = ['Resource', ...visibleDays.map(d => {
      const dt = new Date(year, month - 1, d)
      const dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dt.getDay()]
      return `${dow} ${d}`
    }), 'Total', 'Util %']

    const rows = filteredResources.map(res => {
      const dayCells = visibleDays.map(d => {
        const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`
        const dayData = res.days[dateStr]
        const hours = dayData?.total_hours || 0
        const capacity = dayData?.capacity_hours || 0
        const isWeekend = dayData?.is_weekend
        if (isWeekend) return '<span style="color:#94a3b8">\u2014</span>'
        const color = hours > capacity ? '#dc2626' : hours >= capacity * 0.5 ? '#16a34a' : hours > 0 ? '#d97706' : '#94a3b8'
        return `<span style="color:${color};font-weight:600">${hours}</span>`
      })
      const visibleTotal = visibleDays.reduce((sum, d) => {
        const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`
        return sum + (res.days[dateStr]?.total_hours || 0)
      }, 0)
      const visibleCapacity = visibleDays.reduce((sum, d) => {
        const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`
        return sum + (res.days[dateStr]?.capacity_hours || 0)
      }, 0)
      const util = visibleCapacity > 0 ? Math.round((visibleTotal / visibleCapacity) * 100) : 0
      const utilColor = util > 100 ? '#dc2626' : util >= 70 ? '#16a34a' : util >= 40 ? '#d97706' : '#64748b'
      return [`<strong>${res.developer_name}</strong><br><span style="font-size:10px;color:#64748b">${res.role} · ${res.skill}</span>`, ...dayCells, `<strong>${visibleTotal}h</strong>`, `<span style="color:${utilColor};font-weight:700">${util}%</span>`]
    })

    const html = `<!DOCTYPE html><html><head><title>Resource Calendar Report</title><style>
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
      <h1>Resource Calendar Report</h1>
      <div class="subtitle">${MONTH_NAMES[month - 1]} ${year} | Project: ${projectName} | Generated on ${generated}</div>
      ${buildTable(headers, rows)}
      <div class="generated">PRM Report — ${generated}</div>
      <script>window.onload = function() { window.print(); }<\/script>
    </body></html>`

    const printWindow = window.open('', '_blank')
    printWindow.document.write(html)
    printWindow.document.close()
  }

  // Week navigation — step by 7 days, switch month if needed
  const prevWeek = () => {
    if (!weekSunday) return
    const prev = new Date(weekSunday)
    prev.setDate(prev.getDate() - 7)
    if (prev.getMonth() + 1 !== month || prev.getFullYear() !== year) {
      setMonth(prev.getMonth() + 1)
      setYear(prev.getFullYear())
    }
    setSelectedWeekStart(prev.getDate())
  }
  const nextWeek = () => {
    if (!weekSunday) return
    const next = new Date(weekSunday)
    next.setDate(next.getDate() + 7)
    if (next.getMonth() + 1 !== month || next.getFullYear() !== year) {
      setMonth(next.getMonth() + 1)
      setYear(next.getFullYear())
    }
    setSelectedWeekStart(next.getDate())
  }

  // Day navigation
  const prevDay = () => {
    if (selectedDay > 1) setSelectedDay(selectedDay - 1)
    else { prevMonth(); setSelectedDay(getDaysInMonth(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1)) }
  }
  const nextDay = () => {
    if (selectedDay < daysInMonth) setSelectedDay(selectedDay + 1)
    else { nextMonth(); setSelectedDay(1) }
  }

  const toggleResource = (devId) => {
    setExpandedResource((prev) => (prev === devId ? null : devId))
  }

  if (loading) return <LoadingSpinner label="Loading resource calendar..." />

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Resource Calendar</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            <span title="Hours are from task activity logs. Each cell shows hours logged for that day. Default capacity = 8 hrs/day. Red = exceeded capacity, Green = 50-100%, Grey = under 50%.">Daily time spent per resource — 8 hrs/day capacity. Click a cell to see task details. ⓘ</span>
          </p>
        </div>
        <button className="btn btn-secondary px-5 py-2 text-sm flex items-center gap-2 whitespace-nowrap" onClick={handleExportPDF} title="Export to PDF">
          📄 Export PDF
        </button>
      </div>

      {/* Controls Row */}
      <div className="flex items-center gap-4 mb-5 bg-white border border-slate-200 rounded-xl px-5 py-3 flex-wrap">
        {/* Navigation */}
        <button onClick={viewMode === 'day' ? prevDay : prevMonth}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600">
          <ChevronLeft size={20} />
        </button>
        <h3 className="text-lg font-semibold text-slate-800 min-w-[200px] text-center">
          {viewMode === 'day' && `${selectedDay} ${MONTH_NAMES[month - 1]} ${year}`}
          {viewMode === 'week' && weekSunday && `Week of ${weekSunday.getDate()} ${MONTH_NAMES[weekSunday.getMonth()]} ${weekSunday.getFullYear()}`}
          {viewMode === 'month' && `${MONTH_NAMES[month - 1]} ${year}`}
        </h3>
        <button onClick={viewMode === 'day' ? nextDay : nextMonth}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600">
          <ChevronRight size={20} />
        </button>

        {/* View Mode Switcher */}
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1 ml-4">
          {['day', 'month'].map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${
                viewMode === mode ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="ml-auto flex items-center gap-3">
          {!isDeveloper && (
            <FilterSelect
              label="Resource"
              value={resourceFilter}
              onChange={setResourceFilter}
              options={(allResources || []).map((r) => ({ value: r.id, label: r.name }))}
            />
          )}
          <FilterSelect
            label="Project"
            value={projectFilter}
            onChange={setProjectFilter}
            options={rpProjects.map((p) => ({ value: p.id, label: p.name }))}
            showAll={showAllOption}
          />
        </div>
      </div>

      {/* Calendar Grid */}
      {filteredResources.length > 0 ? (
        <div className="card overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="sticky left-0 bg-white z-10 text-left px-3 py-2 min-w-[160px] text-slate-600 font-semibold">
                  Resource
                </th>
                {dayHeaders.map((h) => (
                  <th
                    key={h.day}
                    className={`text-center px-1 py-1.5 ${viewMode === 'day' ? 'min-w-[120px]' : viewMode === 'week' ? 'min-w-[70px]' : 'min-w-[40px]'} ${
                      h.isWeekend ? 'bg-red-50/60 text-red-400' : 'text-slate-500'
                    }`}
                  >
                    <div className="text-[9px] font-medium">{h.label}</div>
                    <div className="font-semibold">{h.day}</div>
                  </th>
                ))}
                <th className="text-center px-2 py-2 min-w-[70px] text-slate-600 font-semibold bg-slate-50">
                  Total
                </th>
                <th className="text-center px-2 py-2 min-w-[60px] text-slate-600 font-semibold bg-slate-50">
                  Util %
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredResources.map((res) => {
                const isExpanded = expandedResource === res.developer_id
                // Calculate totals for visible days only
                const visibleTotal = visibleDays.reduce((sum, d) => {
                  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
                  return sum + (res.days[dateStr]?.total_hours || 0)
                }, 0)
                const visibleCapacity = visibleDays.reduce((sum, d) => {
                  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
                  return sum + (res.days[dateStr]?.capacity_hours || 0)
                }, 0)
                const visibleUtil = visibleCapacity > 0 ? Math.round((visibleTotal / visibleCapacity) * 100) : 0

                return (
                  <>
                    <tr
                      key={res.developer_id}
                      className="border-b border-slate-100 hover:bg-slate-50/50 cursor-pointer"
                      onClick={() => toggleResource(res.developer_id)}
                    >
                      <td className="sticky left-0 bg-white z-10 px-3 py-2">
                        <div className="font-semibold text-slate-800">{res.developer_name}</div>
                        <div className="text-[10px] text-slate-400">{res.role} · {res.skill}</div>
                      </td>
                      {dayHeaders.map((h) => {
                        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(h.day).padStart(2, '0')}`
                        const dayData = res.days[dateStr]
                        const hours = dayData?.total_hours || 0
                        const capacity = dayData?.capacity_hours || 0
                        const isWeekend = dayData?.is_weekend
                        const isHoliday = dayData?.is_holiday
                        const isSelected = selectedCell?.devId === res.developer_id && selectedCell?.dateStr === dateStr

                        return (
                          <td
                            key={h.day}
                            className={`text-center px-0.5 py-1 relative ${
                              isWeekend ? 'bg-red-50/40' : isHoliday ? 'bg-amber-50/40' : ''
                            } ${isSelected ? 'ring-2 ring-indigo-400 rounded' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              if (!isWeekend && !isHoliday) {
                                setSelectedCell({ devId: res.developer_id, dateStr })
                                setExpandedResource(res.developer_id)
                              }
                            }}
                            title={
                              isWeekend ? 'Weekend' :
                              isHoliday ? `Holiday: ${dayData.holiday_name}` :
                              `${hours}h / ${capacity}h`
                            }
                          >
                            {isWeekend || isHoliday ? (
                              <span className="text-[9px] text-slate-300">—</span>
                            ) : hours > 0 ? (
                              <div className="flex flex-col items-center">
                                <span className={`text-[10px] font-bold ${
                                  hours > capacity ? 'text-red-600' :
                                  hours >= capacity * 0.5 ? 'text-green-600' :
                                  'text-amber-600'
                                }`}>
                                  {hours}
                                </span>
                                {viewMode !== 'month' && (
                                  <div className="w-8 h-1 bg-slate-200 rounded-full mt-0.5">
                                    <div
                                      className={`h-1 rounded-full ${
                                        hours > capacity ? 'bg-red-500' :
                                        hours >= capacity * 0.5 ? 'bg-green-500' :
                                        'bg-amber-400'
                                      }`}
                                      style={{ width: `${getBarWidth(hours, capacity)}%` }}
                                    />
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-[9px] text-slate-300">0</span>
                            )}
                          </td>
                        )
                      })}
                      <td className="text-center px-2 py-2 bg-slate-50 font-semibold text-slate-700">
                        {visibleTotal}h
                      </td>
                      <td className="text-center px-2 py-2 bg-slate-50">
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                          visibleUtil > 100 ? 'bg-red-100 text-red-700' :
                          visibleUtil >= 70 ? 'bg-green-100 text-green-700' :
                          visibleUtil >= 40 ? 'bg-amber-100 text-amber-700' :
                          'bg-slate-100 text-slate-500'
                        }`}>
                          {visibleUtil}%
                        </span>
                      </td>
                    </tr>

                    {/* Expanded detail row */}
                    {isExpanded && (
                      <tr key={`${res.developer_id}-detail`} className="bg-indigo-50/30">
                        <td colSpan={visibleDays.length + 3} className="px-4 py-3">
                          <div className="grid grid-cols-4 gap-3 mb-3">
                            <div className="bg-white rounded-lg p-2 border border-slate-200">
                              <div className="text-[10px] text-slate-400">View Period</div>
                              <div className="text-sm font-bold text-slate-800 capitalize">{viewMode}</div>
                            </div>
                            <div className="bg-white rounded-lg p-2 border border-slate-200">
                              <div className="text-[10px] text-slate-400">Capacity</div>
                              <div className="text-sm font-bold text-slate-800">{visibleCapacity}h</div>
                            </div>
                            <div className="bg-white rounded-lg p-2 border border-slate-200">
                              <div className="text-[10px] text-slate-400">Total Spent</div>
                              <div className="text-sm font-bold text-indigo-600">{visibleTotal}h</div>
                            </div>
                            <div className="bg-white rounded-lg p-2 border border-slate-200">
                              <div className="text-[10px] text-slate-400">Utilization</div>
                              <div className={`text-sm font-bold ${
                                visibleUtil > 100 ? 'text-red-600' :
                                visibleUtil >= 70 ? 'text-green-600' :
                                'text-amber-600'
                              }`}>{visibleUtil}%</div>
                            </div>
                          </div>

                          {/* Task breakdown for selected day */}
                          {selectedCell && selectedCell.devId === res.developer_id && (
                            <div className="bg-white rounded-lg p-3 border border-slate-200">
                              <div className="text-[11px] font-semibold text-slate-600 mb-2">
                                Tasks on {new Date(selectedCell.dateStr + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
                              </div>
                              {res.days[selectedCell.dateStr]?.tasks?.length > 0 ? (
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-left text-slate-400 border-b border-slate-100">
                                      <th className="pb-1 font-medium">Task</th>
                                      <th className="pb-1 font-medium">Description</th>
                                      <th className="pb-1 font-medium text-right">Hours</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {res.days[selectedCell.dateStr].tasks.map((t, idx) => (
                                      <tr key={idx} className="border-b border-slate-50">
                                        <td className="py-1.5 font-medium text-indigo-600">{t.task_code}</td>
                                        <td className="py-1.5 text-slate-600">{t.description}</td>
                                        <td className="py-1.5 text-right font-semibold">{t.hours_spent}h</td>
                                      </tr>
                                    ))}
                                    <tr className="font-semibold">
                                      <td className="pt-2" colSpan={2}>Total</td>
                                      <td className="pt-2 text-right text-indigo-700">
                                        {res.days[selectedCell.dateStr].total_hours}h / 8h
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              ) : (
                                <p className="text-slate-400 text-xs">No activity logged for this day</p>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card p-8 text-center text-slate-400 text-sm">
          No resources found for the selected filters.
        </div>
      )}

      {/* Legend */}
      <div className="mt-4 flex items-center gap-4 text-[10px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-green-500 inline-block"></span> ≥ 50% utilized
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-amber-400 inline-block"></span> &lt; 50% utilized
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-red-500 inline-block"></span> Over capacity (&gt;8h)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-red-50 inline-block border border-red-200"></span> Weekend
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-amber-50 inline-block border border-amber-200"></span> Holiday
        </span>
      </div>
    </div>
  )
}
