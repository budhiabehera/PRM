import { useState } from 'react'
import useApi from '../../hooks/useApi'
import useAppStore from '../../store/useAppStore'
import {
  getModuleTree, getMainModules, createMainModule, createSubModule, deleteSubModule,
} from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import KPICard from '../../components/common/KPICard'
import ModuleForm from '../../components/forms/ModuleForm'

export default function AdminModulesPage() {
  const bumpRefresh = useAppStore((s) => s.bumpRefresh)
  const { data: tree, loading: l1, reload: reloadTree } = useApi(getModuleTree, [])
  const { data: mainModules, loading: l2, reload: reloadModules } = useApi(getMainModules, [])
  const [showForm, setShowForm] = useState(false)

  const refreshAll = () => { reloadTree(); reloadModules(); bumpRefresh() }

  const handleSubmitMain = async (data) => {
    const created = await createMainModule(data)
    refreshAll()
    return created
  }
  const handleSubmitSub = async (data) => {
    await createSubModule(data)
    refreshAll()
  }
  const handleDeleteSub = async (id) => {
    await deleteSubModule(id)
    refreshAll()
  }

  if (l1 || l2) return <LoadingSpinner label="Loading modules..." />

  const totalSubs = tree.reduce((acc, m) => acc + m.sub_module_count, 0)
  const totalDevs = tree.reduce((acc, m) => acc + m.developer_count, 0)
  const totalTasks = tree.reduce((acc, m) => acc + m.task_count, 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Modules & Sub-Modules</h2>
          <p className="text-xs text-slate-500 mt-0.5">Define the module hierarchy — Main Modules → Sub Modules</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>+ Add Module</button>
      </div>

      <div className="grid grid-cols-4 gap-3.5 mb-6">
        <KPICard label="Main Modules" value={tree.length} />
        <KPICard label="Sub Modules" value={totalSubs} />
        <KPICard label="Developers" value={totalDevs} />
        <KPICard label="Active Tasks" value={totalTasks} />
      </div>

      {showForm && (
        <div className="card">
          <div className="text-[15px] font-semibold mb-4">➕ Add New Module / Sub-Module</div>
          <ModuleForm
            mainModules={mainModules}
            onSubmitMainModule={handleSubmitMain}
            onSubmitSubModule={handleSubmitSub}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      <div className="card">
        <div className="text-[15px] font-semibold mb-3.5">Module Hierarchy</div>
        <div className="space-y-3">
          {tree.map((m) => (
            <div key={m.id} className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3.5 bg-slate-50">
                <div className="flex items-center gap-3">
                  <span className="text-base">📦</span>
                  <span className="font-semibold text-sm">{m.name}</span>
                  <span className="text-[11px] text-slate-500">
                    {m.sub_module_count} sub-modules · {m.developer_count} developers · {m.task_count} tasks
                  </span>
                </div>
              </div>
              {m.sub_modules.length > 0 && (
                <div className="px-4 py-2">
                  {m.sub_modules.map((s) => (
                    <div key={s.id} className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0 text-xs">
                      <span>📄 {s.name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400">{s.tasks} tasks · {s.estimated_hours} hrs</span>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDeleteSub(s.id)}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
