import { Navigate, Outlet, useLocation } from 'react-router-dom'
import useAuthStore from '../../store/useAuthStore'

export default function ProtectedRoute({ allowedRoles }) {
  const { token, user } = useAuthStore()
  const location = useLocation()

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    return (
      <div className="p-10 text-center text-slate-500">
        <div className="text-lg font-semibold text-slate-700 mb-1">Access restricted</div>
        <p className="text-sm">Your role ({user?.role}) doesn't have permission to view this page.</p>
      </div>
    )
  }
  return <Outlet />
}
