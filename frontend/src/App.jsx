import { Routes, Route } from 'react-router-dom'
import { Navigate } from 'react-router-dom'
import useAuthStore from './store/useAuthStore'
import Layout from './components/Layout/Layout'
import ProtectedRoute from './components/Layout/ProtectedRoute'
import LoginPage from './pages/LoginPage'

import DashboardPage from './pages/DashboardPage'
import ChangePasswordPage from './pages/ChangePasswordPage'
import SprintPage from './pages/SprintPage'
import TasksPage from './pages/TasksPage'
import MyDashboardPage from './pages/MyDashboardPage'
import ResourceCalendarPage from './pages/ResourceCalendarPage'
import TeamPage from './pages/TeamPage'
import UtilizationPage from './pages/UtilizationPage'
import AvailabilityPage from './pages/AvailabilityPage'
import TimelinePage from './pages/TimelinePage'
import TimeLogPage from './pages/TimeLogPage'

import AdminProjectsPage from './pages/admin/AdminProjectsPage'
import AdminModulesPage from './pages/admin/AdminModulesPage'
import UserSetupPage from './pages/admin/UserSetupPage'
import SkillSetupPage from './pages/admin/SkillSetupPage'
import AdminWorkTypesPage from './pages/admin/AdminWorkTypesPage'
import AdminSprintsPage from './pages/admin/AdminSprintsPage'
import AdminTasksPage from './pages/admin/AdminTasksPage'
import RoleCapacityPage from './pages/admin/RoleCapacityPage'
import TaskStatusPage from './pages/admin/TaskStatusPage'
import PageAccessPage from './pages/admin/PageAccessPage'
import AdminAvailabilityPage from './pages/admin/AdminAvailabilityPage'
import AdminSettingsPage from './pages/admin/AdminSettingsPage'
import AuditLogPage from './pages/admin/AuditLogPage'

import HolidaysPage from './pages/HolidaysPage'
import SalesforceTasksReportPage from './pages/reports/SalesforceTasksReportPage'
import ProjectProgressPage from './pages/reports/ProjectProgressPage'
import OverdueTasksPage from './pages/reports/OverdueTasksPage'
import CustomerSummaryPage from './pages/reports/CustomerSummaryPage'
import TimeVariancePage from './pages/reports/TimeVariancePage'

import KnowledgeBasePage from './pages/KnowledgeBasePage'
import StandupPage from './pages/StandupPage'
import UserSettingsPage from './pages/UserSettingsPage'
const ADMIN_MANAGER = ['Admin', 'Manager']
const ADMIN_MANAGER_LEAD = ['Admin', 'Manager', 'Lead']
const NON_DEVELOPER = ['Admin', 'Manager', 'Lead']

// Dashboard: hide from Developer role — redirect to My Dashboard
function DashboardOrRedirect() {
  const user = useAuthStore((s) => s.user)
  if (user?.role === 'Developer') {
    return <Navigate to="/my-dashboard" replace />
  }
  return <DashboardPage />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          {/* Available to all roles (Developer sees own data only) */}
          <Route path="/my-dashboard" element={<MyDashboardPage />} />
          <Route path="/" element={<DashboardOrRedirect />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/utilization" element={<UtilizationPage />} />
          <Route path="/availability" element={<AvailabilityPage />} />
          <Route path="/resource-calendar" element={<ResourceCalendarPage />} />
          <Route path="/holidays" element={<HolidaysPage />} />
          <Route path="/time-logs" element={<TimeLogPage />} />
          <Route path="/standup" element={<StandupPage />} />

          <Route path="/change-password" element={<ChangePasswordPage />} />
          <Route path="/knowledge-base" element={<KnowledgeBasePage />} />
          <Route path="/settings" element={<UserSettingsPage />} />

          {/* Not available to Developer role */}
          <Route element={<ProtectedRoute allowedRoles={NON_DEVELOPER} />}>
            <Route path="/sprint" element={<SprintPage />} />
            <Route path="/team" element={<TeamPage />} />
            <Route path="/timeline" element={<TimelinePage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={ADMIN_MANAGER} />}>
            <Route path="/admin/projects" element={<AdminProjectsPage />} />
            <Route path="/admin/modules" element={<AdminModulesPage />} />
            <Route path="/admin/user-setup" element={<UserSetupPage />} />
            <Route path="/admin/skills" element={<SkillSetupPage />} />
            <Route path="/admin/work-types" element={<AdminWorkTypesPage />} />
            <Route path="/admin/sprints" element={<AdminSprintsPage />} />
            <Route path="/admin/role-capacity" element={<RoleCapacityPage />} />
            <Route path="/admin/task-statuses" element={<TaskStatusPage />} />
            <Route path="/admin/page-access" element={<PageAccessPage />} />
            <Route path="/admin/audit-log" element={<AuditLogPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={ADMIN_MANAGER_LEAD} />}>
            <Route path="/admin/assignments" element={<AdminTasksPage />} />

            <Route path="/reports/salesforce-tasks" element={<SalesforceTasksReportPage />} />
            <Route path="/reports/project-progress" element={<ProjectProgressPage />} />
            <Route path="/reports/overdue-tasks" element={<OverdueTasksPage />} />
            <Route path="/reports/customer-summary" element={<CustomerSummaryPage />} />
            <Route path="/reports/time-variance" element={<TimeVariancePage />} />
          </Route>

          <Route path="/admin/availability" element={<AdminAvailabilityPage />} />
          <Route element={<ProtectedRoute allowedRoles={NON_DEVELOPER} />}>
            <Route path="/admin/settings" element={<AdminSettingsPage />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  )
}
