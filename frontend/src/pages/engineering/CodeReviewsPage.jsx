import { useState, useEffect, useCallback, useMemo } from 'react'
import { getCodeReviews, getLinkedRepositories } from '../../services/api'
import useDropdowns from '../../hooks/useDropdowns'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import FilterSelect from '../../components/common/FilterSelect'
import KPICard from '../../components/common/KPICard'
import { formatNumber } from '../../utils/formatters'
import { Eye, GitBranch } from 'lucide-react'

// --- Helpers ---

/** Extract task codes like T09045 from a PR title */
const TASK_CODE_RE = /\b(T\d{5})\b/g

function renderTitle(msg, maxLen = 120) {
  if (!msg) return '—'
  const truncated = msg.length > maxLen ? msg.slice(0, maxLen) + '…' : msg
  const parts = []
  let lastIdx = 0
  let match
  const re = new RegExp(TASK_CODE_RE.source, 'g')
  while ((match = re.exec(truncated)) !== null) {
    if (match.index > lastIdx) {
      parts.push(<span key={lastIdx}>{truncated.slice(lastIdx, match.index)}</span>)
    }
    parts.push(
      <span key={match.index} className="inline-flex items-center px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[11px] font-semibold mx-0.5">
        {match[1]}
      </span>
    )
    lastIdx = re.lastIndex
  }
  if (lastIdx < truncated.length) {
    parts.push(<span key={lastIdx}>{truncated.slice(lastIdx)}</span>)
  }
  return parts.length > 0 ? parts : truncated
}

/** Format hours value */
function formatHours(hrs) {
  if (hrs == null || hrs === 0) return '—'
  if (Number.isInteger(hrs)) return `${hrs}h`
  return `${hrs.toFixed(1)}h`
}

/** Color for waiting days */
function waitingColor(days) {
  if (days > 2) return 'text-red-600'
  if (days > 1) return 'text-orange-500'
  return 'text-green-600'
}

export default function CodeReviewsPage() {
  const { projects, resources } = useDropdowns()

  // --- Filter state ---
  const [projectId, setProjectId] = useState('')
  const [repoId, setRepoId] = useState('')
  const [reviewerId, setReviewerId] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  // --- Data ---
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [repos, setRepos] = useState([])

  // Load repos for filter dropdown
  useEffect(() => {
    getLinkedRepositories()
      .then(setRepos)
      .catch(() => setRepos([]))
  }, [])

  // Filter repos by selected project
  const filteredRepos = useMemo(() => {
    if (!projectId) return repos
    return repos.filter((r) => String(r.project_id) === String(projectId))
  }, [repos, projectId])

  // Reset repo filter when project changes and current repo doesn't match
  useEffect(() => {
    if (repoId && projectId) {
      const match = filteredRepos.find((r) => String(r.id) === String(repoId))
      if (!match) setRepoId('')
    }
  }, [projectId, filteredRepos, repoId])

  // Fetch code reviews
  const fetchCodeReviews = useCallback(() => {
    setLoading(true)
    const params = {
      project_id: projectId || undefined,
      repo_id: repoId || undefined,
      reviewer_id: reviewerId || undefined,
      from_date: fromDate || undefined,
      to_date: toDate || undefined,
    }
    getCodeReviews(params)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [projectId, repoId, reviewerId, fromDate, toDate])

  useEffect(() => { fetchCodeReviews() }, [fetchCodeReviews])

  const kpis = data?.kpis || {}
  const leaderboard = data?.leaderboard || []
  const awaitingReview = data?.awaiting_review || []

  // Sort leaderboard by reviews descending
  const sortedLeaderboard = useMemo(() => {
    return [...leaderboard].sort((a, b) => (b.reviews || 0) - (a.reviews || 0))
  }, [leaderboard])

  // Sort awaiting review by days_waiting descending (oldest first)
  const sortedAwaiting = useMemo(() => {
    return [...awaitingReview].sort((a, b) => (b.days_waiting || 0) - (a.days_waiting || 0))
  }, [awaitingReview])

  const handleExportPDF = () => {
    const now = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    const filterParts = []
    if (reviewerId) { const r = resources.find(d => String(d.id) === String(reviewerId)); if (r) filterParts.push('Reviewer: ' + r.name) }
    if (projectId) { const p = projects.find(x => String(x.id) === String(projectId)); if (p) filterParts.push('Project: ' + p.name) }
    if (repoId) { const r = filteredRepos.find(x => String(x.id) === String(repoId)); if (r) filterParts.push('Repo: ' + (r.repo_name || r.repo_slug)) }
    if (fromDate) filterParts.push('From: ' + fromDate)
    if (toDate) filterParts.push('To: ' + toDate)
    const subtitle = (filterParts.length ? filterParts.join(' \u00b7 ') : 'All Data') + ' | Generated on ' + now

    const buildTable = (headers, rows) => {
      let h = '<table><thead><tr>' + headers.map(h => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>'
      h += rows.map(r => '<tr>' + r.map(c => '<td>' + (c ?? '\u2014') + '</td>').join('') + '</tr>').join('')
      return h + '</tbody></table>'
    }

    const kpiHtml = '<div class="kpi-row">'
      + '<div class="kpi-card"><div class="kpi-value">' + formatNumber(kpis.total_reviews || 0) + '</div><div class="kpi-label">Total Reviews</div></div>'
      + '<div class="kpi-card"><div class="kpi-value">' + (kpis.avg_turnaround_hr != null ? kpis.avg_turnaround_hr.toFixed(1) + 'h' : '\u2014') + '</div><div class="kpi-label">Avg Turnaround</div></div>'
      + '<div class="kpi-card"><div class="kpi-value">' + formatNumber(kpis.prs_awaiting_review || 0) + '</div><div class="kpi-label">Awaiting Review</div></div>'
      + '<div class="kpi-card"><div class="kpi-value">' + (kpis.oldest_pending_days != null ? kpis.oldest_pending_days.toFixed(1) + ' days' : '\u2014') + '</div><div class="kpi-label">Oldest Pending</div></div>'
      + '</div>'

    const leaderboardTable = buildTable(
      ['Developer', 'Reviews', 'Approved', 'Changes Req.', 'Avg Time', 'Comments'],
      sortedLeaderboard.map(d => [
        d.developer_name || d.reviewer_name || '\u2014', formatNumber(d.reviews || 0),
        formatNumber(d.approved || 0), formatNumber(d.changes_requested || 0),
        d.avg_time_hr != null ? d.avg_time_hr.toFixed(1) + 'h' : '\u2014', formatNumber(d.comments || 0),
      ])
    )

    const awaitingTable = buildTable(
      ['PR #', 'Title', 'Author', 'Days Waiting', 'Pending Reviewers'],
      sortedAwaiting.map(pr => [
        '#' + (pr.pr_number || pr.bitbucket_id), (pr.title || '\u2014').slice(0, 80),
        pr.author_name || '\u2014', (pr.days_waiting || 0).toFixed(1),
        (pr.pending_reviewers || []).join(', ') || '\u2014',
      ])
    )

    const content = kpiHtml
      + '<div class="section"><div class="section-title">Review Activity by Developer</div>' + leaderboardTable + '</div>'
      + '<div class="section"><div class="section-title">PRs Awaiting Review (' + sortedAwaiting.length + ')</div>' + awaitingTable + '</div>'

    const html = `<!DOCTYPE html><html><head><title>Code Reviews Report</title><style>body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; color: #1e293b; font-size: 12px; }
      h1 { font-size: 20px; margin-bottom: 2px; }
      .subtitle { font-size: 12px; color: #64748b; margin-bottom: 20px; }
      .kpi-row { display: flex; gap: 12px; margin-bottom: 24px; }
      .kpi-card { flex: 1; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; text-align: center; }
      .kpi-value { font-size: 22px; font-weight: 700; }
      .kpi-label { font-size: 10px; text-transform: uppercase; color: #64748b; margin-top: 4px; }
      .section { margin-bottom: 24px; }
      .section-title { font-size: 14px; font-weight: 600; margin-bottom: 8px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
      th { padding: 6px 10px; border-bottom: 2px solid #cbd5e1; font-size: 11px; text-transform: uppercase; color: #475569; text-align: left; }
      td { padding: 6px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 8px; font-size: 10px; font-weight: 600; }
      .generated { margin-top: 24px; font-size: 10px; color: #94a3b8; }
      @media print { body { padding: 0; } }</style></head><body>'
      + '<h1>Code Reviews Report</h1><div class="subtitle">${subtitle}</div>'
      + content
      + '<div class="generated">PRM Report \u2014 ${now}</div>'
      + '<script>window.onload = function() { window.print(); }</' + 'script></body></html>`
    const w = window.open('', '_blank')
    w.document.write(html)
    w.document.close()
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Code Reviews</h2>
          <p className="text-xs text-slate-500 mt-0.5">Review activity leaderboard and PRs awaiting review</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={handleExportPDF} title="Export to PDF">
          📄 Export PDF
        </button>
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap gap-3 mb-4 p-3.5 bg-white border border-slate-200 rounded-xl items-end">
        <FilterSelect
          label="Reviewer"
          value={reviewerId}
          onChange={setReviewerId}
          options={resources.map((d) => ({ value: d.id, label: d.name }))}
        />
        <FilterSelect
          label="Project"
          value={projectId}
          onChange={setProjectId}
          options={projects.map((p) => ({ value: p.id, label: p.name }))}
        />
        <FilterSelect
          label="Repository"
          value={repoId}
          onChange={setRepoId}
          options={filteredRepos.map((r) => ({ value: r.id, label: r.repo_name || r.repo_slug || `Repo #${r.id}` }))}
        />
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-slate-400 font-medium">From</span>
          <input
            type="date"
            className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:outline-none focus:border-indigo-500"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-slate-400 font-medium">To</span>
          <input
            type="date"
            className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:outline-none focus:border-indigo-500"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        <KPICard label="Total Reviews" value={formatNumber(kpis.total_reviews || 0)} />
        <KPICard label="Avg Turnaround" value={kpis.avg_turnaround_hr != null ? `${kpis.avg_turnaround_hr.toFixed(1)}h` : '—'} />
        <KPICard label="Awaiting Review" value={formatNumber(kpis.prs_awaiting_review || 0)} />
        <KPICard label="Oldest Pending" value={kpis.oldest_pending_days != null ? `${kpis.oldest_pending_days.toFixed(1)} days` : '—'} />
      </div>

      {/* Content */}
      {loading ? (
        <LoadingSpinner label="Loading code reviews..." />
      ) : !data ? (
        <div className="card text-center py-12">
          <Eye size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm text-slate-500">No code review data found.</p>
          <p className="text-xs text-slate-400 mt-1">Try adjusting your filters or sync repositories to pull in review data.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Section 1: Review Leaderboard */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-800">📊 Review Activity by Developer</h3>
            </div>
            {sortedLeaderboard.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-slate-400">No review activity found for the selected filters.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60">
                    <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Developer</th>
                    <th className="text-center px-4 py-2.5 text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Reviews</th>
                    <th className="text-center px-4 py-2.5 text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Approved</th>
                    <th className="text-center px-4 py-2.5 text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Changes Requested</th>
                    <th className="text-center px-4 py-2.5 text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Avg Time</th>
                    <th className="text-center px-4 py-2.5 text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Comments</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedLeaderboard.map((dev, idx) => (
                    <tr key={dev.developer_id || dev.reviewer_id || idx} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-2.5 font-semibold text-slate-800">
                        {dev.developer_name || dev.reviewer_name || '—'}
                      </td>
                      <td className="px-4 py-2.5 text-center text-slate-700 font-medium">
                        {formatNumber(dev.reviews || 0)}
                      </td>
                      <td className="px-4 py-2.5 text-center text-green-600 font-medium">
                        {formatNumber(dev.approved || 0)}
                      </td>
                      <td className="px-4 py-2.5 text-center text-orange-500 font-medium">
                        {formatNumber(dev.changes_requested || 0)}
                      </td>
                      <td className="px-4 py-2.5 text-center text-slate-600">
                        {formatHours(dev.avg_time_hr)}
                      </td>
                      <td className="px-4 py-2.5 text-center text-slate-600">
                        {formatNumber(dev.comments || 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Section 2: Awaiting Review Queue */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-800">
                ⏳ PRs Awaiting Review ({sortedAwaiting.length})
              </h3>
            </div>
            {sortedAwaiting.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-slate-400">No PRs currently awaiting review. 🎉</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {sortedAwaiting.map((pr, idx) => {
                  const days = pr.days_waiting || 0
                  const pendingReviewers = pr.pending_reviewers || []

                  return (
                    <div key={pr.id || pr.pr_number || idx} className="px-4 py-3 hover:bg-slate-50/60 transition-colors">
                      {/* Row 1: PR number, title, author, waiting time */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2 min-w-0 flex-1">
                          <span className="text-base flex-shrink-0 mt-0.5">⏳</span>
                          <code className="text-xs font-mono font-bold text-slate-700 flex-shrink-0 mt-0.5">
                            #{pr.pr_number || pr.bitbucket_id}
                          </code>
                          <div className="text-sm text-slate-800 leading-snug min-w-0">
                            {renderTitle(pr.title)}
                          </div>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <div className="text-xs text-slate-600 font-medium">
                            Author: {pr.author_name || '—'}
                          </div>
                          <div className={`text-xs font-semibold mt-0.5 ${waitingColor(days)}`}>
                            Waiting {days.toFixed(1)} days
                          </div>
                        </div>
                      </div>

                      {/* Row 2: Repo / branch + pending reviewers */}
                      <div className="flex items-center justify-between gap-3 mt-1.5 ml-[52px]">
                        <div className="flex items-center gap-1 text-[11px] text-slate-400">
                          <GitBranch size={11} className="text-slate-400" />
                          <span className="text-slate-500">
                            {pr.repo_name || '—'} / {pr.source_branch || '—'}
                          </span>
                        </div>
                        {pendingReviewers.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] uppercase tracking-wide text-slate-400 font-medium">Pending:</span>
                            {pendingReviewers.map((name, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-medium"
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
            )}
          </div>
        </div>
      )}
    </div>
  )
}
