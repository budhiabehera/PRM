import { useState, useEffect } from 'react'
import useApi from '../hooks/useApi'
import useAuthStore from '../store/useAuthStore'
import useDropdowns from '../hooks/useDropdowns'
import useProjectDefault from '../hooks/useProjectDefault'
import { getUtilizationGrid } from '../services/api'
import LoadingSpinner from '../components/common/LoadingSpinner'
import FilterSelect from '../components/common/FilterSelect'
import MultiSelect from '../components/common/MultiSelect'
import { UTIL_STATUS_COLORS } from '../utils/constants'
import { formatPercent } from '../utils/formatters'
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'
import PresetBar from '../components/common/PresetBar'
import useFilterPresets from '../hooks/useFilterPresets'

function sortRowsByName(rows) {
  if (!rows || !Array.isArray(rows)) return []
  return rows.slice().sort(function(a, b) {
    var nameA = (a.developer_name || '').trim().toLowerCase()
    var nameB = (b.developer_name || '').trim().toLowerCase()
    if (nameA < nameB) return -1
    if (nameA > nameB) return 1
    return 0
  })
}

export default function UtilizationPage() {
  const user = useAuthStore((s) => s.user)
  const isDeveloper = user?.role === 'Developer'
  const devParams = isDeveloper && user?.developer_id ? { developer_id: user.developer_id } : undefined
  const { resources, sprints: allSprints, projects } = useDropdowns()

  const { defaultProjectId, showAllOption, restrictedProjects } = useProjectDefault()
  const [projectFilter, setProjectFilter] = useState(defaultProjectId)
  const [selectedResources, setSelectedResources] = useState([])
  const [sprintFilter, setSprintFilter] = useState('')

  // Filter presets
  const { presets, defaultFilters, savePreset } = useFilterPresets('utilization')

  // Auto-apply default preset on first load
  useEffect(() => {
    if (!defaultFilters) return
    if (defaultFilters.selectedResources) setSelectedResources(defaultFilters.selectedResources)
    if (defaultFilters.sprintFilter) setSprintFilter(defaultFilters.sprintFilter)
  }, [defaultFilters])

  const { data, loading } = useApi(() => getUtilizationGrid(devParams), [user?.developer_id])
  if (loading) return <LoadingSpinner label="Loading utilization grid..." />

  const sprints = data.sprints
  let rows = sortRowsByName(data.rows)

  // Filter by selected resources (empty = all)
  if (selectedResources.length > 0 && selectedResources[0] !== '__none__') {
    rows = rows.filter((r) => selectedResources.includes(String(r.developer_id)))
  } else if (selectedResources[0] === '__none__') {
    rows = []
  }

  // Filter by project (show only resources that belong to the selected project)
  if (projectFilter) {
    const projectResIds = resources.filter((r) => (r.project_ids || []).includes(Number(projectFilter))).map((r) => r.id)
    rows = rows.filter((r) => projectResIds.includes(r.developer_id))
  }

  // Filter sprint columns
  const filteredSprints = sprintFilter
    ? sprints.filter((s) => s === allSprints.find((sp) => String(sp.id) === sprintFilter)?.name)
    : sprints

  // Filter cells in each row to match filtered sprints
  const filteredRows = rows.map((row) => ({
    ...row,
    cells: sprintFilter
      ? row.cells.filter((cell) => filteredSprints.includes(cell.month))
      : row.cells,
  }))

  // --- Export to Excel ---
  const handleExportExcel = () => {
    if (!filteredRows || filteredRows.length === 0) return

    const exportData = filteredRows.map((row) => {
      const obj = {
        'Developer': (row.developer_name || '').trim(),
        'Role': row.role || '',
      }
      row.cells.forEach((cell) => {
        obj[cell.month] = `${cell.utilization_pct}% (${cell.allocated_hours}/${cell.capacity}h)`
      })
      return obj
    })

    const ws = XLSX.utils.json_to_sheet(exportData)

    // Set column widths
    const cols = [{ wch: 22 }, { wch: 22 }]
    filteredSprints.forEach(() => cols.push({ wch: 18 }))
    ws['!cols'] = cols

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Utilization')
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    saveAs(new Blob([wbout], { type: 'application/octet-stream' }), `Utilization_Report_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // --- Export to PDF (print-based) ---
  const handleExportPDF = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    const tableRows = filteredRows.map((row) => {
      const cells = row.cells.map((cell) => {
        let color = '#64748b'
        if (cell.utilization_pct > 100) color = '#dc2626'
        else if (cell.utilization_pct >= 60) color = '#15803d'
        else if (cell.utilization_pct > 0) color = '#d97706'
        return `<td style="text-align:center;padding:8px 12px;border-bottom:1px solid #e2e8f0;">
          <span style="color:${color};font-weight:600;">${cell.utilization_pct}%</span>
          <div style="font-size:10px;color:#94a3b8;">${cell.allocated_hours}/${cell.capacity}h</div>
        </td>`
      }).join('')
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:500;">${(row.developer_name || '').trim()}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">${row.role || ''}</td>
        ${cells}
      </tr>`
    }).join('')

    const sprintHeaders = filteredSprints.map((s) => `<th style="text-align:center;padding:8px 12px;border-bottom:2px solid #cbd5e1;font-size:11px;text-transform:uppercase;color:#475569;">${s}</th>`).join('')

    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Utilization Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; color: #1e293b; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .subtitle { font-size: 12px; color: #64748b; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { text-align: left; padding: 8px 12px; border-bottom: 2px solid #cbd5e1; font-size: 11px; text-transform: uppercase; color: #475569; }
    .legend { margin-top: 16px; font-size: 11px; color: #64748b; display: flex; gap: 16px; }
    .generated { margin-top: 20px; font-size: 10px; color: #94a3b8; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>Utilization Report</h1>
  <div class="subtitle">Developer × Month utilization grid (leave-adjusted net capacity)</div>
  <table>
    <thead>
      <tr>
        <th>Developer</th>
        <th>Role</th>
        ${sprintHeaders}
      </tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>
  <div class="legend">
    <span><span style="color:#dc2626;font-weight:700;">■</span> Over-allocated (&gt;100%)</span>
    <span><span style="color:#15803d;font-weight:700;">■</span> Healthy (60–100%)</span>
    <span><span style="color:#d97706;font-weight:700;">■</span> Under-utilized (1–59%)</span>
    <span><span style="color:#94a3b8;font-weight:700;">■</span> Idle (0%)</span>
  </div>
  <div class="generated">Generated on ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</div>
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
          <h2 className="text-xl font-bold text-slate-900">Utilization</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {isDeveloper ? 'Your monthly utilization (leave-adjusted)' : 'Developer × Month utilization grid (leave-adjusted net capacity)'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PresetBar
            presets={presets}
            onLoad={(f) => { if (f.selectedResources) setSelectedResources(f.selectedResources); else setSelectedResources([]); if (f.sprintFilter) setSprintFilter(f.sprintFilter); else setSprintFilter('') }}
            onSave={(name, isDefault) => savePreset(name, { selectedResources, sprintFilter }, isDefault)}
          />
          <span className="w-px h-6 bg-slate-200" />
          <button className="btn btn-secondary" onClick={handleExportExcel}>
            📥 Export Excel
          </button>
          <button className="btn btn-secondary" onClick={handleExportPDF}>
            📄 Export PDF
          </button>
        </div>
      </div>

      {/* Filters */}
      {!isDeveloper && (
        <div className="flex flex-wrap gap-3 mb-5 p-3.5 bg-white border border-slate-200 rounded-xl items-end">
          <FilterSelect
            label="Project"
            value={projectFilter}
            onChange={setProjectFilter}
            options={restrictedProjects.map((p) => ({ value: p.id, label: p.name }))}
            showAll={showAllOption}
          />
          <MultiSelect
            label="Resource"
            options={resources.map((d) => ({ value: d.id, label: d.name }))}
            selected={selectedResources}
            onChange={setSelectedResources}
          />
          <FilterSelect
            label="Sprint"
            value={sprintFilter}
            onChange={setSprintFilter}
            options={allSprints.filter((s) => !projectFilter || !s.project_id || String(s.project_id) === projectFilter).map((s) => ({ value: s.id, label: s.name }))}
            sorted={false}
          />
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th className="sticky left-0 bg-white">Developer</th>
              <th>Role</th>
              {filteredSprints.map((m) => <th key={m} className="text-center" title="Utilization % = (Allocated Hours ÷ Net Capacity) × 100. Hours allocated / capacity shown below.">{m}</th>)}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr key={row.developer_id}>
                <td className="font-medium sticky left-0 bg-white">{row.developer_name}</td>
                <td>{row.role}</td>
                {row.cells.map((cell) => (
                  <td key={cell.sprint_id} className="text-center">
                    <span className={UTIL_STATUS_COLORS[cell.status]}>{formatPercent(cell.utilization_pct)}</span>
                    <div className="text-[10px] text-slate-400">{cell.allocated_hours}/{cell.capacity}h</div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-4 mt-4 text-[11px] text-slate-500">
        <span><span className="text-red-600 font-semibold">■</span> Over-allocated (&gt;100%)</span>
        <span><span className="text-green-700 font-semibold">■</span> Healthy (60–100%)</span>
        <span><span className="text-amber-600 font-semibold">■</span> Under-utilized (1–59%)</span>
        <span><span className="text-slate-400 font-semibold">■</span> Idle (0%)</span>
      </div>
    </div>
  )
}
