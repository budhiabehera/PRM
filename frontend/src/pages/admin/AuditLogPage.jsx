import { useState, useEffect, useCallback } from 'react'
import { Search, Filter, ChevronLeft, ChevronRight, Eye } from 'lucide-react'
import { getAuditLogs, getAuditEntityTypes } from '../../services/api'

const ACTION_COLORS = {
  CREATE: 'bg-emerald-100 text-emerald-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
}

function ChangesModal({ changes, onClose }) {
  let parsed = {}
  try {
    parsed = JSON.parse(changes)
  } catch {
    parsed = {}
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[70vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-200 flex justify-between items-center">
          <h3 className="font-semibold text-slate-800">Changes Detail</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
        </div>
        <div className="p-5 space-y-3">
          {Object.keys(parsed).length === 0 && (
            <p className="text-slate-500 text-sm">No change details available.</p>
          )}
          {Object.entries(parsed).map(([field, vals]) => (
            <div key={field} className="border border-slate-200 rounded-lg p-3">
              <div className="text-xs font-semibold text-slate-500 uppercase mb-1">{field}</div>
              <div className="flex items-center gap-2 text-sm">
                <span className="bg-red-50 text-red-700 px-2 py-0.5 rounded line-through">
                  {vals.old ?? '(empty)'}
                </span>
                <span className="text-slate-400">→</span>
                <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded">
                  {vals.new ?? '(empty)'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(50)
  const [entityTypes, setEntityTypes] = useState([])
  const [filters, setFilters] = useState({
    entity_type: '',
    action: '',
    search: '',
    date_from: '',
    date_to: '',
  })
  const [loading, setLoading] = useState(false)
  const [changesModal, setChangesModal] = useState(null)

  useEffect(() => {
    getAuditEntityTypes().then(setEntityTypes).catch(() => {})
  }, [])

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = { page, page_size: pageSize }
      if (filters.entity_type) params.entity_type = filters.entity_type
      if (filters.action) params.action = filters.action
      if (filters.search) params.search = filters.search
      if (filters.date_from) params.date_from = filters.date_from
      if (filters.date_to) params.date_to = filters.date_to
      const data = await getAuditLogs(params)
      setLogs(data.items)
      setTotal(data.total)
    } catch (err) {
      console.error('Failed to fetch audit logs', err)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, filters])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const totalPages = Math.ceil(total / pageSize)

  const formatDate = (iso) => {
    if (!iso) return '—'
    const d = new Date(iso)
    return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const handleExportPDF = () => {
    const now = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    const filterParts = []
    if (filters.entity_type) filterParts.push('Type: ' + filters.entity_type)
    if (filters.action) filterParts.push('Action: ' + filters.action)
    if (filters.search) filterParts.push('Search: ' + filters.search)
    if (filters.date_from) filterParts.push('From: ' + filters.date_from)
    if (filters.date_to) filterParts.push('To: ' + filters.date_to)
    const subtitle = (filterParts.length ? filterParts.join(' \u00b7 ') : 'All Data') + ' | Generated on ' + now

    const buildTable = (headers, rows) => {
      let h = '<table><thead><tr>' + headers.map(h => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>'
      h += rows.map(r => '<tr>' + r.map(c => '<td>' + (c ?? '\u2014') + '</td>').join('') + '</tr>').join('')
      return h + '</tbody></table>'
    }

    const parseChanges = (ch) => {
      try {
        const p = JSON.parse(ch)
        return Object.entries(p).map(([k, v]) => k + ': ' + (v.old ?? '') + ' \u2192 ' + (v.new ?? '')).join('; ')
      } catch { return '\u2014' }
    }

    const tableHtml = buildTable(
      ['Date', 'User', 'Action', 'Entity Type', 'Entity', 'Changes'],
      logs.map(l => [
        formatDate(l.created_at), l.user_name || '\u2014', l.action,
        l.entity_type, l.entity_label || '\u2014',
        l.changes ? parseChanges(l.changes) : '\u2014',
      ])
    )

    const html = `<!DOCTYPE html><html><head><title>Audit Log Report</title><style>body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; color: #1e293b; font-size: 12px; }
      h1 { font-size: 20px; margin-bottom: 2px; }
      .subtitle { font-size: 12px; color: #64748b; margin-bottom: 20px; }
      .kpi-row { display: flex; gap: 12px; margin-bottom: 24px; }
      .kpi-card { flex: 1; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; text-align: center; }
      .kpi-value { font-size: 22px; font-weight: 700; }
      .kpi-label { font-size: 10px; text-transform: uppercase; color: #64748b; margin-top: 4px; }
      .section { margin-bottom: 24px; }
      .section-title { font-size: 14px; font-weight: 600; margin-bottom: 8px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
      th { padding: 6px 10px; border-bottom: 2px solid #cbd5e1; font-size: 11px; text-transform: uppercase; color: #475569; text-align: left; }
      td { padding: 6px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 8px; font-size: 10px; font-weight: 600; }
      .generated { margin-top: 24px; font-size: 10px; color: #94a3b8; }
      @media print { body { padding: 0; } }</style></head><body>'
      + '<h1>Audit Log Report</h1><div class="subtitle">${subtitle}</div>'
      + '<div class="section">${tableHtml}</div>'
      + '<div class="generated">PRM Report \u2014 ${now}</div>'
      + '<script>window.onload = function() { window.print(); }</' + 'script></body></html>`
    const w = window.open('', '_blank')
    w.document.write(html)
    w.document.close()
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
        <h1 className="text-2xl font-bold text-slate-800">Audit Log</h1>
        <p className="text-sm text-slate-500 mt-1">Track all create, update, and delete actions across the system.</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={handleExportPDF} title="Export to PDF">
          📄 Export PDF
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-5 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="text-xs font-medium text-slate-500 mb-1 block">Search Entity</label>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by label..."
              className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
              value={filters.search}
              onChange={e => { setFilters(f => ({ ...f, search: e.target.value })); setPage(1) }}
            />
          </div>
        </div>
        <div className="min-w-[140px]">
          <label className="text-xs font-medium text-slate-500 mb-1 block">Entity Type</label>
          <select
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
            value={filters.entity_type}
            onChange={e => { setFilters(f => ({ ...f, entity_type: e.target.value })); setPage(1) }}
          >
            <option value="">All Types</option>
            {entityTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="min-w-[130px]">
          <label className="text-xs font-medium text-slate-500 mb-1 block">Action</label>
          <select
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
            value={filters.action}
            onChange={e => { setFilters(f => ({ ...f, action: e.target.value })); setPage(1) }}
          >
            <option value="">All Actions</option>
            <option value="CREATE">CREATE</option>
            <option value="UPDATE">UPDATE</option>
            <option value="DELETE">DELETE</option>
          </select>
        </div>
        <div className="min-w-[140px]">
          <label className="text-xs font-medium text-slate-500 mb-1 block">From Date</label>
          <input
            type="date"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
            value={filters.date_from}
            onChange={e => { setFilters(f => ({ ...f, date_from: e.target.value })); setPage(1) }}
          />
        </div>
        <div className="min-w-[140px]">
          <label className="text-xs font-medium text-slate-500 mb-1 block">To Date</label>
          <input
            type="date"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
            value={filters.date_to}
            onChange={e => { setFilters(f => ({ ...f, date_to: e.target.value })); setPage(1) }}
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-medium text-slate-600">Date/Time</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">User</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Action</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Entity Type</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Entity</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Changes</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-10 text-slate-400">Loading...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-10 text-slate-400">No audit logs found.</td></tr>
              ) : logs.map(log => (
                <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatDate(log.created_at)}</td>
                  <td className="px-4 py-3 text-slate-700">{log.user_name || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${ACTION_COLORS[log.action] || 'bg-slate-100 text-slate-600'}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{log.entity_type}</td>
                  <td className="px-4 py-3 text-slate-800 font-medium">{log.entity_label}</td>
                  <td className="px-4 py-3">
                    {log.changes ? (
                      <button
                        onClick={() => setChangesModal(log.changes)}
                        className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 text-xs font-medium"
                      >
                        <Eye size={13} /> View
                      </button>
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
            <span className="text-xs text-slate-500">
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-40"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs text-slate-600 px-2">Page {page} of {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-40"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {changesModal && <ChangesModal changes={changesModal} onClose={() => setChangesModal(null)} />}
    </div>
  )
}
