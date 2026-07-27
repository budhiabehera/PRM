import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, PanelLeftClose, PanelLeftOpen, KeyRound, LayoutGrid } from 'lucide-react'
import useAuthStore from '../../store/useAuthStore'
import useUIStore from '../../store/useUIStore'
import { changePassword } from '../../services/api'

export default function Header() {
  const { user, logout } = useAuthStore()
  const { sidebarCollapsed, toggleSidebar } = useUIStore()
  const navigate = useNavigate()
  const [showPwModal, setShowPwModal] = useState(false)
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm_password: '' })
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState('')

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    setPwError('')
    setPwSuccess('')
    if (pwForm.new_password !== pwForm.confirm_password) {
      setPwError('New passwords do not match')
      return
    }
    if (pwForm.new_password.length < 6) {
      setPwError('New password must be at least 6 characters')
      return
    }
    try {
      await changePassword({
        current_password: pwForm.current_password,
        new_password: pwForm.new_password,
      })
      setPwSuccess('Password changed successfully!')
      setPwForm({ current_password: '', new_password: '', confirm_password: '' })
      setTimeout(() => { setShowPwModal(false); setPwSuccess('') }, 1500)
    } catch (err) {
      setPwError(err.response?.data?.detail || 'Could not change password')
    }
  }

  return (
    <>
      <header className="fixed top-0 left-0 right-0 h-14 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between px-8 z-50">
        <div className="flex items-center gap-3">
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-md text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
          <h1 className="text-[17px] font-semibold flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <LayoutGrid size={16} className="text-white" />
            </div>
            PRM <span className="font-normal text-slate-300">— Project & Resource Management</span>
          </h1>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <div className="bg-white/10 px-3.5 py-1.5 rounded-full flex items-center gap-1.5">
            👤 {user?.full_name || 'User'}
            <span className="text-[10px] bg-white/15 px-2 py-0.5 rounded-full">{user?.role}</span>
          </div>
          <button
            onClick={() => setShowPwModal(true)}
            className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full transition-colors"
            title="Change Password"
          >
            <KeyRound size={13} /> Password
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full transition-colors"
          >
            <LogOut size={13} /> Logout
          </button>
        </div>
      </header>

      {/* Change Password Modal */}
      {showPwModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">Change Password</h3>
              <button className="text-slate-400 hover:text-slate-600 text-xl" onClick={() => { setShowPwModal(false); setPwError(''); setPwSuccess('') }}>×</button>
            </div>
            <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="form-label">Current Password *</label>
                <input type="password" className="form-input" value={pwForm.current_password}
                  onChange={(e) => setPwForm((f) => ({ ...f, current_password: e.target.value }))} required />
              </div>
              <div className="flex flex-col gap-1">
                <label className="form-label">New Password *</label>
                <input type="password" className="form-input" value={pwForm.new_password}
                  onChange={(e) => setPwForm((f) => ({ ...f, new_password: e.target.value }))} required />
              </div>
              <div className="flex flex-col gap-1">
                <label className="form-label">Confirm New Password *</label>
                <input type="password" className="form-input" value={pwForm.confirm_password}
                  onChange={(e) => setPwForm((f) => ({ ...f, confirm_password: e.target.value }))} required />
              </div>
              {pwError && <div className="text-xs text-red-600">{pwError}</div>}
              {pwSuccess && <div className="text-xs text-green-600">{pwSuccess}</div>}
              <div className="flex gap-2 mt-2">
                <button type="submit" className="btn btn-primary">Change Password</button>
                <button type="button" className="btn btn-secondary" onClick={() => { setShowPwModal(false); setPwError(''); setPwSuccess('') }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
