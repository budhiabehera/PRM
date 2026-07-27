import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, CalendarRange, ListChecks, Users, Gauge, CalendarClock,
  GanttChartSquare, FolderKanban, Boxes, UserCog, UserPlus, Tag, Settings, ClipboardList, ShieldCheck,
  Cloud, TrendingUp, AlertTriangle, Building2, Clock, ChevronsLeft, ChevronsRight,
} from 'lucide-react'
import useAuthStore from '../../store/useAuthStore'
import useUIStore from '../../store/useUIStore'

// Full overview items — visible to Admin, Manager, Lead
const ALL_OVERVIEW_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/sprint', label: 'Sprint View', icon: CalendarRange },
  { to: '/tasks', label: 'Tasks', icon: ListChecks },
  { to: '/team', label: 'Team', icon: Users },
  { to: '/utilization', label: 'Utilization', icon: Gauge },
  { to: '/availability', label: 'Availability', icon: CalendarClock },
  { to: '/timeline', label: 'Timeline', icon: GanttChartSquare },
]

// Developer-only items — limited view
const DEVELOPER_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/tasks', label: 'My Tasks', icon: ListChecks },
  { to: '/utilization', label: 'Utilization', icon: Gauge },
  { to: '/availability', label: 'Availability', icon: CalendarClock },
]

// Each admin item declares which roles may see it.
const ADMIN_ITEMS = [
  { to: '/admin/projects', label: 'Projects', icon: FolderKanban, roles: ['Admin', 'Manager'] },
  { to: '/admin/modules', label: 'Modules', icon: Boxes, roles: ['Admin', 'Manager'] },
  { to: '/admin/resources', label: 'Resources', icon: UserCog, roles: ['Admin', 'Manager'] },
  { to: '/admin/developer-setup', label: 'Developer Setup', icon: UserPlus, roles: ['Admin', 'Manager'] },
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
  const { sidebarCollapsed, toggleSidebar } = useUIStore()

  const isDeveloper = role === 'Developer'
  const overviewItems = isDeveloper ? DEVELOPER_ITEMS : ALL_OVERVIEW_ITEMS
  const visibleAdminItems = ADMIN_ITEMS.filter((item) => item.roles.includes(role))
  const visibleReportItems = REPORT_ITEMS.filter((item) => item.roles.includes(role))

  const collapsed = sidebarCollapsed

  const linkClass = ({ isActive }) =>
    `flex items-center ${collapsed ? 'justify-center min-w-0' : 'gap-2.5'} px-3 py-2 rounded-lg text-[13px] font-medium mb-0.5 transition-colors ${
      isActive ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`

  return (
    <aside
      className={`fixed left-0 top-14 bottom-0 bg-white border-r border-slate-200 overflow-y-auto overflow-x-hidden py-5 z-40 transition-all duration-200 sidebar-scroll ${
        collapsed ? 'w-[72px]' : 'w-56'
      }`}
    >
      {/* Collapse/Expand Toggle */}
      <div className={`px-3 mb-4 flex ${collapsed ? 'justify-center' : 'justify-end'}`}>
        <button
          onClick={toggleSidebar}
          className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
        </button>
      </div>

      <div className={`${collapsed ? 'px-2' : 'px-3'} mb-5`}>
        {!collapsed && (
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-2 px-2">
            {isDeveloper ? 'My Work' : 'Overview'}
          </div>
        )}
        {overviewItems.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className={linkClass} title={collapsed ? label : undefined}>
            <Icon size={collapsed ? 18 : 15} className="flex-shrink-0" />
            {!collapsed && label}
          </NavLink>
        ))}
      </div>

      {visibleAdminItems.length > 0 && (
        <div className={`${collapsed ? 'px-2' : 'px-3'} mb-5`}>
          {!collapsed && (
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-2 px-2">
              Admin — Configuration
            </div>
          )}
          {collapsed && <div className="border-t border-slate-200 mb-2" />}
          {visibleAdminItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={linkClass} title={collapsed ? label : undefined}>
              <Icon size={collapsed ? 18 : 15} className="flex-shrink-0" />
              {!collapsed && label}
            </NavLink>
          ))}
        </div>
      )}

      {visibleReportItems.length > 0 && (
        <div className={`${collapsed ? 'px-2' : 'px-3'} mb-5`}>
          {!collapsed && (
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-2 px-2">
              Reports
            </div>
          )}
          {collapsed && <div className="border-t border-slate-200 mb-2" />}
          {visibleReportItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={linkClass} title={collapsed ? label : undefined}>
              <Icon size={collapsed ? 18 : 15} className="flex-shrink-0" />
              {!collapsed && label}
            </NavLink>
          ))}
        </div>
      )}

      {!isDeveloper && (
        <div className={`${collapsed ? 'px-2' : 'px-3'} mb-5`}>
          {!collapsed && (
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-2 px-2">System</div>
          )}
          {collapsed && <div className="border-t border-slate-200 mb-2" />}
          <NavLink to="/admin/settings" className={linkClass} title={collapsed ? 'Settings' : undefined}>
            <Settings size={collapsed ? 18 : 15} className="flex-shrink-0" />
            {!collapsed && 'Settings'}
          </NavLink>
        </div>
      )}
    </aside>
  )
}
