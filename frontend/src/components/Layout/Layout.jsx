import { Outlet } from 'react-router-dom'
import Header from './Header'
import Sidebar from './Sidebar'
import useUIStore from '../../store/useUIStore'

export default function Layout() {
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed)

  return (
    <div>
      <Header />
      <Sidebar />
      <main className={`pt-14 min-h-screen transition-all duration-200 ${sidebarCollapsed ? 'ml-[72px]' : 'ml-56'}`}>
        <div className="p-7">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
