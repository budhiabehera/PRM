import { useState, useEffect, useCallback, useMemo } from 'react'
import { getPullRequests, getLinkedRepositories, syncAllPRs } from '../../services/api'
import useDropdowns from '../../hooks/useDropdowns'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import FilterSelect from '../../components/common/FilterSelect'
import KPICard from '../../components/common/KPICard'
import { formatNumber } from '../../utils/formatters'
import { Search, RefreshCw, GitPullRequest, GitBranch, MessageSquare, GitCommitHorizontal } from 'lucide-react'

// --- Helpers ---

/** Return a relative-time string for recent dates, otherwise a formatted date */
function timeAgo(dateStr) {
  if (!dateStr) return '—'
  const now = new Date()
  const d = new Date(dateStr)
  const diffMs = now - d
  if (diffMs < 0) return formatDateShort(d)

  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`

  return formatDateShort(d)
}

function formatDateShort(d) {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Format merge time in hours */
function formatMergeTime(hrs) {
  if (hrs == null || hrs === 0) return '—'
  if (hrs < 1) return `${Math.round(hrs * 60)}m`
  if (Number.isInteger(hrs)) return `${hrs}h`
  return `${hrs.toFixed(1)}h`
}

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

/** Status icon + color mapping */
const STATUS_MAP = {
  OPEN:       { icon: '🟢', label: 'Open',       color: 'text-green-600' },
  MERGED:     { icon: '🟣', label: 'Merged',     color: 'text-purple-600' },
  DECLINED:   { icon: '🔴', label: 'Declined',   color: 'text-red-500' },
  SUPERSEDED: { icon: '⚪', label: 'Superseded', color: 'text-slate-400' },
}

/** Reviewer status badge */
function ReviewerBadge({ reviewer }) {
  const status = (reviewer.status || reviewer.state || '').toUpperCase()
  if (status === 'APPROVED') {
    return <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 text-[10px] font-medium">✅ {reviewer.name || reviewer.display_name}</span>
  }
  if (status === 'CHANGES_REQUESTED') {
    return <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 text-[10px] font-medium">❌ {reviewer.name || reviewer.display_name}</span>
  }
  // PENDING or any other status
  return <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-medium">⏳ {reviewer.name || reviewer.display_name}</span>
}

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'OPEN', label: 'Open' },
  { value: 'MERGED', label: 'Merged' },
  { value: 'DECLINED', label: 'Declined' },
]

export default function PullRequestsPage() {
  const { projects, resources } = useDropdowns()

  // --- Filter state ---
  const [projectId, setProjectId] = useState('')
  const [repoId, setRepoId] = useState('')
  const [status, setStatus] = useState('')
  const [developerId, setDeveloperId] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')

  // --- Pagination ---
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  // --- Data ---
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [repos, setRepos] = useState([])
  const [syncing, setSyncing] = useState(false)
  const [toast, setToast] = useState(null)

  const showToast = (type, text) => {
    setToast({ type, text })
    setTimeout(() => setToast(null), 5000)
  }

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

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 400)
    return () => clearTimeout(timer)
  }, [searchInput])

  // Reset to page 1 when any filter changes
  useEffect(() => { setPage(1) }, [projectId, repoId, status, developerId, fromDate, toDate, search])

  // Fetch pull requests
  const fetchPRs = useCallback(() => {
    setLoading(true)
    const params = {
      page,
      page_size: pageSize,
      project_id: projectId || undefined,
      repo_id: repoId || undefined,
      status: status || undefined,
      developer_id: developerId || undefined,
      from_date: fromDate || undefined,
      to_date: toDate || undefined,
      search: search || undefined,
    }
    getPullRequests(params)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [page, pageSize, projectId, repoId, status, developerId, fromDate, toDate, search])

  useEffect(() => { fetchPRs() }, [fetchPRs])

  // --- Sync ---
  const handleSyncAll = async () => {
    setSyncing(true)
    try {
      const res = await syncAllPRs()
      const totalNew = Array.isArray(res) ? res.reduce((s, r) => s + (r.new || 0), 0) : (res.new || 0)
      const totalUpdated = Array.isArray(res) ? res.reduce((s, r) => s + (r.updated || 0), 0) : (res.updated || 0)
      showToast('success', `Sync complete — ${totalNew} new PRs, ${totalUpdated} updated`)
      fetchPRs()
    } catch (err) {
      showToast('error', err.response?.data?.detail || 'PR sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const items = data?.items || []
  const kpis = data?.kpis || {}
  const totalPages = data?.pages || 1

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Pull Requests</h2>
          <p className="text-xs text-slate-500 mt-0.5">Browse and review pull requests across all linked repositories</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-secondary btn-sm" onClick={() => window.print()} title="Export to PDF">
            📄 Export PDF
          </button>
          <button
          className="btn btn-primary flex items-center gap-2"
          onClick={handleSyncAll}
          disabled={syncing}
        >
          <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing...' : 'Sync PRs'}
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`text-xs rounded-lg px-3.5 py-2.5 mb-4 ${toast.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
          {toast.text}
        </div>
      )}

      {/* Filters row */}
      <div className="flex flex-wrap gap-3 mb-4 p-3.5 bg-white border border-slate-200 rounded-xl items-end">
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
        <FilterSelect
          label="Status"
          value={status}
          onChange={setStatus}
          options={STATUS_OPTIONS}
          showAll={false}
          sorted={false}
        />
        <FilterSelect
          label="Developer"
          value={developerId}
          onChange={setDeveloperId}
          options={resources.map((d) => ({ value: d.id, label: d.name }))}
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
        <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
          <span className="text-[10px] uppercase tracking-wide text-slate-400 font-medium">Search</span>
          <div className="relative">
            <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search PR titles..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg bg-slate-50 text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        <KPICard label="Open" value={<span className="text-green-600">{formatNumber(kpis.open_count || 0)}</span>} />
        <KPICard label="Merged" value={<span className="text-purple-600">{formatNumber(kpis.merged_count || 0)}</span>} />
        <KPICard label="Declined" value={<span className="text-red-500">{formatNumber(kpis.declined_count || 0)}</span>} />
        <KPICard label="Avg Merge Time" value={formatMergeTime(kpis.avg_merge_time_hr)} />
      </div>

      {/* PR list */}
      {loading ? (
        <LoadingSpinner label="Loading pull requests..." />
      ) : items.length === 0 ? (
        <div className="card text-center py-12">
          <GitPullRequest size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm text-slate-500">No pull requests found matching your filters.</p>
          <p className="text-xs text-slate-400 mt-1">Try adjusting your filters or sync repositories to pull in new PRs.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((pr) => {
            const st = STATUS_MAP[pr.status] || STATUS_MAP.OPEN
            const reviewers = pr.reviewers || []
            const timeLabel = pr.status === 'MERGED'
              ? `Merged ${timeAgo(pr.merged_at || pr.updated_at)}`
              : pr.status === 'DECLINED'
                ? `Declined ${timeAgo(pr.updated_at)}`
                : `Opened ${timeAgo(pr.created_at)}`

            return (
              <div key={pr.id} className="bg-white border border-slate-200 rounded-xl px-4 py-3 hover:border-slate-300 hover:shadow-sm transition-all">
                {/* Row 1: Status icon, PR number, Title, Author */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    <span className="text-base flex-shrink-0 mt-0.5">{st.icon}</span>
                    <code className="text-xs font-mono font-bold text-slate-700 flex-shrink-0 mt-0.5">#{pr.pr_number || pr.bitbucket_id}</code>
                    <div className="text-sm text-slate-800 leading-snug min-w-0">
                      {renderTitle(pr.title)}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <div className="text-xs text-slate-600 font-medium">{pr.author_name || pr.developer_name || '—'}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{timeLabel}</div>
                  </div>
                </div>

                {/* Row 2: Branch info, commits, comments */}
                <div className="flex items-center gap-3 mt-1.5 ml-[52px] text-[11px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <GitBranch size={11} className="text-slate-400" />
                    <span className="text-slate-500">{pr.source_branch || '—'}</span>
                    <span className="text-slate-300">→</span>
                    <span className="text-slate-500">{pr.dest_branch || '—'}</span>
                  </span>
                  {pr.commit_count != null && (
                    <span className="flex items-center gap-1">
                      <GitCommitHorizontal size={11} className="text-slate-400" />
                      {pr.commit_count} commit{pr.commit_count !== 1 ? 's' : ''}
                    </span>
                  )}
                  {pr.comment_count != null && (
                    <span className="flex items-center gap-1">
                      <MessageSquare size={11} className="text-slate-400" />
                      {pr.comment_count} comment{pr.comment_count !== 1 ? 's' : ''}
                    </span>
                  )}
                  {pr.status === 'MERGED' && pr.merge_duration_hr != null && (
                    <span className="text-purple-500 font-medium">
                      merged in {formatMergeTime(pr.merge_duration_hr)}
                    </span>
                  )}
                </div>

                {/* Row 3: Reviewers */}
                {reviewers.length > 0 && (
                  <div className="flex items-center gap-1.5 mt-2 ml-[52px] flex-wrap">
                    <span className="text-[10px] uppercase tracking-wide text-slate-400 font-medium mr-0.5">Reviewers:</span>
                    {reviewers.map((rev, i) => (
                      <ReviewerBadge key={rev.id || rev.name || i} reviewer={rev} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {items.length > 0 && (
        <div className="flex items-center justify-between mt-4 px-1">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>
              Showing {Math.min((page - 1) * pageSize + 1, data?.total || 0)}–{Math.min(page * pageSize, data?.total || 0)} of {formatNumber(data?.total || 0)}
            </span>
            <span className="text-slate-300">|</span>
            <span>Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}
              className="px-2 py-1 border border-slate-200 rounded-md bg-white text-xs text-slate-700 focus:ring-1 focus:ring-indigo-400"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-2.5 py-1 rounded-md text-xs font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← Prev
            </button>
            <span className="px-3 py-1 text-xs font-medium text-slate-700">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-2.5 py-1 rounded-md text-xs font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
