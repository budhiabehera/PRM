import { useState, useEffect } from 'react'
import useDropdowns from '../hooks/useDropdowns'
import useFilterPresets from '../hooks/useFilterPresets'
import { getUserSettings, updateUserSetting } from '../services/api'
import LoadingSpinner from '../components/common/LoadingSpinner'

const PAGE_LABELS = { dashboard: 'Dashboard', tasks: 'Tasks', utilization: 'Utilization' }

export default function UserSettingsPage() {
  const { projects, sprints } = useDropdowns()
  const [settings, setSettings] = useState({})
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)

  // Load all presets across pages
  const dashPresets = useFilterPresets('dashboard')
  const taskPresets = useFilterPresets('tasks')
  const utilPresets = useFilterPresets('utilization')

  const allPresets = [
    ...dashPresets.presets.map(p => ({ ...p, _remove: dashPresets.removePreset, _setDefault: dashPresets.setAsDefault })),
    ...taskPresets.presets.map(p => ({ ...p, _remove: taskPresets.removePreset, _setDefault: taskPresets.setAsDefault })),
    ...utilPresets.presets.map(p => ({ ...p, _remove: utilPresets.removePreset, _setDefault: utilPresets.setAsDefault })),
  ]

  useEffect(() => {
    getUserSettings().then((data) => { setSettings(data); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000) }

  const handleSavePref = async (key, value) => {
    await updateUserSetting(key, value)
    setSettings((s) => ({ ...s, [key]: value }))
    showToast('Preference saved!')
  }

  const handleDeletePreset = async (preset) => {
    if (!confirm(`Delete preset "${preset.name}"?`)) return
    await preset._remove(preset.id)
    showToast('Preset deleted')
    // Reload all
    dashPresets.reload()
    taskPresets.reload()
    utilPresets.reload()
  }

  const handleSetDefault = async (preset) => {
    await preset._setDefault(preset.id)
    showToast(`"${preset.name}" set as default for ${PAGE_LABELS[preset.page]}`)
    dashPresets.reload()
    taskPresets.reload()
    utilPresets.reload()
  }

  if (loading) return <LoadingSpinner label="Loading settings..." />

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900">Application Settings</h2>
        <p className="text-xs text-slate-500 mt-0.5">Manage your default views and saved filter presets</p>
      </div>

      {toast && (
        <div className="text-xs rounded-lg px-3.5 py-2.5 mb-4 bg-green-50 text-green-700 border border-green-200">{toast}</div>
      )}

      {/* General Preferences */}
      <div className="card mb-6">
        <div className="text-[15px] font-semibold mb-4">General Preferences</div>
        <div className="grid grid-cols-2 gap-6">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-600">Default Project</label>
            <select
              className="form-input text-xs"
              value={settings.default_project || ''}
              onChange={(e) => handleSavePref('default_project', e.target.value)}
            >
              <option value="">All Projects</option>
              {projects.map((p) => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
            </select>
            <span className="text-[10px] text-slate-400">Dashboard and Tasks page will open with this project selected</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-600">Default Sprint</label>
            <select
              className="form-input text-xs"
              value={settings.default_sprint || ''}
              onChange={(e) => handleSavePref('default_sprint', e.target.value)}
            >
              <option value="">All Sprints</option>
              {sprints.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
            </select>
            <span className="text-[10px] text-slate-400">Dashboard will open with this sprint selected</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-600">Default Tasks View</label>
            <select
              className="form-input text-xs"
              value={settings.default_tasks_view || 'list'}
              onChange={(e) => handleSavePref('default_tasks_view', e.target.value)}
            >
              <option value="list">List View</option>
              <option value="kanban">Kanban View</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-600">Items Per Page</label>
            <select
              className="form-input text-xs"
              value={settings.items_per_page || '50'}
              onChange={(e) => handleSavePref('items_per_page', e.target.value)}
            >
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </div>
        </div>
      </div>

      {/* Saved Filter Presets */}
      <div className="card">
        <div className="text-[15px] font-semibold mb-4">Saved Filter Presets</div>
        {allPresets.length === 0 ? (
          <div className="text-xs text-slate-400 py-4">
            No saved presets yet. Use the "💾 Save View" button on Dashboard, Tasks, or Utilization pages to save your current filters as a named preset.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Page</th>
                <th>Default</th>
                <th>Filters</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {allPresets.map((preset) => {
                let filterSummary = ''
                try {
                  const f = JSON.parse(preset.filters)
                  filterSummary = Object.entries(f)
                    .filter(([, v]) => v && v.length !== 0)
                    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.length + ' selected' : v}`)
                    .join(', ') || 'No filters'
                } catch { filterSummary = 'Invalid' }

                return (
                  <tr key={preset.id}>
                    <td className="font-medium">{preset.name}</td>
                    <td>
                      <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full text-[10px] font-medium">
                        {PAGE_LABELS[preset.page] || preset.page}
                      </span>
                    </td>
                    <td>
                      {preset.is_default ? (
                        <span className="text-green-600 font-medium text-xs">✓ Default</span>
                      ) : (
                        <button className="text-xs text-indigo-500 hover:text-indigo-700" onClick={() => handleSetDefault(preset)}>
                          Set as default
                        </button>
                      )}
                    </td>
                    <td><span className="text-xs text-slate-500 truncate max-w-[200px] block">{filterSummary}</span></td>
                    <td>
                      <button className="text-red-400 hover:text-red-600 text-xs" onClick={() => handleDeletePreset(preset)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
