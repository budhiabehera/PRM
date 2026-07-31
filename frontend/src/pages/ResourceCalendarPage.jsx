import { useState, useEffect, useMemo } from 'react'
import { getResourceCalendar, getProjects } from '../services/api'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import LoadingSpinner from '../components/common/LoadingSpinner'
import FilterSelect from '../components/common/FilterSelect'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const DAY_ABBR = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate()
}

function getUtilColor(hours, capacity) {
  if (capacity === 0) return ''
  const pct = (hours / capacity) * 100
  if (pct === 0) return 'bg-white'
  if (pct < 50) return 'bg-amber-50 text-amber-700'
  if (pct <= 100) return 'bg-green-50 text-green-700'
  return 'bg-red-50 text-red-700'
}

function getBarWidth(hours, capacity) {
  if (capacity === 0) return 0
  return Math.min((hours / capacity) * 100, 100)
}

export default function ResourceCalendarPage() {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [projects, setProjects] = useState([])
  const [projectFilter, setProjectFilter] = useState('')
  const [expandedResource, setExpandedResource] = useState(null)
  const [selectedCell, setSelectedCell] = useState(null) // { devId, dateStr }

  useEffect(() => {
    getProjects().then(setProjects).catch(() => {})
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const params = { year, month }
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

  // Build day headers
  const dayHeaders = useMemo(() => {
    const headers = []
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(year, month - 1, d)
      const dow = dt.getDay() // 0=Sun, 6=Sat
      headers.push({
        day: d,
        dow,
        isWeekend: dow === 0 || dow === 6,
        label: DAY_ABBR[dow === 0 ? 6 : dow - 1], // convert JS dow to Mon-indexed
      })
    }
    return headers
  }, [year, month, daysInMonth])

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
            Daily time spent per resource — 8 hrs/day capacity. Click a cell to see task details.
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4 mb-5 bg-white border border-slate-200 rounded-xl px-5 py-3">
        <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600">
          <ChevronLeft size={20} />
        </button>
        <h3 className="text-lg font-semibold text-slate-800 min-w-[180px] text-center">
          {MONTH_NAMES[month - 1]} {year}
        </h3>
        <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600">
          <ChevronRight size={20} />
        </button>
        <div className="ml-auto">
          <FilterSelect
            label="Project"
            value={projectFilter}
            onChange={setProjectFilter}
            options={projects.map((p) => ({ value: p.id, label: p.name }))}
          />
        </div>
      </div>

      {/* Calendar Grid */}
      {data && data.resources.length > 0 ? (
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
                    className={`text-center px-1 py-1.5 min-w-[40px] ${
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
              {data.resources.map((res) => {
                const isExpanded = expandedResource === res.developer_id
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
                                <div className="w-6 h-1 bg-slate-200 rounded-full mt-0.5">
                                  <div
                                    className={`h-1 rounded-full ${
                                      hours > capacity ? 'bg-red-500' :
                                      hours >= capacity * 0.5 ? 'bg-green-500' :
                                      'bg-amber-400'
                                    }`}
                                    style={{ width: `${getBarWidth(hours, capacity)}%` }}
                                  />
                                </div>
                              </div>
                            ) : (
                              <span className="text-[9px] text-slate-300">0</span>
                            )}
                          </td>
                        )
                      })}
                      <td className="text-center px-2 py-2 bg-slate-50 font-semibold text-slate-700">
                        {res.summary.total_spent}h
                      </td>
                      <td className="text-center px-2 py-2 bg-slate-50">
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                          res.summary.utilization_pct > 100 ? 'bg-red-100 text-red-700' :
                          res.summary.utilization_pct >= 70 ? 'bg-green-100 text-green-700' :
                          res.summary.utilization_pct >= 40 ? 'bg-amber-100 text-amber-700' :
                          'bg-slate-100 text-slate-500'
                        }`}>
                          {res.summary.utilization_pct}%
                        </span>
                      </td>
                    </tr>

                    {/* Expanded detail row */}
                    {isExpanded && (
                      <tr key={`${res.developer_id}-detail`} className="bg-indigo-50/30">
                        <td colSpan={daysInMonth + 3} className="px-4 py-3">
                          <div className="text-[11px] font-semibold text-slate-600 mb-2">
                            {res.developer_name} — {MONTH_NAMES[month - 1]} Summary
                          </div>
                          <div className="grid grid-cols-4 gap-3 mb-3">
                            <div className="bg-white rounded-lg p-2 border border-slate-200">
                              <div className="text-[10px] text-slate-400">Working Days</div>
                              <div className="text-sm font-bold text-slate-800">{res.summary.working_days}</div>
                            </div>
                            <div className="bg-white rounded-lg p-2 border border-slate-200">
                              <div className="text-[10px] text-slate-400">Capacity</div>
                              <div className="text-sm font-bold text-slate-800">{res.summary.total_capacity}h</div>
                            </div>
                            <div className="bg-white rounded-lg p-2 border border-slate-200">
                              <div className="text-[10px] text-slate-400">Total Spent</div>
                              <div className="text-sm font-bold text-indigo-600">{res.summary.total_spent}h</div>
                            </div>
                            <div className="bg-white rounded-lg p-2 border border-slate-200">
                              <div className="text-[10px] text-slate-400">Utilization</div>
                              <div className={`text-sm font-bold ${
                                res.summary.utilization_pct > 100 ? 'text-red-600' :
                                res.summary.utilization_pct >= 70 ? 'text-green-600' :
                                'text-amber-600'
                              }`}>{res.summary.utilization_pct}%</div>
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
