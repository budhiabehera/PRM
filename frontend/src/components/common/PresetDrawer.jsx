import { useState } from 'react'

/**
 * Right-side slide-out drawer for saving/loading filter presets.
 * Props:
 *   open        - whether drawer is visible
 *   onClose     - close callback
 *   presets     - array of { id, name, is_default, filters }
 *   onSave      - called with { name, isDefault } to save current filters
 *   onLoad      - called with preset object to apply its filters
 *   onSetDefault - called with preset id
 *   onDelete    - called with preset id
 *   pageName    - display name of current page (e.g., "Dashboard")
 */
export default function PresetDrawer({ open, onClose, presets = [], onSave, onLoad, onSetDefault, onDelete, pageName = 'Page' }) {
  const [showSaveForm, setShowSaveForm] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saveAsDefault, setSaveAsDefault] = useState(false)

  const handleSave = () => {
    if (!saveName.trim()) return
    onSave({ name: saveName.trim(), isDefault: saveAsDefault })
    setSaveName('')
    setSaveAsDefault(false)
    setShowSaveForm(false)
  }

  return (
    <>
      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/20 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Drawer Panel */}
      <div className={`fixed top-0 right-0 h-full w-80 bg-white shadow-2xl z-50 transform transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">Saved Views</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto h-[calc(100%-130px)]">
          {/* Save Current View */}
          {!showSaveForm ? (
            <button
              onClick={() => setShowSaveForm(true)}
              className="w-full btn btn-primary text-xs mb-5"
            >
              💾 Save Current View
            </button>
          ) : (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-5">
              <div className="text-[11px] font-medium text-slate-600 mb-2">Save current filters as:</div>
              <input
                className="form-input text-xs w-full mb-2"
                placeholder="e.g., My QA View, Sprint Review..."
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                autoFocus
              />
              <label className="flex items-center gap-2 text-xs text-slate-600 mb-3">
                <input
                  type="checkbox"
                  checked={saveAsDefault}
                  onChange={(e) => setSaveAsDefault(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                Set as default view (auto-apply on page load)
              </label>
              <div className="flex gap-2">
                <button onClick={handleSave} className="btn btn-primary btn-sm text-xs">Save</button>
                <button onClick={() => { setShowSaveForm(false); setSaveName('') }} className="btn btn-sm text-xs text-slate-500">Cancel</button>
              </div>
            </div>
          )}

          {/* Preset List */}
          <div className="text-[10px] uppercase tracking-wide text-slate-400 font-medium mb-2">
            {pageName} Views ({presets.length})
          </div>

          {presets.length === 0 ? (
            <div className="text-xs text-slate-400 py-4 text-center">
              No saved views yet.<br />Set your filters and click "Save Current View".
            </div>
          ) : (
            <div className="space-y-2">
              {presets.map((preset) => (
                <div
                  key={preset.id}
                  className="bg-white border border-slate-200 rounded-lg p-3 hover:border-indigo-300 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-800">{preset.name}</span>
                      {preset.is_default && (
                        <span className="text-[9px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-medium">DEFAULT</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 mt-2">
                    <button
                      onClick={() => onLoad(preset)}
                      className="text-[10px] px-2 py-1 rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-medium"
                    >
                      Apply
                    </button>
                    {!preset.is_default && (
                      <button
                        onClick={() => onSetDefault(preset.id)}
                        className="text-[10px] px-2 py-1 rounded bg-slate-50 text-slate-600 hover:bg-slate-100 font-medium"
                      >
                        Set Default
                      </button>
                    )}
                    <button
                      onClick={() => onDelete(preset.id)}
                      className="text-[10px] px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 font-medium ml-auto"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 px-5 py-3 border-t border-slate-100 bg-slate-50">
          <p className="text-[10px] text-slate-400 text-center">
            Saved views remember your filter selections and auto-apply on load.
          </p>
        </div>
      </div>
    </>
  )
}
