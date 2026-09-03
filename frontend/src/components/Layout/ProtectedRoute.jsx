import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import useAuthStore from '../../store/useAuthStore'
import { getPageAccess } from '../../services/api'

let cachedPageAccess = null
let cachePromise = null

function loadPageAccess() {
  if (cachedPageAccess) return Promise.resolve(cachedPageAccess)
  if (cachePromise) return cachePromise
  cachePromise = getPageAccess().then((data) => {
    cachedPageAccess = data
    return data
  }).catch(() => {
    cachedPageAccess = []
    return []
  })
  return cachePromise
}

// Call this to clear cache when settings change
export function clearPageAccessCache() {
  cachedPageAccess = null
  cachePromise = null
}

export default function ProtectedRoute() {
  const { token, user } = useAuthStore()
  const location = useLocation()
  const [pageAccess, setPageAccess] = useState(cachedPageAccess)
  const [loading, setLoading] = useState(!cachedPageAccess)

  useEffect(() => {
    if (!cachedPageAccess) {
      loadPageAccess().then((data) => {
        setPageAccess(data)
        setLoading(false)
      })
    }
  }, [])

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  // Still loading page access rules
  if (loading && !pageAccess) {
    return null
  }

  // Admin always has full access
  if (user?.role === 'Admin') {
    return <Outlet />
  }

  // Universal pages — always accessible (DashboardOrRedirect handles routing)
  const universalPaths = ['/', '/my-dashboard', '/login', '/change-password', '/settings']
  if (universalPaths.includes(location.pathname)) {
    return <Outlet />
  }

  // Check DB-driven page access rules
  if (pageAccess && pageAccess.length > 0) {
    const currentPath = location.pathname
    const rule = pageAccess.find((r) => currentPath === r.page_key || currentPath.startsWith(r.page_key + '/'))

    if (rule) {
      if (rule.roles.includes(user?.role)) {
        return <Outlet />
      } else {
        return (
          <div className="p-10 text-center text-slate-500">
            <div className="text-lg font-semibold text-slate-700 mb-1">Access restricted</div>
            <p className="text-sm">Your role ({user?.role}) doesn&apos;t have permission to view this page.</p>
          </div>
        )
      }
    }

    // No rule for this path — allow access (page not managed by page access)
    return <Outlet />
  }

  // No DB rules at all — allow everything (admin hasn't configured page access yet)
  return <Outlet />
}
