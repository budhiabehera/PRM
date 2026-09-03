import { useMemo, useState } from 'react'
import useApi from '../../hooks/useApi'
import useDropdowns from '../../hooks/useDropdowns'
import { getTimeVarianceReport } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import KPICard from '../../components/common/KPICard'
import StatusBadge from '../../components/common/StatusBadge'
import FilterSelect from '../../components/common/FilterSelect'
import { STATUS_OPTIONS } from '../../utils/constants'

const BUDGET_COLORS = {
  over: 'text-red-600 font-semibold',
  under: 'text-green-700 font-semibold',
  'on-budget': 'text-slate-500',
}

export default function TimeVariancePage() {
  const { projects, resources } = useDropdowns()
  const [filters, setFilters] = useState({})

  const params = useMemo(() => {
    const p = {}
    Object.entries(filters).forEach(([k, v]) => { if (v) p[k] = v })
    return p
  }, [filters])

  const { data: report, loading } = useApi(() => getTimeVarianceReport(params), [JSON.stringify(params)])
  const setFilter = (key) => (value) => setFilters((f) => ({ ...f, [key]: value }))

  const handleExportPDF = () => {
    const now = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    const filterParts = []
    if (filters.project_id) { const p = projects.find(x => String(x.id) === String(filters.project_id)); if (p) filterParts.push('Project: ' + p.name) }
    if (filters.developer_id) { const r = resources.find(x => String(x.id) === String(filters.developer_id)); if (r) filterParts.push('Resource: ' + r.name) }
    if (filters.status) filterParts.push('Status: ' + filters.status)
    const subtitle = (filterParts.length ? filterParts.join(' \u00b7 ') : 'All Data') + ' | Generated on ' + now

    const buildTable = (headers, rowData) => {
      let h = '<table><thead><tr>' + headers.map(h => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>'
      h += rowData.map(r => '<tr>' + r.map(c => '<td>' + (c ?? '\u2014') + '</td>').join('') + '</tr>').join('')
      return h + '</tbody></table>'
    }

    const tasks = report?.tasks || []
    const tableHtml = buildTable(
      ['Task', 'Product', 'Resource', 'Status', 'Est Hrs', 'Actual Hrs', 'Variance', 'Variance %'],
      tasks.map(t => [
        t.task_code + ' \u2014 ' + (t.description || '').slice(0, 50),
        t.product || '\u2014', t.developer || '\u2014', t.status || '\u2014',
        t.estimated_hours, t.actual_hours,
        (t.variance_hours > 0 ? '+' : '') + t.variance_hours + 'h',
        (t.variance_pct > 0 ? '+' : '') + t.variance_pct + '%',
      ])
    )

    const html = `<!DOCTYPE html><html><head><title>Time Variance Report</title><style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; color: #1e293b; font-size: 12px; }
      h1 { font-size: 20px; margin-bottom: 2px; }
      .subtitle { font-size: 12px; color: #64748b; margin-bottom: 20px; }
      .section { margin-bottom: 24px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
      th { padding: 6px 10px; border-bottom: 2px solid #cbd5e1; font-size: 11px; text-transform: uppercase; color: #475569; text-align: left; }
      td { padding: 6px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; }
      .generated { margin-top: 24px; font-size: 10px; color: #94a3b8; }
      @media print { body { padding: 0; } }
    </style></head><body>
      <h1>Time Variance Report</h1>
      <div class="subtitle">${subtitle}</div>
      <div class="section">${tableHtml}</div>
      <div class="generated">PRM Report — ${now}</div>
      <script>window.onload = function() { window.print(); }<\/script>
    </body></html>`
    const w = window.open('', '_blank')
    w.document.write(html)
    w.document.close()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
        <h2 className="text-xl font-bold text-slate-900">Time Variance</h2>
        <p className="text-xs text-slate-500 mt-0.5">Estimated vs. actual hours on tasks with logged time — spot what's running over or under budget</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={handleExportPDF} title="Export to PDF">
          📄 Export PDF
        </button>
      </div>

      {loading ? <LoadingSpinner /> : (
        <>
          <div className="grid grid-cols-4 gap-3.5 mb-6">
            <KPICard label="Tasks With Logged Time" value={report.summary.total_tasks} />
            <KPICard label="Over Budget" value={report.summary.over_budget} />
            <KPICard label="Under Budget" value={report.summary.under_budget} />
            <KPICard label="Net Variance (hrs)" value={report.summary.total_variance_hours} />
          </div>

          <div className="flex flex-wrap gap-3 mb-5 p-3.5 bg-white border border-slate-200 rounded-xl items-end">
            <FilterSelect label="Project" value={filters.project_id} onChange={setFilter('project_id')}
              options={projects.map((p) => ({ value: p.id, label: p.name }))} />
            <FilterSelect label="Resource" value={filters.developer_id} onChange={setFilter('developer_id')}
              options={resources.map((d) => ({ value: d.id, label: d.name }))} />
            <FilterSelect label="Status" value={filters.status} onChange={setFilter('status')} options={STATUS_OPTIONS} />
          </div>

          <div className="card overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Task</th><th>Product</th><th>Resource</th><th>Status</th>
                  <th>Est Hrs</th><th>Actual Hrs</th><th>Variance</th><th>Variance %</th>
                </tr>
              </thead>
              <tbody>
                {report.tasks.map((t) => (
                  <tr key={t.id}>
                    <td className="font-medium max-w-[220px] truncate">{t.task_code} — {t.description}</td>
                    <td>{t.product || '—'}</td>
                    <td>{t.developer || '—'}</td>
                    <td><StatusBadge status={t.status} /></td>
                    <td>{t.estimated_hours}</td>
                    <td>{t.actual_hours}</td>
                    <td className={BUDGET_COLORS[t.budget_state]}>
                      {t.variance_hours > 0 ? '+' : ''}{t.variance_hours}h
                    </td>
                    <td className={BUDGET_COLORS[t.budget_state]}>
                      {t.variance_pct > 0 ? '+' : ''}{t.variance_pct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {report.tasks.length === 0 && (
              <div className="text-center py-10 text-sm text-slate-400">No tasks with logged actual hours yet.</div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
