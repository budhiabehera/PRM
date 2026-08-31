import { useState, useEffect, useRef } from 'react'
import { getTaskAttachments, uploadTaskAttachment, updateTaskAttachment, deleteTaskAttachment, getAttachmentDownloadUrl } from '../services/api'
import useAuthStore from '../store/useAuthStore'

function formatFileSize(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let size = bytes
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024
    i++
  }
  return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

function formatDateTime(dt) {
  if (!dt) return ''
  const d = new Date(dt)
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })
}

export default function TaskAttachmentsPanel({ task }) {
  const [attachments, setAttachments] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const fileInputRef = useRef(null)
  const token = useAuthStore((s) => s.token)

  const loadAttachments = async () => {
    try {
      const data = await getTaskAttachments(task.id)
      setAttachments(data)
    } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => {
    loadAttachments()
  }, [task.id])

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      await uploadTaskAttachment(task.id, file)
      loadAttachments()
    } catch (err) {
      alert(err.response?.data?.detail || 'Upload failed')
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleView = (attachment) => {
    const url = getAttachmentDownloadUrl(attachment.id)
    window.open(url, '_blank')
  }

  const handleEditStart = (attachment) => {
    setEditingId(attachment.id)
    setEditName(attachment.file_name)
  }

  const handleEditSave = async (attachmentId) => {
    try {
      await updateTaskAttachment(attachmentId, { file_name: editName })
      setEditingId(null)
      loadAttachments()
    } catch (err) {
      alert(err.response?.data?.detail || 'Rename failed')
    }
  }

  const handleDelete = async (attachmentId) => {
    if (!window.confirm('Are you sure you want to delete this attachment?')) return
    try {
      await deleteTaskAttachment(attachmentId)
      loadAttachments()
    } catch (err) {
      alert(err.response?.data?.detail || 'Delete failed')
    }
  }

  return (
    <div className="mt-4 p-3.5 rounded-xl bg-green-50/50 border border-green-100">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold uppercase tracking-wide text-green-700">📎 Attachments</span>
        <label className="btn btn-primary btn-sm cursor-pointer">
          {uploading ? 'Uploading...' : '+ Upload File'}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
          />
        </label>
      </div>

      {loading ? (
        <div className="text-xs text-slate-400 py-2">Loading attachments...</div>
      ) : attachments.length === 0 ? (
        <div className="text-xs text-slate-400 py-2">No attachments yet</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-100">
                <th className="pb-1.5 font-medium">File Name</th>
                <th className="pb-1.5 font-medium">Size</th>
                <th className="pb-1.5 font-medium">Last Modified</th>
                <th className="pb-1.5 font-medium">Created By</th>
                <th className="pb-1.5 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {attachments.map((a) => (
                <tr key={a.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                  <td className="py-2">
                    {editingId === a.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          className="form-input text-xs py-0.5 px-1.5 w-40"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleEditSave(a.id)}
                        />
                        <button className="text-green-600 text-[10px] font-medium" onClick={() => handleEditSave(a.id)}>Save</button>
                        <button className="text-slate-400 text-[10px]" onClick={() => setEditingId(null)}>Cancel</button>
                      </div>
                    ) : (
                      <span className="text-slate-700">{a.file_name}</span>
                    )}
                  </td>
                  <td className="py-2 text-slate-500">{formatFileSize(a.file_size)}</td>
                  <td className="py-2 text-slate-500">{formatDateTime(a.last_modified)}</td>
                  <td className="py-2 text-slate-500">{a.created_by_name || '—'}</td>
                  <td className="py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        className="text-indigo-600 hover:text-indigo-800 font-medium"
                        onClick={() => handleEditStart(a)}
                        title="Rename"
                      >
                        Edit
                      </button>
                      <span className="text-slate-200">|</span>
                      <button
                        className="text-blue-600 hover:text-blue-800 font-medium"
                        onClick={() => handleView(a)}
                        title="View / Download"
                      >
                        View
                      </button>
                      <span className="text-slate-200">|</span>
                      <button
                        className="text-red-500 hover:text-red-700 font-medium"
                        onClick={() => handleDelete(a.id)}
                        title="Delete"
                      >
                        Del
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
