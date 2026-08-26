import { useMemo, useState, useCallback } from 'react'
import useApi from '../hooks/useApi'
import useDropdowns from '../hooks/useDropdowns'
import useAppStore from '../store/useAppStore'
import useAuthStore, { canEditTask, canDeleteTask, canCreateTask, isLeadOrAbove } from '../store/useAuthStore'
import { getTasks, createTask, updateTask, deleteTask, notifyTeamsForTask, getTaskDependencies, addTaskDependency, removeTaskDependency } from '../services/api'
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'
import LoadingSpinner from '../components/common/LoadingSpinner'
import StatusBadge from '../components/common/StatusBadge'
import PriorityBadge from '../components/common/PriorityBadge'
import FilterSelect from '../components/common/FilterSelect'
import Modal from '../components/common/Modal'
import ConfirmDialog from '../components/common/ConfirmDialog'
import TaskForm from '../components/forms/TaskForm'
import { formatShortDate } from '../utils/formatters'
import { PRIORITY_OPTIONS } from '../utils/constants'
import { ChevronDown, ChevronRight } from 'lucide-react'
import TaskActivityPanel from '../components/TaskActivityPanel'
import TaskAttachmentsPanel from '../components/TaskAttachmentsPanel'

const KANBAN_COLUMNS = ['Not Started', 'In Progress', 'On Hold', 'Completed']

export default function TasksPage() {
  const { projects, mainModules, subModules, resources, workTypes, sprints, taskStatuses } = useDropdowns()
  const bumpRefresh = useAppStore((s) => s.bumpRefresh)
  const user = useAuthStore((s) => s.user)
  const isDeveloper = user?.role === 'Developer'
  const [filters, setFilters] = useState({})
  const [view, setView] = useState('list')
  const [editingTask, setEditingTask] = useState(null)
  const [creatingTask, setCreatingTask] = useState(false)
  const [toDelete, setToDelete] = useState(null)
  const [toast, setToast] = useState(null)
  const [expandedRow, setExpandedRow] = useState(null)
  const [dragOverCol, setDragOverCol] = useState(null)
  const [expandedDeps, setExpandedDeps] = useState({}) // { taskId: [dep objects] }

  const showToast = (type, text) => {
    setToast({ type, text })
    setTimeout(() => setToast(null), 4000)
  }

  const params = useMemo(() => {
    const p = {}
    Object.entries(filters).forEach(([k, v]) => { if (v) p[k] = v })
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

  const toggleRow = (taskId) => {
    setExpandedRow((prev) => prev === taskId ? null : taskId)
  }

  // ---- Kanban Drag-and-Drop Handlers ----
  const handleDragStart = useCallback((e, taskId) => {
    e.dataTransfer.setData('text/plain', taskId.toString())
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const handleDragOver = useCallback((e, col) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverCol(col)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOverCol(null)
  }, [])

  const handleDrop = useCallback(async (e, newStatus) => {
    e.preventDefault()
    setDragOverCol(null)
    const taskId = Number(e.dataTransfer.getData('text/plain'))
    const task = tasks?.find((t) => t.id === taskId)
    if (!task || task.status === newStatus) return
    try {
      await updateTask(taskId, { status: newStatus })
      refreshAll()
      showToast('success', `Task ${task.task_code} moved to "${newStatus}"`)
    } catch (err) {
      showToast('error', err.response?.data?.detail || 'Failed to update task status')
    }
  }, [tasks])

  // ---- Dependency helpers ----
  const loadDeps = async (taskId) => {
    try {
      const deps = await getTaskDependencies(taskId)
      setExpandedDeps((prev) => ({ ...prev, [taskId]: deps }))
    } catch { /* ignore */ }
  }

  const handleExportExcel = () => {
    if (!tasks || tasks.length === 0) {
      showToast('error', 'No tasks to export')
      return
    }

    const exportData = tasks.map((t, idx) => {
      const isInternal = !t.property_client || t.property_client.toLowerCase() === 'internal'
      return {
        'Sl No': idx + 1,
        'Client': isInternal ? 'Internal' : t.property_client,
        'SFDC Case#': t.case_ref || '',
        'Module': t.main_module_name || '',
        'Region': isInternal ? 'Global' : (t.property_client || ''),
        'Type': t.work_type_name || '',
        'Description': t.description || '',
        'Deployment Status': t.status || '',
        'Deployment Date': t.end_date ? new Date(t.end_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '',
      }
    })

    const ws = XLSX.utils.json_to_sheet(exportData)

    // Set column widths to match the design
    ws['!cols'] = [
      { wch: 8 },   // Sl No
      { wch: 38 },  // Client
      { wch: 12 },  // SFDC Case#
      { wch: 12 },  // Module
      { wch: 10 },  // Region
      { wch: 14 },  // Type
      { wch: 45 },  // Description
      { wch: 18 },  // Deployment Status
      { wch: 18 },  // Deployment Date
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Tasks')
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    saveAs(new Blob([wbout], { type: 'application/octet-stream' }), `Tasks_Export_${new Date().toISOString().slice(0, 10)}.xlsx`)
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
          <FilterSelect label="Resource" value={filters.developer_id} onChange={setFilter('developer_id')}
            options={
              filters.project_id
                ? resources
                    .filter((d) => (d.project_ids || []).includes(Number(filters.project_id))).sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }))
                    .map((d) => ({ value: d.id, label: d.name }))
                : resources.map((d) => ({ value: d.id, label: d.name }))
            }
          />
        )}
        <FilterSelect label="Status" value={filters.status} onChange={setFilter('status')} options={(taskStatuses || []).map((s) => s.name)} />
        <FilterSelect label="Priority" value={filters.priority} onChange={setFilter('priority')} options={PRIORITY_OPTIONS} />
        <FilterSelect label="Work Type" value={filters.work_type_id} onChange={setFilter('work_type_id')}
          options={workTypes.map((w) => ({ value: w.id, label: w.name }))} />
        <FilterSelect label="Sprint" value={filters.sprint_id} onChange={setFilter('sprint_id')}
          options={sprints.map((s) => ({ value: s.id, label: s.name }))} />
        <button className="btn btn-secondary ml-auto" onClick={handleExportExcel}>
          📥 Export Excel
        </button>
      </div>

      {loading ? <LoadingSpinner /> : view === 'list' ? (
        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th></th>
                <th>ID</th>
                <th>Case#</th>
                <th>Property</th>
                <th>Task</th>
                {!isDeveloper && <th>Resource</th>}
                <th>Work Type</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => {
                const editable = canEditTask(user, t)
                const deletable = canDeleteTask(user)
                const isExpanded = expandedRow === t.id
                return (
                  <>
                    <tr key={t.id}>
                      <td className="w-8 text-center">
                        <button onClick={() => toggleRow(t.id)} className="text-slate-400 hover:text-slate-600">
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      </td>
                      <td className="font-medium">{t.task_code}</td>
                      <td>{t.case_ref || '—'}</td>
                      <td>{t.property_client || '—'}</td>
                      <td className="max-w-[220px] truncate">{t.description}</td>
                      {!isDeveloper && <td>{t.developer_name || '—'}</td>}
                      <td>{t.work_type_name || '—'}</td>
                      <td><PriorityBadge priority={t.priority} /></td>
                      <td><StatusBadge status={t.status} /></td>
                      <td>
                        <div className="flex gap-1.5">
                          {editable && (
                            <button className="btn btn-secondary btn-sm" onClick={() => setEditingTask(t)}>Edit</button>
                          )}
                          {deletable && (
                            <button className="btn btn-danger btn-sm" onClick={() => setToDelete(t)}>Delete</button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {/* Expanded "More" row */}
                    {isExpanded && (
                      <tr key={`${t.id}-more`} className="bg-slate-50/70">
                        <td colSpan={isDeveloper ? 10 : 11} className="px-6 py-3">
                          <div className="grid grid-cols-4 gap-4 text-xs">
                            <div>
                              <span className="text-slate-400 font-medium">Module</span>
                              <div className="text-slate-700 mt-0.5">{t.main_module_name || '—'}</div>
                            </div>
                            <div>
                              <span className="text-slate-400 font-medium">Sub Module</span>
                              <div className="text-slate-700 mt-0.5">{t.sub_module_name || '—'}</div>
                            </div>
                            <div>
                              <span className="text-slate-400 font-medium">Start Date</span>
                              <div className="text-slate-700 mt-0.5">{formatShortDate(t.start_date) || '—'}</div>
                            </div>
                            <div>
                              <span className="text-slate-400 font-medium">End Date</span>
                              <div className="text-slate-700 mt-0.5">{formatShortDate(t.end_date) || '—'}</div>
                            </div>
                            <div>
                              <span className="text-slate-400 font-medium">Est. Hours</span>
                              <div className="text-slate-700 mt-0.5">{t.estimated_hours}</div>
                            </div>
                            <div>
                              <span className="text-slate-400 font-medium">Actual Hours</span>
                              <div className="text-slate-700 mt-0.5">{t.actual_hours}</div>
                            </div>
                            <div>
                              <span className="text-slate-400 font-medium">% Complete</span>
                              <div className="text-slate-700 mt-0.5">{t.percent_complete}%</div>
                            </div>
                            <div>
                              <span className="text-slate-400 font-medium">Cross-Month</span>
                              <div className="text-slate-700 mt-0.5">{t.is_cross_month ? 'Yes' : 'No'}</div>
                            </div>
                            <div>
                              <span className="text-slate-400 font-medium">Customer Committed</span>
                              <div className="text-slate-700 mt-0.5">{t.customer_committed ? 'Yes' : 'No'}</div>
                            </div>
                            <div>
                              <span className="text-slate-400 font-medium">Sprint</span>
                              <div className="text-slate-700 mt-0.5">{t.sprint_name || '—'}</div>
                            </div>
                          </div>
                          {isLeadOrAbove(user) && (
                            <div className="flex gap-2 mt-3 pt-3 border-t border-slate-200">
                              <button className="btn btn-secondary btn-sm" title="Notify Microsoft Teams" onClick={() => handleNotifyTeams(t)}>🟦 Notify Teams</button>
                            </div>
                          )}

                          {/* Task Dependencies */}
                          <div className="mt-3 pt-3 border-t border-slate-200">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-xs font-semibold text-slate-500">Dependencies (Blocked By)</span>
                              {t.blocked_by && t.blocked_by.length > 0 && (
                                <span className="bg-red-100 text-red-600 rounded-full px-2 text-[10px] py-0.5 font-medium">
                                  {t.blocked_by.length} blocker{t.blocked_by.length > 1 ? 's' : ''}
                                </span>
                              )}
                              <button
                                className="btn btn-secondary btn-sm ml-auto text-[10px]"
                                onClick={() => loadDeps(t.id)}
                              >
                                🔄 Refresh
                              </button>
                            </div>
                            {t.blocked_by && t.blocked_by.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {t.blocked_by.map((code) => (
                                  <span
                                    key={code}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-50 text-amber-700 text-[11px] font-medium border border-amber-200"
                                  >
                                    🔗 {code}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p className="text-[11px] text-slate-400">No active blockers</p>
                            )}
                          </div>

                          {/* Task Activity Log */}
                          <TaskActivityPanel task={t} user={user} onUpdate={reload} />

                          {/* Task Attachments */}
                          <TaskAttachmentsPanel task={t} />
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {KANBAN_COLUMNS.map((col) => (
            <div
              key={col}
              className={`rounded-xl p-3 transition-colors duration-150 ${
                dragOverCol === col
                  ? 'bg-indigo-50 border-2 border-indigo-300 border-dashed'
                  : 'bg-slate-50 border-2 border-transparent'
              }`}
              onDragOver={(e) => handleDragOver(e, col)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, col)}
            >
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex justify-between">
                {col}
                <span className="bg-slate-200 text-slate-600 rounded-full px-2 text-[10px] py-0.5">
                  {tasks.filter((t) => t.status === col).length}
                </span>
              </div>
              <div className="space-y-2 min-h-[60px]">
                {tasks.filter((t) => t.status === col).map((t) => (
                  <div
                    key={t.id}
                    draggable={canEditTask(user, t) ? 'true' : 'false'}
                    onDragStart={(e) => handleDragStart(e, t.id)}
                    className={`bg-white border border-slate-200 rounded-lg p-3 text-xs select-none ${canEditTask(user, t) ? 'cursor-grab hover:border-indigo-300 active:cursor-grabbing' : ''}`}
                    onClick={() => canEditTask(user, t) && setEditingTask(t)}
                  >
                    <div className="font-semibold text-slate-700 mb-1">{t.task_code}</div>
                    <div className="text-slate-600 mb-2 line-clamp-2">{t.description}</div>
                    <div className="flex justify-between items-center">
                      <PriorityBadge priority={t.priority} />
                      <span className="text-slate-400">{t.developer_name}</span>
                    </div>
                    {t.blocked_by && t.blocked_by.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {t.blocked_by.map((code) => (
                          <span key={code} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-red-50 text-red-600 text-[10px] font-medium border border-red-200">
                            🚫 {code}
                          </span>
                        ))}
                      </div>
                    )}
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
          taskStatuses={taskStatuses}
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
            taskStatuses={taskStatuses}
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
