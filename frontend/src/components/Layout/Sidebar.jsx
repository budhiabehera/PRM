import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, CalendarRange, ListChecks, Users, Gauge, CalendarClock,
  GanttChartSquare, FolderKanban, Boxes, UserCog, Tag, Settings, ClipboardList, ShieldCheck,
  Cloud, TrendingUp, AlertTriangle, Building2, Clock,
} from 'lucide-react'
import useAuthStore from '../../store/useAuthStore'

const OVERVIEW_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/sprint', label: 'Sprint View', icon: CalendarRange },
  { to: '/tasks', label: 'Tasks', icon: ListChecks },
  { to: '/team', label: 'Team', icon: Users },
  { to: '/utilization', label: 'Utilization', icon: Gauge },
  { to: '/availability', label: 'Availability', icon: CalendarClock },
  { to: '/timeline', label: 'Timeline', icon: GanttChartSquare },
]

// Each admin item declares which roles may see it.
const ADMIN_ITEMS = [
  { to: '/admin/projects', label: 'Projects', icon: FolderKanban, roles: ['Admin', 'Manager'] },
  { to: '/admin/modules', label: 'Modules', icon: Boxes, roles: ['Admin', 'Manager'] },
  { to: '/admin/resources', label: 'Resources', icon: UserCog, roles: ['Admin', 'Manager'] },
  { to: '/admin/work-types', label: 'Work Types', icon: Tag, roles: ['Admin', 'Manager'] },
  { to: '/admin/sprints', label: 'Sprints', icon: CalendarRange, roles: ['Admin', 'Manager'] },
  { to: '/admin/assignments', label: 'Assignments', icon: ClipboardList, roles: ['Admin', 'Manager', 'Lead'] },
  { to: '/admin/users', label: 'Users', icon: ShieldCheck, roles: ['Admin'] },
]

// Reports section — sits after Admin. Same visibility tier as Assignments.
const REPORT_ITEMS = [
  { to: '/reports/salesforce-tasks', label: 'Salesforce Tasks', icon: Cloud, roles: ['Admin', 'Manager', 'Lead'] },
  { to: '/reports/project-progress', label: 'Project Progress', icon: TrendingUp, roles: ['Admin', 'Manager', 'Lead'] },
  { to: '/reports/overdue-tasks', label: 'Overdue Tasks', icon: AlertTriangle, roles: ['Admin', 'Manager', 'Lead'] },
  { to: '/reports/customer-summary', label: 'Customer Summary', icon: Building2, roles: ['Admin', 'Manager', 'Lead'] },
  { to: '/reports/time-variance', label: 'Time Variance', icon: Clock, roles: ['Admin', 'Manager', 'Lead'] },
]

export default function Sidebar() {
  const role = useAuthStore((s) => s.user?.role)
  const visibleAdminItems = ADMIN_ITEMS.filter((item) => item.roles.includes(role))
  const visibleReportItems = REPORT_ITEMS.filter((item) => item.roles.includes(role))

  const linkClass = ({ isActive }) =>
    `flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium mb-0.5 transition-colors ${
      isActive ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`

  return (
    <aside className="fixed left-0 top-14 bottom-0 w-56 bg-white border-r border-slate-200 overflow-y-auto py-5 z-40">
      <div className="px-4 mb-5">
        <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-2 px-2">Overview</div>
        {OVERVIEW_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className={linkClass}>
            <Icon size={15} />
            {label}
          </NavLink>
        ))}
      </div>

      {visibleAdminItems.length > 0 && (
        <div className="px-4 mb-5">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-2 px-2">
            Admin — Configuration
          </div>
          {visibleAdminItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={linkClass}>
              <Icon size={15} />
              {label}
            </NavLink>
          ))}
        </div>
      )}

      {visibleReportItems.length > 0 && (
        <div className="px-4 mb-5">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-2 px-2">
            Reports
          </div>
          {visibleReportItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={linkClass}>
              <Icon size={15} />
              {label}
            </NavLink>
          ))}
        </div>
      )}

      <div className="px-4 mb-5">
        <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-2 px-2">System</div>
        <NavLink to="/admin/settings" className={linkClass}>
          <Settings size={15} />
          Settings
        </NavLink>
      </div>
    </aside>
  )
}
