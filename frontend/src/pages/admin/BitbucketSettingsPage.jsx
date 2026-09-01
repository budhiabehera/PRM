import { useEffect, useState } from 'react'
import {
  getBitbucketSettings,
  updateBitbucketSettings,
  testBitbucketConnection,
  syncRepository,
  syncAllRepos,
  syncRepoPRs,
  syncAllPRs,
  syncRepoReleases,
  syncAllReleases,
  getLinkedRepositories,
  getAvailableRepositories,
  linkRepository,
  unlinkRepository,
  getRepoBranches,
  updateRepository,
  getBranchesBySlug,
} from '../../services/api'
import useDropdowns from '../../hooks/useDropdowns'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import ConfirmDialog from '../../components/common/ConfirmDialog'

export default function BitbucketSettingsPage() {
  // --- Connection Settings state ---
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncingAll, setSyncingAll] = useState(false)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState(null) // { type: 'success'|'error', text }
  const [syncingAllPRs, setSyncingAllPRs] = useState(false)
  const [syncingPRRepoId, setSyncingPRRepoId] = useState(null)
  const [syncingAllReleases, setSyncingAllReleases] = useState(false)
  const [syncingReleaseRepoId, setSyncingReleaseRepoId] = useState(null)

  // --- Linked Repos state ---
  const [repos, setRepos] = useState([])
  const [reposLoading, setReposLoading] = useState(true)
  const [availableRepos, setAvailableRepos] = useState([])
  const [showLinkForm, setShowLinkForm] = useState(false)
  const [linkData, setLinkData] = useState({ repo_slug: '', repo_name: '', repo_full_name: '', language: '', project_id: '', default_branch: 'main' })
  const [linking, setLinking] = useState(false)
  const [syncingRepoId, setSyncingRepoId] = useState(null)
  const [toUnlink, setToUnlink] = useState(null)

  // Branch editing
  const [editingBranchRepoId, setEditingBranchRepoId] = useState(null)
  const [branchOptions, setBranchOptions] = useState([])
  const [linkBranches, setLinkBranches] = useState([])
  const [loadingBranches, setLoadingBranches] = useState(false)

  const { projects } = useDropdowns()

  // --- Load data ---
  useEffect(() => {
    getBitbucketSettings()
      .then(setSettings)
      .catch(() => setSettings({
        platform: 'cloud',
        workspace_slug: '',
        base_url: '',
        auth_type: 'api_token',
        auth_username: '',
        auth_token: '',
        webhook_secret: '',
        sync_enabled: false,
        sync_interval: 30,
      }))
      .finally(() => setLoading(false))
  }, [])

  const loadRepos = () => {
    setReposLoading(true)
    getLinkedRepositories()
      .then(setRepos)
      .catch(() => setRepos([]))
      .finally(() => setReposLoading(false))
  }

  useEffect(() => { loadRepos() }, [])

  // --- Handlers ---
  const update = (key, value) => setSettings((s) => ({ ...s, [key]: value }))

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const saved = await updateBitbucketSettings(settings)
      setSettings(saved)
      setMessage({ type: 'success', text: 'Bitbucket settings saved.' })
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Could not save settings.' })
    } finally {
      setSaving(false)
    }
  }

  const handleTestConnection = async () => {
    setTesting(true)
    setMessage(null)
    try {
      // Auto-save before testing so the backend has the latest config
      await updateBitbucketSettings(settings)
      const res = await testBitbucketConnection()
      setMessage({ type: 'success', text: res.message || 'Connection successful!' })
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Connection test failed.' })
    } finally {
      setTesting(false)
    }
  }

  const handleOpenLinkForm = async () => {
    setShowLinkForm(true)
    setLinkData({ repo_slug: '', repo_name: '', repo_full_name: '', language: '', project_id: '' })
    try {
      const available = await getAvailableRepositories()
      setAvailableRepos(available)
    } catch {
      setAvailableRepos([])
    }
  }

  const handleLinkRepo = async () => {
    if (!linkData.repo_slug || !linkData.project_id) return
    setLinking(true)
    setMessage(null)
    try {
      await linkRepository(linkData)
      setShowLinkForm(false)
      setLinkData({ repo_slug: '', repo_name: '', repo_full_name: '', language: '', project_id: '' })
      loadRepos()
      setMessage({ type: 'success', text: 'Repository linked successfully.' })
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to link repository.' })
    } finally {
      setLinking(false)
    }
  }

  const handleUnlink = async () => {
    if (!toUnlink) return
    setMessage(null)
    try {
      await unlinkRepository(toUnlink.id)
      setToUnlink(null)
      loadRepos()
      setMessage({ type: 'success', text: 'Repository unlinked.' })
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to unlink repository.' })
    }
  }

  const handleSyncRepo = async (repo) => {
    setSyncingRepoId(repo.id)
    setMessage(null)
    try {
      const res = await syncRepository(repo.id)
      loadRepos()
      setMessage({
        type: 'success',
        text: `Synced "${repo.repo_name || repo.repo_slug}" — ${res.new ?? 0} new commits, ${res.skipped ?? 0} skipped, ${res.linked_tasks ?? 0} tasks linked.`,
      })
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || `Failed to sync "${repo.repo_name || repo.repo_slug}".` })
    } finally {
      setSyncingRepoId(null)
    }
  }

  const handleSyncAll = async () => {
    setSyncingAll(true)
    setMessage(null)
    try {
      const res = await syncAllRepos()
      const totalNew = Array.isArray(res) ? res.reduce((s, r) => s + (r.new || 0), 0) : (res.new || 0)
      const totalLinked = Array.isArray(res) ? res.reduce((s, r) => s + (r.linked_tasks || 0), 0) : (res.linked_tasks || 0)
      loadRepos()
      setMessage({ type: 'success', text: `Sync complete — ${totalNew} new commits, ${totalLinked} tasks linked.` })
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to sync all repositories.' })
    } finally {
      setSyncingAll(false)
    }
  }

  const handleSyncRepoPRs = async (repo) => {
    setSyncingPRRepoId(repo.id)
    setMessage(null)
    try {
      const res = await syncRepoPRs(repo.id)
      loadRepos()
      setMessage({
        type: 'success',
        text: `PR sync "${repo.repo_name || repo.repo_slug}" — ${res.new ?? 0} new, ${res.updated ?? 0} updated.`,
      })
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || `Failed to sync PRs for "${repo.repo_name || repo.repo_slug}".` })
    } finally {
      setSyncingPRRepoId(null)
    }
  }

  const handleSyncAllPRs = async () => {
    setSyncingAllPRs(true)
    setMessage(null)
    try {
      const res = await syncAllPRs()
      const totalNew = Array.isArray(res) ? res.reduce((s, r) => s + (r.new || 0), 0) : (res.new || 0)
      const totalUpdated = Array.isArray(res) ? res.reduce((s, r) => s + (r.updated || 0), 0) : (res.updated || 0)
      loadRepos()
      setMessage({ type: 'success', text: `PR sync complete — ${totalNew} new PRs, ${totalUpdated} updated.` })
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to sync all PRs.' })
    } finally {
      setSyncingAllPRs(false)
    }
  }

  const handleSyncRepoReleases = async (repo) => {
    setSyncingReleaseRepoId(repo.id)
    setMessage(null)
    try {
      const res = await syncRepoReleases(repo.id)
      loadRepos()
      setMessage({
        type: 'success',
        text: `Release sync "${repo.repo_name || repo.repo_slug}" — ${res.new ?? 0} new, ${res.skipped ?? 0} skipped.`,
      })
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || `Failed to sync releases for "${repo.repo_name || repo.repo_slug}".` })
    } finally {
      setSyncingReleaseRepoId(null)
    }
  }

  const handleSyncAllReleases = async () => {
    setSyncingAllReleases(true)
    setMessage(null)
    try {
      const res = await syncAllReleases()
      const totalNew = Object.values(res).reduce((s, r) => s + (r.new || 0), 0)
      loadRepos()
      setMessage({ type: 'success', text: `Release sync complete — ${totalNew} new releases synced.` })
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to sync all releases.' })
    } finally {
      setSyncingAllReleases(false)
    }
  }

  const handleEditBranch = async (repo) => {
    setEditingBranchRepoId(repo.id)
    setBranchOptions([])
    try {
      const res = await getRepoBranches(repo.id)
      setBranchOptions(res.branches || [])
    } catch {
      // Fallback: just let user type
      setBranchOptions([])
    }
  }

  const handleBranchChange = async (repoId, branch) => {
    try {
      await updateRepository(repoId, { default_branch: branch })
      setEditingBranchRepoId(null)
      loadRepos()
      setMessage({ type: 'success', text: `Branch updated to "${branch}".` })
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to update branch.' })
    }
  }

  if (loading) return <LoadingSpinner label="Loading Bitbucket settings..." />

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900">Bitbucket Settings</h2>
        <p className="text-xs text-slate-500 mt-0.5">Configure Bitbucket integration and manage linked repositories</p>
      </div>

      {/* Toast / message */}
      {message && (
        <div className={`text-xs rounded-lg px-3 py-2 mb-4 ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
          {message.text}
        </div>
      )}

      {/* ── Connection Settings ── */}
      <div className="card">
        <div className="text-[15px] font-semibold mb-4">Connection Settings</div>

        <div className="grid grid-cols-2 gap-4">
          {/* Platform */}
          <div className="flex flex-col gap-1">
            <label className="form-label">Platform</label>
            <select className="form-select" value={settings.platform || 'cloud'} onChange={(e) => update('platform', e.target.value)}>
              <option value="cloud">Bitbucket Cloud</option>
              <option value="server">Bitbucket Server / Data Center</option>
            </select>
          </div>

          {/* Workspace Slug (Cloud only) */}
          {settings.platform === 'cloud' && (
            <div className="flex flex-col gap-1">
              <label className="form-label">Workspace Slug</label>
              <input className="form-input" placeholder="my-workspace" value={settings.workspace_slug || ''} onChange={(e) => update('workspace_slug', e.target.value)} />
            </div>
          )}

          {/* Base URL (Server only) */}
          {settings.platform === 'server' && (
            <div className="flex flex-col gap-1">
              <label className="form-label">Base URL</label>
              <input className="form-input" placeholder="https://bitbucket.mycompany.com" value={settings.base_url || ''} onChange={(e) => update('base_url', e.target.value)} />
            </div>
          )}

          {/* Auth Type */}
          <div className="flex flex-col gap-1">
            <label className="form-label">Auth Type</label>
            <select className="form-select" value={settings.auth_type || 'api_token'} onChange={(e) => update('auth_type', e.target.value)}>
              <option value="api_token">API Token (Recommended)</option>
              <option value="app_password">App Password (Deprecated Jul 2026)</option>
              <option value="pat">Personal Access Token (Server)</option>
            </select>
          </div>

          {/* Username */}
          <div className="flex flex-col gap-1">
            <label className="form-label">Username</label>
            <input className="form-input" placeholder="bitbucket-username" value={settings.auth_username || ''} onChange={(e) => update('auth_username', e.target.value)} />
          </div>

          {/* Token / Password */}
          <div className="flex flex-col gap-1">
            <label className="form-label">{settings.auth_type === 'api_token' ? 'API Token' : settings.auth_type === 'pat' ? 'Personal Access Token' : 'App Password'}</label>
            <input type="password" className="form-input" placeholder="••••••••" value={settings.auth_token || ''} onChange={(e) => update('auth_token', e.target.value)} />
          </div>

          {/* Webhook Secret */}
          <div className="flex flex-col gap-1">
            <label className="form-label">Webhook Secret <span className="text-slate-400 font-normal">(optional)</span></label>
            <input type="password" className="form-input" placeholder="Optional shared secret" value={settings.webhook_secret || ''} onChange={(e) => update('webhook_secret', e.target.value)} />
          </div>
        </div>

        {/* Auto-sync */}
        <div className="flex items-center gap-3 mt-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={settings.sync_enabled || false} onChange={(e) => update('sync_enabled', e.target.checked)} />
            Auto-sync repositories
          </label>
          {settings.sync_enabled && (
            <div className="flex items-center gap-1.5 text-sm">
              <span className="text-slate-500">every</span>
              <input
                type="number"
                className="form-input w-20"
                min={5}
                value={settings.sync_interval || 30}
                onChange={(e) => update('sync_interval', Number(e.target.value))}
              />
              <span className="text-slate-500">minutes</span>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 mt-5">
          <button className="btn btn-secondary" onClick={handleTestConnection} disabled={testing}>
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* ── Linked Repositories ── */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="text-[15px] font-semibold">Linked Repositories</div>
          <div className="flex items-center gap-2">
            <button className="btn btn-secondary btn-sm" onClick={handleSyncAll} disabled={syncingAll}>
              {syncingAll ? '⏳ Syncing All...' : '🔄 Sync All'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={handleSyncAllPRs} disabled={syncingAllPRs}>
              {syncingAllPRs ? '⏳ Syncing PRs...' : '🔄 Sync All PRs'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={handleSyncAllReleases} disabled={syncingAllReleases}>
              {syncingAllReleases ? '⏳ Syncing Releases...' : '🔄 Sync All Releases'}
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleOpenLinkForm}>+ Link Repository</button>
          </div>
        </div>

        {/* Link form (inline) */}
        {showLinkForm && (
          <div className="border border-slate-200 rounded-xl p-4 mb-4">
            <div className="text-sm font-semibold mb-3">Link a Repository</div>
            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col gap-1">
                <label className="form-label">Repository</label>
                <select
                  className="form-select"
                  value={linkData.repo_slug}
                  onChange={(e) => {
                    const slug = e.target.value
                    const repo = availableRepos.find((r) => (r.slug || r.full_name) === slug)
                    setLinkData((d) => ({
                      ...d,
                      repo_slug: slug,
                      repo_name: repo?.name || repo?.slug || slug,
                      repo_full_name: repo?.full_name || '',
                      language: repo?.language || '',
                      default_branch: 'main',
                    }))
                    // Fetch branches for selected repo
                    if (slug) {
                      setLoadingBranches(true)
                      setLinkBranches([])
                      getBranchesBySlug(slug)
                        .then((res) => setLinkBranches(res.branches || []))
                        .catch(() => setLinkBranches([]))
                        .finally(() => setLoadingBranches(false))
                    } else {
                      setLinkBranches([])
                    }
                  }}
                >
                  <option value="">— Select repository —</option>
                  {availableRepos.map((r) => (
                    <option key={r.slug || r.id} value={r.slug || r.full_name}>{r.full_name || r.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="form-label">Project</label>
                <select
                  className="form-select"
                  value={linkData.project_id}
                  onChange={(e) => setLinkData((d) => ({ ...d, project_id: e.target.value }))}
                >
                  <option value="">— Select project —</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="form-label">Branch</label>
                <select
                  className="form-select"
                  value={linkData.default_branch}
                  onChange={(e) => setLinkData((d) => ({ ...d, default_branch: e.target.value }))}
                  disabled={!linkData.repo_slug || loadingBranches}
                >
                  {loadingBranches ? (
                    <option value="main">Loading branches...</option>
                  ) : linkBranches.length > 0 ? (
                    linkBranches.map((b) => <option key={b} value={b}>{b}</option>)
                  ) : (
                    <option value="main">main</option>
                  )}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button className="btn btn-primary btn-sm" onClick={handleLinkRepo} disabled={linking || !linkData.repo_slug || !linkData.project_id}>
                {linking ? 'Linking...' : 'Link'}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowLinkForm(false)}>Cancel</button>
            </div>
          </div>
        )}

        {reposLoading ? (
          <LoadingSpinner label="Loading repositories..." />
        ) : repos.length === 0 ? (
          <p className="text-sm text-slate-500">No repositories linked yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Repository</th>
                <th>Project</th>
                <th>Default Branch</th>
                <th>Last Synced</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {repos.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium">{r.repo_name || r.repo_slug || `Repo #${r.id}`}</td>
                  <td>{r.project_name}</td>
                  <td>
                    {editingBranchRepoId === r.id ? (
                      <div className="flex items-center gap-1">
                        <select
                          className="form-select text-xs py-1"
                          defaultValue={r.default_branch || 'main'}
                          onChange={(e) => handleBranchChange(r.id, e.target.value)}
                        >
                          {branchOptions.length > 0 ? (
                            branchOptions.map((b) => <option key={b} value={b}>{b}</option>)
                          ) : (
                            <option value={r.default_branch || 'main'}>{r.default_branch || 'main'}</option>
                          )}
                        </select>
                        <button className="text-xs text-slate-400 hover:text-slate-600" onClick={() => setEditingBranchRepoId(null)}>✕</button>
                      </div>
                    ) : (
                      <button
                        className="text-indigo-600 hover:text-indigo-800 hover:underline text-left"
                        onClick={() => handleEditBranch(r)}
                      >
                        {r.default_branch || 'main'}
                      </button>
                    )}
                  </td>
                  <td>{r.last_synced_at ? new Date(r.last_synced_at).toLocaleString() : '—'}</td>
                  <td>
                    <div className="flex gap-1.5">
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleSyncRepo(r)}
                        disabled={syncingRepoId === r.id}
                      >
                        {syncingRepoId === r.id ? 'Syncing...' : 'Sync'}
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleSyncRepoPRs(r)}
                        disabled={syncingPRRepoId === r.id}
                      >
                        {syncingPRRepoId === r.id ? 'Syncing PRs...' : 'Sync PRs'}
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleSyncRepoReleases(r)}
                        disabled={syncingReleaseRepoId === r.id}
                      >
                        {syncingReleaseRepoId === r.id ? 'Syncing Releases...' : 'Sync Releases'}
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => setToUnlink(r)}>Unlink</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmDialog
        open={!!toUnlink}
        message={`Unlink repository "${toUnlink?.repo_name || toUnlink?.repo_slug}"? This will remove the link but won't delete any data.`}
        onConfirm={handleUnlink}
        onCancel={() => setToUnlink(null)}
      />
    </div>
  )
}
