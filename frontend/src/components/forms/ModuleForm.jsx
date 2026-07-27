import { useState, useMemo } from 'react'

export default function ModuleForm({ mainModules = [], projects = [], treeData, onSubmitMainModule, onSubmitSubModule, onCancel }) {
  const [activeTab, setActiveTab] = useState('module') // 'module' or 'submodule'

  // Module tab state
  const [modProjectId, setModProjectId] = useState('')
  const [moduleName, setModuleName] = useState('')
  const [modError, setModError] = useState('')

  // Sub Module tab state
  const [subProjectId, setSubProjectId] = useState('')
  const [subModuleId, setSubModuleId] = useState('')
  const [subModuleName, setSubModuleName] = useState('')
  const [subError, setSubError] = useState('')

  // Filter modules by selected project using the project_tree from backend
  const filteredModules = useMemo(() => {
    if (!subProjectId) return mainModules
    // Find the project in project_tree and get its modules
    if (treeData?.project_tree) {
      const projEntry = treeData.project_tree.find((p) => String(p.project_id) === String(subProjectId))
      if (projEntry && projEntry.modules.length > 0) {
        // Return module objects matching mainModules format (id, name)
        return projEntry.modules.map((m) => ({ id: m.id, name: m.name }))
      }
    }
    // Fallback: check project.main_module_id
    const project = projects.find((p) => String(p.id) === String(subProjectId))
    if (project && project.main_module_id) {
      const linked = mainModules.filter((m) => m.id === project.main_module_id)
      if (linked.length > 0) return linked
    }
    // If no modules found for this project, show empty with message
    return []
  }, [subProjectId, mainModules, projects, treeData])

  const handleSaveModule = async (e) => {
    e.preventDefault()
    setModError('')
    if (!moduleName.trim()) {
      setModError('Please enter a module name')
      return
    }
    if (!modProjectId) {
      setModError('Please select a project')
      return
    }
    try {
      await onSubmitMainModule({ name: moduleName.trim() }, modProjectId)
      setModProjectId('')
      setModuleName('')
    } catch (err) {
      setModError(err.response?.data?.detail || 'Could not create module')
    }
  }

  const handleSaveSubModule = async (e) => {
    e.preventDefault()
    setSubError('')
    if (!subModuleId) {
      setSubError('Please select a module')
      return
    }
    if (!subModuleName.trim()) {
      setSubError('Please enter a sub-module name')
      return
    }
    try {
      await onSubmitSubModule({ name: subModuleName.trim(), main_module_id: Number(subModuleId) })
      setSubProjectId('')
      setSubModuleId('')
      setSubModuleName('')
    } catch (err) {
      setSubError(err.response?.data?.detail || 'Could not create sub-module')
    }
  }

  return (
    <div>
      {/* Tab Switcher */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 mb-5 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('module')}
          className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === 'module' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-600 hover:text-slate-900'}`}
        >
          Module
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('submodule')}
          className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === 'submodule' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-600 hover:text-slate-900'}`}
        >
          Sub Module
        </button>
      </div>

      {/* Module Tab */}
      {activeTab === 'module' && (
        <form onSubmit={handleSaveModule}>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="form-label">Select Project *</label>
              <select className="form-select" value={modProjectId}
                onChange={(e) => setModProjectId(e.target.value)}>
                <option value="">— Select Project —</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="form-label">Module Name *</label>
              <input className="form-input" placeholder="e.g., FX FOM" value={moduleName}
                onChange={(e) => setModuleName(e.target.value)} />
            </div>
          </div>
          {modError && <div className="text-xs text-red-600 mt-3">{modError}</div>}
          <div className="flex gap-2 mt-5">
            <button type="submit" className="btn btn-primary">Save Module</button>
            <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          </div>
        </form>
      )}

      {/* Sub Module Tab */}
      {activeTab === 'submodule' && (
        <form onSubmit={handleSaveSubModule}>
          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-1">
              <label className="form-label">Select Project *</label>
              <select className="form-select" value={subProjectId}
                onChange={(e) => { setSubProjectId(e.target.value); setSubModuleId('') }}>
                <option value="">— Select Project —</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="form-label">Select Module *</label>
              <select className="form-select" value={subModuleId}
                onChange={(e) => setSubModuleId(e.target.value)}>
                <option value="">— Select Module —</option>
                {filteredModules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              {subProjectId && filteredModules.length === 0 && (
                <span className="text-[10px] text-amber-600">No modules linked to this project. Create one first in the Module tab.</span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label className="form-label">Sub Module Name *</label>
              <input className="form-input" placeholder="e.g., Reservations" value={subModuleName}
                onChange={(e) => setSubModuleName(e.target.value)} />
            </div>
          </div>
          {subError && <div className="text-xs text-red-600 mt-3">{subError}</div>}
          <div className="flex gap-2 mt-5">
            <button type="submit" className="btn btn-primary">Save Sub Module</button>
            <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  )
}
