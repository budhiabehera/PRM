import { useNavigate } from 'react-router-dom'
import { LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import useAuthStore from '../../store/useAuthStore'
import useUIStore from '../../store/useUIStore'

export default function Header() {
  const { user, logout } = useAuthStore()
  const { sidebarCollapsed, toggleSidebar } = useUIStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
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
          <img src="/logo.png" alt="PRM" className="w-8 h-8 rounded-md object-cover" />
          PRM <span className="font-normal text-slate-300">— Project & Resource Management</span>
          <span className="text-[10px] bg-indigo-600 px-2.5 py-0.5 rounded-full font-normal">
            50-dev team · Jul–Dec 2026
          </span>
        </h1>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <div className="bg-white/10 px-3.5 py-1.5 rounded-full flex items-center gap-1.5">
          👤 {user?.full_name || 'User'}
          <span className="text-[10px] bg-white/15 px-2 py-0.5 rounded-full">{user?.role}</span>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full transition-colors"
        >
          <LogOut size={13} /> Logout
        </button>
      </div>
    </header>
  )
}
