export default function AdminSettingsPage() {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900">Settings</h2>
        <p className="text-xs text-slate-500 mt-0.5">System configuration and preferences</p>
      </div>

      <div className="card">
        <div className="text-[15px] font-semibold mb-3.5">Application Info</div>
        <table className="data-table">
          <tbody>
            <tr><td className="font-medium w-48">Application</td><td>FX Resource & Sprint Dashboard</td></tr>
            <tr><td className="font-medium">Version</td><td>1.0.0</td></tr>
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
    </div>
  )
}
