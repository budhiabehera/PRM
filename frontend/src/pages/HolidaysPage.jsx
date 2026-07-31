import { useState, useEffect, useMemo } from 'react'
import { getHolidays, createHoliday, updateHoliday, deleteHoliday } from '../services/api'
import { ChevronLeft, ChevronRight, Plus, Trash2, Edit2, X } from 'lucide-react'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate()
}

function getFirstDayOfWeek(year, month) {
  // 0=Sun, 1=Mon, ..., 6=Sat
  return new Date(year, month - 1, 1).getDay()
}

function formatDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export default function HolidaysPage() {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1) // 1-based
  const [holidays, setHolidays] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingHoliday, setEditingHoliday] = useState(null)
  const [form, setForm] = useState({ date: '', name: '' })
  const [error, setError] = useState('')
  const [toast, setToast] = useState(null)

  const showToast = (type, text) => {
    setToast({ type, text })
    setTimeout(() => setToast(null), 4000)
  }

  const loadHolidays = async () => {
    setLoading(true)
    try {
      const data = await getHolidays({ month, year })
      setHolidays(data)
    } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => {
    loadHolidays()
  }, [month, year])

  // Build holiday lookup map: date string -> holiday object
  const holidayMap = useMemo(() => {
    const map = {}
    holidays.forEach((h) => {
      map[h.date] = h
    })
    return map
  }, [holidays])

  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfWeek(year, month)

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(year - 1) }
    else setMonth(month - 1)
  }

  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(year + 1) }
    else setMonth(month + 1)
  }

  const openAddForm = (day = null) => {
    setEditingHoliday(null)
    setForm({
      date: day ? formatDate(year, month, day) : '',
      name: '',
    })
    setShowForm(true)
    setError('')
  }

  const openEditForm = (holiday) => {
    setEditingHoliday(holiday)
    setForm({ date: holiday.date, name: holiday.name })
    setShowForm(true)
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.date || !form.name.trim()) {
      setError('Date and holiday name are required')
      return
    }
    try {
      if (editingHoliday) {
        await updateHoliday(editingHoliday.id, { date: form.date, name: form.name.trim() })
        showToast('success', 'Holiday updated')
      } else {
        await createHoliday({ date: form.date, name: form.name.trim() })
        showToast('success', 'Holiday added')
      }
      setShowForm(false)
      setEditingHoliday(null)
      loadHolidays()
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not save holiday')
    }
  }

  const handleDelete = async (holiday) => {
    if (!window.confirm(`Delete holiday "${holiday.name}" on ${holiday.date}?`)) return
    try {
      await deleteHoliday(holiday.id)
      showToast('success', 'Holiday deleted')
      loadHolidays()
    } catch (err) {
      showToast('error', err.response?.data?.detail || 'Could not delete holiday')
    }
  }

  // Count working days (exclude weekends + holidays)
  const workingDays = useMemo(() => {
    let count = 0
    for (let d = 1; d <= daysInMonth; d++) {
      const dayOfWeek = new Date(year, month - 1, d).getDay()
      const dateStr = formatDate(year, month, d)
      if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidayMap[dateStr]) {
        count++
      }
    }
    return count
  }, [daysInMonth, year, month, holidayMap])

  // Build calendar grid
  const calendarCells = []
  // Empty cells before 1st day
  for (let i = 0; i < firstDay; i++) {
    calendarCells.push(null)
  }
  for (let d = 1; d <= daysInMonth; d++) {
    calendarCells.push(d)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Holidays</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage holidays for each month. Saturdays & Sundays are weekends.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => openAddForm()}>
          <Plus size={14} className="mr-1" /> Add Holiday
        </button>
      </div>

      {toast && (
        <div className={`text-xs rounded-lg px-3.5 py-2.5 mb-4 ${toast.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
          {toast.text}
        </div>
      )}

      {/* Month Navigator */}
      <div className="flex items-center justify-between mb-5 bg-white border border-slate-200 rounded-xl px-5 py-3">
        <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600">
          <ChevronLeft size={20} />
        </button>
        <div className="text-center">
          <h3 className="text-lg font-semibold text-slate-800">{MONTH_NAMES[month - 1]} {year}</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {holidays.length} holiday{holidays.length !== 1 ? 's' : ''} · {workingDays} working days
          </p>
        </div>
        <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600">
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-slate-700">
              {editingHoliday ? 'Edit Holiday' : 'Add Holiday'}
            </span>
            <button onClick={() => { setShowForm(false); setEditingHoliday(null) }} className="text-slate-400 hover:text-slate-600">
              <X size={16} />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="flex items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-500 font-medium">Date *</label>
              <input type="date" className="form-input text-xs" value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required />
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-[10px] text-slate-500 font-medium">Holiday Name *</label>
              <input className="form-input text-xs" placeholder="e.g., Independence Day" value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
            </div>
            <button type="submit" className="btn btn-primary btn-sm">
              {editingHoliday ? 'Update' : 'Save'}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setShowForm(false); setEditingHoliday(null) }}>
              Cancel
            </button>
          </form>
          {error && <div className="text-[11px] text-red-600 mt-2">{error}</div>}
        </div>
      )}

      {/* Calendar Grid */}
      <div className="card p-4">
        <div className="grid grid-cols-7 gap-px bg-slate-200 rounded-lg overflow-hidden">
          {/* Header */}
          {DAY_NAMES.map((day, i) => (
            <div
              key={day}
              className={`text-center py-2 text-[11px] font-semibold uppercase tracking-wide ${
                i === 0 || i === 6 ? 'bg-red-50 text-red-500' : 'bg-slate-50 text-slate-500'
              }`}
            >
              {day}
            </div>
          ))}

          {/* Days */}
          {calendarCells.map((day, idx) => {
            if (day === null) {
              return <div key={`empty-${idx}`} className="bg-white min-h-[72px]" />
            }

            const dayOfWeek = new Date(year, month - 1, day).getDay()
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
            const dateStr = formatDate(year, month, day)
            const holiday = holidayMap[dateStr]
            const isToday =
              day === today.getDate() &&
              month === today.getMonth() + 1 &&
              year === today.getFullYear()

            return (
              <div
                key={day}
                className={`min-h-[72px] p-1.5 relative group cursor-pointer transition-colors ${
                  isWeekend
                    ? 'bg-red-50/60'
                    : holiday
                    ? 'bg-amber-50'
                    : 'bg-white hover:bg-slate-50'
                }`}
                onClick={() => {
                  if (!isWeekend && !holiday) openAddForm(day)
                }}
              >
                <div className="flex items-start justify-between">
                  <span
                    className={`text-xs font-medium leading-none ${
                      isToday
                        ? 'bg-indigo-600 text-white w-5 h-5 rounded-full flex items-center justify-center'
                        : isWeekend
                        ? 'text-red-400'
                        : holiday
                        ? 'text-amber-700'
                        : 'text-slate-700'
                    }`}
                  >
                    {day}
                  </span>
                  {!isWeekend && !holiday && (
                    <button
                      onClick={(e) => { e.stopPropagation(); openAddForm(day) }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-slate-400 hover:text-indigo-600"
                      title="Add holiday"
                    >
                      <Plus size={12} />
                    </button>
                  )}
                </div>

                {isWeekend && (
                  <span className="text-[9px] text-red-400 font-medium mt-1 block">Weekend</span>
                )}

                {holiday && (
                  <div className="mt-1">
                    <span className="text-[10px] text-amber-700 font-medium block truncate" title={holiday.name}>
                      {holiday.name}
                    </span>
                    <div className="flex gap-1 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); openEditForm(holiday) }}
                        className="text-blue-500 hover:text-blue-700"
                        title="Edit"
                      >
                        <Edit2 size={10} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(holiday) }}
                        className="text-red-400 hover:text-red-600"
                        title="Delete"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Holidays List */}
      {holidays.length > 0 && (
        <div className="card mt-5 p-4">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-3">
            Holidays in {MONTH_NAMES[month - 1]} {year}
          </h4>
          <div className="space-y-1.5">
            {holidays.map((h) => (
              <div key={h.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 text-xs">
                <div className="flex items-center gap-3">
                  <span className="text-slate-400 font-medium w-24">
                    {new Date(h.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' })}
                  </span>
                  <span className="text-slate-700 font-medium">{h.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => openEditForm(h)} className="text-blue-500 hover:text-blue-700" title="Edit">
                    <Edit2 size={13} />
                  </button>
                  <button onClick={() => handleDelete(h)} className="text-red-400 hover:text-red-600" title="Delete">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
