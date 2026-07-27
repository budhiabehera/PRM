import { Outlet } from 'react-router-dom'
import Header from './Header'
import Sidebar from './Sidebar'

export default function Layout() {
  return (
    <div>
      <Header />
      <Sidebar />
      <main className="ml-56 pt-14 min-h-screen">
        <div className="p-7">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
