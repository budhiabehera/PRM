import { useState, useEffect } from 'react'
import { getCommits, getPullRequests } from '../services/api'
import { GitCommitHorizontal, GitPullRequest } from 'lucide-react'

function timeAgo(dateStr) {
  if (!dateStr) return '—'
  const now = new Date()
  const d = new Date(dateStr)
  const diffMs = now - d
  if (diffMs < 0) return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

const STATUS_COLORS = {
  OPEN: 'bg-blue-50 text-blue-700 border-blue-200',
  MERGED: 'bg-purple-50 text-purple-700 border-purple-200',
  DECLINED: 'bg-red-50 text-red-700 border-red-200',
  SUPERSEDED: 'bg-slate-50 text-slate-600 border-slate-200',
}

export default function TaskEngineeringPanel({ task }) {
  const [commits, setCommits] = useState([])
  const [prs, setPrs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!task?.id) return
    setLoading(true)
    Promise.all([
      getCommits({ task_id: task.id, page_size: 10 }).catch(() => ({ items: [] })),
      getPullRequests({ task_id: task.id, page_size: 10 }).catch(() => ({ items: [] })),
    ]).then(([commitData, prData]) => {
      setCommits(commitData?.items || [])
      setPrs(prData?.items || [])
    }).finally(() => setLoading(false))
  }, [task?.id])

  const hasData = commits.length > 0 || prs.length > 0

  return (
    <div className="mt-3 pt-3 border-t border-slate-200">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-semibold text-slate-500">Engineering Activity</span>
        {!loading && hasData && (
          <span className="bg-indigo-100 text-indigo-600 rounded-full px-2 text-[10px] py-0.5 font-medium">
            {commits.length + prs.length} item{commits.length + prs.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {loading ? (
        <div className="text-[11px] text-slate-400 py-2">Loading engineering data...</div>
      ) : !hasData ? (
        <p className="text-[11px] text-slate-400">No linked commits or pull requests</p>
      ) : (
        <div className="space-y-2">
          {/* Linked Commits */}
          {commits.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <GitCommitHorizontal size={12} className="text-indigo-500" />
                <span className="text-[10px] uppercase tracking-wide text-slate-400 font-medium">Commits ({commits.length})</span>
              </div>
              <div className="space-y-1">
                {commits.map((c) => (
                  <div key={c.id || c.hash} className="flex items-center gap-3 px-2 py-1.5 rounded-md bg-slate-50/80 text-[11px]">
                    <code className="text-indigo-600 font-mono font-semibold flex-shrink-0">
                      {(c.hash || '').slice(0, 7)}
                    </code>
                    <span className="text-slate-700 truncate flex-1 min-w-0">
                      {(c.message || '').slice(0, 80)}{(c.message || '').length > 80 ? '…' : ''}
                    </span>
                    <span className="text-slate-400 flex-shrink-0">{timeAgo(c.committed_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Linked PRs */}
          {prs.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <GitPullRequest size={12} className="text-purple-500" />
                <span className="text-[10px] uppercase tracking-wide text-slate-400 font-medium">Pull Requests ({prs.length})</span>
              </div>
              <div className="space-y-1">
                {prs.map((pr) => {
                  const statusKey = (pr.state || pr.status || '').toUpperCase()
                  const statusClass = STATUS_COLORS[statusKey] || STATUS_COLORS.OPEN
                  return (
                    <div key={pr.id || pr.pr_number} className="flex items-center gap-3 px-2 py-1.5 rounded-md bg-slate-50/80 text-[11px]">
                      <span className="text-purple-600 font-mono font-semibold flex-shrink-0">
                        #{pr.pr_number || pr.bitbucket_id || '—'}
                      </span>
                      <span className="text-slate-700 truncate flex-1 min-w-0">
                        {(pr.title || '').slice(0, 80)}{(pr.title || '').length > 80 ? '…' : ''}
                      </span>
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium border ${statusClass}`}>
                        {pr.state || pr.status || '—'}
                      </span>
                      <span className="text-slate-400 flex-shrink-0">{timeAgo(pr.merged_at || pr.updated_at)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
