import { useState } from 'react'
import useApi from '../hooks/useApi'
import useDropdowns from '../hooks/useDropdowns'
import useProjectDefault from '../hooks/useProjectDefault'
import { getResources, getResourceStats } from '../services/api'
import LoadingSpinner from '../components/common/LoadingSpinner'
import KPICard from '../components/common/KPICard'
import RoleBadge from '../components/common/RoleBadge'
import UtilizationBar from '../components/charts/UtilizationBar'
import { UTIL_STATUS_COLORS } from '../utils/constants'
import { formatPercent } from '../utils/formatters'

const initials = (name) => name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
const avatarColor = (name) => {
  const colors = ['#4f46e5', '#22c55e', '#f59e0b', '#0ea5e9', '#dc2626', '#9333ea', '#0d9488', '#e11d48']
  const idx = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % colors.length
  return colors[idx]
}

export default function TeamPage() {
  const { data: stats, loading: l1 } = useApi(getResourceStats, [])
  const { data: resources, loading: l2, reload: reloadResources } = useApi(() => getResources(sprintFilter ? { sprint_id: sprintFilter } : {}), [sprintFilter])
  const { skills, projects, sprints } = useDropdowns()
  const { defaultProjectId, showAllOption, restrictedProjects } = useProjectDefault()
  const [projectFilter, setProjectFilter] = useState(defaultProjectId)
  const [skillFilter, setSkillFilter] = useState('')
  const [sprintFilter, setSprintFilter] = useState('')

  if (l1 || l2) return <LoadingSpinner label="Loading team..." />

  let filtered = resources
  if (projectFilter) filtered = filtered.filter((r) => (r.project_ids || []).includes(Number(projectFilter)))
  if (skillFilter) filtered = filtered.filter((r) => r.skill === skillFilter)

  const handleExportPDF = () => {
    const now = new Date()
    const generated = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    const projectName = projectFilter ? (restrictedProjects.find(p => String(p.id) === String(projectFilter))?.name || '') : 'All Projects'

    const buildTable = (headers, rows) => {
      const ths = headers.map(h => `<th>${h}</th>`).join('')
      const trs = rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')
      return `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`
    }

    const headers = ['Name', 'Module', 'Skill', 'Role', 'Active Tasks', 'Assigned Hrs', 'Capacity', 'Utilization']
    const rows = filtered.map(dev => {
      const utilColor = dev.utilization_pct > 100 ? '#dc2626' : dev.utilization_pct >= 60 ? '#16a34a' : '#d97706'
      return [
        `<strong>${dev.name}</strong>`,
        dev.home_module || 'Unassigned',
        dev.skill || '—',
        dev.role || '—',
        String(dev.active_tasks || 0),
        `${dev.assigned_hours || 0}h`,
        `${dev.base_capacity || 0}h`,
        `<span style="color:${utilColor};font-weight:700">${Math.round(dev.utilization_pct || 0)}%</span>`
      ]
    })

    const html = `<!DOCTYPE html><html><head><title>Team Report</title><style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; color: #1e293b; font-size: 12px; }
      h1 { font-size: 20px; margin-bottom: 2px; }
      .subtitle { font-size: 12px; color: #64748b; margin-bottom: 20px; }
      .kpi-row { display: flex; gap: 12px; margin-bottom: 24px; }
      .kpi-card { flex: 1; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; text-align: center; }
      .kpi-value { font-size: 22px; font-weight: 700; color: #1e293b; }
      .kpi-label { font-size: 10px; text-transform: uppercase; color: #64748b; margin-top: 4px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
      th { padding: 6px 10px; border-bottom: 2px solid #cbd5e1; font-size: 11px; text-transform: uppercase; color: #475569; text-align: left; }
      td { padding: 6px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; }
      .generated { margin-top: 24px; font-size: 10px; color: #94a3b8; }
      @media print { body { padding: 0; } }
    </style></head><body>
      <h1>Team Report</h1>
      <div class="subtitle">Project: ${projectName} | Generated on ${generated}</div>
      <div class="kpi-row"><div class="kpi-card"><div class="kpi-value">${filtered.length}</div><div class="kpi-label">Active Resources</div></div><div class="kpi-card"><div class="kpi-value">${filtered.reduce((s, d) => s + (d.base_capacity || 0), 0)}</div><div class="kpi-label">Team Capacity</div></div><div class="kpi-card"><div class="kpi-value">${filtered.reduce((s, d) => s + (d.assigned_hours || 0), 0).toFixed(1)}</div><div class="kpi-label">Monthly Hrs</div></div><div class="kpi-card"><div class="kpi-value">${filtered.length > 0 ? ((filtered.reduce((s, d) => s + (d.assigned_hours || 0), 0) / Math.max(filtered.reduce((s, d) => s + (d.base_capacity || 0), 0), 1)) * 100).toFixed(1) + '%' : '0%'}</div><div class="kpi-label">Avg Utilization</div></div></div>
      ${buildTable(headers, rows)}
      <div class="generated">PRM Report — ${generated}</div>
      <script>window.onload = function() { window.print(); }<\/script>
    </body></html>`

    const printWindow = window.open('', '_blank')
    printWindow.document.write(html)
    printWindow.document.close()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Team</h2>
          <p className="text-xs text-slate-500 mt-0.5">Team overview and current workload</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-secondary px-5 py-2 text-sm flex items-center gap-2 whitespace-nowrap" onClick={handleExportPDF} title="Export to PDF">📄 Export PDF
          </button>
          <select className="form-select max-w-[160px]" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
            {showAllOption && <option value="">All Projects</option>}
            {restrictedProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="form-select max-w-[160px]" value={sprintFilter} onChange={(e) => setSprintFilter(e.target.value)}>
            <option value="">All Sprints</option>
            {(sprints || []).filter(s => !projectFilter || !s.project_id || String(s.project_id) === String(projectFilter)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className="form-select max-w-[140px]" value={skillFilter} onChange={(e) => setSkillFilter(e.target.value)}>
            <option value="">All Skills</option>
            {(skills || []).map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3.5 mb-6">
        <KPICard label="Active Resources" value={filtered.length} tooltip="Total number of active developers matching current filters" />
        <KPICard label="Team Capacity" value={filtered.reduce((s, d) => s + (d.base_capacity || 0), 0)} tooltip="Sum of all developers' base monthly capacity (hrs/month)" />
        <KPICard label="Monthly Hrs" value={filtered.reduce((s, d) => s + (d.assigned_hours || 0), 0).toFixed(1)} tooltip="Total estimated hours from all active tasks assigned to filtered team members" />
        <KPICard label="Avg Utilization" value={formatPercent(filtered.length > 0 ? Math.round((filtered.reduce((s, d) => s + (d.assigned_hours || 0), 0) / Math.max(filtered.reduce((s, d) => s + (d.base_capacity || 0), 0), 1)) * 1000) / 10 : 0)} tooltip="(Total Assigned Hours ÷ Team Capacity) × 100%" />
      </div>

      <div className="grid grid-cols-3 gap-3.5">
        {filtered.map((dev) => (
          <div key={dev.id} className="card !mb-0">
            <div className="flex items-center gap-2.5 mb-3">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center font-semibold text-xs text-white flex-shrink-0"
                style={{ background: avatarColor(dev.name) }}
              >
                {initials(dev.name)}
              </div>
              <div>
                <div className="font-semibold text-[13px]">{dev.name}</div>
                <div className="text-[11px] text-slate-500">{dev.home_module || 'Unassigned'} · {dev.skill}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 mb-1">
              <RoleBadge role={dev.role} />
              <span className={`text-[11px] ${UTIL_STATUS_COLORS[dev.utilization_status]}`}>
                <span title={`Utilization = Assigned Hours (${dev.assigned_hours}) ÷ Base Capacity (${dev.base_capacity}) × 100`}>{formatPercent(dev.utilization_pct)}</span>
              </span>
            </div>
            <UtilizationBar pct={dev.utilization_pct} status={dev.utilization_status} width="100%" />
            <div className="flex justify-between mt-2 text-[11px] text-slate-500">
              <span title="Number of tasks not in 'Completed' status">{dev.active_tasks} active tasks</span>
              <span title={`Assigned Hours (sum of estimated_hours for all tasks) / Base Monthly Capacity`}>{dev.assigned_hours} / {dev.base_capacity} hrs</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
