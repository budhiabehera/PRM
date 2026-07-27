const ROLE_COLORS = {
  Admin: 'bg-red-100 text-red-700',
  Manager: 'bg-purple-100 text-purple-700',
  'Lead - Manager': 'bg-fuchsia-100 text-fuchsia-700',
  Lead: 'bg-blue-100 text-blue-700',
  Developer: 'bg-slate-100 text-slate-600',
}

export default function RoleBadge({ role }) {
  const cls = ROLE_COLORS[role] || 'bg-slate-100 text-slate-600'
  return <span className={`badge ${cls}`}>{role}</span>
}
