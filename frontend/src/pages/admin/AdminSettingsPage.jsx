import { useEffect, useState } from 'react'
import { getIntegrationSettings, updateIntegrationSettings, testTeamsIntegration, testSalesforceIntegration } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null) // { type: 'success'|'error', text }

  useEffect(() => {
    getIntegrationSettings().then(setSettings).finally(() => setLoading(false))
  }, [])

  const update = (key, value) => setSettings((s) => ({ ...s, [key]: value }))

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const saved = await updateIntegrationSettings(settings)
      setSettings(saved)
      setMessage({ type: 'success', text: 'Integration settings saved.' })
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Could not save settings.' })
    } finally {
      setSaving(false)
    }
  }

  const handleTestTeams = async () => {
    setMessage(null)
    try {
      const res = await testTeamsIntegration()
      setMessage({ type: 'success', text: res.message })
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Teams test failed.' })
    }
  }

  const handleTestSalesforce = async () => {
    setMessage(null)
    try {
      const res = await testSalesforceIntegration()
      setMessage({ type: 'success', text: res.message })
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Salesforce test failed.' })
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900">Settings</h2>
        <p className="text-xs text-slate-500 mt-0.5">System configuration and integrations</p>
      </div>

      <div className="card">
        <div className="text-[15px] font-semibold mb-3.5">Application Info</div>
        <table className="data-table">
          <tbody>
            <tr><td className="font-medium w-48">Application</td><td>PRM — Project & Resource Management</td></tr>
            <tr><td className="font-medium">Version</td><td>1.1.0</td></tr>
            <tr><td className="font-medium">Frontend Stack</td><td>React 18 + Vite + TailwindCSS</td></tr>
            <tr><td className="font-medium">Backend Stack</td><td>Python (FastAPI) + SQLAlchemy</td></tr>
            <tr><td className="font-medium">Database</td><td>SQLite</td></tr>
            <tr><td className="font-medium">State Management</td><td>Zustand</td></tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="text-[15px] font-semibold mb-2">Capacity Assumptions</div>
        <ul className="text-sm text-slate-600 list-disc pl-5 space-y-1">
          <li>Lead / Manager base capacity: 96 hrs/month</li>
          <li>Full-time Developer base capacity: 192 hrs/month</li>
          <li>Working days per month (for leave proration): 22</li>
          <li>Utilization thresholds — Idle: 0%, Under: 1–59%, Healthy: 60–100%, Over: &gt;100%</li>
        </ul>
      </div>

      <div className="card">
        <div className="text-[15px] font-semibold mb-1">Integrations</div>
        <p className="text-xs text-slate-500 mb-4">
          Connect PRM to Microsoft Teams and Salesforce. Admin-only. See <code>docs/INTEGRATIONS.md</code> for
          step-by-step setup instructions for each.
        </p>

        {loading || !settings ? <LoadingSpinner /> : (
          <>
            {message && (
              <div className={`text-xs rounded-lg px-3 py-2 mb-4 ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
                {message.text}
              </div>
            )}

            {/* Microsoft Teams */}
            <div className="border border-slate-200 rounded-xl p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold text-sm">🟦 Microsoft Teams</div>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={settings.teams_enabled} onChange={(e) => update('teams_enabled', e.target.checked)} />
                  Enabled
                </label>
              </div>
              <div className="flex flex-col gap-1">
                <label className="form-label">Incoming Webhook / Workflow URL</label>
                <input
                  className="form-input"
                  placeholder="https://outlook.office.com/webhook/... or Power Automate workflow URL"
                  value={settings.teams_webhook_url || ''}
                  onChange={(e) => update('teams_webhook_url', e.target.value)}
                />
              </div>
              <button className="btn btn-secondary btn-sm mt-3" onClick={handleTestTeams}>Send Test Message</button>
            </div>

            {/* Salesforce */}
            <div className="border border-slate-200 rounded-xl p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold text-sm">☁️ Salesforce</div>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={settings.salesforce_enabled} onChange={(e) => update('salesforce_enabled', e.target.checked)} />
                  Enabled
                </label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="form-label">Login URL</label>
                  <select className="form-select" value={settings.salesforce_login_url} onChange={(e) => update('salesforce_login_url', e.target.value)}>
                    <option value="https://login.salesforce.com">Production / Developer (login.salesforce.com)</option>
                    <option value="https://test.salesforce.com">Sandbox (test.salesforce.com)</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="form-label">Consumer Key (Client ID)</label>
                  <input className="form-input" value={settings.salesforce_client_id || ''} onChange={(e) => update('salesforce_client_id', e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="form-label">Consumer Secret</label>
                  <input type="password" className="form-input" value={settings.salesforce_client_secret || ''} onChange={(e) => update('salesforce_client_secret', e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="form-label">Username</label>
                  <input className="form-input" value={settings.salesforce_username || ''} onChange={(e) => update('salesforce_username', e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="form-label">Password</label>
                  <input type="password" className="form-input" value={settings.salesforce_password || ''} onChange={(e) => update('salesforce_password', e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="form-label">Security Token</label>
                  <input type="password" className="form-input" value={settings.salesforce_security_token || ''} onChange={(e) => update('salesforce_security_token', e.target.value)} />
                </div>
              </div>
              <button className="btn btn-secondary btn-sm mt-3" onClick={handleTestSalesforce}>Test Connection</button>
            </div>

            {/* Azure Blob & Notification Settings */}
            <div className="border border-slate-200 rounded-lg p-5 mt-5">
              <h3 className="text-[15px] font-semibold text-slate-800 mb-4">☁️ Azure Blob & Notifications</h3>
              <div className="grid grid-cols-1 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="form-label">Azure Blob Connection String</label>
                  <input
                    className="form-input"
                    placeholder="DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...;EndpointSuffix=core.windows.net"
                    value={settings.azure_blob_connection_string || ''}
                    onChange={(e) => update('azure_blob_connection_string', e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="form-label">Task Link Base URL</label>
                  <input
                    className="form-input"
                    placeholder="http://localhost:5173/tasks/"
                    value={settings.task_link_base_url || ''}
                    onChange={(e) => update('task_link_base_url', e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="form-label">Company Logo URL</label>
                  <input
                    className="form-input"
                    placeholder="https://example.com/logo.png"
                    value={settings.company_logo_url || ''}
                    onChange={(e) => update('company_logo_url', e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* SMTP Email Settings */}
            <div className="border border-slate-200 rounded-lg p-5 mt-5">
              <h3 className="text-[15px] font-semibold text-slate-800 mb-4">📧 SMTP Email Settings</h3>
              <div className="flex items-center gap-2 mb-4">
                <input type="checkbox" checked={settings.smtp_enabled} onChange={(e) => update('smtp_enabled', e.target.checked)} />
                <span className="text-sm font-medium text-slate-700">Enable email notifications (welcome email on user creation)</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="form-label">SMTP Host</label>
                  <input className="form-input" placeholder="smtp.gmail.com" value={settings.smtp_host || ''}
                    onChange={(e) => update('smtp_host', e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="form-label">SMTP Port</label>
                  <input type="number" className="form-input" placeholder="587" value={settings.smtp_port || 587}
                    onChange={(e) => update('smtp_port', Number(e.target.value))} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="form-label">SMTP Username</label>
                  <input className="form-input" placeholder="your-email@gmail.com" value={settings.smtp_username || ''}
                    onChange={(e) => update('smtp_username', e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="form-label">SMTP Password</label>
                  <input type="password" className="form-input" placeholder="App password or SMTP password" value={settings.smtp_password || ''}
                    onChange={(e) => update('smtp_password', e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="form-label">From Email</label>
                  <input className="form-input" placeholder="noreply@company.com" value={settings.smtp_from_email || ''}
                    onChange={(e) => update('smtp_from_email', e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="form-label">From Name</label>
                  <input className="form-input" placeholder="PRM System" value={settings.smtp_from_name || ''}
                    onChange={(e) => update('smtp_from_name', e.target.value)} />
                </div>
                <div className="flex items-center gap-2 col-span-2">
                  <input type="checkbox" checked={settings.smtp_use_tls ?? true} onChange={(e) => update('smtp_use_tls', e.target.checked)} />
                  <span className="text-sm text-slate-600">Use TLS (recommended for port 587)</span>
                </div>
              </div>
            </div>

            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Integration Settings'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
