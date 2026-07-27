import { useState } from 'react'

export default function ModuleForm({ mainModules = [], projects = [], onSubmitMainModule, onSubmitSubModule, onCancel }) {
  const [newMainName, setNewMainName] = useState('')
  const [projectId, setProjectId] = useState('')
  const [existingModuleId, setExistingModuleId] = useState('')
  const [subName, setSubName] = useState('')
  const [error, setError] = useState('')

  const handleSave = async (e) => {
    e.preventDefault()
    setError('')

    try {
      let mainModuleId = existingModuleId ? Number(existingModuleId) : null

      // Create new main module if name provided
      if (!mainModuleId && newMainName.trim()) {
        const created = await onSubmitMainModule({ name: newMainName.trim() })
        mainModuleId = created.id
      }

      if (!mainModuleId && !newMainName.trim()) {
        setError('Please enter a Main Module name or select an existing one')
        return
      }

      // Create sub-module if name provided
      if (subName.trim() && mainModuleId) {
        await onSubmitSubModule({ name: subName.trim(), main_module_id: mainModuleId })
      }

      // Reset form after success
      setNewMainName('')
      setProjectId('')
      setExistingModuleId('')
      setSubName('')
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not save module')
    }
  }

  return (
    <form onSubmit={handleSave}>
      <div className="grid grid-cols-3 gap-4">
        <div className="flex flex-col gap-1">
          <label className="form-label">Select Project</label>
          <select className="form-select" value={projectId}
            onChange={(e) => setProjectId(e.target.value)}>
            <option value="">— Select Project —</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="form-label">Main Module Name *</label>
          <input className="form-input" placeholder="e.g., FX FOM" value={newMainName}
            onChange={(e) => { setNewMainName(e.target.value); setExistingModuleId('') }} />
          <span className="text-[10px] text-slate-400">Or select existing to add sub-module</span>
        </div>
        <div className="flex flex-col gap-1">
          <label className="form-label">Select Existing Main Module</label>
          <select className="form-select" value={existingModuleId}
            onChange={(e) => { setExistingModuleId(e.target.value); setNewMainName('') }}>
            <option value="">— New Module —</option>
            {mainModules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="form-label">Sub Module Name</label>
          <input className="form-input" placeholder="e.g., Reservations" value={subName}
            onChange={(e) => setSubName(e.target.value)} />
        </div>
      </div>
      {error && <div className="text-xs text-red-600 mt-3">{error}</div>}
      <div className="flex gap-2 mt-5">
        <button type="submit" className="btn btn-primary">Save Module</button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}
