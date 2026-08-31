import { useState, useEffect, useCallback, useMemo } from 'react'
import { getReleases, getLinkedRepositories } from '../../services/api'
import useDropdowns from '../../hooks/useDropdowns'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import FilterSelect from '../../components/common/FilterSelect'
import KPICard from '../../components/common/KPICard'
import { formatNumber } from '../../utils/formatters'
import { Search, Tag, ChevronDown, ChevronUp } from 'lucide-react'

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

/** Extract task codes like T09045 from text */
const TASK_CODE_RE = /\b(T\d{5})\b/g

function renderDescription(text) {
  if (!text) return null
  const parts = []
  let lastIdx = 0
  let match
  const re = new RegExp(TASK_CODE_RE.source, 'g')
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(<span key={lastIdx}>{text.slice(lastIdx, match.index)}</span>)
    }
    parts.push(
      <span key={match.index} className="inline-flex items-center px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[11px] font-semibold mx-0.5">
        {match[1]}
      </span>
    )
    lastIdx = re.lastIndex
  }
  if (lastIdx < text.length) {
    parts.push(<span key={lastIdx}>{text.slice(lastIdx)}</span>)
  }
  return parts.length > 0 ? parts : text
}

/** Release card with expandable description */
function ReleaseCard({ release }) {
  const [expanded, setExpanded] = useState(false)

  const description = release.description || ''
  const isLong = description.length > 200
  const displayText = expanded ? description : description.slice(0, 200)

  const releasedDate = release.released_at
    ? new Date(release.released_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—'

  const showReleaseName =
    release.release_name && release.release_name !== release.tag_name

  return (
    <div className="relative flex gap-4">
      {/* Timeline line + dot */}
      <div className="flex flex-col items-center flex-shrink-0 w-6">
        <div className="w-3 h-3 rounded-full bg-indigo-500 border-2 border-white shadow-sm ring-2 ring-indigo-100 mt-4 z-10" />
        <div className="flex-1 w-px bg-slate-200" />
      </div>

      {/* Card */}
      <div className="flex-1 bg-white border border-slate-200 rounded-xl px-5 py-4 hover:shadow-sm transition-shadow mb-3">
        {/* Row 1: Tag + name + date */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-wrap min-w-0">
            <span className="text-base font-bold text-slate-900 flex items-center gap-1.5">
              <Tag size={15} className="text-indigo-500 flex-shrink-0" />
              {release.tag_name || '—'}
            </span>
            {showReleaseName && (
              <span className="text-sm text-slate-600">
                — {release.release_name}
              </span>
            )}
          </div>
          <span className="text-xs text-slate-500 flex-shrink-0 pt-0.5">
            {releasedDate}
          </span>
        </div>

        {/* Row 2: Repo + stats */}
        <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-400 flex-wrap">
          <span className="text-slate-500 font-medium">{release.repo_name || '—'}</span>
          {release.commit_count != null && (
            <>
              <span className="text-slate-300">•</span>
              <span>{formatNumber(release.commit_count)} commit{release.commit_count !== 1 ? 's' : ''}</span>
            </>
          )}
          {release.pr_count != null && (
            <>
              <span className="text-slate-300">•</span>
              <span>{formatNumber(release.pr_count)} PR{release.pr_count !== 1 ? 's' : ''}</span>
            </>
          )}
          {release.days_since_prev != null && (
            <>
              <span className="text-slate-300">•</span>
              <span>{release.days_since_prev} day{release.days_since_prev !== 1 ? 's' : ''} gap</span>
            </>
          )}
        </div>

        {/* Row 3: Description / changelog */}
        {description && (
          <div className="mt-3">
            <div className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">
              {renderDescription(displayText)}
              {isLong && !expanded && '…'}
            </div>
            {isLong && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 mt-1.5 text-[11px] text-indigo-600 hover:text-indigo-700 font-medium"
              >
                {expanded ? (
                  <>
                    <ChevronUp size={12} /> Show less
                  </>
                ) : (
                  <>
                    <ChevronDown size={12} /> Show more
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {/* Row 4: Author */}
        {release.author_name && (
          <div className="mt-2 text-[11px] text-slate-400">
            by {release.author_name}
          </div>
        )}
      </div>
    </div>
  )
}

export default function ReleasesPage() {
  const { projects } = useDropdowns()

  // --- Filter state ---
  const [projectId, setProjectId] = useState('')
  const [repoId, setRepoId] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')

  // --- Pagination ---
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

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

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 400)
    return () => clearTimeout(timer)
  }, [searchInput])

  // Reset to page 1 when any filter changes
  useEffect(() => { setPage(1) }, [projectId, repoId, fromDate, toDate, search])

  // Fetch releases
  const fetchReleases = useCallback(() => {
    setLoading(true)
    const params = {
      page,
      page_size: pageSize,
      project_id: projectId || undefined,
      repo_id: repoId || undefined,
      from_date: fromDate || undefined,
      to_date: toDate || undefined,
      search: search || undefined,
    }
    getReleases(params)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [page, pageSize, projectId, repoId, fromDate, toDate, search])

  useEffect(() => { fetchReleases() }, [fetchReleases])

  const items = data?.items || []
  const kpis = data?.kpis || {}
  const totalPages = data?.pages || 1

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Releases</h2>
          <p className="text-xs text-slate-500 mt-0.5">Track release history and cadence across linked repositories</p>
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
        <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
          <span className="text-[10px] uppercase tracking-wide text-slate-400 font-medium">Search</span>
          <div className="relative">
            <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search tag, name, description..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg bg-slate-50 text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        <KPICard label="Total Releases" value={formatNumber(kpis.total_releases || data?.total || 0)} />
        <KPICard
          label="Avg Gap"
          value={kpis.avg_days_between_releases != null ? `${Number(kpis.avg_days_between_releases).toFixed(1)} days` : '—'}
        />
        <KPICard
          label="Avg Commits / Release"
          value={kpis.avg_commits_per_release != null ? Number(kpis.avg_commits_per_release).toFixed(1) : '—'}
        />
        <KPICard
          label="Last Release"
          value={kpis.last_release_tag || '—'}
          sub={kpis.last_release_date ? timeAgo(kpis.last_release_date) : null}
        />
      </div>

      {/* Release list */}
      {loading ? (
        <LoadingSpinner label="Loading releases..." />
      ) : items.length === 0 ? (
        <div className="card text-center py-12">
          <Tag size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm text-slate-500">No releases found matching your filters.</p>
          <p className="text-xs text-slate-400 mt-1">Try adjusting your filters or sync repositories to pull in new releases.</p>
        </div>
      ) : (
        <div className="pl-1">
          {items.map((release) => (
            <ReleaseCard key={release.id || release.tag_name} release={release} />
          ))}
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
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
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
