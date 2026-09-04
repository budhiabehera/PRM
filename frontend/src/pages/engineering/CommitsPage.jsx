import { useState, useEffect, useCallback, useMemo } from 'react'
import { getCommits, getLinkedRepositories, syncAllRepos } from '../../services/api'
import useDropdowns from '../../hooks/useDropdowns'
import useProjectDefault from '../../hooks/useProjectDefault'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import FilterSelect from '../../components/common/FilterSelect'
import KPICard from '../../components/common/KPICard'
import { formatNumber } from '../../utils/formatters'
import { Search, RefreshCw, GitCommitHorizontal, GitBranch } from 'lucide-react'

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

/** Extract task codes like T09045 from a commit message */
const TASK_CODE_RE = /\b(T\d{5})\b/g

function renderMessage(msg, maxLen = 100) {
  if (!msg) return '—'
  const truncated = msg.length > maxLen ? msg.slice(0, maxLen) + '…' : msg
  // Split by task code matches
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

export default function CommitsPage() {
  const { projects, resources } = useDropdowns()
  const { defaultProjectId, showAllOption, restrictedProjects } = useProjectDefault()

  // --- Filter state ---
  const [projectId, setProjectId] = useState(defaultProjectId)
  const [repoId, setRepoId] = useState('')
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
  useEffect(() => { setPage(1) }, [projectId, repoId, developerId, fromDate, toDate, search])

  // Fetch commits
  const fetchCommits = useCallback(() => {
    setLoading(true)
    const params = {
      page,
      page_size: pageSize,
      project_id: projectId || undefined,
      repo_id: repoId || undefined,
      developer_id: developerId || undefined,
      from_date: fromDate || undefined,
      to_date: toDate || undefined,
      search: search || undefined,
    }
    getCommits(params)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [page, pageSize, projectId, repoId, developerId, fromDate, toDate, search])

  useEffect(() => { fetchCommits() }, [fetchCommits])

  // --- Sync ---
  const handleSyncAll = async () => {
    setSyncing(true)
    try {
      const res = await syncAllRepos()
      const totalNew = Array.isArray(res) ? res.reduce((s, r) => s + (r.new || 0), 0) : (res.new || 0)
      const totalLinked = Array.isArray(res) ? res.reduce((s, r) => s + (r.linked_tasks || 0), 0) : (res.linked_tasks || 0)
      showToast('success', `Sync complete — ${totalNew} new commits, ${totalLinked} tasks linked`)
      fetchCommits()
    } catch (err) {
      showToast('error', err.response?.data?.detail || 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const items = data?.items || []
  const kpis = data?.kpis || {}
  const totalPages = data?.pages || 1

  const handleExportPDF = () => {
    const now = new Date()
    const generated = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    const projectName = projectId ? (projects.find(p => String(p.id) === String(projectId))?.name || '') : 'All Projects'
    const repoName = repoId ? (repos.find(r => String(r.id) === String(repoId))?.repo_name || '') : 'All Repos'
    const dateRange = (fromDate || toDate) ? `${fromDate || '...'} to ${toDate || '...'}` : 'All Time'

    const buildTable = (headers, rows) => {
      const ths = headers.map(h => `<th>${h}</th>`).join('')
      const trs = rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')
      return `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`
    }

    const fmtDate = (dateStr) => {
      if (!dateStr) return '—'
      const d = new Date(dateStr)
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    }

    const headers = ['Hash', 'Message', 'Author', 'Branch', 'Date', '+', '−']
    const rows = items.map(c => [
      `<code>${(c.hash || '').slice(0, 7)}</code>`,
      (c.message || '—').length > 80 ? (c.message || '').slice(0, 80) + '…' : (c.message || '—'),
      c.author_name || c.developer_name || '—',
      c.branch || '—',
      fmtDate(c.committed_at),
      `<span style="color:#16a34a">+${c.additions ?? c.lines_added ?? 0}</span>`,
      `<span style="color:#dc2626">-${c.deletions ?? c.lines_deleted ?? 0}</span>`
    ])

    const html = `<!DOCTYPE html><html><head><title>Engineering Commits Report</title><style>
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
      code { font-family: monospace; color: #4f46e5; font-weight: 600; }
      .generated { margin-top: 24px; font-size: 10px; color: #94a3b8; }
      @media print { body { padding: 0; } }
    </style></head><body>
      <h1>Engineering Commits Report</h1>
      <div class="subtitle">Project: ${projectName} | Repo: ${repoName} | ${dateRange} | Generated on ${generated}</div>
      <div class="kpi-row">
        <div class="kpi-card"><div class="kpi-value">${kpis.total_commits || data?.total || 0}</div><div class="kpi-label">Total Commits</div></div>
        <div class="kpi-card"><div class="kpi-value">${kpis.unique_authors || 0}</div><div class="kpi-label">Unique Authors</div></div>
        <div class="kpi-card"><div class="kpi-value" style="color:#16a34a">+${kpis.lines_added || 0}</div><div class="kpi-label">Lines Added</div></div>
        <div class="kpi-card"><div class="kpi-value" style="color:#dc2626">-${kpis.lines_deleted || 0}</div><div class="kpi-label">Lines Deleted</div></div>
      </div>
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
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Commits</h2>
          <p className="text-xs text-slate-500 mt-0.5">Browse and search repository commits across all linked projects</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-secondary px-5 py-2 text-sm flex items-center gap-2 whitespace-nowrap" onClick={handleExportPDF} title="Export to PDF">
            📄 Export PDF
          </button>
          <button
          className="btn btn-primary flex items-center gap-2"
          onClick={handleSyncAll}
          disabled={syncing}
        >
          <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing...' : 'Sync Repos'}
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
          options={restrictedProjects.map((p) => ({ value: p.id, label: p.name }))}
        />
        <FilterSelect
          label="Repository"
          value={repoId}
          onChange={setRepoId}
          options={filteredRepos.map((r) => ({ value: r.id, label: r.repo_name || r.repo_slug || `Repo #${r.id}` }))}
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
              placeholder="Search commit messages..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg bg-slate-50 text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        <KPICard label="Total Commits" value={formatNumber(kpis.total_commits || data?.total || 0)} />
        <KPICard label="Unique Authors" value={formatNumber(kpis.unique_authors || 0)} />
        <KPICard
          label="Lines Added"
          value={
            <span className="text-green-600">+{formatNumber(kpis.lines_added || 0)}</span>
          }
        />
        <KPICard
          label="Lines Deleted"
          value={
            <span className="text-red-500">-{formatNumber(kpis.lines_deleted || 0)}</span>
          }
        />
      </div>

      {/* Commits list */}
      {loading ? (
        <LoadingSpinner label="Loading commits..." />
      ) : items.length === 0 ? (
        <div className="card text-center py-12">
          <GitCommitHorizontal size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm text-slate-500">No commits found matching your filters.</p>
          <p className="text-xs text-slate-400 mt-1">Try adjusting your filters or sync repositories to pull in new commits.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="divide-y divide-slate-100">
            {items.map((c) => (
              <div key={c.id || c.hash} className="flex items-start gap-4 px-4 py-3 hover:bg-slate-50/60 transition-colors">
                {/* Hash */}
                <code className="text-xs font-mono text-indigo-600 font-semibold pt-0.5 flex-shrink-0 w-[70px]">
                  {(c.hash || '').slice(0, 7)}
                </code>

                {/* Message + metadata */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-800 leading-snug">
                    {renderMessage(c.message)}
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-400">
                    <span className="text-slate-600 font-medium">{c.author_name || c.developer_name || '—'}</span>
                    <span className="flex items-center gap-1">
                      <span className="text-slate-300">•</span>
                      {c.repo_name || '—'}
                    </span>
                    {c.branch && (
                      <span className="flex items-center gap-1">
                        <GitBranch size={11} className="text-slate-400" />
                        {c.branch}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right side: date + stats */}
                <div className="flex-shrink-0 text-right">
                  <div className="text-xs text-slate-500">{timeAgo(c.committed_at)}</div>
                  <div className="flex items-center justify-end gap-2 mt-1 text-[11px]">
                    {(c.additions != null || c.lines_added != null) && (
                      <span className="text-green-600 font-medium">+{formatNumber(c.additions ?? c.lines_added ?? 0)}</span>
                    )}
                    {(c.deletions != null || c.lines_deleted != null) && (
                      <span className="text-red-500 font-medium">-{formatNumber(c.deletions ?? c.lines_deleted ?? 0)}</span>
                    )}
                    {c.files_changed != null && (
                      <span className="text-slate-400">{c.files_changed} file{c.files_changed !== 1 ? 's' : ''}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
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
