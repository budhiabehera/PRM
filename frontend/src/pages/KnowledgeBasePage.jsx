import { useState, useEffect, useCallback } from 'react'
import { BookOpen, Plus, ArrowLeft, Edit2, Trash2, Paperclip, Upload, X, Search } from 'lucide-react'
import useAuthStore from '../store/useAuthStore'
import {
  getKBArticles, getKBArticle, createKBArticle, updateKBArticle,
  deleteKBArticle, uploadKBAttachment, deleteKBAttachment, getKBCategories, getProjects,
} from '../services/api'
import KBArticleForm from '../components/forms/KBArticleForm'

const CATEGORY_COLORS = {
  'Process': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  'Setup Guide': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  'Module Guide': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  'FAQ': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  'Troubleshooting': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
}

export default function KnowledgeBasePage() {
  const user = useAuthStore((s) => s.user)
  const [articles, setArticles] = useState([])
  const [projects, setProjects] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const [filterProject, setFilterProject] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterVisibility, setFilterVisibility] = useState('')

  // Views: 'list' | 'view' | 'create' | 'edit'
  const [view, setView] = useState('list')
  const [selectedArticle, setSelectedArticle] = useState(null)
  const [uploading, setUploading] = useState(false)

  const canManage = user?.role === 'Admin' || user?.role === 'Manager'

  const fetchArticles = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (search) params.search = search
      if (filterProject) params.project_id = filterProject
      if (filterCategory) params.category = filterCategory
      if (filterVisibility) params.visibility = filterVisibility
      const data = await getKBArticles(params)
      setArticles(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [search, filterProject, filterCategory, filterVisibility])

  useEffect(() => { fetchArticles() }, [fetchArticles])
  useEffect(() => {
    getProjects().then(setProjects).catch(() => {})
    getKBCategories().then(setCategories).catch(() => {})
  }, [])

  const openArticle = async (id) => {
    try {
      const data = await getKBArticle(id)
      setSelectedArticle(data)
      setView('view')
    } catch (e) {
      console.error(e)
    }
  }

  const handleCreate = async (payload) => {
    const article = await createKBArticle(payload)
    setView('list')
    fetchArticles()
    getKBCategories().then(setCategories).catch(() => {})
  }

  const handleUpdate = async (payload) => {
    await updateKBArticle(selectedArticle.id, payload)
    setView('list')
    fetchArticles()
    getKBCategories().then(setCategories).catch(() => {})
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this article?')) return
    await deleteKBArticle(id)
    setView('list')
    fetchArticles()
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    try {
      await uploadKBAttachment(selectedArticle.id, file)
      const refreshed = await getKBArticle(selectedArticle.id)
      setSelectedArticle(refreshed)
    } catch (err) {
      alert('Upload failed: ' + (err.response?.data?.detail || err.message))
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteAttachment = async (attId) => {
    if (!window.confirm('Delete this attachment?')) return
    await deleteKBAttachment(selectedArticle.id, attId)
    const refreshed = await getKBArticle(selectedArticle.id)
    setSelectedArticle(refreshed)
  }

  const formatDate = (d) => {
    if (!d) return ''
    const dt = new Date(d)
    return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + ', ' + dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
  }

  // Simple markdown-ish rendering (bold, headings, code, lists)
  const renderContent = (text) => {
    if (!text) return <p className="text-gray-400 italic">No content</p>
    // Content is now HTML from React Quill
    return (
      <div
        className="prose prose-sm max-w-none text-gray-800 dark:text-gray-200"
        dangerouslySetInnerHTML={{ __html: text }}
      />
    )
  }

  // ===================== LIST VIEW =====================
  if (view === 'list') {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <BookOpen className="w-6 h-6 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Knowledge Base</h1>
          </div>
          <button
            onClick={() => setView('create')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> New Article
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search articles..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
          >
            <option value="">All Projects</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
          >
            <option value="">All Categories</option>
            {['Process', 'Setup Guide', 'Module Guide', 'FAQ', 'Troubleshooting', ...categories.filter(c => !['Process', 'Setup Guide', 'Module Guide', 'FAQ', 'Troubleshooting'].includes(c))].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            value={filterVisibility}
            onChange={(e) => setFilterVisibility(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
          >
            <option value="">All Articles</option>
            <option value="global">🌐 Global</option>
            <option value="personal">🔒 My Personal</option>
          </select>
        </div>

        {/* Articles grid */}
        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : articles.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>No articles found. Create your first article!</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {articles.map((a) => (
              <div
                key={a.id}
                onClick={() => openArticle(a.id)}
                className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm hover:shadow-md cursor-pointer transition-shadow"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-gray-900 dark:text-white text-sm line-clamp-2">{a.title}</h3>
                </div>
                <div className="flex flex-wrap gap-2 mb-2">
                  {a.category && (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[a.category] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'}`}>
                      {a.category}
                    </span>
                  )}
                  {a.project_name && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                      {a.project_name}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-2">
                  {a.content ? a.content.substring(0, 120) + (a.content.length > 120 ? '...' : '') : 'No content'}
                </p>
                <div className="text-xs text-gray-400">
                  {a.created_by_name} • {formatDate(a.created_at)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ===================== CREATE VIEW =====================
  if (view === 'create') {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <button onClick={() => setView('list')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to articles
        </button>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">New Article</h2>
        <KBArticleForm onSave={handleCreate} onCancel={() => setView('list')} />
      </div>
    )
  }

  // ===================== EDIT VIEW =====================
  if (view === 'edit') {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <button onClick={() => setView('view')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to article
        </button>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Edit Article</h2>
        <KBArticleForm initial={selectedArticle} onSave={handleUpdate} onCancel={() => setView('view')} />
      </div>
    )
  }

  // ===================== DETAIL VIEW =====================
  if (view === 'view' && selectedArticle) {
    const canEdit = canManage || selectedArticle.created_by_id === user?.id
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <button onClick={() => setView('list')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to articles
        </button>

        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{selectedArticle.title}</h1>
              <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                {selectedArticle.category && (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[selectedArticle.category] || 'bg-gray-100 text-gray-800'}`}>
                    {selectedArticle.category}
                  </span>
                )}
                {selectedArticle.project_name && <span>📁 {selectedArticle.project_name}</span>}
                <span>By {selectedArticle.created_by_name}</span>
                <span>• {formatDate(selectedArticle.created_at)}</span>
                {selectedArticle.updated_at && <span>(updated {formatDate(selectedArticle.updated_at)})</span>}
              </div>
            </div>
            {canEdit && (
              <div className="flex gap-2">
                <button onClick={() => setView('edit')} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg">
                  <Edit2 className="w-4 h-4" />
                </button>
                {canEdit && (
                  <button onClick={() => handleDelete(selectedArticle.id)} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Content */}
          <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-6">
            {renderContent(selectedArticle.content)}
          </div>

          {/* Attachments */}
          <div className="mt-8 border-t border-gray-200 dark:border-gray-700 pt-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <Paperclip className="w-4 h-4" /> Attachments ({selectedArticle.attachments?.length || 0})
              </h3>
              <label className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 dark:bg-blue-900/30 rounded-lg cursor-pointer hover:bg-blue-100">
                <Upload className="w-3.5 h-3.5" />
                {uploading ? 'Uploading...' : 'Upload File'}
                <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
              </label>
            </div>
            {selectedArticle.attachments?.length > 0 ? (
              <ul className="space-y-2">
                {selectedArticle.attachments.map((att) => (
                  <li key={att.id} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    <a
                      href={att.blob_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 dark:text-blue-400 hover:underline truncate"
                    >
                      {att.file_name}
                    </a>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">{att.file_size ? `${(att.file_size / 1024).toFixed(1)} KB` : ''}</span>
                      <button onClick={() => handleDeleteAttachment(att.id)} className="p-1 text-gray-400 hover:text-red-500">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-400 italic">No attachments yet.</p>
            )}
          </div>
        </div>
      </div>
    )
  }

  return null
}
