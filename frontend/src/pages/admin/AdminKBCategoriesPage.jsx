import { useState } from 'react'
import useApi from '../../hooks/useApi'
import useAppStore from '../../store/useAppStore'
import { getKBCategoryList, createKBCategory, updateKBCategory, deleteKBCategory } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import ConfirmDialog from '../../components/common/ConfirmDialog'

export default function AdminKBCategoriesPage() {
  const bumpRefresh = useAppStore((s) => s.bumpRefresh)
  const { data: categories, loading, reload } = useApi(getKBCategoryList, [])
  const [editing, setEditing] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [toDelete, setToDelete] = useState(null)
  const [form, setForm] = useState({ name: '', color: '#4f46e5', sort_order: 0 })

  const refreshAll = () => { reload(); bumpRefresh() }

  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', color: '#4f46e5', sort_order: 0 })
    setShowForm(true)
  }

  const openEdit = (cat) => {
    setEditing(cat)
    setForm({ name: cat.name, color: cat.color, sort_order: cat.sort_order })
    setShowForm(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    if (editing) await updateKBCategory(editing.id, form)
    else await createKBCategory(form)
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
          <p className="text-xs text-slate-500 mt-0.5">Manage Knowledge Base article categories</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ Add Category</button>
      </div>

      {showForm && (
        <div className="card mb-4">
          <div className="text-[15px] font-semibold mb-4">✏️ {editing ? 'Edit Category' : 'Add New Category'}</div>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-3 gap-4">
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
