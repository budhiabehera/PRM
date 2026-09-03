export const STATUS_COLORS = {
  'Completed': 'bg-green-100 text-green-700',
  'In Progress': 'bg-blue-100 text-blue-700',
  'Not Started': 'bg-slate-100 text-slate-600',
  'On Hold': 'bg-amber-100 text-amber-800',
  'Clarification': 'bg-pink-100 text-pink-700',
  'TBD': 'bg-slate-200 text-slate-600',
  'QA-Open': 'bg-violet-100 text-violet-700',
  'QA-WIP': 'bg-indigo-100 text-indigo-700',
  'QA-Staging': 'bg-cyan-100 text-cyan-700',
  'QA-Confirmed': 'bg-emerald-100 text-emerald-700',
  'Active': 'bg-green-100 text-green-700',
  'Inactive': 'bg-slate-100 text-slate-500',
  'Planning': 'bg-blue-100 text-blue-700',
  'Planned': 'bg-sky-100 text-sky-700',
}

export const PRIORITY_COLORS = {
  Critical: 'bg-red-200 text-red-800',
  High: 'bg-red-100 text-red-600',
  Medium: 'bg-amber-100 text-amber-700',
  Low: 'bg-sky-100 text-sky-700',
}

export const UTIL_STATUS_COLORS = {
  over: 'text-red-600 font-semibold',
  healthy: 'text-green-700 font-semibold',
  under: 'text-amber-600 font-semibold',
  idle: 'text-slate-400',
}

export const UTIL_FILL_COLORS = {
  over: '#dc2626',
  healthy: '#22c55e',
  under: '#f59e0b',
  idle: '#d1d5db',
}

export const CHART_COLORS = ['#4f46e5', '#22c55e', '#f59e0b', '#0ea5e9', '#dc2626', '#9333ea', '#0d9488']

export const STATUS_OPTIONS = [
  'Not Started', 'In Progress', 'Completed', 'Clarification', 'On Hold',
  'TBD', 'QA-Open', 'QA-WIP', 'QA-Staging', 'QA-Confirmed',
]

export const PRIORITY_OPTIONS = ['Critical', 'High', 'Medium', 'Low']

export const ROLE_OPTIONS = ['Admin', 'Manager', 'Lead - Manager', 'Lead', 'Developer']
export const SKILL_OPTIONS = ['Backend', 'Frontend', 'Mobile']

// Statuses that represent future/planning tasks — relaxed validation, excluded from sprint stats
export const PLANNING_STATUSES = ['Backlog', 'New', 'Unassigned']
