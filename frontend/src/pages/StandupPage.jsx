import { useState, useEffect } from 'react'
import { MessageSquare, Copy, Check, ChevronDown, ChevronRight, AlertTriangle, PlayCircle, History, CalendarDays } from 'lucide-react'
import useAuthStore from '../store/useAuthStore'
import { getMyStandup, getTeamStandup, getStandupText } from '../services/api'

export default function StandupPage() {
  const user = useAuthStore((s) => s.user)
  const isLeadership = ['Admin', 'Manager', 'Lead'].includes(user?.role)

  const [tab, setTab] = useState(isLeadership ? 'team' : 'my')
  const [myData, setMyData] = useState(null)
  const [teamData, setTeamData] = useState([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [expandedDevs, setExpandedDevs] = useState({})
  
  // Date picker — defaults to yesterday
  const getToday = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const [selectedDate, setSelectedDate] = useState(getToday())

  useEffect(() => {
    setLoading(true)
    if (tab === 'my') {
      getMyStandup(selectedDate)
        .then(setMyData)
        .catch(() => setMyData(null))
        .finally(() => setLoading(false))
    } else {
      getTeamStandup(selectedDate)
        .then(setTeamData)
        .catch(() => setTeamData([]))
        .finally(() => setLoading(false))
    }
  }, [tab, selectedDate])

  const handleCopy = async () => {
    try {
      const res = await getStandupText(user?.developer_id || null)
      await navigator.clipboard.writeText(res.text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
    }
  }

  const toggleDev = (devId) => {
    setExpandedDevs((prev) => ({ ...prev, [devId]: !prev[devId] }))
  }

  const handleExportPDF = () => {
    const now = new Date()
    const generated = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    const displayDate = new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })

    const renderSection = (icon, title, items, isBlocker) => {
      if (!items || items.length === 0) {
        return `<div class="section"><div class="section-title">${icon} ${title}</div><p style="color:#94a3b8;font-style:italic">${isBlocker ? 'No blockers 🎉' : 'No items'}</p></div>`
      }
      const listItems = items.map(item => {
        const code = item.task_code || ''
        const desc = item.subject || item.description || item.task_description || ''
        const notes = item.notes ? `<br><span style="color:#64748b;margin-left:8px">→ ${item.notes}</span>` : ''
        const hours = item.hours_spent > 0 ? ` <span style="color:#94a3b8">(${item.hours_spent}h)</span>` : ''
        const reason = item.reason ? ` <span style="color:#dc2626;font-size:10px">— ${item.reason}</span>` : ''
        return `<li><strong style="color:#4f46e5">[${code}]</strong> ${desc}${hours}${reason}${notes}</li>`
      }).join('')
      return `<div class="section"><div class="section-title">${icon} ${title}</div><ul>${listItems}</ul></div>`
    }

    const renderDevStandup = (name, data) => {
      return `<div class="dev-block"><div class="dev-name">${name}</div>${renderSection('🕐', 'Yesterday', data.yesterday, false)}${renderSection('▶️', 'Today', data.today, false)}${renderSection('⚠️', 'Blockers', data.blockers, true)}</div>`
    }

    let content = ''
    if (tab === 'my' && myData) {
      content = renderDevStandup(user?.name || 'My Standup', myData)
    } else if (tab === 'team' && teamData.length > 0) {
      content = teamData.map(dev => renderDevStandup(dev.developer_name, dev)).join('')
    } else {
      content = '<p style="color:#94a3b8">No standup data available.</p>'
    }

    const html = `<!DOCTYPE html><html><head><title>Daily Standup Report</title><style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; color: #1e293b; font-size: 12px; }
      h1 { font-size: 20px; margin-bottom: 2px; }
      .subtitle { font-size: 12px; color: #64748b; margin-bottom: 20px; }
      .dev-block { margin-bottom: 24px; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; }
      .dev-name { font-size: 14px; font-weight: 700; margin-bottom: 12px; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; }
      .section { margin-bottom: 12px; }
      .section-title { font-size: 13px; font-weight: 600; margin-bottom: 6px; }
      ul { margin: 0; padding-left: 18px; }
      li { margin-bottom: 4px; line-height: 1.5; }
      .generated { margin-top: 24px; font-size: 10px; color: #94a3b8; }
      @media print { body { padding: 0; } }
    </style></head><body>
      <h1>Daily Standup Report</h1>
      <div class="subtitle">${displayDate} | ${tab === 'team' ? 'Team View' : 'My Standup'} | Generated on ${generated}</div>
      ${content}
      <div class="generated">PRM Report — ${generated}</div>
      <script>window.onload = function() { window.print(); }<\/script>
    </body></html>`

    const printWindow = window.open('', '_blank')
    printWindow.document.write(html)
    printWindow.document.close()
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-64" />
          <div className="h-40 bg-slate-200 rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MessageSquare size={22} className="text-indigo-600" />
          <h1 className="text-xl font-bold text-slate-800">Daily Standup</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <CalendarDays size={14} className="text-slate-500" />
            <input
              type="date"
              className="form-input text-xs py-1.5 px-2"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>
          <button className="btn btn-secondary px-5 py-2 text-sm flex items-center gap-2 whitespace-nowrap" onClick={handleExportPDF} title="Export to PDF">
            📄 Export PDF
          </button>
          {tab === 'my' && (
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied!' : 'Copy to Clipboard'}
          </button>
          )}
        </div>
      </div>

      {/* Tabs for leadership */}
      {isLeadership && (
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
          <button
            onClick={() => setTab('my')}
            className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
              tab === 'my' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            My Standup
          </button>
          <button
            onClick={() => setTab('team')}
            className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
              tab === 'team' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            Team Standup
          </button>
        </div>
      )}

      {/* My Standup */}
      {tab === 'my' && myData && (
        <div className="space-y-4">
          <StandupCard
            yesterday={myData.yesterday}
            today={myData.today}
            blockers={myData.blockers}
            selectedDate={selectedDate}
          />
        </div>
      )}

      {tab === 'my' && !myData && (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <p className="text-slate-500 text-sm">No standup data available. Make sure your account is linked to a developer record.</p>
        </div>
      )}

      {/* Team Standup */}
      {tab === 'team' && (
        <div className="space-y-3">
          {teamData.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
              <p className="text-slate-500 text-sm">No team data available.</p>
            </div>
          )}
          {teamData.map((dev) => (
            <div key={dev.developer_id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <button
                onClick={() => toggleDev(dev.developer_id)}
                className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center text-xs font-bold">
                    {dev.developer_name?.charAt(0) || '?'}
                  </div>
                  <span className="text-sm font-semibold text-slate-800">{dev.developer_name}</span>
                  <div className="flex gap-2 ml-2">
                    <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                      {dev.yesterday?.length || 0} yesterday
                    </span>
                    <span className="text-[10px] bg-green-50 text-green-600 px-1.5 py-0.5 rounded">
                      {dev.today?.length || 0} today
                    </span>
                    {dev.blockers?.length > 0 && (
                      <span className="text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded">
                        {dev.blockers.length} blocked
                      </span>
                    )}
                  </div>
                </div>
                {expandedDevs[dev.developer_id] ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
              </button>
              {expandedDevs[dev.developer_id] && (
                <div className="px-5 pb-4 border-t border-slate-100">
                  <StandupCard
                    yesterday={dev.yesterday}
                    today={dev.today}
                    blockers={dev.blockers}
                    selectedDate={selectedDate}
                    compact
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StandupCard({ yesterday, today, blockers, selectedDate, compact = false }) {
  const sectionClass = compact ? 'pt-3' : 'bg-white border border-slate-200 rounded-xl p-5'

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      {/* Yesterday */}
      <div className={sectionClass}>
        <div className="flex items-center gap-2 mb-3">
          <History size={15} className="text-blue-500" />
          <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Yesterday</h3>
        </div>
        {yesterday?.length > 0 ? (
          <ul className="space-y-2">
            {yesterday.map((item, i) => (
              <li key={item.activity_id || i} className="flex items-start gap-2 text-xs text-slate-600">
                <span className="text-slate-400 mt-0.5">•</span>
                <div>
                  <span className="font-medium text-indigo-600">[{item.task_code}]</span>{' '}
                  <span>{item.subject || item.task_description}</span>
                  {item.notes && <p className="text-slate-500 mt-0.5 ml-0.5">→ {item.notes}</p>}
                  {item.hours_spent > 0 && <span className="text-slate-400 ml-1">({item.hours_spent}h)</span>}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-400 italic">No activities logged for {new Date(selectedDate + 'T00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
        )}
      </div>

      {/* Today */}
      <div className={sectionClass}>
        <div className="flex items-center gap-2 mb-3">
          <PlayCircle size={15} className="text-green-500" />
          <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Today</h3>
        </div>
        {today?.length > 0 ? (
          <ul className="space-y-2">
            {today.map((item) => (
              <li key={item.task_id} className="flex items-start gap-2 text-xs text-slate-600">
                <span className="text-slate-400 mt-0.5">•</span>
                <div>
                  <span className="font-medium text-indigo-600">[{item.task_code}]</span>{' '}
                  <span>{item.subject || item.description}</span>
                  <span className="ml-2 text-[10px] text-slate-400">
                    Priority: {item.priority} • {item.percentage || 0}% done
                    {item.end_date && ` • Due: ${item.end_date}`}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-400 italic">No tasks currently in progress</p>
        )}
      </div>

      {/* Blockers */}
      <div className={sectionClass}>
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle size={15} className="text-red-500" />
          <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Blockers</h3>
        </div>
        {blockers?.length > 0 ? (
          <ul className="space-y-2">
            {blockers.map((item) => (
              <li key={item.task_id} className="flex items-start gap-2 text-xs text-red-600">
                <span className="text-red-300 mt-0.5">•</span>
                <div>
                  <span className="font-medium">[{item.task_code}]</span>{' '}
                  <span>{item.subject || item.description}</span>
                  <span className="ml-2 text-[10px] text-red-400">— {item.reason}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-green-500 italic">No blockers 🎉</p>
        )}
      </div>
    </div>
  )
}
