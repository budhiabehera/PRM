import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bot, ArrowRight, Loader2 } from 'lucide-react'
import { pmDailyBrief } from '../../services/api'

export default function DailyBriefWidget() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    pmDailyBrief()
      .then(setData)
      .catch((err) => setError(err.response?.data?.detail || 'Could not load daily brief'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center">
            <Bot size={14} className="text-indigo-600" />
          </div>
          <h3 className="text-sm font-semibold text-slate-800">PM Brief</h3>
        </div>
        <div className="flex items-center justify-center py-6">
          <Loader2 size={18} className="animate-spin text-slate-400" />
          <span className="text-xs text-slate-400 ml-2">Loading brief...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center">
            <Bot size={14} className="text-indigo-600" />
          </div>
          <h3 className="text-sm font-semibold text-slate-800">PM Brief</h3>
        </div>
        <p className="text-xs text-slate-400">{error}</p>
        <button
          onClick={() => navigate('/engineering/pm')}
          className="mt-3 flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
        >
          Open PM Chat <ArrowRight size={12} />
        </button>
      </div>
    )
  }

  const focusItems = data?.focus_items || []
  const yesterday = data?.yesterday_activity || {}

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center">
          <Bot size={14} className="text-indigo-600" />
        </div>
        <h3 className="text-sm font-semibold text-slate-800">PM Brief</h3>
      </div>

      {/* Focus Today */}
      {focusItems.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-semibold text-slate-500 mb-1.5">🎯 Focus Today</p>
          <ol className="space-y-1">
            {focusItems.slice(0, 3).map((item, i) => (
              <li key={i} className="text-xs text-slate-700 leading-relaxed pl-4 relative">
                <span className="absolute left-0 text-slate-400 font-medium">{i + 1}.</span>
                {item}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Yesterday Activity */}
      {(yesterday.commits != null || yesterday.hours_logged != null) && (
        <div className="mb-3 px-3 py-2 bg-slate-50 rounded-lg">
          <p className="text-xs text-slate-600">
            📈 Yesterday:{' '}
            {yesterday.commits != null && (
              <span className="font-medium">{yesterday.commits} commit{yesterday.commits !== 1 ? 's' : ''}</span>
            )}
            {yesterday.commits != null && yesterday.hours_logged != null && ', '}
            {yesterday.hours_logged != null && (
              <span className="font-medium">{yesterday.hours_logged}h logged</span>
            )}
          </p>
        </div>
      )}

      {/* CTA */}
      <button
        onClick={() => navigate('/engineering/pm')}
        className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors mt-1"
      >
        Open PM Chat <ArrowRight size={12} />
      </button>
    </div>
  )
}
