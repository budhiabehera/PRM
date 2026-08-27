import { useState } from 'react'

/**
 * Preset bar with a dropdown to load saved views and a "Save View" button.
 * Props:
 *   presets       - Array of preset objects from useFilterPresets
 *   onLoad        - Called with parsed filters when a preset is selected
 *   onSave        - Called with (name, isDefault) when saving
 *   currentLabel  - Currently active preset label (optional)
 */
export default function PresetBar({ presets = [], onLoad, onSave, currentLabel }) {
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saveAsDefault, setSaveAsDefault] = useState(false)

  const handleLoadPreset = (e) => {
    const presetId = e.target.value
    if (!presetId) return
    const preset = presets.find((p) => String(p.id) === presetId)
    if (preset && onLoad) {
      try {
        onLoad(JSON.parse(preset.filters))
      } catch { /* ignore */ }
    }
  }

  const handleSave = () => {
    if (!saveName.trim()) return
    if (onSave) onSave(saveName.trim(), saveAsDefault)
    setSaveName('')
    setSaveAsDefault(false)
    setShowSaveDialog(false)
  }

  return (
    <div className="flex items-center gap-2">
      {/* Preset selector */}
      {presets.length > 0 && (
        <select
          className="px-2 py-1 border border-slate-300 rounded-lg text-xs bg-slate-50 min-w-[130px] focus:outline-none focus:border-indigo-500"
          defaultValue=""
          onChange={handleLoadPreset}
        >
          <option value="">📋 Load Saved View...</option>
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}{p.is_default ? ' ★' : ''}
            </option>
          ))}
        </select>
      )}

      {/* Save button */}
      {!showSaveDialog ? (
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => setShowSaveDialog(true)}
        >
          💾 Save View
        </button>
      ) : (
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2 py-1">
          <input
            className="form-input text-xs w-32"
            placeholder="Preset name..."
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            autoFocus
          />
          <label className="flex items-center gap-1 text-[10px] text-slate-500 cursor-pointer">
            <input
              type="checkbox"
              checked={saveAsDefault}
              onChange={(e) => setSaveAsDefault(e.target.checked)}
              className="rounded border-slate-300 text-indigo-600"
            />
            Default
          </label>
          <button className="text-xs text-indigo-600 font-medium hover:text-indigo-800" onClick={handleSave}>Save</button>
          <button className="text-xs text-slate-400 hover:text-slate-600" onClick={() => setShowSaveDialog(false)}>✕</button>
        </div>
      )}
    </div>
  )
}
