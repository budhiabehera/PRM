import { useState } from 'react'

export default function ModuleForm({ mainModules = [], onSubmitMainModule, onSubmitSubModule, onCancel }) {
  const [newMainName, setNewMainName] = useState('')
  const [existingModuleId, setExistingModuleId] = useState('')
  const [subName, setSubName] = useState('')

  const handleSave = async () => {
    let mainModuleId = existingModuleId ? Number(existingModuleId) : null
    if (!mainModuleId && newMainName.trim()) {
      const created = await onSubmitMainModule({ name: newMainName.trim() })
      mainModuleId = created.id
    }
    if (subName.trim() && mainModuleId) {
      await onSubmitSubModule({ name: subName.trim(), main_module_id: mainModuleId })
    } else if (!subName.trim() && newMainName.trim()) {
      // main module only, already created above
    }
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-4">
        <div className="flex flex-col gap-1">
          <label className="form-label">Main Module Name *</label>
          <input className="form-input" placeholder="e.g., FX FOM" value={newMainName}
            onChange={(e) => { setNewMainName(e.target.value); setExistingModuleId('') }} />
          <span className="text-[10px] text-slate-400">Or select existing to add sub-module</span>
        </div>
        <div className="flex flex-col gap-1">
          <label className="form-label">Or Select Existing Main Module</label>
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
      <div className="flex gap-2 mt-5">
        <button className="btn btn-primary" onClick={handleSave}>Save Module</button>
        <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
