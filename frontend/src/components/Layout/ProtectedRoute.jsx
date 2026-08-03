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

export default function ProtectedRoute({ allowedRoles }) {
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
    return null // brief flash, then renders
  }

  // If page access rules exist in DB, use them instead of hardcoded allowedRoles
  if (pageAccess && pageAccess.length > 0 && allowedRoles) {
    // Find the rule for the current path
    const currentPath = location.pathname
    const rule = pageAccess.find((r) => currentPath === r.page_key || currentPath.startsWith(r.page_key + '/'))

    if (rule) {
      // Rule exists — check if user's role is in the allowed roles
      if (rule.roles.includes(user?.role)) {
        return <Outlet />
      } else {
        return (
          <div className="p-10 text-center text-slate-500">
            <div className="text-lg font-semibold text-slate-700 mb-1">Access restricted</div>
            <p className="text-sm">Your role ({user?.role}) doesn't have permission to view this page.</p>
          </div>
        )
      }
    }

    // No specific rule for this path — allow access (page not managed by page access)
    return <Outlet />
  }

  // Fallback: use hardcoded allowedRoles (when no page access rules in DB)
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
