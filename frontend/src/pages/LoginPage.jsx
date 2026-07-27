import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { login } from '../services/api'
import useAuthStore from '../store/useAuthStore'

const DEMO_ACCOUNTS = [
  { role: 'Admin', username: 'admin', password: 'Admin@123' },
  { role: 'Manager', username: 'elango.manager', password: 'Manager@123' },
  { role: 'Team Lead', username: 'ramesh.lead', password: 'Lead@123' },
  { role: 'Developer', username: 'srishti.dev', password: 'Dev@123' },
]

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const setAuth = useAuthStore((s) => s.setAuth)
  const navigate = useNavigate()
  const location = useLocation()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await login(username, password)
      setAuth(data.access_token, data.user)
      const redirectTo = location.state?.from || '/'
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid username or password')
    } finally {
      setLoading(false)
    }
  }

  const fillDemo = (acct) => {
    setUsername(acct.username)
    setPassword(acct.password)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-indigo-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-6">
          <img src="/logo.png" alt="PRM" className="w-16 h-16 mx-auto rounded-xl object-cover mb-3" />
          <h1 className="text-xl font-bold text-slate-900">PRM — Project & Resource Management</h1>
          <p className="text-xs text-slate-500 mt-1">Sign in with your account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="form-label">Username</label>
            <input
              className="form-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. admin"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
          <button type="submit" className="btn btn-primary w-full justify-center" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-slate-100">
          <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-2">Demo Accounts</p>
          <div className="grid grid-cols-2 gap-2">
            {DEMO_ACCOUNTS.map((acct) => (
              <button
                key={acct.username}
                type="button"
                onClick={() => fillDemo(acct)}
                className="text-left border border-slate-200 rounded-lg px-3 py-2 text-xs hover:bg-slate-50 transition-colors"
              >
                <div className="font-semibold text-slate-700">{acct.role}</div>
                <div className="text-slate-400">{acct.username}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
