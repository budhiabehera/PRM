import { useEffect, useState, useMemo } from 'react'
import {
  getAlertRules,
  createAlertRule,
  updateAlertRule,
  deleteAlertRule,
  checkAlerts,
  getAlertHistory,
  resolveAlert,
} from '../../services/api'
import useDropdowns from '../../hooks/useDropdowns'
import useProjectDefault from '../../hooks/useProjectDefault'
import FilterSelect from '../../components/common/FilterSelect'
import ConfirmDialog from '../../components/common/ConfirmDialog'
import LoadingSpinner from '../../components/common/LoadingSpinner'

// --- Constants ---

const RULE_TYPES = [
  { value: 'pr_review_pending', label: 'PR Review Pending' },
  { value: 'task_no_activity', label: 'Task No Activity' },
  { value: 'task_overdue', label: 'Overdue Task' },
  { value: 'sprint_delay', label: 'Sprint Delay Warning' },
]

const SEVERITIES = [
  { value: 'info', label: 'Info' },
  { value: 'warning', label: 'Warning' },
  { value: 'critical', label: 'Critical' },
]

const RULE_TYPE_META = {
  pr_review_pending:  { color: 'bg-purple-100 text-purple-700', unit: 'hours', defaultName: 'PR Review Pending Alert' },
  task_no_activity:   { color: 'bg-orange-100 text-orange-700', unit: 'days',  defaultName: 'Task No Activity Alert' },
  task_overdue:       { color: 'bg-red-100 text-red-700',       unit: 'days',  defaultName: 'Overdue Task Alert' },
  sprint_delay:       { color: 'bg-blue-100 text-blue-700',     unit: '%',     defaultName: 'Sprint Delay Warning' },
}

const SEVERITY_COLORS = {
  info:     'bg-blue-100 text-blue-700',
  warning:  'bg-yellow-100 text-yellow-700',
  critical: 'bg-red-100 text-red-700',
}

const SEVERITY_ICONS = { info: '🔵', warning: '🟡', critical: '🔴' }

const EMPTY_FORM = {
  rule_type: 'pr_review_pending',
  name: 'PR Review Pending Alert',
  description: '',
  threshold_value: 24,
  severity: 'warning',
  notify_in_app: true,
  notify_email: false,
  notify_teams: false,
  project_id: '',
  enabled: true,
}

const PAGE_SIZE = 25

export default function AlertRulesPage() {
  // --- Rules state ---
  const [rules, setRules] = useState([])
  const [rulesLoading, setRulesLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [checking, setChecking] = useState(false)
  const [toDelete, setToDelete] = useState(null)

  // --- History state ---
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyOpen, setHistoryOpen] = useState(true)
  const [historyPage, setHistoryPage] = useState(1)
  const [historyTotal, setHistoryTotal] = useState(0)
  const [hFilterType, setHFilterType] = useState('')
  const [hFilterSeverity, setHFilterSeverity] = useState('')
  const [hFilterStatus, setHFilterStatus] = useState('')
  const [resolvingId, setResolvingId] = useState(null)

  // --- Toast ---
  const [message, setMessage] = useState(null)

  const { projects } = useDropdowns()
  const { defaultProjectId, showAllOption, restrictedProjects } = useProjectDefault()

  const projectMap = useMemo(() => {
    const m = {}
    projects.forEach((p) => { m[p.id] = p.name })
    return m
  }, [projects])

  const projectOptions = useMemo(
    () => restrictedProjects.map((p) => ({ value: String(p.id), label: p.name })),
    [restrictedProjects]
  )

  // --- Load rules ---
  const loadRules = () => {
    setRulesLoading(true)
    getAlertRules()
      .then(setRules)
      .catch(() => setRules([]))
      .finally(() => setRulesLoading(false))
  }

  // --- Load history ---
  const loadHistory = () => {
    setHistoryLoading(true)
    const params = { page: historyPage, page_size: PAGE_SIZE }
    if (hFilterType) params.rule_type = hFilterType
    if (hFilterSeverity) params.severity = hFilterSeverity
    if (hFilterStatus === 'active') params.is_resolved = false
    if (hFilterStatus === 'resolved') params.is_resolved = true
    getAlertHistory(params)
      .then((res) => {
        setHistory(Array.isArray(res) ? res : res.items || [])
        setHistoryTotal(res.total ?? (Array.isArray(res) ? res.length : 0))
      })
      .catch(() => { setHistory([]); setHistoryTotal(0) })
      .finally(() => setHistoryLoading(false))
  }

  useEffect(() => { loadRules() }, [])
  useEffect(() => { loadHistory() }, [historyPage, hFilterType, hFilterSeverity, hFilterStatus])

  // --- Form helpers ---
  const updateForm = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const handleTypeChange = (type) => {
    const meta = RULE_TYPE_META[type] || {}
    setForm((f) => ({
      ...f,
      rule_type: type,
      name: editingId ? f.name : (meta.defaultName || ''),
      threshold_value: type === 'pr_review_pending' ? 24 : type === 'sprint_delay' ? 30 : 3,
    }))
  }

  const handleAdd = () => {
    setEditingId(null)
    setForm({ ...EMPTY_FORM })
    setShowForm(true)
  }

  const handleEdit = (rule) => {
    setEditingId(rule.id)
    setForm({
      rule_type: rule.rule_type,
      name: rule.name,
      description: rule.description || '',
      threshold_value: rule.threshold_value,
      severity: rule.severity,
      notify_in_app: rule.notify_in_app ?? true,
      notify_email: rule.notify_email ?? false,
      notify_teams: rule.notify_teams ?? false,
      project_id: rule.project_id ? String(rule.project_id) : '',
      enabled: rule.enabled ?? true,
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    const payload = {
      ...form,
      threshold_value: Number(form.threshold_value),
      project_id: form.project_id ? Number(form.project_id) : null,
    }
    try {
      if (editingId) {
        await updateAlertRule(editingId, payload)
        setMessage({ type: 'success', text: 'Alert rule updated.' })
      } else {
        await createAlertRule(payload)
        setMessage({ type: 'success', text: 'Alert rule created.' })
      }
      setShowForm(false)
      setEditingId(null)
      loadRules()
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to save alert rule.' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!toDelete) return
    setMessage(null)
    try {
      await deleteAlertRule(toDelete.id)
      setToDelete(null)
      setMessage({ type: 'success', text: 'Alert rule deleted.' })
      loadRules()
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to delete alert rule.' })
    }
  }

  const handleToggleEnabled = async (rule) => {
    try {
      await updateAlertRule(rule.id, { ...rule, enabled: !rule.enabled })
      loadRules()
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to toggle rule.' })
    }
  }

  const handleRunCheck = async () => {
    setChecking(true)
    setMessage(null)
    try {
      const res = await checkAlerts()
      const triggered = res.triggered ?? res.alerts_triggered ?? 0
      const resolved = res.resolved ?? res.alerts_resolved ?? 0
      setMessage({ type: 'success', text: `${triggered} alerts triggered, ${resolved} resolved.` })
      loadHistory()
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Alert check failed.' })
    } finally {
      setChecking(false)
    }
  }

  const handleResolve = async (alert) => {
    setResolvingId(alert.id)
    setMessage(null)
    try {
      await resolveAlert(alert.id)
      setMessage({ type: 'success', text: 'Alert resolved.' })
      loadHistory()
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to resolve alert.' })
    } finally {
      setResolvingId(null)
    }
  }

  // --- Relative time helper ---
  const relativeTime = (dateStr) => {
    if (!dateStr) return '—'
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    return `${days}d ago`
  }

  const currentMeta = RULE_TYPE_META[form.rule_type] || {}
  const totalPages = Math.ceil(historyTotal / PAGE_SIZE) || 1

  if (rulesLoading) return <LoadingSpinner label="Loading alert rules..." />

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900">Alert Rules</h2>
        <p className="text-xs text-slate-500 mt-0.5">Configure alert rules for engineering notifications</p>
      </div>

      {/* Toast */}
      {message && (
        <div className={`text-xs rounded-lg px-3 py-2 mb-4 ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
          {message.text}
        </div>
      )}

      {/* Run Alert Check card */}
      <div className="card mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[15px] font-semibold">Manual Alert Check</div>
            <p className="text-xs text-slate-500 mt-0.5">Run the alert engine now to evaluate all active rules</p>
          </div>
          <button className="btn btn-primary" onClick={handleRunCheck} disabled={checking}>
            {checking ? '⏳ Running...' : '▶ Run Alert Check'}
          </button>
        </div>
      </div>

      {/* Rules Table */}
      <div className="card mb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="text-[15px] font-semibold">Alert Rules</div>
          <button className="btn btn-primary btn-sm" onClick={handleAdd}>+ Add Rule</button>
        </div>

        {/* Inline Add/Edit Form */}
        {showForm && (
          <div className="border border-slate-200 rounded-xl p-4 mb-4">
            <div className="text-sm font-semibold mb-3">{editingId ? 'Edit Rule' : 'Add New Rule'}</div>
            <div className="grid grid-cols-3 gap-4">
              {/* Rule Type */}
              <div className="flex flex-col gap-1">
                <label className="form-label">Rule Type</label>
                <select className="form-select" value={form.rule_type} onChange={(e) => handleTypeChange(e.target.value)}>
                  {RULE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              {/* Name */}
              <div className="flex flex-col gap-1">
                <label className="form-label">Name</label>
                <input className="form-input" value={form.name} onChange={(e) => updateForm('name', e.target.value)} placeholder="Rule name" />
              </div>

              {/* Threshold */}
              <div className="flex flex-col gap-1">
                <label className="form-label">Threshold</label>
                <div className="flex items-center gap-2">
                  <input type="number" className="form-input w-24" min={1} value={form.threshold_value} onChange={(e) => updateForm('threshold_value', e.target.value)} />
                  <span className="text-xs text-slate-500">{currentMeta.unit || 'units'}</span>
                </div>
              </div>

              {/* Severity */}
              <div className="flex flex-col gap-1">
                <label className="form-label">Severity</label>
                <select className="form-select" value={form.severity} onChange={(e) => updateForm('severity', e.target.value)}>
                  {SEVERITIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>

              {/* Project */}
              <div className="flex flex-col gap-1">
                <label className="form-label">Project</label>
                <FilterSelect
                  value={form.project_id}
                  onChange={(v) => updateForm('project_id', v)}
                  options={projectOptions}
                  allLabel="All Projects"
                />
              </div>

              {/* Description */}
              <div className="flex flex-col gap-1">
                <label className="form-label">Description <span className="text-slate-400 font-normal">(optional)</span></label>
                <input className="form-input" value={form.description} onChange={(e) => updateForm('description', e.target.value)} placeholder="Optional description" />
              </div>
            </div>

            {/* Notification checkboxes */}
            <div className="flex items-center gap-6 mt-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.notify_in_app} onChange={(e) => updateForm('notify_in_app', e.target.checked)} />
                🔔 In-App
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.notify_email} onChange={(e) => updateForm('notify_email', e.target.checked)} />
                ✉️ Email
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.notify_teams} onChange={(e) => updateForm('notify_teams', e.target.checked)} />
                🟦 Teams
              </label>
              <label className="flex items-center gap-2 text-sm ml-4">
                <input type="checkbox" checked={form.enabled} onChange={(e) => updateForm('enabled', e.target.checked)} />
                Enabled
              </label>
            </div>

            <div className="flex gap-2 mt-4">
              <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || !form.name}>
                {saving ? 'Saving...' : editingId ? 'Update Rule' : 'Create Rule'}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => { setShowForm(false); setEditingId(null) }}>Cancel</button>
            </div>
          </div>
        )}

        {/* Table */}
        {rules.length === 0 ? (
          <p className="text-sm text-slate-500">No alert rules configured yet. Click &quot;+ Add Rule&quot; to get started.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Threshold</th>
                  <th>Severity</th>
                  <th>Delivery</th>
                  <th>Project</th>
                  <th>Enabled</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => {
                  const meta = RULE_TYPE_META[rule.rule_type] || {}
                  const sevClass = SEVERITY_COLORS[rule.severity] || 'bg-slate-100 text-slate-600'
                  return (
                    <tr key={rule.id}>
                      <td className="font-medium">{rule.name}</td>
                      <td>
                        <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full ${meta.color || 'bg-slate-100 text-slate-600'}`}>
                          {RULE_TYPES.find((t) => t.value === rule.rule_type)?.label || rule.rule_type}
                        </span>
                      </td>
                      <td>
                        {rule.threshold_value} {meta.unit || ''}
                      </td>
                      <td>
                        <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full ${sevClass}`}>
                          {rule.severity}
                        </span>
                      </td>
                      <td className="text-sm">
                        {rule.notify_in_app && <span title="In-App">🔔</span>}
                        {rule.notify_email && <span title="Email" className="ml-1">✉️</span>}
                        {rule.notify_teams && <span title="Teams" className="ml-1">🟦</span>}
                        {!rule.notify_in_app && !rule.notify_email && !rule.notify_teams && <span className="text-slate-400">—</span>}
                      </td>
                      <td>{rule.project_id ? (projectMap[rule.project_id] || `#${rule.project_id}`) : 'All'}</td>
                      <td>
                        <button
                          onClick={() => handleToggleEnabled(rule)}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${rule.enabled ? 'bg-indigo-500' : 'bg-slate-300'}`}
                          title={rule.enabled ? 'Disable' : 'Enable'}
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${rule.enabled ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
                        </button>
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          <button className="btn btn-secondary btn-sm !px-2 !py-1 text-[11px]" onClick={() => handleEdit(rule)}>Edit</button>
                          <button className="btn btn-secondary btn-sm !px-2 !py-1 text-[11px] text-red-600 hover:text-red-700" onClick={() => setToDelete(rule)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Alert History Section */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <button className="flex items-center gap-2" onClick={() => setHistoryOpen((o) => !o)}>
            <div className="text-[15px] font-semibold">Alert History</div>
            <span className="text-slate-400 text-xs">{historyOpen ? '▾' : '▸'}</span>
          </button>
          {historyOpen && (
            <div className="flex items-center gap-3">
              <FilterSelect label="Type" value={hFilterType} onChange={(v) => { setHFilterType(v); setHistoryPage(1) }} options={RULE_TYPES} allLabel="All Types" />
              <FilterSelect label="Severity" value={hFilterSeverity} onChange={(v) => { setHFilterSeverity(v); setHistoryPage(1) }} options={SEVERITIES} allLabel="All" />
              <FilterSelect
                label="Status"
                value={hFilterStatus}
                onChange={(v) => { setHFilterStatus(v); setHistoryPage(1) }}
                options={[{ value: 'active', label: 'Active' }, { value: 'resolved', label: 'Resolved' }]}
                allLabel="All"
                sorted={false}
              />
            </div>
          )}
        </div>

        {historyOpen && (
          <>
            {historyLoading ? (
              <LoadingSpinner label="Loading alert history..." />
            ) : history.length === 0 ? (
              <p className="text-sm text-slate-500">No alerts found.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Severity</th>
                        <th>Title</th>
                        <th>Message</th>
                        <th>Entity</th>
                        <th>Triggered</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((a) => {
                        const isResolved = !!a.resolved_at
                        return (
                          <tr key={a.id}>
                            <td>
                              <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full ${SEVERITY_COLORS[a.severity] || 'bg-slate-100 text-slate-600'}`}>
                                {SEVERITY_ICONS[a.severity] || ''} {a.severity}
                              </span>
                            </td>
                            <td className="font-medium">{a.title || a.rule_name || '—'}</td>
                            <td className="max-w-[260px] truncate text-slate-600" title={a.message}>{a.message || '—'}</td>
                            <td className="text-xs text-slate-600">{a.entity_label || (a.entity_type && a.entity_id ? `${a.entity_type} #${a.entity_id}` : '—')}</td>
                            <td className="text-xs text-slate-500">{relativeTime(a.triggered_at || a.created_at)}</td>
                            <td>
                              {isResolved ? (
                                <span className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                                  Resolved {relativeTime(a.resolved_at)}
                                </span>
                              ) : (
                                <span className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                                  Active
                                </span>
                              )}
                            </td>
                            <td>
                              {!isResolved && (
                                <button
                                  className="btn btn-secondary btn-sm !px-2 !py-1 text-[11px]"
                                  onClick={() => handleResolve(a)}
                                  disabled={resolvingId === a.id}
                                >
                                  {resolvingId === a.id ? '...' : 'Resolve'}
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <span className="text-xs text-slate-500">
                      Page {historyPage} of {totalPages} · {historyTotal} alert{historyTotal !== 1 ? 's' : ''}
                    </span>
                    <div className="flex gap-1">
                      <button
                        className="btn btn-secondary btn-sm"
                        disabled={historyPage <= 1}
                        onClick={() => setHistoryPage((p) => p - 1)}
                      >
                        ← Prev
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        disabled={historyPage >= totalPages}
                        onClick={() => setHistoryPage((p) => p + 1)}
                      >
                        Next →
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!toDelete}
        title="Delete Alert Rule"
        message={`Are you sure you want to delete "${toDelete?.name}"? This cannot be undone.`}
        onConfirm={handleDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  )
}
