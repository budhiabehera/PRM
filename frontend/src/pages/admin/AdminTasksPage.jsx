import { useState } from 'react'
import useApi from '../../hooks/useApi'
import useDropdowns from '../../hooks/useDropdowns'
import useAppStore from '../../store/useAppStore'
import { getTasks, createTask, deleteTask } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import TaskForm from '../../components/forms/TaskForm'
import StatusBadge from '../../components/common/StatusBadge'
import PriorityBadge from '../../components/common/PriorityBadge'
import ConfirmDialog from '../../components/common/ConfirmDialog'

export default function AdminTasksPage() {
  const { projects, mainModules, subModules, resources, workTypes, sprints } = useDropdowns()
  const bumpRefresh = useAppStore((s) => s.bumpRefresh)
  const { data: tasks, loading, reload } = useApi(getTasks, [])
  const [toDelete, setToDelete] = useState(null)
  const [formKey, setFormKey] = useState(0) // resets the form after a successful save

  const handleSubmit = async (data) => {
    await createTask(data)
    reload()
    bumpRefresh()
    setFormKey((k) => k + 1)
  }

  const handleDelete = async () => {
    await deleteTask(toDelete.id)
    setToDelete(null)
    reload()
    bumpRefresh()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Task Assignments</h2>
          <p className="text-xs text-slate-500 mt-0.5">Assign tasks to developers with project, module, and sprint details</p>
        </div>
      </div>

      <div className="card">
        <div className="text-[15px] font-semibold mb-4">➕ Create & Assign New Task</div>
        <TaskForm
          key={formKey}
          projects={projects}
          mainModules={mainModules}
          subModules={subModules}
          resources={resources}
          workTypes={workTypes}
          sprints={sprints}
          onSubmit={handleSubmit}
          onCancel={() => setFormKey((k) => k + 1)}
        />
      </div>

      <div className="card">
        <div className="text-[15px] font-semibold mb-3.5">Recent Assignments</div>
        {loading ? <LoadingSpinner /> : (
          <table className="data-table">
            <thead>
              <tr><th>ID</th><th>Task</th><th>Developer</th><th>Project</th><th>Priority</th><th>Status</th><th>Est Hrs</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {[...tasks].reverse().slice(0, 20).map((t) => (
                <tr key={t.id}>
                  <td className="font-medium">{t.task_code}</td>
                  <td className="max-w-[240px] truncate">{t.description}</td>
                  <td>{t.developer_name || '—'}</td>
                  <td>{t.project_name || '—'}</td>
                  <td><PriorityBadge priority={t.priority} /></td>
                  <td><StatusBadge status={t.status} /></td>
                  <td>{t.estimated_hours}</td>
                  <td>
                    <button className="btn btn-danger btn-sm" onClick={() => setToDelete(t)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmDialog
        open={!!toDelete}
        message={`Delete task "${toDelete?.task_code}"?`}
        onConfirm={handleDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  )
}
