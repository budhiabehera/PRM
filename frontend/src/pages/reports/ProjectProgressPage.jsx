import useApi from '../../hooks/useApi'
import { getProjectProgressReport } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import UtilizationBar from '../../components/charts/UtilizationBar'
import { formatNumber } from '../../utils/formatters'

export default function ProjectProgressPage() {
  const { data: rows, loading } = useApi(getProjectProgressReport, [])

  const handleExportPDF = () => {
    const now = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    const subtitle = 'All Projects | Generated on ' + now

    const buildTable = (headers, rowData) => {
      let h = '<table><thead><tr>' + headers.map(h => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>'
      h += rowData.map(r => '<tr>' + r.map(c => '<td>' + (c ?? '\u2014') + '</td>').join('') + '</tr>').join('')
      return h + '</tbody></table>'
    }

    const tableHtml = buildTable(
      ['Project', 'Status', 'Total Tasks', 'Completed', 'In Progress', 'Not Started', '% Complete', 'Est Hrs', 'Actual Hrs', 'Remaining Hrs'],
      (rows || []).map(r => [
        r.project + (r.code ? ' (' + r.code + ')' : ''), r.status, r.total_tasks,
        r.completed, r.in_progress, r.not_started, r.pct_complete + '%',
        r.estimated_hours, r.actual_hours, r.remaining_hours,
      ])
    )

    const html = `<!DOCTYPE html><html><head><title>Project Progress Report</title><style>body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; color: #1e293b; font-size: 12px; }
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
      + '<h1>Project Progress Report</h1><div class="subtitle">${subtitle}</div>'
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
        <h2 className="text-xl font-bold text-slate-900">Project Progress</h2>
        <p className="text-xs text-slate-500 mt-0.5">Completion status and hours by project</p>
        </div>
        <button className="btn btn-secondary px-5 py-2 text-sm flex items-center gap-2 whitespace-nowrap" onClick={handleExportPDF} title="Export to PDF">
          📄 Export PDF
        </button>
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Project</th><th>Status</th><th>Total Tasks</th><th>Completed</th><th>In Progress</th>
                <th>Not Started</th><th>% Complete</th><th>Est Hrs</th><th>Actual Hrs</th><th>Remaining Hrs</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.project_id}>
                  <td>
                    <div className="font-semibold">{r.project}</div>
                    <div className="text-[10px] text-slate-400">{r.code}</div>
                  </td>
                  <td>{r.status}</td>
                  <td>{r.total_tasks}</td>
                  <td className="text-green-700">{r.completed}</td>
                  <td className="text-blue-700">{r.in_progress}</td>
                  <td className="text-slate-400">{r.not_started}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <UtilizationBar pct={r.pct_complete} status={r.pct_complete >= 90 ? 'healthy' : r.pct_complete > 0 ? 'under' : 'idle'} width={80} />
                      <span className="text-xs font-medium">{r.pct_complete}%</span>
                    </div>
                  </td>
                  <td>{formatNumber(r.estimated_hours)}</td>
                  <td>{formatNumber(r.actual_hours)}</td>
                  <td>{formatNumber(r.remaining_hours)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
