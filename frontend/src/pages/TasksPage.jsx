import { useMemo, useState } from 'react'
import useApi from '../hooks/useApi'
import useDropdowns from '../hooks/useDropdowns'
import { getTasks } from '../services/api'
import LoadingSpinner from '../components/common/LoadingSpinner'
import StatusBadge from '../components/common/StatusBadge'
import PriorityBadge from '../components/common/PriorityBadge'
import FilterSelect from '../components/common/FilterSelect'
import { formatShortDate } from '../utils/formatters'
import { STATUS_OPTIONS, PRIORITY_OPTIONS } from '../utils/constants'

const KANBAN_COLUMNS = ['Not Started', 'In Progress', 'On Hold', 'Completed']

export default function TasksPage() {
  const { projects, mainModules, subModules, resources, workTypes, sprints } = useDropdowns()
  const [filters, setFilters] = useState({})
  const [view, setView] = useState('list')

  const params = useMemo(() => {
    const p = {}
    Object.entries(filters).forEach(([k, v]) => { if (v) p[k] = v })
    return p
  }, [filters])

  const { data: tasks, loading } = useApi(() => getTasks(params), [JSON.stringify(params)])

  const setFilter = (key) => (value) => setFilters((f) => ({ ...f, [key]: value }))

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Tasks</h2>
          <p className="text-xs text-slate-500 mt-0.5">{tasks?.length ?? 0} tasks matching filters</p>
        </div>
        <div className="flex gap-1 bg-slate-200 rounded-lg p-1">
          <button onClick={() => setView('list')} className={`px-3 py-1 rounded-md text-xs font-medium ${view === 'list' ? 'bg-white shadow-sm' : ''}`}>List</button>
          <button onClick={() => setView('kanban')} className={`px-3 py-1 rounded-md text-xs font-medium ${view === 'kanban' ? 'bg-white shadow-sm' : ''}`}>Kanban</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-5 p-3.5 bg-white border border-slate-200 rounded-xl items-end">
        <FilterSelect label="Project" onChange={setFilter('project_id')}
          options={projects.map((p) => ({ value: p.id, label: p.name }))} />
        <FilterSelect label="Main Module" onChange={setFilter('main_module_id')}
          options={mainModules.map((m) => ({ value: m.id, label: m.name }))} />
        <FilterSelect label="Sub Module" onChange={setFilter('sub_module_id')}
          options={subModules.map((s) => ({ value: s.id, label: s.name }))} />
        <FilterSelect label="Developer" onChange={setFilter('developer_id')}
          options={resources.map((d) => ({ value: d.id, label: d.name }))} />
        <FilterSelect label="Status" onChange={setFilter('status')} options={STATUS_OPTIONS} />
        <FilterSelect label="Priority" onChange={setFilter('priority')} options={PRIORITY_OPTIONS} />
        <FilterSelect label="Work Type" onChange={setFilter('work_type_id')}
          options={workTypes.map((w) => ({ value: w.id, label: w.name }))} />
        <FilterSelect label="Sprint" onChange={setFilter('sprint_id')}
          options={sprints.map((s) => ({ value: s.id, label: s.name }))} />
      </div>

      {loading ? <LoadingSpinner /> : view === 'list' ? (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th><th>Case#</th><th>Property</th><th>Task</th><th>Module</th><th>Sub Module</th>
                <th>Developer</th><th>Work Type</th><th>Priority</th><th>Status</th><th>Start</th><th>End</th>
                <th>Est</th><th>Actual</th><th>%</th><th>Cross-Mo</th><th>Committed</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id}>
                  <td className="font-medium">{t.task_code}</td>
                  <td>{t.case_ref || '—'}</td>
                  <td>{t.property_client || '—'}</td>
                  <td className="max-w-[220px] truncate">{t.description}</td>
                  <td>{t.main_module_name || '—'}</td>
                  <td>{t.sub_module_name || '—'}</td>
                  <td>{t.developer_name || '—'}</td>
                  <td>{t.work_type_name || '—'}</td>
                  <td><PriorityBadge priority={t.priority} /></td>
                  <td><StatusBadge status={t.status} /></td>
                  <td>{formatShortDate(t.start_date)}</td>
                  <td>{formatShortDate(t.end_date)}</td>
                  <td>{t.estimated_hours}</td>
                  <td>{t.actual_hours}</td>
                  <td>{t.percent_complete}%</td>
                  <td>{t.is_cross_month ? 'Yes' : 'No'}</td>
                  <td>{t.customer_committed ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {KANBAN_COLUMNS.map((col) => (
            <div key={col} className="bg-slate-50 rounded-xl p-3">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex justify-between">
                {col}
                <span className="bg-slate-200 text-slate-600 rounded-full px-2 text-[10px] py-0.5">
                  {tasks.filter((t) => t.status === col).length}
                </span>
              </div>
              <div className="space-y-2">
                {tasks.filter((t) => t.status === col).map((t) => (
                  <div key={t.id} className="bg-white border border-slate-200 rounded-lg p-3 text-xs">
                    <div className="font-semibold text-slate-700 mb-1">{t.task_code}</div>
                    <div className="text-slate-600 mb-2 line-clamp-2">{t.description}</div>
                    <div className="flex justify-between items-center">
                      <PriorityBadge priority={t.priority} />
                      <span className="text-slate-400">{t.developer_name}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
