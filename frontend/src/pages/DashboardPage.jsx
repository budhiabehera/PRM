import { useState, useMemo, useEffect } from 'react'
import useApi from '../hooks/useApi'
import useAuthStore from '../store/useAuthStore'
import useDropdowns from '../hooks/useDropdowns'
import useProjectDefault from '../hooks/useProjectDefault'
import {
  getKpis, getStatusBreakdown, getProjectBreakdown, getWorkTypeBreakdown,
  getModuleBreakdown, getSubModuleBreakdown, getMonthlyUtilization,
} from '../services/api'
import KPICard from '../components/common/KPICard'
import LoadingSpinner from '../components/common/LoadingSpinner'
import StatusDonut from '../components/charts/StatusDonut'
import MonthlyTrend from '../components/charts/MonthlyTrend'
import StatusBadge from '../components/common/StatusBadge'
import useFilterPresets from '../hooks/useFilterPresets'
import PresetDrawer from '../components/common/PresetDrawer'
import { formatNumber, formatPercent } from '../utils/formatters'

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const { sprints, projects } = useDropdowns()
  const isDeveloper = user?.role === 'Developer'
  const { defaultProjectId, showAllOption, restrictedProjects } = useProjectDefault()
  const [selectedProject, setSelectedProject] = useState(defaultProjectId)
  const [selectedSprint, setSelectedSprint] = useState('')

  // Filter presets
  const { presets, defaultFilters, savePreset, removePreset, setAsDefault } = useFilterPresets('dashboard')
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Auto-apply default preset on first load
  useEffect(() => {
    if (!defaultFilters) return
    if (defaultFilters.project_id) setSelectedProject(defaultFilters.project_id)
    if (defaultFilters.sprint_id) setSelectedSprint(defaultFilters.sprint_id)
  }, [defaultFilters])

  // Build params: developer_id for Developer role + sprint_id if selected
  const params = useMemo(() => {
    const p = {}
    if (isDeveloper && user?.developer_id) p.developer_id = user.developer_id
    if (selectedProject) p.project_id = selectedProject
    if (selectedSprint) p.sprint_id = selectedSprint
    return Object.keys(p).length > 0 ? p : undefined
  }, [isDeveloper, user?.developer_id, selectedProject, selectedSprint])

  const depsKey = `${user?.developer_id || ''}-${selectedProject}-${selectedSprint}`

  const { data: kpis, loading: l1 } = useApi(() => getKpis(params), [depsKey])
  const { data: statusData, loading: l2 } = useApi(() => getStatusBreakdown(params), [depsKey])
  const { data: projectData, loading: l3 } = useApi(() => getProjectBreakdown(params), [depsKey])
  const { data: workTypeData, loading: l4 } = useApi(() => getWorkTypeBreakdown(params), [depsKey])
  const { data: moduleData, loading: l5 } = useApi(() => getModuleBreakdown(params), [depsKey])
  const { data: subModuleData, loading: l6 } = useApi(() => getSubModuleBreakdown(params), [depsKey])
  const { data: monthlyData, loading: l7 } = useApi(() => getMonthlyUtilization(params), [depsKey])

  const loading = l1 || l2 || l3 || l4 || l5 || l6 || l7
  if (loading || !kpis) return <LoadingSpinner label="Loading dashboard..." />

  // Ensure arrays have fallback
  const safeStatus = statusData || []
  const safeProject = projectData || []
  const safeWorkType = workTypeData || []
  const safeModule = moduleData || []
  const safeSubModule = subModuleData || []
  const safeMonthly = monthlyData || []

  // --- Export Dashboard to PDF ---
  const handleExportPDF = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    const CHART_COLORS = ['#4f46e5', '#22c55e', '#f59e0b', '#0ea5e9', '#dc2626', '#9333ea', '#0d9488']

    const buildTable = (headers, rows) => {
      const ths = headers.map(h => `<th style="padding:6px 10px;border-bottom:2px solid #cbd5e1;font-size:11px;text-transform:uppercase;color:#475569;text-align:left;">${h}</th>`).join('')
      const trs = rows.map(r => `<tr>${r.map(c => `<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;">${c}</td>`).join('')}</tr>`).join('')
      return `<table style="width:100%;border-collapse:collapse;margin-bottom:8px;"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`
    }

    // --- SVG Donut Chart ---
    const buildDonutSVG = () => {
      const total = safeStatus.reduce((sum, r) => sum + r.count, 0)
      if (total === 0) return '<p style="color:#94a3b8;">No data</p>'
      const cx = 120, cy = 120, outerR = 100, innerR = 60
      let cumAngle = -90
      const paths = safeStatus.map((r, i) => {
        const angle = (r.count / total) * 360
        const startAngle = cumAngle
        const endAngle = cumAngle + angle
        cumAngle = endAngle
        const startRad = (startAngle * Math.PI) / 180
        const endRad = (endAngle * Math.PI) / 180
        const x1Outer = cx + outerR * Math.cos(startRad)
        const y1Outer = cy + outerR * Math.sin(startRad)
        const x2Outer = cx + outerR * Math.cos(endRad)
        const y2Outer = cy + outerR * Math.sin(endRad)
        const x1Inner = cx + innerR * Math.cos(endRad)
        const y1Inner = cy + innerR * Math.sin(endRad)
        const x2Inner = cx + innerR * Math.cos(startRad)
        const y2Inner = cy + innerR * Math.sin(startRad)
        const largeArc = angle > 180 ? 1 : 0
        const d = `M ${x1Outer} ${y1Outer} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2Outer} ${y2Outer} L ${x1Inner} ${y1Inner} A ${innerR} ${innerR} 0 ${largeArc} 0 ${x2Inner} ${y2Inner} Z`
        return `<path d="${d}" fill="${CHART_COLORS[i % CHART_COLORS.length]}" />`
      }).join('')
      const legend = safeStatus.map((r, i) => `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px;"><span style="width:10px;height:10px;border-radius:2px;background:${CHART_COLORS[i % CHART_COLORS.length]};display:inline-block;"></span>${r.status} (${r.count})</span>`).join('')
      return `<svg width="240" height="240" viewBox="0 0 240 240">${paths}</svg><div style="margin-top:8px;font-size:11px;line-height:1.8;">${legend}</div>`
    }

    // --- SVG Line Chart (Monthly Utilization) ---
    const buildLineSVG = () => {
      if (!safeMonthly || safeMonthly.length === 0) return ''
      const W = 500, H = 200, padL = 40, padR = 20, padT = 20, padB = 40
      const chartW = W - padL - padR, chartH = H - padT - padB
      const maxVal = Math.max(...safeMonthly.map(r => Math.max(r.utilization_pct || 0, r.allocated_hours || 0)), 100)
      const xStep = chartW / Math.max(safeMonthly.length - 1, 1)
      const scaleY = (v) => padT + chartH - (v / maxVal) * chartH
      const scaleX = (i) => padL + i * xStep

      // Grid lines
      const gridLines = [0, 25, 50, 75, 100].filter(v => v <= maxVal).map(v => {
        const y = scaleY(v)
        return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#e2e8f0" stroke-dasharray="3,3" /><text x="${padL - 5}" y="${y + 4}" text-anchor="end" font-size="9" fill="#94a3b8">${v}</text>`
      }).join('')

      // Util % line
      const utilPoints = safeMonthly.map((r, i) => `${scaleX(i)},${scaleY(r.utilization_pct || 0)}`).join(' ')
      // Allocated hrs line (scaled)
      const allocPoints = safeMonthly.map((r, i) => `${scaleX(i)},${scaleY(r.allocated_hours || 0)}`).join(' ')

      // X-axis labels
      const xLabels = safeMonthly.map((r, i) => `<text x="${scaleX(i)}" y="${H - 8}" text-anchor="middle" font-size="9" fill="#64748b">${r.month}</text>`).join('')

      // Dots
      const utilDots = safeMonthly.map((r, i) => `<circle cx="${scaleX(i)}" cy="${scaleY(r.utilization_pct || 0)}" r="3" fill="#4f46e5" />`).join('')
      const allocDots = safeMonthly.map((r, i) => `<circle cx="${scaleX(i)}" cy="${scaleY(r.allocated_hours || 0)}" r="3" fill="#22c55e" />`).join('')

      return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
        ${gridLines}
        <polyline points="${utilPoints}" fill="none" stroke="#4f46e5" stroke-width="2" />
        <polyline points="${allocPoints}" fill="none" stroke="#22c55e" stroke-width="2" />
        ${utilDots}${allocDots}
        ${xLabels}
      </svg>
      <div style="font-size:11px;margin-top:6px;">
        <span style="color:#4f46e5;font-weight:600;">━</span> Utilization %
        <span style="margin-left:16px;color:#22c55e;font-weight:600;">━</span> Allocated Hrs
      </div>`
    }

    const statusTable = buildTable(
      ['Status', 'Count', 'Est Hrs'],
      safeStatus.map(r => [r.status, r.count, r.estimated_hours?.toLocaleString() || '0'])
    )

    const projectTable = buildTable(
      ['Project', 'Tasks', 'Est Hrs', 'Remaining'],
      safeProject.map(r => [r.project, r.tasks, r.estimated_hours?.toLocaleString() || '0', r.remaining_hours?.toLocaleString() || '0'])
    )

    const workTypeTable = buildTable(
      ['Work Type', 'Committed', 'Tasks', 'Est', 'Actual'],
      safeWorkType.map(r => [r.work_type, r.customer_committed ? 'Yes' : 'No', r.tasks, r.estimated_hours?.toLocaleString() || '0', r.actual_hours?.toLocaleString() || '0'])
    )

    const moduleTable = buildTable(
      ['Module', 'Devs', 'Tasks', 'Est Hrs'],
      safeModule.map(r => [r.module, r.developers, r.tasks, r.estimated_hours?.toLocaleString() || '0'])
    )

    const subModuleTable = buildTable(
      ['Sub Module', 'Main Module', 'Tasks', 'Est Hrs'],
      safeSubModule.map(r => [r.sub_module, r.main_module || '', r.tasks, r.estimated_hours?.toLocaleString() || '0'])
    )

    const monthlyTable = buildTable(
      ['Month', 'Alloc Hrs', 'Net Cap', 'Util %', 'Over', 'Healthy', 'Idle'],
      safeMonthly.map(r => [r.month, r.allocated_hours?.toLocaleString() || '0', r.net_capacity?.toLocaleString() || '0', `${r.utilization_pct}%`, r.over_count, r.healthy_count, r.idle_count])
    )

    const projectLabel = selectedProject ? projects.find(p => String(p.id) === selectedProject)?.name || '' : 'All Projects'
    const sprintLabel = selectedSprint ? sprints.find(s => String(s.id) === selectedSprint)?.name || '' : 'All Sprints'

    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Dashboard Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; color: #1e293b; font-size: 12px; }
    h1 { font-size: 20px; margin-bottom: 2px; }
    .subtitle { font-size: 12px; color: #64748b; margin-bottom: 20px; }
    .kpi-row { display: flex; gap: 12px; margin-bottom: 24px; }
    .kpi-card { flex: 1; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; text-align: center; }
    .kpi-value { font-size: 22px; font-weight: 700; color: #1e293b; }
    .kpi-label { font-size: 10px; text-transform: uppercase; color: #64748b; margin-top: 4px; letter-spacing: 0.5px; }
    .section { margin-bottom: 24px; }
    .section-title { font-size: 14px; font-weight: 600; margin-bottom: 8px; color: #1e293b; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .generated { margin-top: 24px; font-size: 10px; color: #94a3b8; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>Dashboard Report</h1>
  <div class="subtitle">Project: ${projectLabel} | Sprint: ${sprintLabel} | Generated on ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</div>

  <div class="kpi-row">
    <div class="kpi-card"><div class="kpi-value">${kpis.total_developers}</div><div class="kpi-label">Total Resources</div></div>
    <div class="kpi-card"><div class="kpi-value">${kpis.total_tasks}</div><div class="kpi-label">Total Tasks</div></div>
    <div class="kpi-card"><div class="kpi-value">${formatNumber(kpis.total_estimated_hours)}</div><div class="kpi-label">Total Est. Hours</div></div>
    <div class="kpi-card"><div class="kpi-value">${kpis.customer_committed_tasks}</div><div class="kpi-label">Customer Committed</div></div>
    <div class="kpi-card"><div class="kpi-value">${kpis.cross_month_tasks}</div><div class="kpi-label">Cross-Month Tasks</div></div>
  </div>

  <div class="two-col">
    <div class="section">
      <div class="section-title">Tasks by Status</div>
      ${statusTable}
    </div>
    <div class="section">
      <div class="section-title">Status Distribution</div>
      ${buildDonutSVG()}
    </div>
  </div>

  <div class="two-col">
    <div class="section">
      <div class="section-title">Tasks by Project</div>
      ${projectTable}
    </div>
    <div class="section">
      <div class="section-title">Hours by Work Type</div>
      ${workTypeTable}
    </div>
  </div>

  <div class="two-col">
    <div class="section">
      <div class="section-title">Tasks by Main Module</div>
      ${moduleTable}
    </div>
    <div class="section">
      <div class="section-title">Tasks by Sub Module</div>
      ${subModuleTable}
    </div>
  </div>

  <div class="section">
    <div class="section-title">Monthly Utilization Summary</div>
    ${buildLineSVG()}
    ${monthlyTable}
  </div>

  <div class="generated">PRM Dashboard Report — ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}</div>
  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`

    printWindow.document.write(html)
    printWindow.document.close()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Dashboard</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {isDeveloper ? 'Your personal task summary and utilization' : 'Program-wide KPIs across projects, modules, and sprints'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-secondary" onClick={() => setDrawerOpen(true)}>
            📋 Saved Views
          </button>
          <button className="btn btn-secondary" onClick={handleExportPDF}>
            📄 Export PDF
          </button>
          <span className="text-[10px] uppercase tracking-wide text-slate-400 font-medium">Project</span>
          <select
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white min-w-[150px] focus:outline-none focus:border-indigo-500"
            value={selectedProject}
            onChange={(e) => { setSelectedProject(e.target.value); setSelectedSprint('') }}
          >
            {showAllOption && <option value="">All Projects</option>}
            {restrictedProjects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <span className="text-[10px] uppercase tracking-wide text-slate-400 font-medium">Sprint</span>
          <select
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white min-w-[150px] focus:outline-none focus:border-indigo-500"
            value={selectedSprint}
            onChange={(e) => setSelectedSprint(e.target.value)}
          >
            <option value="">All Sprints</option>
            {sprints
            .filter((s) => !selectedProject || !s.project_id || String(s.project_id) === selectedProject)
            .map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3.5 mb-6">
        <KPICard label="Total Resources" value={kpis.total_developers} tooltip="Number of active developers assigned to the selected project" />
        <KPICard label="Total Tasks" value={kpis.total_tasks} tooltip="Total tasks matching current project and sprint filters" />
        <KPICard label="Total Est. Hours" value={formatNumber(kpis.total_estimated_hours)} tooltip="Sum of estimated_hours from all filtered tasks" />
        <KPICard label="Customer Committed" value={kpis.customer_committed_tasks} tooltip="Tasks marked as customer-committed (delivery promised to client)" />
        <KPICard label="Cross-Month Tasks" value={kpis.cross_month_tasks} tooltip="Tasks that span across multiple calendar months (start and end date in different months)" />
      </div>

      <div className="grid grid-cols-[1.4fr_1fr] gap-5">
        <div className="card">
          <div className="text-[15px] font-semibold mb-3.5">Tasks by Status</div>
          <table className="data-table">
            <thead><tr><th>Status</th><th>Count</th><th>Est Hrs</th></tr></thead>
            <tbody>
              {safeStatus.map((row) => (
                <tr key={row.status}>
                  <td><StatusBadge status={row.status} /></td>
                  <td>{row.count}</td>
                  <td>{formatNumber(row.estimated_hours)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className="text-[15px] font-semibold mb-3.5">Status Distribution</div>
          <StatusDonut data={safeStatus} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div className="card">
          <div className="text-[15px] font-semibold mb-3.5">Tasks by Project</div>
          <table className="data-table">
            <thead><tr><th>Project</th><th>Tasks</th><th>Est Hrs</th><th>Remaining</th></tr></thead>
            <tbody>
              {safeProject.map((row) => (
                <tr key={row.project}>
                  <td className="font-medium">{row.project}</td>
                  <td>{row.tasks}</td>
                  <td>{formatNumber(row.estimated_hours)}</td>
                  <td>{formatNumber(row.remaining_hours)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className="text-[15px] font-semibold mb-3.5">Hours by Work Type</div>
          <table className="data-table">
            <thead><tr><th>Work Type</th><th>Committed?</th><th>Tasks</th><th>Est</th><th>Actual</th></tr></thead>
            <tbody>
              {safeWorkType.map((row) => (
                <tr key={row.work_type}>
                  <td className="font-medium">{row.work_type}</td>
                  <td>{row.customer_committed ? <span className="badge bg-green-100 text-green-700">Yes</span> : <span className="badge bg-slate-100 text-slate-500">No</span>}</td>
                  <td>{row.tasks}</td>
                  <td>{formatNumber(row.estimated_hours)}</td>
                  <td>{formatNumber(row.actual_hours)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div className="card">
          <div className="text-[15px] font-semibold mb-3.5">Tasks by Main Module</div>
          <table className="data-table">
            <thead><tr><th>Module</th><th>Devs</th><th>Tasks</th><th>Est Hrs</th></tr></thead>
            <tbody>
              {safeModule.map((row) => (
                <tr key={row.module}>
                  <td className="font-medium">{row.module}</td>
                  <td>{row.developers}</td>
                  <td>{row.tasks}</td>
                  <td>{formatNumber(row.estimated_hours)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className="text-[15px] font-semibold mb-3.5">Tasks by Sub Module</div>
          <table className="data-table">
            <thead><tr><th>Sub Module</th><th>Main Module</th><th>Tasks</th><th>Est Hrs</th></tr></thead>
            <tbody>
              {safeSubModule.map((row) => (
                <tr key={row.sub_module}>
                  <td className="font-medium">{row.sub_module}</td>
                  <td>{row.main_module}</td>
                  <td>{row.tasks}</td>
                  <td>{formatNumber(row.estimated_hours)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="text-[15px] font-semibold mb-3.5">Monthly Utilization Summary</div>
        <MonthlyTrend data={safeMonthly} />
        <table className="data-table mt-4">
          <thead><tr><th>Month</th><th>Alloc Hrs</th><th>Net Cap</th><th>Util %</th><th>Over</th><th>Healthy</th><th>Idle</th></tr></thead>
          <tbody>
            {safeMonthly.map((row) => (
              <tr key={row.month}>
                <td className="font-medium">{row.month}</td>
                <td>{formatNumber(row.allocated_hours)}</td>
                <td>{formatNumber(row.net_capacity)}</td>
                <td>{formatPercent(row.utilization_pct)}</td>
                <td className="text-red-600">{row.over_count}</td>
                <td className="text-green-700">{row.healthy_count}</td>
                <td className="text-slate-400">{row.idle_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Right-side Preset Drawer */}
      <PresetDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        presets={presets}
        pageName="Dashboard"
        onSave={({ name, isDefault }) => savePreset(name, { project_id: selectedProject, sprint_id: selectedSprint }, isDefault)}
        onLoad={(preset) => {
          const f = preset.filters || {}
          setSelectedProject(f.project_id || '')
          setSelectedSprint(f.sprint_id || '')
          setDrawerOpen(false)
        }}
        onSetDefault={(id) => setAsDefault(id)}
        onDelete={(id) => removePreset(id)}
      />
    </div>
  )
}
