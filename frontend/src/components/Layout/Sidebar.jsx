import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, CalendarRange, ListChecks, Users, Gauge, CalendarClock,
  GanttChartSquare, FolderKanban, Boxes, UserCog, Tag, Settings, ClipboardList,
} from 'lucide-react'

const navSections = [
  {
    title: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/sprint', label: 'Sprint View', icon: CalendarRange },
      { to: '/tasks', label: 'Tasks', icon: ListChecks },
      { to: '/team', label: 'Team', icon: Users },
      { to: '/utilization', label: 'Utilization', icon: Gauge },
      { to: '/availability', label: 'Availability', icon: CalendarClock },
      { to: '/timeline', label: 'Timeline', icon: GanttChartSquare },
    ],
  },
  {
    title: 'Admin — Configuration',
    items: [
      { to: '/admin/projects', label: 'Projects', icon: FolderKanban },
      { to: '/admin/modules', label: 'Modules', icon: Boxes },
      { to: '/admin/resources', label: 'Resources', icon: UserCog },
      { to: '/admin/work-types', label: 'Work Types', icon: Tag },
      { to: '/admin/sprints', label: 'Sprints', icon: CalendarRange },
      { to: '/admin/assignments', label: 'Assignments', icon: ClipboardList },
    ],
  },
  {
    title: 'System',
    items: [
      { to: '/admin/settings', label: 'Settings', icon: Settings },
    ],
  },
]

export default function Sidebar() {
  return (
    <aside className="fixed left-0 top-14 bottom-0 w-56 bg-white border-r border-slate-200 overflow-y-auto py-5 z-40">
      {navSections.map((section) => (
        <div key={section.title} className="px-4 mb-5">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-2 px-2">
            {section.title}
          </div>
          {section.items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium mb-0.5 transition-colors ${
                  isActive ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <Icon size={15} />
              {label}
            </NavLink>
          ))}
        </div>
      ))}
    </aside>
  )
}
