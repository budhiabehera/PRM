import { useMemo, useState } from 'react'
import useApi from '../../hooks/useApi'
import useDropdowns from '../../hooks/useDropdowns'
import { getOverdueTasksReport } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import KPICard from '../../components/common/KPICard'
import StatusBadge from '../../components/common/StatusBadge'
import PriorityBadge from '../../components/common/PriorityBadge'
import FilterSelect from '../../components/common/FilterSelect'
import { formatDate } from '../../utils/formatters'
import { PRIORITY_OPTIONS } from '../../utils/constants'

export default function OverdueTasksPage() {
  const { projects, resources } = useDropdowns()
  const [filters, setFilters] = useState({})

  const params = useMemo(() => {
    const p = {}
    Object.entries(filters).forEach(([k, v]) => { if (v) p[k] = v })
    return p
  }, [filters])

  const { data: report, loading } = useApi(() => getOverdueTasksReport(params), [JSON.stringify(params)])
  const setFilter = (key) => (value) => setFilters((f) => ({ ...f, [key]: value }))

  const handleExportPDF = () => {
    const now = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    const filterParts = []
    if (filters.project_id) { const p = projects.find(x => String(x.id) === String(filters.project_id)); if (p) filterParts.push('Project: ' + p.name) }
    if (filters.developer_id) { const r = resources.find(x => String(x.id) === String(filters.developer_id)); if (r) filterParts.push('Resource: ' + r.name) }
    if (filters.priority) filterParts.push('Priority: ' + filters.priority)
    const subtitle = (filterParts.length ? filterParts.join(' \u00b7 ') : 'All Data') + ' | Generated on ' + now

    const buildTable = (headers, rows) => {
      let h = '<table><thead><tr>' + headers.map(h => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>'
      h += rows.map(r => '<tr>' + r.map(c => '<td>' + (c ?? '\u2014') + '</td>').join('') + '</tr>').join('')
      return h + '</tbody></table>'
    }

    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '\u2014'
    const tasks = report?.tasks || []

    const tableHtml = buildTable(
      ['Task Code', 'Description', 'Resource', 'Customer', 'Product', 'Priority', 'Due Date', 'Days Overdue'],
      tasks.map(t => [
        t.task_code, (t.description || '\u2014').slice(0, 60), t.developer || '\u2014',
        t.customer || '\u2014', t.product || '\u2014', t.priority || '\u2014',
        fmtDate(t.end_date), t.days_overdue + 'd',
      ])
    )

    const html = `<!DOCTYPE html><html><head><title>Overdue Tasks Report</title><style>body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; color: #1e293b; font-size: 12px; }
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
      + '<h1>Overdue Tasks Report</h1><div class="subtitle">${subtitle}</div>'
      + '<div class="section">${tableHtml}</div>'
      + '<div class="generated">PRM Report \u2014 ${now}</div>'
      + '<script>window.onload = function() { window.print(); }</' + 'script></body></html>`
    const w = window.open('', '_blank')
    w.document.write(html)
    w.document.close()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
        <h2 className="text-xl font-bold text-slate-900">Overdue Tasks</h2>
        <p className="text-xs text-slate-500 mt-0.5">Tasks past their end date that aren't marked Completed — what's slipping</p>
        </div>
        <button className="btn btn-secondary px-5 py-2 text-sm flex items-center gap-2 whitespace-nowrap" onClick={handleExportPDF} title="Export to PDF">
          📄 Export PDF
        </button>
      </div>

      {loading ? <LoadingSpinner /> : (
        <>
          <div className="grid grid-cols-3 gap-3.5 mb-6">
            <KPICard label="Total Overdue" value={report.summary.total_overdue} />
            <KPICard label="Critical/High Priority" value={report.summary.critical_or_high} />
            <KPICard label="Avg Days Overdue" value={report.summary.avg_days_overdue} />
          </div>

          <div className="flex flex-wrap gap-3 mb-5 p-3.5 bg-white border border-slate-200 rounded-xl items-end">
            <FilterSelect label="Project" value={filters.project_id} onChange={setFilter('project_id')}
              options={projects.map((p) => ({ value: p.id, label: p.name }))} />
            <FilterSelect label="Resource" value={filters.developer_id} onChange={setFilter('developer_id')}
              options={resources.map((d) => ({ value: d.id, label: d.name }))} />
            <FilterSelect label="Priority" value={filters.priority} onChange={setFilter('priority')} options={PRIORITY_OPTIONS} />
          </div>

          <div className="card overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Task</th><th>Customer</th><th>Product</th><th>Resource</th>
                  <th>Priority</th><th>Status</th><th>Due Date</th><th>Days Overdue</th>
                </tr>
              </thead>
              <tbody>
                {report.tasks.map((t) => (
                  <tr key={t.id}>
                    <td className="font-medium max-w-[220px] truncate">{t.task_code} — {t.description}</td>
                    <td>{t.customer || '—'}</td>
                    <td>{t.product || '—'}</td>
                    <td>{t.developer || '—'}</td>
                    <td><PriorityBadge priority={t.priority} /></td>
                    <td><StatusBadge status={t.status} /></td>
                    <td>{formatDate(t.end_date)}</td>
                    <td className="font-semibold text-red-600">{t.days_overdue}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {report.tasks.length === 0 && (
              <div className="text-center py-10 text-sm text-slate-400">Nothing overdue — everything's on track. 🎉</div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
