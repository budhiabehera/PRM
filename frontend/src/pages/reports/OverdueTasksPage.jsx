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

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900">Overdue Tasks</h2>
        <p className="text-xs text-slate-500 mt-0.5">Tasks past their end date that aren't marked Completed — what's slipping</p>
      </div>

      {loading ? <LoadingSpinner /> : (
        <>
          <div className="grid grid-cols-3 gap-3.5 mb-6">
            <KPICard label="Total Overdue" value={report.summary.total_overdue} />
            <KPICard label="Critical/High Priority" value={report.summary.critical_or_high} />
            <KPICard label="Avg Days Overdue" value={report.summary.avg_days_overdue} />
          </div>

          <div className="flex flex-wrap gap-3 mb-5 p-3.5 bg-white border border-slate-200 rounded-xl items-end">
            <FilterSelect label="Project" onChange={setFilter('project_id')}
              options={projects.map((p) => ({ value: p.id, label: p.name }))} />
            <FilterSelect label="Developer" onChange={setFilter('developer_id')}
              options={resources.map((d) => ({ value: d.id, label: d.name }))} />
            <FilterSelect label="Priority" onChange={setFilter('priority')} options={PRIORITY_OPTIONS} />
          </div>

          <div className="card overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Task</th><th>Customer</th><th>Product</th><th>Developer</th>
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
