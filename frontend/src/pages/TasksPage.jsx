import { useMemo, useState } from 'react'
import useApi from '../hooks/useApi'
import useDropdowns from '../hooks/useDropdowns'
import useAppStore from '../store/useAppStore'
import useAuthStore, { canEditTask, canDeleteTask, canCreateTask, isLeadOrAbove } from '../store/useAuthStore'
import { getTasks, createTask, updateTask, deleteTask, notifyTeamsForTask, syncTaskToSalesforce } from '../services/api'
import LoadingSpinner from '../components/common/LoadingSpinner'
import StatusBadge from '../components/common/StatusBadge'
import PriorityBadge from '../components/common/PriorityBadge'
import FilterSelect from '../components/common/FilterSelect'
import Modal from '../components/common/Modal'
import ConfirmDialog from '../components/common/ConfirmDialog'
import TaskForm from '../components/forms/TaskForm'
import { formatShortDate } from '../utils/formatters'
import { STATUS_OPTIONS, PRIORITY_OPTIONS } from '../utils/constants'

const KANBAN_COLUMNS = ['Not Started', 'In Progress', 'On Hold', 'Completed']

export default function TasksPage() {
  const { projects, mainModules, subModules, resources, workTypes, sprints } = useDropdowns()
  const bumpRefresh = useAppStore((s) => s.bumpRefresh)
  const user = useAuthStore((s) => s.user)
  const isDeveloper = user?.role === 'Developer'
  const [filters, setFilters] = useState({})
  const [view, setView] = useState('list')
  const [editingTask, setEditingTask] = useState(null)
  const [creatingTask, setCreatingTask] = useState(false)
  const [toDelete, setToDelete] = useState(null)
  const [toast, setToast] = useState(null) // { type, text }

  const showToast = (type, text) => {
    setToast({ type, text })
    setTimeout(() => setToast(null), 4000)
  }

  const params = useMemo(() => {
    const p = {}
    Object.entries(filters).forEach(([k, v]) => { if (v) p[k] = v })
    // Developer role: always scope to own tasks
    if (user?.role === 'Developer' && user?.developer_id) {
      p.developer_id = user.developer_id
    }
    return p
  }, [filters, user?.developer_id, user?.role])

  const { data: tasks, loading, reload } = useApi(() => getTasks(params), [JSON.stringify(params)])

  const setFilter = (key) => (value) => setFilters((f) => ({ ...f, [key]: value }))

  const refreshAll = () => { reload(); bumpRefresh() }

  const handleCreate = async (data) => {
    await createTask(data)
    setCreatingTask(false)
    refreshAll()
    showToast('success', 'Task created successfully!')
  }

  const handleSave = async (data) => {
    await updateTask(editingTask.id, data)
    setEditingTask(null)
    refreshAll()
  }

  const handleDelete = async () => {
    await deleteTask(toDelete.id)
    setToDelete(null)
    refreshAll()
  }

  const handleNotifyTeams = async (task) => {
    try {
      const res = await notifyTeamsForTask(task.id)
      showToast('success', `Teams: ${res.message}`)
    } catch (err) {
      showToast('error', err.response?.data?.detail || 'Could not notify Teams.')
    }
  }

  const handleSyncSalesforce = async (task) => {
    try {
      const res = await syncTaskToSalesforce(task.id)
      showToast('success', `Salesforce Case created: ${res.salesforce_case_id}`)
      refreshAll()
    } catch (err) {
      showToast('error', err.response?.data?.detail || 'Could not sync to Salesforce.')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{isDeveloper ? 'My Tasks' : 'Tasks'}</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {tasks?.length ?? 0} tasks matching filters
          </p>
        </div>
        <div className="flex items-center gap-3">
          {canCreateTask(user) && (
            <button className="btn btn-primary" onClick={() => setCreatingTask(true)}>
              + Add Task
            </button>
          )}
          <div className="flex gap-1 bg-slate-200 rounded-lg p-1">
            <button onClick={() => setView('list')} className={`px-3 py-1 rounded-md text-xs font-medium ${view === 'list' ? 'bg-white shadow-sm' : ''}`}>List</button>
            <button onClick={() => setView('kanban')} className={`px-3 py-1 rounded-md text-xs font-medium ${view === 'kanban' ? 'bg-white shadow-sm' : ''}`}>Kanban</button>
          </div>
        </div>
      </div>

      {toast && (
        <div className={`text-xs rounded-lg px-3.5 py-2.5 mb-4 ${toast.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
          {toast.text}
        </div>
      )}

      <div className="flex flex-wrap gap-3 mb-5 p-3.5 bg-white border border-slate-200 rounded-xl items-end">
        <FilterSelect label="Project" value={filters.project_id} onChange={setFilter('project_id')}
          options={projects.map((p) => ({ value: p.id, label: p.name }))} />
        <FilterSelect label="Main Module" value={filters.main_module_id} onChange={setFilter('main_module_id')}
          options={mainModules.map((m) => ({ value: m.id, label: m.name }))} />
        <FilterSelect label="Sub Module" value={filters.sub_module_id} onChange={setFilter('sub_module_id')}
          options={subModules.map((s) => ({ value: s.id, label: s.name }))} />
        {!isDeveloper && (
          <FilterSelect label="Developer" value={filters.developer_id} onChange={setFilter('developer_id')}
            options={resources.map((d) => ({ value: d.id, label: d.name }))} />
        )}
        <FilterSelect label="Status" value={filters.status} onChange={setFilter('status')} options={STATUS_OPTIONS} />
        <FilterSelect label="Priority" value={filters.priority} onChange={setFilter('priority')} options={PRIORITY_OPTIONS} />
        <FilterSelect label="Work Type" value={filters.work_type_id} onChange={setFilter('work_type_id')}
          options={workTypes.map((w) => ({ value: w.id, label: w.name }))} />
        <FilterSelect label="Sprint" value={filters.sprint_id} onChange={setFilter('sprint_id')}
          options={sprints.map((s) => ({ value: s.id, label: s.name }))} />
      </div>

      {loading ? <LoadingSpinner /> : view === 'list' ? (
        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th><th>Case#</th><th>Property</th><th>Task</th><th>Module</th><th>Sub Module</th>
                {!isDeveloper && <th>Developer</th>}<th>Work Type</th><th>Priority</th><th>Status</th><th>Start</th><th>End</th>
                <th>Est</th><th>Actual</th><th>%</th><th>Cross-Mo</th><th>Committed</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => {
                const editable = canEditTask(user, t)
                const deletable = canDeleteTask(user)
                return (
                  <tr key={t.id}>
                    <td className="font-medium">{t.task_code}</td>
                    <td>{t.case_ref || '—'}</td>
                    <td>{t.property_client || '—'}</td>
                    <td className="max-w-[220px] truncate">{t.description}</td>
                    <td>{t.main_module_name || '—'}</td>
                    <td>{t.sub_module_name || '—'}</td>
                    {!isDeveloper && <td>{t.developer_name || '—'}</td>}
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
                    <td>
                      <div className="flex gap-1.5 flex-wrap">
                        {editable && (
                          <button className="btn btn-secondary btn-sm" onClick={() => setEditingTask(t)}>
                            Edit
                          </button>
                        )}
                        {deletable && (
                          <button className="btn btn-danger btn-sm" onClick={() => setToDelete(t)}>Delete</button>
                        )}
                        {isLeadOrAbove(user) && (
                          <>
                            <button className="btn btn-secondary btn-sm" title="Notify Microsoft Teams" onClick={() => handleNotifyTeams(t)}>🟦 Teams</button>
                            <button className="btn btn-secondary btn-sm" title="Sync to Salesforce" onClick={() => handleSyncSalesforce(t)}>☁️ SFDC</button>
                          </>
                        )}
                        {!editable && !deletable && !isLeadOrAbove(user) && <span className="text-slate-300 text-[11px]">—</span>}
                      </div>
                    </td>
                  </tr>
                )
              })}
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
                  <div
                    key={t.id}
                    className={`bg-white border border-slate-200 rounded-lg p-3 text-xs ${canEditTask(user, t) ? 'cursor-pointer hover:border-indigo-300' : ''}`}
                    onClick={() => canEditTask(user, t) && setEditingTask(t)}
                  >
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

      {/* Create Task Modal */}
      <Modal open={creatingTask} title={isDeveloper ? 'Add My Task' : 'Create Task'} onClose={() => setCreatingTask(false)}>
        <TaskForm
          initial={isDeveloper ? { developer_id: user.developer_id } : undefined}
          projects={projects}
          mainModules={mainModules}
          subModules={subModules}
          resources={resources}
          workTypes={workTypes}
          sprints={sprints}
          onSubmit={handleCreate}
          onCancel={() => setCreatingTask(false)}
          lockDeveloper={isDeveloper}
        />
      </Modal>

      {/* Edit Task Modal */}
      <Modal open={!!editingTask} title="Edit Task" onClose={() => setEditingTask(null)}>
        {editingTask && (
          <TaskForm
            initial={editingTask}
            projects={projects}
            mainModules={mainModules}
            subModules={subModules}
            resources={resources}
            workTypes={workTypes}
            sprints={sprints}
            onSubmit={handleSave}
            onCancel={() => setEditingTask(null)}
            lockDeveloper={isDeveloper}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        message={`Delete task "${toDelete?.task_code}"?`}
        onConfirm={handleDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  )
}
