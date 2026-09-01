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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
        <h2 className="text-xl font-bold text-slate-900">Time Variance</h2>
        <p className="text-xs text-slate-500 mt-0.5">Estimated vs. actual hours on tasks with logged time — spot what's running over or under budget</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => window.print()} title="Export to PDF">
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
