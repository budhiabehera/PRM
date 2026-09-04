import { useState, useEffect, useCallback, useMemo } from 'react'
import { getEngineeringOverview } from '../../services/api'
import useDropdowns from '../../hooks/useDropdowns'
import useProjectDefault from '../../hooks/useProjectDefault'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import FilterSelect from '../../components/common/FilterSelect'
import KPICard from '../../components/common/KPICard'
import { formatNumber } from '../../utils/formatters'
import { BarChart3, GitPullRequest, Eye, Rocket, TrendingUp } from 'lucide-react'

// --- Helpers ---

function daysAgoISO(days) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

function formatDateShort(d) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

/** Simple inline bar chart built with divs */
function MiniBarChart({ data, valueKey = 'count', labelKey = 'date', color = 'bg-indigo-500', maxBars = 30 }) {
  if (!data || data.length === 0) {
    return <div className="text-xs text-slate-400 py-8 text-center">No data available</div>
  }
  const sliced = data.slice(-maxBars)
  const maxVal = Math.max(...sliced.map((d) => d[valueKey] || 0), 1)
  return (
    <div className="flex items-end gap-[3px] h-[140px] px-1">
      {sliced.map((d, i) => {
        const val = d[valueKey] || 0
        const pct = (val / maxVal) * 100
        return (
          <div key={i} className="flex-1 flex flex-col items-center justify-end h-full min-w-0 group relative">
            <div
              className={`w-full ${color} rounded-t-sm transition-all duration-200 min-h-[2px] group-hover:opacity-80`}
              style={{ height: `${Math.max(pct, 2)}%` }}
            />
            {/* Tooltip */}
            <div className="absolute bottom-full mb-1 px-2 py-1 bg-slate-800 text-white text-[10px] rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
              {formatDateShort(d[labelKey])}: {val}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Colored stat blocks for PR status */
function PRStatusBlocks({ open = 0, merged = 0, declined = 0 }) {
  const total = open + merged + declined || 1
  const blocks = [
    { label: 'Open', count: open, color: 'bg-blue-500', text: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' },
    { label: 'Merged', count: merged, color: 'bg-purple-500', text: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200' },
    { label: 'Declined', count: declined, color: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' },
  ]
  return (
    <div className="space-y-3">
      {/* Stacked bar */}
      <div className="flex h-6 rounded-lg overflow-hidden bg-slate-100">
        {blocks.map((b) =>
          b.count > 0 ? (
            <div
              key={b.label}
              className={`${b.color} transition-all duration-300`}
              style={{ width: `${(b.count / total) * 100}%` }}
              title={`${b.label}: ${b.count}`}
            />
          ) : null
        )}
      </div>
      {/* Legend cards */}
      <div className="grid grid-cols-3 gap-2">
        {blocks.map((b) => (
          <div key={b.label} className={`${b.bg} border ${b.border} rounded-lg p-3 text-center`}>
            <div className={`text-xl font-bold font-mono ${b.text}`}>{formatNumber(b.count)}</div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500 mt-0.5">{b.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function EngineeringDashboard() {
  const { projects, sprints } = useDropdowns()
  const { defaultProjectId, showAllOption, restrictedProjects } = useProjectDefault()

  // --- Filter state ---
  const [projectId, setProjectId] = useState(defaultProjectId)
  const [sprintId, setSprintId] = useState('')
  const [fromDate, setFromDate] = useState(() => daysAgoISO(30))
  const [toDate, setToDate] = useState('')
  const [timeRange, setTimeRange] = useState('30d')

  // --- Data ---
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Filter sprints by selected project
  const filteredSprints = useMemo(() => {
    if (!projectId) return sprints
    return sprints.filter((s) => String(s.project_id) === String(projectId))
  }, [sprints, projectId])

  // When sprint selected, auto-fill date range
  useEffect(() => {
    if (!sprintId) return
    const sprint = sprints.find((s) => String(s.id) === String(sprintId))
    if (sprint) {
      if (sprint.start_date) setFromDate(sprint.start_date.slice(0, 10))
      if (sprint.end_date) setToDate(sprint.end_date.slice(0, 10))
      setTimeRange('')
    }
  }, [sprintId, sprints])

  // Time range quick buttons
  const handleTimeRange = (range) => {
    setTimeRange(range)
    setSprintId('')
    setToDate('')
    if (range === 'all') {
      setFromDate('')
    } else {
      const days = parseInt(range)
      setFromDate(daysAgoISO(days))
    }
  }

  // Fetch overview data
  const fetchOverview = useCallback(() => {
    setLoading(true)
    setError(null)
    const params = {
      project_id: projectId || undefined,
      sprint_id: sprintId || undefined,
      from_date: fromDate || undefined,
      to_date: toDate || undefined,
    }
    getEngineeringOverview(params)
      .then(setData)
      .catch((err) => {
        setError(err.response?.data?.detail || 'Failed to load engineering overview')
        setData(null)
      })
      .finally(() => setLoading(false))
  }, [projectId, sprintId, fromDate, toDate])

  useEffect(() => { fetchOverview() }, [fetchOverview])

  const kpis = data?.kpis || {}
  const commitTrend = data?.commit_trend || []
  const prStatus = data?.pr_status || {}
  const topContributors = data?.top_contributors || []
  const prTrend = data?.pr_trend || []

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Engineering Overview</h2>
          <p className="text-xs text-slate-500 mt-0.5">Activity summary across commits, pull requests, reviews, and releases</p>
        </div>
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap gap-3 mb-4 p-3.5 bg-white border border-slate-200 rounded-xl items-end">
        <FilterSelect
          label="Project"
          value={projectId}
          onChange={(v) => { setProjectId(v); setSprintId('') }}
          options={restrictedProjects.map((p) => ({ value: p.id, label: p.name }))}
        />
        <FilterSelect
          label="Sprint"
          value={sprintId}
          onChange={setSprintId}
          options={filteredSprints.map((s) => ({ value: s.id, label: s.name }))}
        sorted={false}
          />
        {/* Time range quick buttons */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-slate-400 font-medium">Time Range</span>
          <div className="flex gap-1">
            {['7d', '30d', '90d', 'all'].map((r) => (
              <button
                key={r}
                onClick={() => handleTimeRange(r)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  timeRange === r
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                    : 'bg-slate-50 border-slate-300 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {r === 'all' ? 'All' : r.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-slate-400 font-medium">From</span>
          <input
            type="date"
            className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:outline-none focus:border-indigo-500"
            value={fromDate}
            onChange={(e) => { setFromDate(e.target.value); setTimeRange(''); setSprintId('') }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-slate-400 font-medium">To</span>
          <input
            type="date"
            className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:outline-none focus:border-indigo-500"
            value={toDate}
            onChange={(e) => { setToDate(e.target.value); setTimeRange(''); setSprintId('') }}
          />
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="text-xs rounded-lg px-3.5 py-2.5 mb-4 bg-red-50 text-red-600 border border-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <LoadingSpinner label="Loading engineering overview..." />
      ) : !data ? (
        <div className="card text-center py-12">
          <BarChart3 size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm text-slate-500">No engineering data available.</p>
          <p className="text-xs text-slate-400 mt-1">Sync your repositories and try adjusting the filters.</p>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-4 gap-4 mb-5">
            <KPICard
              label="Commits"
              value={formatNumber(kpis.total_commits || 0)}
              sub={`${formatNumber(kpis.commits_today || 0)} today · ${formatNumber(kpis.commits_this_week || 0)} this week`}
            />
            <KPICard
              label="Pull Requests"
              value={<span className="text-blue-600">{formatNumber(kpis.open_prs || 0)} open</span>}
              sub={`${formatNumber(kpis.merged_this_week || 0)} merged this week · ${kpis.avg_merge_hr != null ? `${formatNumber(kpis.avg_merge_hr, 1)}h avg` : '—'}`}
            />
            <KPICard
              label="Reviews"
              value={<span className="text-amber-600">{formatNumber(kpis.pending_reviews || 0)} pending</span>}
              sub={kpis.avg_turnaround_hr != null ? `${formatNumber(kpis.avg_turnaround_hr, 1)}h avg turnaround` : '—'}
            />
            <KPICard
              label="Last Release"
              value={kpis.last_release_tag || '—'}
              sub={kpis.days_since_last != null ? `${kpis.days_since_last} day${kpis.days_since_last !== 1 ? 's' : ''} ago` : '—'}
            />
          </div>

          {/* Charts section — 2 columns */}
          <div className="grid grid-cols-2 gap-4 mb-5">
            {/* Commit Trend */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp size={14} className="text-indigo-500" />
                <h3 className="text-sm font-semibold text-slate-800">Commit Trend</h3>
                <span className="text-[10px] text-slate-400 ml-auto">{commitTrend.length} day{commitTrend.length !== 1 ? 's' : ''}</span>
              </div>
              <MiniBarChart data={commitTrend} valueKey="count" labelKey="date" color="bg-indigo-500" />
              {commitTrend.length > 0 && (
                <div className="flex justify-between mt-2 px-1 text-[10px] text-slate-400">
                  <span>{formatDateShort(commitTrend[0]?.date)}</span>
                  <span>{formatDateShort(commitTrend[commitTrend.length - 1]?.date)}</span>
                </div>
              )}
            </div>

            {/* PR Status */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <GitPullRequest size={14} className="text-purple-500" />
                <h3 className="text-sm font-semibold text-slate-800">PR Status</h3>
                <span className="text-[10px] text-slate-400 ml-auto">
                  {formatNumber((prStatus.open || 0) + (prStatus.merged || 0) + (prStatus.declined || 0))} total
                </span>
              </div>
              <PRStatusBlocks
                open={prStatus.open || 0}
                merged={prStatus.merged || 0}
                declined={prStatus.declined || 0}
              />
            </div>
          </div>

          {/* Bottom section — 2 columns */}
          <div className="grid grid-cols-2 gap-4">
            {/* Top Contributors */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
                <Eye size={14} className="text-green-500" />
                <h3 className="text-sm font-semibold text-slate-800">Top Contributors</h3>
              </div>
              {topContributors.length > 0 ? (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-[10px] uppercase tracking-wide text-slate-400">
                      <th className="px-4 py-2 font-medium">#</th>
                      <th className="px-4 py-2 font-medium">Developer</th>
                      <th className="px-4 py-2 font-medium text-right">Commits</th>
                      <th className="px-4 py-2 font-medium text-right">PRs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topContributors.slice(0, 10).map((c, i) => (
                      <tr key={c.developer_name || i} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-2 text-slate-400 font-mono">{i + 1}</td>
                        <td className="px-4 py-2 text-slate-700 font-medium">{c.developer_name || '—'}</td>
                        <td className="px-4 py-2 text-right font-mono text-slate-600">{formatNumber(c.commit_count || 0)}</td>
                        <td className="px-4 py-2 text-right font-mono text-slate-600">{formatNumber(c.pr_count || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-xs text-slate-400 text-center py-8">No contributor data</div>
              )}
            </div>

            {/* PR Trend */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
                <Rocket size={14} className="text-orange-500" />
                <h3 className="text-sm font-semibold text-slate-800">PR Trend</h3>
                <span className="text-[10px] text-slate-400 ml-auto">Opened vs Merged</span>
              </div>
              {prTrend.length > 0 ? (
                <div className="max-h-[320px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b border-slate-100 text-left text-[10px] uppercase tracking-wide text-slate-400">
                        <th className="px-4 py-2 font-medium">Date</th>
                        <th className="px-4 py-2 font-medium text-right">Opened</th>
                        <th className="px-4 py-2 font-medium text-right">Merged</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prTrend.map((d, i) => (
                        <tr key={d.date || i} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                          <td className="px-4 py-2 text-slate-600">{formatDateShort(d.date)}</td>
                          <td className="px-4 py-2 text-right font-mono">
                            {d.opened > 0 ? <span className="text-blue-600">+{d.opened}</span> : <span className="text-slate-300">0</span>}
                          </td>
                          <td className="px-4 py-2 text-right font-mono">
                            {d.merged > 0 ? <span className="text-purple-600">{d.merged}</span> : <span className="text-slate-300">0</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-xs text-slate-400 text-center py-8">No PR trend data</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
