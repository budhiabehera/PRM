import { useState, useEffect } from 'react'
import { getPageAccess, bulkSavePageAccess, getRoleCapacities, getDataScopes, bulkSaveDataScopes, getUsers } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'

// All available pages in the system
const ALL_PAGES = [
  // Overview
  { page_key: '/', page_label: 'Dashboard', section: 'overview' },
  { page_key: '/my-dashboard', page_label: 'My Dashboard', section: 'overview' },
  { page_key: '/sprint', page_label: 'Sprint View', section: 'overview' },
  { page_key: '/tasks', page_label: 'Tasks', section: 'overview' },
  { page_key: '/team', page_label: 'Team', section: 'overview' },
  { page_key: '/utilization', page_label: 'Utilization', section: 'overview' },
  { page_key: '/availability', page_label: 'Leave Tracker', section: 'overview' },
  { page_key: '/holidays', page_label: 'Holidays', section: 'overview' },
  { page_key: '/time-logs', page_label: 'Time Logs', section: 'overview' },
  { page_key: '/resource-calendar', page_label: 'Resource Calendar', section: 'overview' },
  { page_key: '/timeline', page_label: 'Timeline', section: 'overview' },
  { page_key: '/knowledge-base', page_label: 'Knowledge Base', section: 'overview' },
  { page_key: '/standup', page_label: 'Daily Standup', section: 'overview' },
  { page_key: '/settings', page_label: 'My Settings', section: 'overview' },
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
  // Engineering
  { page_key: '/engineering/pm', page_label: 'PM Assistant', section: 'engineering' },
  { page_key: '/engineering', page_label: 'Overview', section: 'engineering' },
  { page_key: '/engineering/commits', page_label: 'Commits', section: 'engineering' },
  { page_key: '/engineering/pull-requests', page_label: 'Pull Requests', section: 'engineering' },
  { page_key: '/engineering/code-reviews', page_label: 'Code Reviews', section: 'engineering' },
  { page_key: '/engineering/releases', page_label: 'Releases', section: 'engineering' },
  { page_key: '/engineering/risks', page_label: 'Risk Analysis', section: 'engineering' },
  { page_key: '/engineering/alerts', page_label: 'Alert Rules', section: 'engineering' },
  { page_key: '/engineering/settings', page_label: 'Bitbucket Settings', section: 'engineering' },
]

export default function PageAccessPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [roles, setRoles] = useState([])
  // accessMap: { page_key: { role: true/false } }
  const [accessMap, setAccessMap] = useState({})
  const [scopeMap, setScopeMap] = useState({}) // { role: 'self_only'|'team'|'full' }
  const [roleCounts, setRoleCounts] = useState({}) // { role: count }

  const showToast = (type, text) => {
    setToast({ type, text })
    setTimeout(() => setToast(null), 4000)
  }

  useEffect(() => {
    const load = async () => {
      try {
        const [pageAccessData, roleCapData, scopeData, usersData] = await Promise.all([
          getPageAccess(),
          getRoleCapacities(),
          getDataScopes(),
          getUsers().catch(() => []),
        ])

        // Get roles from role capacity page
        const roleNames = roleCapData.map((r) => r.role)
        // Always include Admin
        const allRoles = [...new Set(['Admin', ...roleNames])]
        setRoles(allRoles)

        // Build scope map — default: Admin=full, others=self_only
        const sMap = {}
        allRoles.forEach(r => { sMap[r] = r === 'Admin' ? 'full' : 'self_only' })
        scopeData.forEach(s => { if (sMap[s.role] !== undefined) sMap[s.role] = s.data_scope })
        setScopeMap(sMap)

        // Count users per role
        const counts = {}
        usersData.forEach(u => {
          const r = u.role || 'Unknown'
          counts[r] = (counts[r] || 0) + 1
        })
        setRoleCounts(counts)

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

  const selectAllForRole = (role, section) => {
    setAccessMap((prev) => {
      const newMap = { ...prev }
      ALL_PAGES.filter(p => p.section === section).forEach((p) => {
        newMap[p.page_key] = { ...newMap[p.page_key], [role]: true }
      })
      return newMap
    })
  }

  const deselectAllForRole = (role, section) => {
    if (role === 'Admin') return
    setAccessMap((prev) => {
      const newMap = { ...prev }
      ALL_PAGES.filter(p => p.section === section).forEach((p) => {
        newMap[p.page_key] = { ...newMap[p.page_key], [role]: false }
      })
      return newMap
    })
  }

  // Auto-sync page checkboxes when scope changes
  const handleScopeChange = (role, newScope) => {
    setScopeMap(prev => ({ ...prev, [role]: newScope }))
    
    // Auto-adjust page access checkboxes
    const selfOnlyExcluded = ['/', '/sprint', '/team', '/timeline']
    const selfOnlyAllowed = ['/tasks', '/utilization', '/availability', '/holidays', '/time-logs', '/resource-calendar', '/knowledge-base', '/standup', '/settings']
    
    setAccessMap(prev => {
      const newMap = { ...prev }
      if (newScope === 'self_only') {
        // Uncheck team/manager pages, ensure self pages are checked
        selfOnlyExcluded.forEach(pk => {
          if (newMap[pk]) newMap[pk] = { ...newMap[pk], [role]: false }
        })
        selfOnlyAllowed.forEach(pk => {
          if (newMap[pk]) newMap[pk] = { ...newMap[pk], [role]: true }
        })
      } else if (newScope === 'team' || newScope === 'full') {
        // Check all overview pages
        ALL_PAGES.filter(p => p.section === 'overview').forEach(p => {
          if (newMap[p.page_key]) newMap[p.page_key] = { ...newMap[p.page_key], [role]: true }
        })
      }
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
      // Save data scopes
      const scopes = roles.map(r => ({ role: r, data_scope: scopeMap[r] || 'self_only' }))
      await bulkSaveDataScopes({ scopes })
      showToast('success', 'Page access & data scope settings saved successfully!')
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
    { key: 'engineering', label: 'Engineering' },
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

      {/* Data Scope per Role */}
      <div className="card mb-6">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-sm font-bold text-slate-800">🔒 Data Scope per Role</h2>
          <p className="text-xs text-slate-500 mt-1">Controls what data each role can see — changing scope auto-adjusts page checkboxes below</p>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {roles.map(role => {
              const scope = scopeMap[role] || 'self_only'
              const borderColor = scope === 'full' ? 'border-emerald-300 bg-emerald-50/40'
                : scope === 'team' ? 'border-blue-300 bg-blue-50/40'
                : 'border-amber-300 bg-amber-50/40'
              const badgeColor = scope === 'full' ? 'bg-emerald-100 text-emerald-700'
                : scope === 'team' ? 'bg-blue-100 text-blue-700'
                : 'bg-amber-100 text-amber-700'
              const count = roleCounts[role] || 0
              return (
                <div key={role} className={`p-3 rounded-lg border-2 ${borderColor} transition-colors`}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="text-sm font-semibold text-slate-800">{role}</span>
                      {count > 0 && <span className={`ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${badgeColor}`}>{count} user{count !== 1 ? 's' : ''}</span>}
                    </div>
                  </div>
                  <select
                    className="form-select text-xs py-1.5 px-3 w-full"
                    value={scope}
                    onChange={(e) => handleScopeChange(role, e.target.value)}
                    disabled={role === 'Admin'}
                  >
                    <option value="self_only">👤 Self Only</option>
                    <option value="team">👥 Team View</option>
                    <option value="full">🌐 Full Access</option>
                  </select>
                </div>
              )
            })}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3 text-[11px]">
            <div className="p-2 rounded border border-amber-200 bg-amber-50/50"><strong>👤 Self Only</strong> — Own tasks, hours, calendar only. No Dashboard.</div>
            <div className="p-2 rounded border border-blue-200 bg-blue-50/50"><strong>👥 Team View</strong> — Project team data. Dashboard &amp; team pages visible.</div>
            <div className="p-2 rounded border border-emerald-200 bg-emerald-50/50"><strong>🌐 Full Access</strong> — All data across all projects.</div>
          </div>
        </div>
      </div>

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
                          <button className="text-[9px] text-indigo-500 hover:underline" onClick={() => selectAllForRole(role, section.key)}>All</button>
                          <span className="text-slate-300">|</span>
                          <button className="text-[9px] text-red-400 hover:underline" onClick={() => deselectAllForRole(role, section.key)}>None</button>
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
