import { useState, useRef, useEffect, useCallback } from 'react'
import { Bot, Send, Sparkles, BarChart3, CalendarRange, Users, AlertTriangle, GitPullRequest, TrendingUp, ChevronDown } from 'lucide-react'
import { pmChat } from '../../services/api'
import useDropdowns from '../../hooks/useDropdowns'
import useAuthStore from '../../store/useAuthStore'

const QUICK_ACTIONS = [
  { id: 'daily',    label: 'Daily Brief',    icon: Sparkles,       message: 'What should I focus on today?', needsSelection: false },
  { id: 'project',  label: 'Project Status', icon: BarChart3,      message: null, needsSelection: 'project' },
  { id: 'sprint',   label: 'Sprint Summary', icon: CalendarRange,  message: null, needsSelection: 'sprint' },
  { id: 'team',     label: 'Team Report',    icon: Users,          message: 'Give me a team report', needsSelection: false },
  { id: 'risk',     label: 'Risk Report',    icon: AlertTriangle,  message: 'Which projects are at risk?', needsSelection: false },
  { id: 'pr',       label: 'PR Status',      icon: GitPullRequest, message: 'Show me PR status', needsSelection: false },
  { id: 'velocity', label: 'Velocity Report', icon: TrendingUp,    message: 'Show me the velocity report', needsSelection: false },
]

const STARTER_QUESTIONS = [
  'What should I focus on today?',
  'How is FX-POS doing?',
  'Sprint summary for Aug-2026',
  'Which projects are at risk?',
  'Who is idle this sprint?',
  'Show me PR status',
]

function ChatBubble({ role, text }) {
  if (role === 'user') {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[75%] bg-indigo-600 text-white px-4 py-2.5 rounded-2xl rounded-br-md text-sm leading-relaxed shadow-sm">
          {text}
        </div>
      </div>
    )
  }
  return (
    <div className="flex items-start gap-2.5 mb-4">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center">
        <Bot size={16} className="text-indigo-600" />
      </div>
      <div className="max-w-[75%] bg-white border border-slate-200 px-4 py-2.5 rounded-2xl rounded-bl-md text-sm text-slate-800 leading-relaxed shadow-sm whitespace-pre-wrap">
        {text}
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex items-start gap-2.5 mb-4">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center">
        <Bot size={16} className="text-indigo-600" />
      </div>
      <div className="bg-white border border-slate-200 px-4 py-3 rounded-2xl rounded-bl-md shadow-sm">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  )
}

export default function PMChatPage() {
  const user = useAuthStore((s) => s.user)
  const { projects, sprints } = useDropdowns()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectionMode, setSelectionMode] = useState(null) // 'project' | 'sprint' | null
  const chatEndRef = useRef(null)
  const inputRef = useRef(null)

  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, loading, scrollToBottom])

  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || loading) return
    const userMsg = { role: 'user', text: text.trim() }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setSelectionMode(null)
    setLoading(true)
    try {
      const res = await pmChat(text.trim())
      const pmText = res.response || res.answer || res.message || JSON.stringify(res)
      setMessages((prev) => [...prev, { role: 'pm', text: pmText }])
    } catch (err) {
      const errText = err.response?.data?.detail || err.message || 'Something went wrong. Please try again.'
      setMessages((prev) => [...prev, { role: 'pm', text: `⚠️ ${errText}` }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }, [loading])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const handleQuickAction = (action) => {
    if (action.needsSelection) {
      setSelectionMode(action.needsSelection)
    } else {
      sendMessage(action.message)
    }
  }

  const handleSelectionPick = (value, label) => {
    if (selectionMode === 'project') {
      sendMessage(`How is ${label} doing?`)
    } else if (selectionMode === 'sprint') {
      sendMessage(`Sprint summary for ${label}`)
    }
  }

  const firstName = user?.full_name?.split(' ')[0] || 'there'

  return (
    <div>
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center">
            <Bot size={20} className="text-indigo-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">PM Assistant</h2>
            <p className="text-xs text-slate-500 mt-0.5">Ask anything about your projects, sprints, team, and tasks</p>
          </div>
        </div>
      </div>

      {/* Main layout: Chat + Sidebar */}
      <div className="flex gap-4" style={{ height: 'calc(100vh - 180px)' }}>
        {/* Chat Area (70%) */}
        <div className="flex-[7] flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-4 bg-slate-50/50">
            {messages.length === 0 ? (
              /* Starter questions */
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-14 h-14 rounded-2xl bg-indigo-100 flex items-center justify-center mb-4">
                  <Bot size={28} className="text-indigo-600" />
                </div>
                <h3 className="text-base font-semibold text-slate-800 mb-1">
                  Hi {firstName}! I'm your PM Assistant 🤖
                </h3>
                <p className="text-sm text-slate-500 mb-6 max-w-sm">
                  I can answer questions about your projects, sprints, team performance, and more — powered by real-time data.
                </p>
                <div className="text-left max-w-md w-full">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2.5 px-1">
                    Try asking
                  </p>
                  <div className="grid grid-cols-1 gap-1.5">
                    {STARTER_QUESTIONS.map((q) => (
                      <button
                        key={q}
                        onClick={() => sendMessage(q)}
                        className="text-left px-3.5 py-2.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-colors"
                      >
                        "{q}"
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <>
                {messages.map((msg, i) => (
                  <ChatBubble key={i} role={msg.role} text={msg.text} />
                ))}
                {loading && <TypingIndicator />}
                <div ref={chatEndRef} />
              </>
            )}
          </div>

          {/* Selection dropdown (for project/sprint quick actions) */}
          {selectionMode && (
            <div className="px-5 py-2 bg-indigo-50 border-t border-indigo-100 flex items-center gap-3">
              <span className="text-xs font-medium text-indigo-700">
                {selectionMode === 'project' ? 'Select a project:' : 'Select a sprint:'}
              </span>
              <div className="relative flex-1 max-w-xs">
                <select
                  autoFocus
                  className="w-full px-2.5 py-1.5 border border-indigo-200 rounded-lg text-xs bg-white focus:outline-none focus:border-indigo-400 appearance-none pr-7"
                  defaultValue=""
                  onChange={(e) => {
                    const opt = e.target.options[e.target.selectedIndex]
                    if (opt.value) handleSelectionPick(opt.value, opt.text)
                  }}
                >
                  <option value="" disabled>
                    — Choose —
                  </option>
                  {selectionMode === 'project'
                    ? projects.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))
                    : sprints.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                </select>
                <ChevronDown size={12} className="absolute right-2.5 top-2 text-indigo-400 pointer-events-none" />
              </div>
              <button
                onClick={() => setSelectionMode(null)}
                className="text-xs text-indigo-500 hover:text-indigo-700"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Input area */}
          <div className="px-4 py-3 border-t border-slate-200 bg-white">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a question..."
                rows={1}
                className="flex-1 resize-none px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm bg-slate-50 focus:outline-none focus:border-indigo-400 focus:bg-white transition-colors placeholder:text-slate-400"
                style={{ maxHeight: '100px', minHeight: '40px' }}
                disabled={loading}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || loading}
                className="flex-shrink-0 w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Send size={16} />
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5 px-1">
              Press Enter to send · Shift+Enter for new line
            </p>
          </div>
        </div>

        {/* Quick Actions Sidebar (30%) */}
        <div className="flex-[3] flex flex-col gap-3">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
              Quick Actions
            </h3>
            <div className="flex flex-col gap-1.5">
              {QUICK_ACTIONS.map((action) => {
                const Icon = action.icon
                return (
                  <button
                    key={action.id}
                    onClick={() => handleQuickAction(action)}
                    disabled={loading}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-slate-700 font-medium hover:bg-indigo-50 hover:text-indigo-700 transition-colors text-left disabled:opacity-50"
                  >
                    <Icon size={15} className="flex-shrink-0 text-slate-400" />
                    {action.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Tips card */}
          <div className="bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-100 rounded-xl p-4">
            <h4 className="text-xs font-semibold text-indigo-700 mb-2">💡 Tips</h4>
            <ul className="text-xs text-indigo-600/80 space-y-1.5 leading-relaxed">
              <li>• Ask about specific projects by name</li>
              <li>• Request sprint-level breakdowns</li>
              <li>• Check who's overloaded or idle</li>
              <li>• Get risk alerts and PR reviews</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
