import { useState, useEffect } from 'react'
import { getPageAccess, bulkSavePageAccess, getRoleCapacities } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'

// All available pages in the system
const ALL_PAGES = [
  // Overview
  { page_key: '/', page_label: 'Dashboard', section: 'overview' },
  { page_key: '/sprint', page_label: 'Sprint View', section: 'overview' },
  { page_key: '/tasks', page_label: 'Tasks', section: 'overview' },
  { page_key: '/team', page_label: 'Team', section: 'overview' },
  { page_key: '/utilization', page_label: 'Utilization', section: 'overview' },
  { page_key: '/availability', page_label: 'Leave Tracker', section: 'overview' },
  { page_key: '/holidays', page_label: 'Holidays', section: 'overview' },
  { page_key: '/resource-calendar', page_label: 'Resource Calendar', section: 'overview' },
  { page_key: '/timeline', page_label: 'Timeline', section: 'overview' },
  // Admin
  { page_key: '/admin/projects', page_label: 'Projects', section: 'admin' },
  { page_key: '/admin/modules', page_label: 'Modules', section: 'admin' },
  { page_key: '/admin/user-setup', page_label: 'User Setup', section: 'admin' },
  { page_key: '/admin/skills', page_label: 'Skills', section: 'admin' },
  { page_key: '/admin/work-types', page_label: 'Work Types', section: 'admin' },
  { page_key: '/admin/sprints', page_label: 'Sprints', section: 'admin' },
  { page_key: '/admin/role-capacity', page_label: 'Role Capacity', section: 'admin' },
  { page_key: '/admin/task-statuses', page_label: 'Task Status', section: 'admin' },
  { page_key: '/admin/assignments', page_label: 'Assignments', section: 'admin' },
  { page_key: '/admin/settings', page_label: 'Settings', section: 'admin' },
  { page_key: '/admin/page-access', page_label: 'Page Access', section: 'admin' },
  { page_key: '/admin/audit-log', page_label: 'Audit Log', section: 'admin' },

  { page_key: '/reports/salesforce-tasks', page_label: 'Salesforce Tasks', section: 'reports' },
  { page_key: '/reports/project-progress', page_label: 'Project Progress', section: 'reports' },
  { page_key: '/reports/overdue-tasks', page_label: 'Overdue Tasks', section: 'reports' },
  { page_key: '/reports/customer-summary', page_label: 'Customer Summary', section: 'reports' },
  { page_key: '/reports/time-variance', page_label: 'Time Variance', section: 'reports' },
]

export default function PageAccessPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [roles, setRoles] = useState([])
  // accessMap: { page_key: { role: true/false } }
  const [accessMap, setAccessMap] = useState({})

  const showToast = (type, text) => {
    setToast({ type, text })
    setTimeout(() => setToast(null), 4000)
  }

  useEffect(() => {
    const load = async () => {
      try {
        const [pageAccessData, roleCapData] = await Promise.all([
          getPageAccess(),
          getRoleCapacities(),
        ])

        // Get roles from role capacity page
        const roleNames = roleCapData.map((r) => r.role)
        // Always include Admin
        const allRoles = [...new Set(['Admin', ...roleNames])]
        setRoles(allRoles)

        // Build access map from saved data
        const map = {}
        ALL_PAGES.forEach((p) => {
          map[p.page_key] = {}
          allRoles.forEach((r) => { map[p.page_key][r] = false })
        })

        // If no data exists yet, default: Admin gets all, others get overview
        if (pageAccessData.length === 0) {
          ALL_PAGES.forEach((p) => {
            allRoles.forEach((r) => {
              if (r === 'Admin') {
                map[p.page_key][r] = true
              } else if (p.section === 'overview') {
                map[p.page_key][r] = true
              }
            })
          })
        } else {
          // Load from saved
          pageAccessData.forEach((pa) => {
            if (map[pa.page_key]) {
              pa.roles.forEach((r) => {
                if (map[pa.page_key][r] !== undefined) {
                  map[pa.page_key][r] = true
                }
              })
            }
          })
        }

        setAccessMap(map)
      } catch { /* ignore */ }
      setLoading(false)
    }
    load()
  }, [])

  const toggleAccess = (pageKey, role) => {
    // Don't allow removing Admin from Settings or Page Access
    if (role === 'Admin' && (pageKey === '/admin/settings' || pageKey === '/admin/page-access')) return

    setAccessMap((prev) => ({
      ...prev,
      [pageKey]: { ...prev[pageKey], [role]: !prev[pageKey]?.[role] },
    }))
  }

  const selectAllForRole = (role) => {
    setAccessMap((prev) => {
      const newMap = { ...prev }
      ALL_PAGES.forEach((p) => {
        newMap[p.page_key] = { ...newMap[p.page_key], [role]: true }
      })
      return newMap
    })
  }

  const deselectAllForRole = (role) => {
    if (role === 'Admin') return // can't remove admin from everything
    setAccessMap((prev) => {
      const newMap = { ...prev }
      ALL_PAGES.forEach((p) => {
        newMap[p.page_key] = { ...newMap[p.page_key], [role]: false }
      })
      return newMap
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const pages = ALL_PAGES.map((p) => ({
        page_key: p.page_key,
        page_label: p.page_label,
        section: p.section,
        roles: roles.filter((r) => accessMap[p.page_key]?.[r]),
      }))
      await bulkSavePageAccess({ pages })
      showToast('success', 'Page access settings saved successfully!')
    } catch (err) {
      showToast('error', err.response?.data?.detail || 'Could not save settings')
    }
    setSaving(false)
  }

  if (loading) return <LoadingSpinner label="Loading page access..." />

  const sections = [
    { key: 'overview', label: 'Overview Pages' },
    { key: 'admin', label: 'Admin Pages' },
    { key: 'reports', label: 'Reports' },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Page Access Control</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Control which roles can see each page in the sidebar menu.
          </p>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {toast && (
        <div className={`mb-4 px-4 py-2 rounded-lg text-sm font-medium ${toast.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {toast.text}
        </div>
      )}

      {sections.map((section) => {
        const sectionPages = ALL_PAGES.filter((p) => p.section === section.key)
        return (
          <div key={section.key} className="card mb-5">
            <div className="text-[15px] font-semibold mb-4 text-slate-800">{section.label}</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left px-3 py-2 text-slate-600 font-semibold min-w-[180px]">Page</th>
                    {roles.map((role) => (
                      <th key={role} className="text-center px-2 py-2 text-slate-600 font-semibold min-w-[90px]">
                        <div>{role}</div>
                        <div className="flex gap-1 justify-center mt-1">
                          <button className="text-[9px] text-indigo-500 hover:underline" onClick={() => selectAllForRole(role)}>All</button>
                          <span className="text-slate-300">|</span>
                          <button className="text-[9px] text-red-400 hover:underline" onClick={() => deselectAllForRole(role)}>None</button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sectionPages.map((page) => (
                    <tr key={page.page_key} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-3 py-2.5 font-medium text-slate-700">{page.page_label}</td>
                      {roles.map((role) => {
                        const isChecked = accessMap[page.page_key]?.[role] || false
                        const isLocked = role === 'Admin' && (page.page_key === '/admin/settings' || page.page_key === '/admin/page-access')
                        return (
                          <td key={role} className="text-center px-2 py-2.5">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleAccess(page.page_key, role)}
                              disabled={isLocked}
                              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer disabled:opacity-50"
                            />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
        <p className="text-xs text-blue-700">
          <strong>Note:</strong> Admin always has access to Settings and Page Access pages.
          Changes take effect immediately after saving — users will see updated menus on next page load.
        </p>
      </div>
    </div>
  )
}
