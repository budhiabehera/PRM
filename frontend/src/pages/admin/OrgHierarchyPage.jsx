import { useState, useMemo, useCallback, useEffect } from 'react'
import useApi from '../../hooks/useApi'
import useProjectDefault from '../../hooks/useProjectDefault'
import { getOrgHierarchy, saveOrgHierarchy, getAllProjects } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import FilterSelect from '../../components/common/FilterSelect'
import { ChevronDown, ChevronRight } from 'lucide-react'

export default function OrgHierarchyPage() {
  const { defaultProjectId, showAllOption, restrictedProjects } = useProjectDefault()
  const { data: allProjects = [] } = useApi(getAllProjects, [])
  const [projectId, setProjectId] = useState(defaultProjectId)
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [editMap, setEditMap] = useState({})
  const [tableOpen, setTableOpen] = useState(true)
  const [treeOpen, setTreeOpen] = useState(true)

  const showToast = (type, text) => {
    setToast({ type, text })
    setTimeout(() => setToast(null), 4000)
  }

  const projectOptions = useMemo(() => {
    if (showAllOption) return allProjects
    return restrictedProjects
  }, [allProjects, restrictedProjects, showAllOption])

  const loadData = useCallback(async () => {
    if (!projectId) { setMembers([]); return }
    setLoading(true)
    try {
      const data = await getOrgHierarchy(projectId)
      setMembers(data.members || [])
      const map = {}
      data.members.forEach(m => { map[m.id] = m.reports_to_id || '' })
      setEditMap(map)
    } catch { setMembers([]) }
    setLoading(false)
  }, [projectId])

  useEffect(() => { loadData() }, [loadData])

  const handleReportsToChange = (devId, reportsToId) => {
    setEditMap(prev => ({ ...prev, [devId]: reportsToId }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const entries = Object.entries(editMap).map(([devId, reportsToId]) => ({
        user_id: Number(devId),
        reports_to_user_id: reportsToId ? Number(reportsToId) : null,
      }))
      await saveOrgHierarchy({ project_id: Number(projectId), entries })
      showToast('success', 'Org hierarchy saved successfully!')
      loadData()
    } catch (err) {
      showToast('error', err.response?.data?.detail || 'Failed to save')
    }
    setSaving(false)
  }

  // Role colors
  const rc = {
    'Admin': 'bg-red-50 text-red-600 border-red-200',
    'Manager': 'bg-purple-50 text-purple-600 border-purple-200',
    'Development Manager': 'bg-indigo-50 text-indigo-600 border-indigo-200',
    'Development Lead': 'bg-blue-50 text-blue-600 border-blue-200',
    'Developer': 'bg-green-50 text-green-600 border-green-200',
    'QA Engineer': 'bg-amber-50 text-amber-600 border-amber-200',
    'Lead QA engineer': 'bg-teal-50 text-teal-600 border-teal-200',
    'SVP-Product': 'bg-rose-50 text-rose-600 border-rose-200',
    'AVP-Product': 'bg-pink-50 text-pink-600 border-pink-200',
    'Product Manager': 'bg-orange-50 text-orange-600 border-orange-200',
  }
  const getRoleStyle = (role) => rc[role] || 'bg-slate-50 text-slate-600 border-slate-200'

  // Build tree from editMap
  const treeData = useMemo(() => {
    if (!members.length) return []
    const byId = {}
    members.forEach(m => { byId[m.id] = { ...m, children: [] } })
    const roots = []
    members.forEach(m => {
      const rto = editMap[m.id]
      if (rto && byId[rto]) {
        byId[rto].children.push(byId[m.id])
      } else {
        roots.push(byId[m.id])
      }
    })
    return roots
  }, [members, editMap])

  // Count hierarchy levels
  const countLevels = (nodes, depth = 1) => {
    let max = depth
    for (const n of nodes) {
      if (n.children.length > 0) max = Math.max(max, countLevels(n.children, depth + 1))
    }
    return max
  }
  const totalLevels = treeData.length > 0 ? countLevels(treeData) : 0

  // Tree node with collapse
  const TreeNode = ({ node, depth = 0 }) => {
    const [open, setOpen] = useState(true)
    const hasKids = node.children.length > 0
    return (
      <div className={`${depth > 0 ? 'ml-6 border-l-2 border-indigo-100 pl-3' : ''}`}>
        <div className="flex items-center gap-2.5 py-2 px-3 my-0.5 rounded-lg bg-white border border-slate-200 hover:border-indigo-200 hover:shadow-sm transition-all group">
          {hasKids ? (
            <button onClick={() => setOpen(!open)} className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-100 text-slate-400">
              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : <span className="w-5" />}
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-[11px] font-bold text-white shadow-sm flex-shrink-0">
            {(node.developer_name || '?').charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-slate-800 truncate">{node.developer_name}</div>
            <div className="text-[10px] text-slate-400 truncate">{node.username}{node.skill ? ` \u2022 ${node.skill}` : ''}</div>
          </div>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap ${getRoleStyle(node.role)}`}>
            {node.role}
          </span>
          {hasKids && (
            <span className="text-[9px] text-indigo-400 bg-indigo-50 px-1.5 py-0.5 rounded-full font-medium">
              {node.children.length} report{node.children.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        {hasKids && open && (
          <div>{node.children.map(c => <TreeNode key={c.id} node={c} depth={depth + 1} />)}</div>
        )}
      </div>
    )
  }

  // Collapsible section header
  const SectionHeader = ({ title, icon, open, onToggle, badge, extra }) => (
    <div className="flex items-center justify-between cursor-pointer select-none py-2" onClick={onToggle}>
      <div className="flex items-center gap-2">
        <button className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-100 text-slate-400">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <span className="text-[15px] font-semibold">{icon} {title}</span>
        {badge && <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">{badge}</span>}
      </div>
      {extra && <div className="text-[10px] text-slate-400">{extra}</div>}
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{'\ud83c\udfe2'} Organization Hierarchy</h2>
          <p className="text-xs text-slate-500 mt-0.5">Define who reports to whom within each project</p>
        </div>
        {members.length > 0 && (
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : '\ud83d\udcbe Save Hierarchy'}
          </button>
        )}
      </div>

      {toast && (
        <div className={`mb-4 px-4 py-2 rounded-lg text-sm font-medium ${toast.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {toast.text}
        </div>
      )}

      <div className="flex gap-3 mb-4 p-3 bg-white border border-slate-200 rounded-xl">
        <FilterSelect label="Project" value={projectId} onChange={setProjectId}
          options={projectOptions.map((p) => ({ value: p.id, label: p.name }))} showAll={showAllOption} />
      </div>

      {!projectId ? (
        <div className="card p-10 text-center text-slate-400">Select a project to view its org hierarchy</div>
      ) : loading ? (
        <LoadingSpinner label="Loading hierarchy..." />
      ) : members.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">
          <div className="text-lg mb-2">{'\ud83d\udc65'}</div>
          No team members assigned to this project.
          <br /><span className="text-[10px]">Go to Admin {'\u2192'} User Setup to assign team members first.</span>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Hierarchy Tree - show first */}
          <div className="card">
            <SectionHeader
              title="Hierarchy Tree"
              icon={'\ud83c\udf33'}
              open={treeOpen}
              onToggle={() => setTreeOpen(!treeOpen)}
              badge={totalLevels > 0 ? `${totalLevels} level${totalLevels > 1 ? 's' : ''}` : null}
            />
            {treeOpen && (
              treeData.length === 0 ? (
                <div className="text-sm text-slate-400 py-3">Set reporting lines below to see the tree</div>
              ) : (
                <div className="mt-2 space-y-0.5">
                  {treeData.map(node => <TreeNode key={node.id} node={node} />)}
                </div>
              )
            )}
          </div>

          {/* Team Members Table */}
          <div className="card">
            <SectionHeader
              title="Team Members"
              icon={'\ud83d\udccb'}
              open={tableOpen}
              onToggle={() => setTableOpen(!tableOpen)}
              badge={`${members.length} member${members.length > 1 ? 's' : ''}`}
              extra="Assign reporting lines here"
            />
            {tableOpen && (
              <table className="data-table mt-2">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Username</th>
                    <th>Role</th>
                    <th>Skill</th>
                    <th>Reports To</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map(m => (
                    <tr key={m.id}>
                      <td className="font-medium">{m.developer_name}</td>
                      <td className="text-slate-500 text-xs">{m.username}</td>
                      <td>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${getRoleStyle(m.role)}`}>
                          {m.role}
                        </span>
                      </td>
                      <td className="text-slate-500 text-xs">{m.skill || '\u2014'}</td>
                      <td>
                        <select
                          className="form-select text-xs py-1 px-2 w-full max-w-[250px]"
                          value={editMap[m.id] || ''}
                          onChange={(e) => handleReportsToChange(m.id, e.target.value)}
                        >
                          <option value="">{'\u2014'} None (Top Level) {'\u2014'}</option>
                          {members.filter(x => x.id !== m.id).map(x => (
                            <option key={x.id} value={x.id}>{x.developer_name} ({x.role})</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
