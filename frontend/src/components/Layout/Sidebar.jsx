import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, CalendarRange, ListChecks, Users, Gauge, CalendarClock,
  GanttChartSquare, FolderKanban, Boxes, UserPlus, Tag, Settings, ClipboardList, Wrench, CalendarDays, ShieldCheck, CalendarCheck2,
  Cloud, TrendingUp, AlertTriangle, Building2, Clock, ChevronsLeft, ChevronsRight,
  ChevronDown, ChevronRight,
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
  { to: '/holidays', label: 'Holidays', icon: CalendarDays },
  { to: '/resource-calendar', label: 'Resource Calendar', icon: CalendarCheck2 },
  { to: '/timeline', label: 'Timeline', icon: GanttChartSquare },
]

// Developer-only items — limited view
const DEVELOPER_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/tasks', label: 'My Tasks', icon: ListChecks },
  { to: '/utilization', label: 'Utilization', icon: Gauge },
  { to: '/availability', label: 'Availability', icon: CalendarClock },
  { to: '/holidays', label: 'Holidays', icon: CalendarDays },
  { to: '/resource-calendar', label: 'Resource Calendar', icon: CalendarCheck2 },
]

// Each admin item declares which roles may see it.
const ADMIN_ITEMS = [
  { to: '/admin/projects', label: 'Projects', icon: FolderKanban, roles: ['Admin', 'Manager'] },
  { to: '/admin/modules', label: 'Modules', icon: Boxes, roles: ['Admin', 'Manager'] },
  { to: '/admin/user-setup', label: 'User Setup', icon: UserPlus, roles: ['Admin', 'Manager'] },
  { to: '/admin/skills', label: 'Skills', icon: Wrench, roles: ['Admin', 'Manager'] },
  { to: '/admin/work-types', label: 'Work Types', icon: Tag, roles: ['Admin', 'Manager'] },
  { to: '/admin/sprints', label: 'Sprints', icon: CalendarRange, roles: ['Admin', 'Manager'] },
  { to: '/admin/role-capacity', label: 'Role Capacity', icon: ShieldCheck, roles: ['Admin', 'Manager'] },
  { to: '/admin/assignments', label: 'Assignments', icon: ClipboardList, roles: ['Admin', 'Manager', 'Lead'] },
]

// Integration section
const INTEGRATION_ITEMS = [
  { to: '/reports/salesforce-tasks', label: 'Salesforce Tasks', icon: Cloud, roles: ['Admin', 'Manager', 'Lead'] },
]

// Reports section
const REPORT_ITEMS = [
  { to: '/reports/project-progress', label: 'Project Progress', icon: TrendingUp, roles: ['Admin', 'Manager', 'Lead'] },
  { to: '/reports/overdue-tasks', label: 'Overdue Tasks', icon: AlertTriangle, roles: ['Admin', 'Manager', 'Lead'] },
  { to: '/reports/customer-summary', label: 'Customer Summary', icon: Building2, roles: ['Admin', 'Manager', 'Lead'] },
  { to: '/reports/time-variance', label: 'Time Variance', icon: Clock, roles: ['Admin', 'Manager', 'Lead'] },
]

export default function Sidebar() {
  const role = useAuthStore((s) => s.user?.role)
  const { sidebarCollapsed, toggleSidebar } = useUIStore()
  const location = useLocation()

  const isDeveloper = role === 'Developer'
  const overviewItems = isDeveloper ? DEVELOPER_ITEMS : ALL_OVERVIEW_ITEMS
  const visibleAdminItems = ADMIN_ITEMS.filter((item) => item.roles.includes(role))
  const visibleIntegrationItems = INTEGRATION_ITEMS.filter((item) => item.roles.includes(role))
  const visibleReportItems = REPORT_ITEMS.filter((item) => item.roles.includes(role))

  // Auto-expand sections if current route is within them
  const isAdminActive = visibleAdminItems.some((item) => location.pathname === item.to || location.pathname.startsWith(item.to + '/'))
  const isIntegrationActive = visibleIntegrationItems.some((item) => location.pathname === item.to)
  const isReportActive = visibleReportItems.some((item) => location.pathname === item.to)

  const [sections, setSections] = useState({
    admin: true,
    integration: true,
    reports: true,
  })

  const toggleSection = (key) => setSections((s) => ({ ...s, [key]: !s[key] }))

  const collapsed = sidebarCollapsed

  const linkClass = ({ isActive }) =>
    `flex items-center ${collapsed ? 'justify-center min-w-0' : 'gap-2.5'} px-3 py-2 rounded-lg text-[13px] font-medium mb-0.5 transition-colors ${
      isActive ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`

  // Section header component
  const SectionHeader = ({ label, sectionKey, isActive }) => {
    const isOpen = sections[sectionKey]
    return (
      <button
        onClick={() => toggleSection(sectionKey)}
        className={`flex items-center justify-between w-full px-2 mb-1.5 group cursor-pointer ${
          isActive && !isOpen ? 'opacity-100' : ''
        }`}
      >
        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold group-hover:text-slate-600 transition-colors">
          {label}
        </span>
        {isOpen
          ? <ChevronDown size={12} className="text-slate-400 group-hover:text-slate-600" />
          : <ChevronRight size={12} className="text-slate-400 group-hover:text-slate-600" />
        }
      </button>
    )
  }

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

      {/* Overview — always expanded */}
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

      {/* Admin — Configuration (collapsible) */}
      {visibleAdminItems.length > 0 && (
        <div className={`${collapsed ? 'px-2' : 'px-3'} mb-5`}>
          {!collapsed && <SectionHeader label="Admin — Configuration" sectionKey="admin" isActive={isAdminActive} />}
          {collapsed && <div className="border-t border-slate-200 mb-2" />}
          {(collapsed || sections.admin) && visibleAdminItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={linkClass} title={collapsed ? label : undefined}>
              <Icon size={collapsed ? 18 : 15} className="flex-shrink-0" />
              {!collapsed && label}
            </NavLink>
          ))}
        </div>
      )}

      {/* Integration (collapsible) */}
      {visibleIntegrationItems.length > 0 && (
        <div className={`${collapsed ? 'px-2' : 'px-3'} mb-5`}>
          {!collapsed && <SectionHeader label="Integration" sectionKey="integration" isActive={isIntegrationActive} />}
          {collapsed && <div className="border-t border-slate-200 mb-2" />}
          {(collapsed || sections.integration) && visibleIntegrationItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={linkClass} title={collapsed ? label : undefined}>
              <Icon size={collapsed ? 18 : 15} className="flex-shrink-0" />
              {!collapsed && label}
            </NavLink>
          ))}
        </div>
      )}

      {/* Reports (collapsible) */}
      {visibleReportItems.length > 0 && (
        <div className={`${collapsed ? 'px-2' : 'px-3'} mb-5`}>
          {!collapsed && <SectionHeader label="Reports" sectionKey="reports" isActive={isReportActive} />}
          {collapsed && <div className="border-t border-slate-200 mb-2" />}
          {(collapsed || sections.reports) && visibleReportItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={linkClass} title={collapsed ? label : undefined}>
              <Icon size={collapsed ? 18 : 15} className="flex-shrink-0" />
              {!collapsed && label}
            </NavLink>
          ))}
        </div>
      )}

      {/* System — Settings */}
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
