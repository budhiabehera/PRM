import { useState } from 'react'
import useApi from '../hooks/useApi'
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
  const { data: resources, loading: l2 } = useApi(() => getResources({}), [])
  const [skillFilter, setSkillFilter] = useState('')

  if (l1 || l2) return <LoadingSpinner label="Loading team..." />

  const filtered = skillFilter ? resources.filter((r) => r.skill === skillFilter) : resources

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Team</h2>
          <p className="text-xs text-slate-500 mt-0.5">Team overview and current workload</p>
        </div>
        <select className="form-select max-w-[140px]" value={skillFilter} onChange={(e) => setSkillFilter(e.target.value)}>
          <option value="">All Skills</option>
          <option value="Backend">Backend</option>
          <option value="Frontend">Frontend</option>
          <option value="Mobile">Mobile</option>
        </select>
      </div>

      <div className="grid grid-cols-4 gap-3.5 mb-6">
        <KPICard label="Active Resources" value={stats.active_developers} />
        <KPICard label="Team Capacity" value={stats.team_capacity} />
        <KPICard label="Monthly Hrs" value={stats.monthly_hours} />
        <KPICard label="Avg Utilization" value={formatPercent(stats.avg_utilization)} />
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
                {formatPercent(dev.utilization_pct)}
              </span>
            </div>
            <UtilizationBar pct={dev.utilization_pct} status={dev.utilization_status} width="100%" />
            <div className="flex justify-between mt-2 text-[11px] text-slate-500">
              <span>{dev.active_tasks} active tasks</span>
              <span>{dev.assigned_hours} / {dev.base_capacity} hrs</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
