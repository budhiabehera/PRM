import { useState } from 'react'
import useApi from '../hooks/useApi'
import useDropdowns from '../hooks/useDropdowns'
import { getGanttData, getMonthlyAllocation } from '../services/api'
import LoadingSpinner from '../components/common/LoadingSpinner'
import GanttChart from '../components/charts/GanttChart'
import FilterSelect from '../components/common/FilterSelect'
import { formatNumber } from '../utils/formatters'

export default function TimelinePage() {
  const { projects, resources } = useDropdowns()
  const [filters, setFilters] = useState({})

  const { data: gantt, loading: l1 } = useApi(() => getGanttData(filters), [JSON.stringify(filters)])
  const { data: allocation, loading: l2 } = useApi(getMonthlyAllocation, [])

  const setFilter = (key) => (value) => setFilters((f) => ({ ...f, [key]: value || undefined }))

  const allProjectKeys = allocation ? Array.from(new Set(allocation.flatMap((m) => Object.keys(m.by_project)))) : []

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900">Timeline</h2>
        <p className="text-xs text-slate-500 mt-0.5">Gantt view of scheduled tasks and monthly hour allocation</p>
      </div>

      <div className="flex gap-3 mb-5 p-3.5 bg-white border border-slate-200 rounded-xl">
        <FilterSelect label="Project" onChange={setFilter('project_id')}
          options={projects.map((p) => ({ value: p.id, label: p.name }))} />
        <FilterSelect label="Resource" onChange={setFilter('developer_id')}
          options={resources.map((d) => ({ value: d.id, label: d.name }))} />
      </div>

      <div className="card">
        <div className="text-[15px] font-semibold mb-4">Task Gantt</div>
        {l1 ? <LoadingSpinner /> : <GanttChart tasks={gantt} />}
      </div>

      <div className="card">
        <div className="text-[15px] font-semibold mb-3.5">Monthly Allocation by Project</div>
        {l2 ? <LoadingSpinner /> : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Month</th>
                {allProjectKeys.map((p) => <th key={p}>{p}</th>)}
              </tr>
            </thead>
            <tbody>
              {allocation.map((row) => (
                <tr key={row.month}>
                  <td className="font-medium">{row.month}</td>
                  {allProjectKeys.map((p) => <td key={p}>{formatNumber(row.by_project[p] || 0)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
