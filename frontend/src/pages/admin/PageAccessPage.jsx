import React, { useState, useMemo, useEffect } from 'react'
import useApi from '../../hooks/useApi'
import { getPageAccess, bulkSavePageAccess, getUsers, getDataScopes, bulkSaveDataScopes } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'

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
  { page_key: '/admin/org-hierarchy', page_label: 'Org Hierarchy', section: 'admin' },
  { page_key: '/admin/audit-log', page_label: 'Audit Log', section: 'admin' },
  { page_key: '/admin/kb-categories', page_label: 'KB Categories', section: 'admin' },
  // Reports
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

const SECTIONS = [
  { key: 'overview', label: 'Overview', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { key: 'admin', label: 'Admin', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  { key: 'reports', label: 'Reports', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { key: 'engineering', label: 'Engineering', color: 'bg-green-50 text-green-700 border-green-200' },
]

const SCOPE_OPTIONS = [
  { value: 'self_only', label: 'Self', icon: '\u{1F464}', color: 'text-amber-600 bg-amber-50' },
  { value: 'team_reports', label: 'Self+Rpt', icon: '\u{1F465}', color: 'text-violet-600 bg-violet-50' },
  { value: 'team', label: 'Team', icon: '\u{1F46C}', color: 'text-blue-600 bg-blue-50' },
  { value: 'full', label: 'Full', icon: '\u{1F310}', color: 'text-emerald-600 bg-emerald-50' },
]

export default function PageAccessPage() {
  const { data: rules, loading: l1 } = useApi(getPageAccess, [])
  const { data: usersData, loading: l2 } = useApi(getUsers, [])
  const { data: scopeData, loading: l3 } = useApi(getDataScopes, [])
  const [accessMap, setAccessMap] = useState({})
  const [scopeMap, setScopeMap] = useState({})
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [collapsed, setCollapsed] = useState({ overview: true, admin: true, reports: true, engineering: true })

  const roles = useMemo(() => {
    const r = new Set()
    ;(usersData || []).forEach(u => r.add(u.role))
    return [...r].sort()
  }, [usersData])

  const roleCounts = useMemo(() => {
    const c = {}
    ;(usersData || []).forEach(u => { c[u.role] = (c[u.role] || 0) + 1 })
    return c
  }, [usersData])

  useEffect(() => {
    if (!rules) return
    const map = {}
    rules.forEach(r => {
      // Backend returns roles as array per page
      const allowedRoles = r.roles || []
      allowedRoles.forEach(role => {
        map[`${r.page_key}::${role}`] = true
      })
    })
    setAccessMap(map)
  }, [rules])

  useEffect(() => {
    if (!scopeData) return
    const map = {}
    scopeData.forEach(s => { map[s.role] = s.data_scope })
    setScopeMap(map)
  }, [scopeData])

  const hasRulesLoaded = Object.keys(accessMap).length > 0

  const isChecked = (pageKey, role) => {
    if (role === 'Admin') return true
    const key = `${pageKey}::${role}`
    if (key in accessMap) return accessMap[key]
    // If rules exist in DB but this page/role combo isn't set, default to unchecked
    if (hasRulesLoaded) return false
    // If no rules at all (fresh install), default everything to checked
    return true
  }

  const toggleAccess = (pageKey, role) => {
    if (role === 'Admin' && (pageKey === '/admin/settings' || pageKey === '/admin/page-access')) return
    setAccessMap(prev => {
      const key = `${pageKey}::${role}`
      return { ...prev, [key]: !isChecked(pageKey, role) }
    })
  }

  const selectAllSection = (role, sectionKey) => {
    setAccessMap(prev => {
      const next = { ...prev }
      ALL_PAGES.filter(p => p.section === sectionKey).forEach(p => {
        next[`${p.page_key}::${role}`] = true
      })
      return next
    })
  }

  const deselectAllSection = (role, sectionKey) => {
    setAccessMap(prev => {
      const next = { ...prev }
      ALL_PAGES.filter(p => p.section === sectionKey).forEach(p => {
        if (role === 'Admin' && (p.page_key === '/admin/settings' || p.page_key === '/admin/page-access')) return
        next[`${p.page_key}::${role}`] = false
      })
      return next
    })
  }

  const toggleSection = (key) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))

  const handleScopeChange = (role, newScope) => {
    setScopeMap(prev => ({ ...prev, [role]: newScope }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // Group by page: collect roles that have access
      const pages = ALL_PAGES.map(p => ({
        page_key: p.page_key,
        page_label: p.page_label,
        section: p.section,
        roles: roles.filter(role => isChecked(p.page_key, role)),
      }))
      await bulkSavePageAccess({ pages })
      const scopes = roles.map(r => ({ role: r, data_scope: scopeMap[r] || 'self_only' }))
      await bulkSaveDataScopes({ scopes })
      setToast({ type: 'success', text: 'Saved successfully!' })
      setTimeout(() => setToast(null), 3000)
    } catch (err) {
      setToast({ type: 'error', text: typeof err.response?.data?.detail === 'string' ? err.response.data.detail : JSON.stringify(err.response?.data?.detail || 'Save failed') })
      setTimeout(() => setToast(null), 4000)
    }
    setSaving(false)
  }

  if (l1 || l2 || l3) return <LoadingSpinner label="Loading page access..." />

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Page Access Control</h2>
          <p className="text-xs text-slate-500 mt-0.5">Configure data scope and page visibility per role</p>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {toast && (
        <div className={`mb-3 px-4 py-2 rounded-lg text-sm font-medium ${toast.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {toast.text}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-sm">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10">
            {/* Role names row */}
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-3 py-2 font-semibold text-slate-600 w-44 sticky left-0 bg-slate-50 z-20">
                Page
              </th>
              {roles.map(role => (
                <th key={role} className="px-1.5 py-2 text-center min-w-[80px]">
                  <div className="font-semibold text-slate-700 text-[10px] leading-tight">{role}</div>
                  <div className="text-[9px] text-slate-400 font-normal">{roleCounts[role] || 0} user{(roleCounts[role] || 0) !== 1 ? 's' : ''}</div>
                </th>
              ))}
            </tr>
            {/* Data Scope row */}
            <tr className="bg-indigo-50/50 border-b-2 border-indigo-200">
              <td className="px-3 py-2 font-semibold text-indigo-700 text-[10px] sticky left-0 bg-indigo-50/50 z-20">
                DATA SCOPE
              </td>
              {roles.map(role => {
                const scope = scopeMap[role] || 'self_only'
                const opt = SCOPE_OPTIONS.find(o => o.value === scope) || SCOPE_OPTIONS[0]
                return (
                  <td key={role} className="px-1 py-1.5 text-center">
                    <select
                      className={`w-full text-[10px] font-semibold rounded px-1 py-1 border-0 cursor-pointer ${opt.color}`}
                      value={scope}
                      onChange={e => handleScopeChange(role, e.target.value)}
                    >
                      {SCOPE_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.icon} {o.label}</option>
                      ))}
                    </select>
                  </td>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {SECTIONS.map(section => {
              const sectionPages = ALL_PAGES.filter(p => p.section === section.key)
              return (
                <React.Fragment key={section.key}>
                  {/* Section header row */}
                  <tr className={`border-t-2 ${section.color} cursor-pointer`} onClick={() => toggleSection(section.key)}>
                    <td className={`px-3 py-1.5 font-bold text-[11px] uppercase tracking-wide sticky left-0 z-10 ${section.color}`}>
                      <span className="inline-flex items-center gap-1">
                        <span className="text-[10px]">{collapsed[section.key] ? '▶' : '▼'}</span>
                        {section.label}
                        <span className="text-[9px] font-normal opacity-60">({ALL_PAGES.filter(p => p.section === section.key).length})</span>
                      </span>
                    </td>
                    {roles.map(role => (
                      <td key={role} className="px-1 py-1 text-center" onClick={e => e.stopPropagation()}>
                        {!collapsed[section.key] && (
                          <div className="flex gap-1 justify-center">
                            <button
                              className="text-[8px] text-indigo-500 hover:text-indigo-700 hover:underline"
                              onClick={() => selectAllSection(role, section.key)}
                              title="Select all"
                            >All</button>
                            <span className="text-slate-300">|</span>
                            <button
                              className="text-[8px] text-red-400 hover:text-red-600 hover:underline"
                              onClick={() => deselectAllSection(role, section.key)}
                              title="Deselect all"
                            >None</button>
                          </div>
                        )}
                      </td>
                    ))}
                  </tr>
                  {/* Page rows */}
                  {!collapsed[section.key] && sectionPages.map((page, idx) => (
                    <tr key={page.page_key} className={`border-b border-slate-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'} hover:bg-blue-50/30 transition-colors`}>
                      <td className={`px-3 py-1.5 text-slate-700 font-medium text-[11px] sticky left-0 z-10 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                        {page.page_label}
                      </td>
                      {roles.map(role => {
                        const checked = isChecked(page.page_key, role)
                        const locked = role === 'Admin' && (page.page_key === '/admin/settings' || page.page_key === '/admin/page-access')
                        return (
                          <td key={role} className="px-1 py-1.5 text-center">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleAccess(page.page_key, role)}
                              disabled={locked}
                              className={`w-3.5 h-3.5 rounded cursor-pointer accent-indigo-600 ${locked ? 'opacity-40 cursor-not-allowed' : ''}`}
                            />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-[10px] text-slate-400">
        <strong>Note:</strong> Admin always retains access to Settings and Page Access. Data scope controls what data each role sees across all pages.
      </div>
    </div>
  )
}
