import { useState, useEffect, useCallback } from 'react'
import { getKBCategoryList, createKBCategory, updateKBCategory, deleteKBCategory } from '../../services/api'
import useAppStore from '../../store/useAppStore'
import useProjectDefault from '../../hooks/useProjectDefault'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import ConfirmDialog from '../../components/common/ConfirmDialog'

export default function AdminKBCategoriesPage() {
  const bumpRefresh = useAppStore((s) => s.bumpRefresh)
  const { defaultProjectId, showAllOption, restrictedProjects } = useProjectDefault()
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [toDelete, setToDelete] = useState(null)
  const [filterProject, setFilterProject] = useState(defaultProjectId)
  const [form, setForm] = useState({ name: '', project_id: '', color: '#4f46e5', sort_order: 0 })

  const fetchCategories = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (filterProject) params.project_id = filterProject
      const data = await getKBCategoryList(params)
      setCategories(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [filterProject])

  useEffect(() => { fetchCategories() }, [fetchCategories])

  const refreshAll = () => { fetchCategories(); bumpRefresh() }

  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', project_id: filterProject || '', color: '#4f46e5', sort_order: 0 })
    setShowForm(true)
  }

  const openEdit = (cat) => {
    setEditing(cat)
    setForm({ name: cat.name, project_id: cat.project_id || '', color: cat.color, sort_order: cat.sort_order })
    setShowForm(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    const payload = {
      name: form.name.trim(),
      project_id: form.project_id ? Number(form.project_id) : null,
      color: form.color,
      sort_order: form.sort_order,
    }
    if (editing) await updateKBCategory(editing.id, payload)
    else await createKBCategory(payload)
    setShowForm(false)
    setEditing(null)
    refreshAll()
  }

  const handleDelete = async () => {
    await deleteKBCategory(toDelete.id)
    setToDelete(null)
    refreshAll()
  }

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  if (loading) return <LoadingSpinner label="Loading KB categories..." />

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">KB Categories</h2>
          <p className="text-xs text-slate-500 mt-0.5">Manage Knowledge Base article categories per project</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ Add Category</button>
      </div>

      {/* Project Filter */}
      <div className="flex gap-3 mb-4">
        <select
          value={filterProject}
          onChange={(e) => setFilterProject(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
        >
          {showAllOption && <option value="">All Projects (Global + All)</option>}
          {restrictedProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {showForm && (
        <div className="card mb-4">
          <div className="text-[15px] font-semibold mb-4">✏️ {editing ? 'Edit Category' : 'Add New Category'}</div>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-4 gap-4">
              <div className="flex flex-col gap-1">
                <label className="form-label">Category Name *</label>
                <input
                  className="form-input"
                  placeholder="e.g., Architecture"
                  value={form.name}
                  onChange={(e) => update('name', e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="form-label">Project</label>
                <select
                  className="form-select"
                  value={form.project_id}
                  onChange={(e) => update('project_id', e.target.value)}
                >
                  {showAllOption && <option value="">🌐 Global (all projects)</option>}
                  {restrictedProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <span className="text-[10px] text-slate-400">Global categories appear in all projects</span>
              </div>
              <div className="flex flex-col gap-1">
                <label className="form-label">Color</label>
                <input
                  type="color"
                  className="form-input h-10 p-1"
                  value={form.color}
                  onChange={(e) => update('color', e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="form-label">Sort Order</label>
                <input
                  type="number"
                  className="form-input"
                  placeholder="0"
                  value={form.sort_order}
                  onChange={(e) => update('sort_order', parseInt(e.target.value) || 0)}
                />
                <span className="text-[10px] text-slate-400">Lower numbers appear first</span>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button type="submit" className="btn btn-primary">Save Category</button>
              <button type="button" className="btn btn-secondary" onClick={() => { setShowForm(false); setEditing(null) }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <div className="text-[15px] font-semibold mb-3.5">All KB Categories</div>
        {categories.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">No categories found. Add your first category!</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Project</th>
                <th>Color</th>
                <th>Sort Order</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <tr key={cat.id}>
                  <td className="font-semibold">{cat.name}</td>
                  <td>
                    {cat.project_name
                      ? <span className="badge bg-blue-50 text-blue-700">{cat.project_name}</span>
                      : <span className="badge bg-gray-100 text-gray-500">🌐 Global</span>
                    }
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block w-5 h-5 rounded border border-slate-200"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="text-xs text-slate-500">{cat.color}</span>
                    </div>
                  </td>
                  <td>{cat.sort_order}</td>
                  <td>
                    <div className="flex gap-1.5">
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(cat)}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => setToDelete(cat)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmDialog
        open={!!toDelete}
        message={`Delete category "${toDelete?.name}"?`}
        onConfirm={handleDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  )
}
