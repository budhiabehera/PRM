import { useState } from 'react'
import useApi from '../../hooks/useApi'
import useAppStore from '../../store/useAppStore'
import useAuthStore from '../../store/useAuthStore'
import {
  getModuleTree, getMainModules, createMainModule, createSubModule, deleteMainModule, deleteSubModule, deleteProject, getAllProjects,
} from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import KPICard from '../../components/common/KPICard'
import ModuleForm from '../../components/forms/ModuleForm'
import ConfirmDialog from '../../components/common/ConfirmDialog'
import { ChevronDown, ChevronRight, FolderOpen, Boxes, FileText, ChevronsUpDown } from 'lucide-react'

export default function AdminModulesPage() {
  const bumpRefresh = useAppStore((s) => s.bumpRefresh)
  const user = useAuthStore((s) => s.user)
  const { data: projects = [], reload: reloadProjects } = useApi(getAllProjects, [])
  const { data: treeData, loading: l1, reload: reloadTree } = useApi(getModuleTree, [])
  const { data: mainModules, loading: l2, reload: reloadModules } = useApi(getMainModules, [])
  const [showForm, setShowForm] = useState(false)
  const [expandedProjects, setExpandedProjects] = useState({})
  const [expandedModules, setExpandedModules] = useState({})
  const [allCollapsed, setAllCollapsed] = useState(false)
  const [toDeleteModule, setToDeleteModule] = useState(null)
  const [toDeleteProject, setToDeleteProject] = useState(null)

  const refreshAll = () => { reloadTree(); reloadModules(); reloadProjects(); bumpRefresh() }

  const handleSubmitMain = async (data, projectId) => {
    const created = await createMainModule(data, projectId)
    refreshAll()
    return created
  }
  const handleSubmitSub = async (data) => {
    await createSubModule(data)
    refreshAll()
  }
  const handleDeleteModule = async () => {
    await deleteMainModule(toDeleteModule.id)
    setToDeleteModule(null)
    refreshAll()
  }
  const handleDeleteProject = async () => {
    await deleteProject(toDeleteProject.project_id)
    setToDeleteProject(null)
    refreshAll()
  }
  const handleDeleteSub = async (id) => {
    await deleteSubModule(id)
    refreshAll()
  }

  const toggleProject = (id) => setExpandedProjects((s) => ({ ...s, [id]: !s[id] }))
  const toggleModule = (id) => setExpandedModules((s) => ({ ...s, [id]: !s[id] }))

  const collapseAll = () => {
    const projState = {}
    const modState = {}
    projectTree.forEach((p) => { projState[p.project_id || 'unassigned'] = true })
    allModules.forEach((m) => { modState[m.id] = true })
    setExpandedProjects(projState)
    setExpandedModules(modState)
    setAllCollapsed(true)
  }

  const expandAll = () => {
    setExpandedProjects({})
    setExpandedModules({})
    setAllCollapsed(false)
  }

  if (l1 || l2 || !treeData) return <LoadingSpinner label="Loading modules..." />

  const { modules: allModules, project_tree: projectTree } = treeData

  // Filter project tree by user's assigned projects (Admin/Manager see all)
  const isAdmin = user?.role === 'Admin'
  const userProjectIds = user?.project_ids || []
  const filteredProjectTree = isAdmin
    ? projectTree
    : projectTree.filter((p) => p.project_id === null || userProjectIds.includes(p.project_id))

  const totalSubs = allModules.reduce((acc, m) => acc + m.sub_module_count, 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Modules & Sub-Modules</h2>
          <p className="text-xs text-slate-500 mt-0.5">Define the module hierarchy — Project → Module → Sub Module</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>+ Add Module</button>
      </div>

      <div className="grid grid-cols-2 gap-3.5 mb-6">
        <KPICard label="Main Modules" value={allModules.length} />
        <KPICard label="Sub Modules" value={totalSubs} />
      </div>

      {showForm && (
        <div className="card">
          <div className="text-[15px] font-semibold mb-4">➕ Add New Module / Sub-Module</div>
          <ModuleForm
            mainModules={mainModules}
            projects={projects}
            treeData={treeData}
            onSubmitMainModule={handleSubmitMain}
            onSubmitSubModule={handleSubmitSub}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {/* Project → Module → Sub-Module Hierarchy */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="text-[15px] font-semibold">Module Hierarchy</div>
          <button
            onClick={allCollapsed ? expandAll : collapseAll}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors px-2.5 py-1.5 rounded-md hover:bg-slate-100"
          >
            <ChevronsUpDown size={14} />
            {allCollapsed ? 'Expand All' : 'Collapse All'}
          </button>
        </div>
        <div className="space-y-2">
          {filteredProjectTree.map((proj) => {
            const projKey = proj.project_id || 'unassigned'
            const isProjectOpen = !expandedProjects[projKey] // default open (true when key is absent/false)
            return (
              <div key={projKey} className="border border-slate-200 rounded-xl overflow-hidden">
                {/* Project Header */}
                <div className="flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors">
                  <button
                    onClick={() => toggleProject(projKey)}
                    className="flex items-center gap-2.5 text-left flex-1"
                  >
                    {isProjectOpen ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                    <FolderOpen size={15} className="text-indigo-500" />
                    <span className="font-semibold text-sm text-slate-800">{proj.project_name}</span>
                    <span className="text-[11px] text-slate-400 ml-2">{proj.modules.length} module{proj.modules.length !== 1 ? 's' : ''}</span>
                  </button>
                  {proj.project_id && (
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => setToDeleteProject(proj)}
                    >
                      Delete Project
                    </button>
                  )}
                </div>

                {/* Modules inside project */}
                {isProjectOpen && proj.modules.length > 0 && (
                  <div className="border-t border-slate-100">
                    {proj.modules.map((mod) => {
                      const isModOpen = !expandedModules[mod.id] // default open
                      return (
                        <div key={mod.id} className="border-b border-slate-50 last:border-0">
                          {/* Module Header */}
                          <div className="flex items-center justify-between px-6 py-2.5 hover:bg-slate-50 transition-colors">
                            <button
                              onClick={() => toggleModule(mod.id)}
                              className="flex items-center gap-2.5 text-left flex-1"
                            >
                              {isModOpen ? <ChevronDown size={13} className="text-slate-400" /> : <ChevronRight size={13} className="text-slate-400" />}
                              <Boxes size={14} className="text-amber-500" />
                              <span className="font-medium text-[13px] text-slate-700">{mod.name}</span>
                              <span className="text-[10px] text-slate-400 ml-2">
                                {mod.sub_module_count} sub-modules
                              </span>
                            </button>
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => setToDeleteModule(mod)}
                            >
                              Delete
                            </button>
                          </div>

                          {/* Sub-modules */}
                          {isModOpen && mod.sub_modules.length > 0 && (
                            <div className="pl-14 pr-4 pb-2">
                              {mod.sub_modules.map((sub) => (
                                <div key={sub.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0 text-xs">
                                  <div className="flex items-center gap-2">
                                    <FileText size={12} className="text-slate-400" />
                                    <span className="text-slate-700">{sub.name}</span>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className="text-slate-400">{sub.tasks} tasks · {sub.estimated_hours} hrs</span>
                                    <button className="btn btn-danger btn-sm" onClick={() => handleDeleteSub(sub.id)}>Delete</button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {isProjectOpen && proj.modules.length === 0 && (
                  <div className="px-6 py-3 text-xs text-slate-400 border-t border-slate-100">No modules linked to this project</div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Delete Module Confirmation */}
      <ConfirmDialog
        open={!!toDeleteModule}
        message={`Delete module "${toDeleteModule?.name}" and all its sub-modules? This cannot be undone.`}
        onConfirm={handleDeleteModule}
        onCancel={() => setToDeleteModule(null)}
      />

      {/* Delete Project Confirmation */}
      <ConfirmDialog
        open={!!toDeleteProject}
        message={`Delete project "${toDeleteProject?.project_name}"? This will unlink its modules but won't delete them.`}
        onConfirm={handleDeleteProject}
        onCancel={() => setToDeleteProject(null)}
      />
    </div>
  )
}
