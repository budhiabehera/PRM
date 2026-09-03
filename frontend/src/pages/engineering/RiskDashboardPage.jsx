import { useState, useEffect, useCallback, useMemo } from 'react'
import { getRiskAnalysis } from '../../services/api'
import useDropdowns from '../../hooks/useDropdowns'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import FilterSelect from '../../components/common/FilterSelect'
import KPICard from '../../components/common/KPICard'
import { formatNumber, formatDate } from '../../utils/formatters'
import { ShieldAlert, GitPullRequest } from 'lucide-react'

// --- Helpers ---

/** Truncate text to a max length */
function truncate(text, max = 60) {
  if (!text) return '—'
  return text.length > max ? text.slice(0, max) + '…' : text
}

/** Color class for risk score value */
function riskScoreColor(score) {
  if (score > 70) return 'text-red-600'
  if (score > 40) return 'text-orange-500'
  return 'text-green-600'
}

/** Background class for risk score badge */
function riskScoreBg(score) {
  if (score > 70) return 'bg-red-50 text-red-700'
  if (score > 40) return 'bg-orange-50 text-orange-700'
  return 'bg-green-50 text-green-700'
}

/** Risk level badge for sprint health */
function RiskLevelBadge({ level }) {
  const config = {
    LOW:    { emoji: '🟢', bg: 'bg-green-100 text-green-800' },
    MEDIUM: { emoji: '🟡', bg: 'bg-yellow-100 text-yellow-800' },
    HIGH:   { emoji: '🔴', bg: 'bg-red-100 text-red-800' },
  }
  const c = config[level] || config.MEDIUM
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${c.bg}`}>
      {c.emoji} {level}
    </span>
  )
}

/** Waiting time color for PR hours */
function waitingHrsColor(hrs) {
  if (hrs > 48) return 'text-red-600'
  if (hrs > 24) return 'text-orange-500'
  return 'text-green-600'
}

/** Risk type badge */
function RiskTypeBadge({ type }) {
  const map = {
    review_bottleneck: { label: 'Review Bottleneck', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
    idle:              { label: 'Idle',              cls: 'bg-red-50 text-red-700 border-red-200' },
    overloaded:        { label: 'Overloaded',        cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  }
  const m = map[type] || { label: type || '—', cls: 'bg-slate-50 text-slate-600 border-slate-200' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${m.cls}`}>
      {m.label}
    </span>
  )
}

/** Section header with count */
function SectionHeader({ icon, title, count, className = '' }) {
  return (
    <div className={`px-4 py-3 border-b ${className}`}>
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <span>{icon}</span>
        <span>{title}</span>
        {count != null && (
          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-white/70 min-w-[24px]">
            {count}
          </span>
        )}
      </h3>
    </div>
  )
}

/** Table header cell */
function Th({ children, className = '' }) {
  return (
    <th className={`text-left px-4 py-2.5 text-[11px] uppercase tracking-wide text-slate-400 font-semibold ${className}`}>
      {children}
    </th>
  )
}

export default function RiskDashboardPage() {
  const { projects, sprints } = useDropdowns()

  // --- Filter state ---
  const [projectId, setProjectId] = useState('')
  const [sprintId, setSprintId] = useState('')
  const [staleDays, setStaleDays] = useState(3)
  const [prThreshold, setPrThreshold] = useState(24)

  // --- Data ---
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  // Filter sprints by project
  const filteredSprints = useMemo(() => {
    if (!projectId) return sprints
    return sprints.filter((s) => String(s.project_id) === String(projectId))
  }, [sprints, projectId])

  // Reset sprint if it no longer matches the project
  useEffect(() => {
    if (sprintId && projectId) {
      const match = filteredSprints.find((s) => String(s.id) === String(sprintId))
      if (!match) setSprintId('')
    }
  }, [projectId, filteredSprints, sprintId])

  // Fetch risk analysis
  const fetchRisks = useCallback(() => {
    setLoading(true)
    const params = {
      project_id: projectId || undefined,
      sprint_id: sprintId || undefined,
      stale_days: staleDays || undefined,
      pr_review_threshold_hrs: prThreshold || undefined,
    }
    getRiskAnalysis(params)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [projectId, sprintId, staleDays, prThreshold])

  useEffect(() => { fetchRisks() }, [fetchRisks])

  // Extract sections from data
  const kpis = data?.kpis || {}
  const sprintHealth = data?.sprint_health || null
  const staleTasks = useMemo(() => {
    return [...(data?.stale_tasks || [])].sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0))
  }, [data])
  const noActivityTasks = useMemo(() => {
    return [...(data?.no_activity_tasks || [])].sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0))
  }, [data])
  const delayedPrs = useMemo(() => {
    return [...(data?.delayed_prs || [])].sort((a, b) => (b.waiting_hours || 0) - (a.waiting_hours || 0))
  }, [data])
  const resourceRisks = data?.resource_risks || []

  // KPI conditional colors
  const staleKpiColor = (kpis.total_stale_tasks || 0) > 0 ? 'text-red-600' : undefined
  const noActivityKpiColor = (kpis.total_no_activity || 0) > 0 ? 'text-orange-500' : undefined
  const delayedPrKpiColor = (kpis.delayed_prs_count || 0) > 0 ? 'text-orange-500' : undefined
  const riskScoreKpiColor = (kpis.avg_risk_score || 0) > 70 ? 'text-red-600' : (kpis.avg_risk_score || 0) > 40 ? 'text-orange-500' : 'text-green-600'
  const readinessKpiColor = (kpis.sprint_readiness_pct || 0) > 70 ? 'text-green-600' : (kpis.sprint_readiness_pct || 0) > 40 ? 'text-orange-500' : 'text-red-600'

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Risk Analysis</h2>
          <p className="text-xs text-slate-500 mt-0.5">Identify stale tasks, missing activity, delayed PRs, and resource risks</p>
        </div>
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap gap-3 mb-4 p-3.5 bg-white border border-slate-200 rounded-xl items-end">
        <FilterSelect
          label="Project"
          value={projectId}
          onChange={setProjectId}
          options={projects.map((p) => ({ value: p.id, label: p.name }))}
        />
        <FilterSelect
          label="Sprint"
          value={sprintId}
          onChange={setSprintId}
          options={filteredSprints.map((s) => ({ value: s.id, label: s.name }))}
        sorted={false}
          />
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-slate-400 font-medium">Stale after N days</span>
          <input
            type="number"
            min={1}
            max={30}
            className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-slate-50 w-[100px] focus:outline-none focus:border-indigo-500"
            value={staleDays}
            onChange={(e) => setStaleDays(Number(e.target.value) || 3)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-slate-400 font-medium">PR review threshold (hrs)</span>
          <input
            type="number"
            min={1}
            max={168}
            className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-slate-50 w-[100px] focus:outline-none focus:border-indigo-500"
            value={prThreshold}
            onChange={(e) => setPrThreshold(Number(e.target.value) || 24)}
          />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-5 gap-4 mb-5">
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
          <div className={`text-2xl font-bold font-mono ${staleKpiColor || 'text-slate-900'}`}>
            {formatNumber(kpis.total_stale_tasks || 0)}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400 mt-1">🔴 Stale Tasks</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
          <div className={`text-2xl font-bold font-mono ${noActivityKpiColor || 'text-slate-900'}`}>
            {formatNumber(kpis.total_no_activity || 0)}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400 mt-1">⚠️ No Dev Activity</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
          <div className={`text-2xl font-bold font-mono ${delayedPrKpiColor || 'text-slate-900'}`}>
            {formatNumber(kpis.delayed_prs_count || 0)}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400 mt-1">⏳ Delayed PRs</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
          <div className={`text-2xl font-bold font-mono ${riskScoreKpiColor}`}>
            {kpis.avg_risk_score != null ? kpis.avg_risk_score.toFixed(0) : '—'}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400 mt-1">📊 Avg Risk Score</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
          <div className={`text-2xl font-bold font-mono ${readinessKpiColor}`}>
            {kpis.sprint_readiness_pct != null ? `${kpis.sprint_readiness_pct.toFixed(0)}%` : '—'}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400 mt-1">✅ Sprint Readiness</div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <LoadingSpinner label="Analyzing risks..." />
      ) : !data ? (
        <div className="card text-center py-12">
          <ShieldAlert size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm text-slate-500">No risk data found.</p>
          <p className="text-xs text-slate-400 mt-1">Try adjusting your filters or ensure tasks and repositories are synced.</p>
        </div>
      ) : (
        <div className="space-y-6">

          {/* Section 1: Sprint Health */}
          {sprintHealth && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-bold text-slate-800">
                      Sprint: {sprintHealth.sprint_name || '—'}
                    </h3>
                  </div>
                  <RiskLevelBadge level={sprintHealth.risk_level || 'MEDIUM'} />
                </div>

                {/* Progress bar */}
                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                    <span className="font-medium">Sprint Progress</span>
                    <span className="font-semibold text-slate-700">
                      {sprintHealth.total_tasks > 0
                        ? `${Math.round((sprintHealth.tasks_with_merged_pr || 0) / sprintHealth.total_tasks * 100)}% Ready`
                        : '0% Ready'}
                    </span>
                  </div>
                  <div className="w-full h-3.5 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-green-400 to-green-500 rounded-full transition-all duration-500"
                      style={{
                        width: sprintHealth.total_tasks > 0
                          ? `${Math.round((sprintHealth.tasks_with_merged_pr || 0) / sprintHealth.total_tasks * 100)}%`
                          : '0%',
                      }}
                    />
                  </div>
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-6 text-xs text-slate-600">
                  <span>
                    <span className="font-bold text-slate-800">{formatNumber(sprintHealth.total_tasks || 0)}</span> Total
                  </span>
                  <span>
                    <span className="font-bold text-indigo-600">{formatNumber(sprintHealth.tasks_with_commits || 0)}</span> With Commits
                  </span>
                  <span>
                    <span className="font-bold text-green-600">{formatNumber(sprintHealth.tasks_with_merged_pr || 0)}</span> PR Merged
                  </span>
                  <span>
                    <span className="font-bold text-red-500">{formatNumber(sprintHealth.tasks_no_code || 0)}</span> No Code
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Section 2: Stale Tasks */}
          {staleTasks.length > 0 && (
            <div className="bg-red-50/50 border border-red-100 rounded-xl overflow-hidden">
              <SectionHeader
                icon="🔴"
                title="Stale Tasks"
                count={staleTasks.length}
                className="border-red-100 text-red-800"
              />
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-red-100 bg-red-50/40">
                    <Th>Task Code</Th>
                    <Th>Description</Th>
                    <Th>Developer</Th>
                    <Th>Status</Th>
                    <Th className="text-center">Days Idle</Th>
                    <Th className="text-center">Risk Score</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-red-50">
                  {staleTasks.map((task, idx) => (
                    <tr key={task.task_id || task.task_code || idx} className="hover:bg-red-50/60 transition-colors">
                      <td className="px-4 py-2.5">
                        <code className="text-xs font-mono font-bold text-indigo-600">{task.task_code || '—'}</code>
                      </td>
                      <td className="px-4 py-2.5 text-slate-700 text-xs">{truncate(task.description)}</td>
                      <td className="px-4 py-2.5 text-slate-700 text-xs font-medium">{task.developer_name || '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600">
                          {task.status || '—'}
                        </span>
                      </td>
                      <td className={`px-4 py-2.5 text-center font-bold text-xs ${(task.days_idle || 0) > 5 ? 'text-red-600' : 'text-slate-700'}`}>
                        {task.days_idle != null ? `${task.days_idle}d` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[11px] font-bold min-w-[36px] ${riskScoreBg(task.risk_score || 0)}`}>
                          {task.risk_score != null ? task.risk_score : '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Section 3: No Development Activity */}
          {noActivityTasks.length > 0 && (
            <div className="bg-amber-50/50 border border-amber-100 rounded-xl overflow-hidden">
              <SectionHeader
                icon="⚠️"
                title="No Development Activity"
                count={noActivityTasks.length}
                className="border-amber-100 text-amber-800"
              />
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-amber-100 bg-amber-50/40">
                    <Th>Task Code</Th>
                    <Th>Description</Th>
                    <Th>Developer</Th>
                    <Th>Status</Th>
                    <Th>Sprint</Th>
                    <Th>Assigned Since</Th>
                    <Th className="text-center">Risk Score</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-50">
                  {noActivityTasks.map((task, idx) => (
                    <tr key={task.task_id || task.task_code || idx} className="hover:bg-amber-50/60 transition-colors">
                      <td className="px-4 py-2.5">
                        <code className="text-xs font-mono font-bold text-indigo-600">{task.task_code || '—'}</code>
                      </td>
                      <td className="px-4 py-2.5 text-slate-700 text-xs">{truncate(task.description)}</td>
                      <td className="px-4 py-2.5 text-slate-700 text-xs font-medium">{task.developer_name || '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600">
                          {task.status || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-600">{task.sprint_name || '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-600">{formatDate(task.assigned_date)}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[11px] font-bold min-w-[36px] ${riskScoreBg(task.risk_score || 0)}`}>
                          {task.risk_score != null ? task.risk_score : '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Section 4: Delayed PRs */}
          {delayedPrs.length > 0 && (
            <div className="bg-orange-50/50 border border-orange-100 rounded-xl overflow-hidden">
              <SectionHeader
                icon="⏳"
                title="Delayed Pull Requests"
                count={delayedPrs.length}
                className="border-orange-100 text-orange-800"
              />
              <div className="divide-y divide-orange-100">
                {delayedPrs.map((pr, idx) => {
                  const hrs = pr.waiting_hours || 0
                  const pendingReviewers = pr.pending_reviewers || []

                  return (
                    <div key={pr.id || pr.pr_number || idx} className="px-4 py-3 hover:bg-orange-50/60 transition-colors">
                      {/* Row 1: PR info + waiting time */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2 min-w-0 flex-1">
                          <GitPullRequest size={15} className="text-orange-500 flex-shrink-0 mt-0.5" />
                          <code className="text-xs font-mono font-bold text-slate-700 flex-shrink-0 mt-0.5">
                            #{pr.pr_number || pr.bitbucket_id}
                          </code>
                          <div className="text-sm text-slate-800 leading-snug min-w-0">
                            {truncate(pr.title, 100)}
                          </div>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <div className="text-xs text-slate-500">
                            Author: <span className="font-medium text-slate-700">{pr.author_name || '—'}</span>
                          </div>
                          <div className={`text-xs font-bold mt-0.5 ${waitingHrsColor(hrs)}`}>
                            Waiting {hrs.toFixed(1)}h
                          </div>
                        </div>
                      </div>

                      {/* Row 2: Repo + pending reviewers */}
                      <div className="flex items-center justify-between gap-3 mt-1.5 ml-[30px]">
                        <span className="text-[11px] text-slate-400">{pr.repo_name || '—'}</span>
                        {pendingReviewers.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] uppercase tracking-wide text-slate-400 font-medium">Pending:</span>
                            {pendingReviewers.map((name, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-medium"
                              >
                                {name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Section 5: Resource Risks */}
          {resourceRisks.length > 0 && (
            <div className="bg-blue-50/50 border border-blue-100 rounded-xl overflow-hidden">
              <SectionHeader
                icon="👥"
                title="Resource Risks"
                count={resourceRisks.length}
                className="border-blue-100 text-blue-800"
              />
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-blue-100 bg-blue-50/40">
                    <Th>Developer</Th>
                    <Th>Risk Type</Th>
                    <Th className="text-center">PRs to Review</Th>
                    <Th className="text-center">Commits</Th>
                    <Th className="text-center">Assigned Tasks</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-50">
                  {resourceRisks.map((r, idx) => (
                    <tr key={r.developer_id || idx} className="hover:bg-blue-50/60 transition-colors">
                      <td className="px-4 py-2.5 font-semibold text-slate-800 text-xs">{r.developer_name || '—'}</td>
                      <td className="px-4 py-2.5">
                        <RiskTypeBadge type={r.risk_type} />
                      </td>
                      <td className="px-4 py-2.5 text-center text-slate-700 text-xs font-medium">
                        {formatNumber(r.prs_to_review || 0)}
                      </td>
                      <td className="px-4 py-2.5 text-center text-slate-700 text-xs font-medium">
                        {formatNumber(r.commits || 0)}
                      </td>
                      <td className="px-4 py-2.5 text-center text-slate-700 text-xs font-medium">
                        {formatNumber(r.assigned_tasks || 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Empty state when all sections are empty */}
          {staleTasks.length === 0 && noActivityTasks.length === 0 && delayedPrs.length === 0 && resourceRisks.length === 0 && !sprintHealth && (
            <div className="bg-white border border-slate-200 rounded-xl text-center py-12">
              <ShieldAlert size={40} className="mx-auto text-green-300 mb-3" />
              <p className="text-sm text-green-600 font-medium">No risks detected! 🎉</p>
              <p className="text-xs text-slate-400 mt-1">All tasks are on track with the current filter criteria.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
