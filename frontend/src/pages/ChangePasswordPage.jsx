import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { changePassword } from '../services/api'

export default function ChangePasswordPage() {
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm_password: '' })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    // Client-side validation
    if (form.new_password.length < 6) {
      setError('New password must be at least 6 characters')
      return
    }
    if (form.new_password !== form.confirm_password) {
      setError('New passwords do not match')
      return
    }

    setLoading(true)
    try {
      await changePassword({
        current_password: form.current_password,
        new_password: form.new_password,
      })
      setSuccess('Password changed successfully!')
      setForm({ current_password: '', new_password: '', confirm_password: '' })
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not change password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto mt-8">
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <KeyRound size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Change Password</h1>
            <p className="text-xs text-slate-500">Update your account password</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="form-label">Current Password *</label>
            <input
              type="password"
              className="form-input"
              value={form.current_password}
              onChange={(e) => setForm((f) => ({ ...f, current_password: e.target.value }))}
              placeholder="Enter your current password"
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="form-label">New Password *</label>
            <input
              type="password"
              className="form-input"
              value={form.new_password}
              onChange={(e) => setForm((f) => ({ ...f, new_password: e.target.value }))}
              placeholder="At least 6 characters"
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="form-label">Confirm New Password *</label>
            <input
              type="password"
              className="form-input"
              value={form.confirm_password}
              onChange={(e) => setForm((f) => ({ ...f, confirm_password: e.target.value }))}
              placeholder="Re-enter new password"
              required
            />
          </div>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          {success && (
            <div className="text-xs text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              {success}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary w-full justify-center mt-2"
            disabled={loading}
          >
            {loading ? 'Changing...' : 'Change Password'}
          </button>
        </form>
      </div>
    </div>
  )
}
