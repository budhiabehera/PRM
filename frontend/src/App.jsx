import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout/Layout'
import ProtectedRoute from './components/Layout/ProtectedRoute'
import LoginPage from './pages/LoginPage'

import DashboardPage from './pages/DashboardPage'
import SprintPage from './pages/SprintPage'
import TasksPage from './pages/TasksPage'
import TeamPage from './pages/TeamPage'
import UtilizationPage from './pages/UtilizationPage'
import AvailabilityPage from './pages/AvailabilityPage'
import TimelinePage from './pages/TimelinePage'

import AdminProjectsPage from './pages/admin/AdminProjectsPage'
import AdminModulesPage from './pages/admin/AdminModulesPage'
import AdminResourcesPage from './pages/admin/AdminResourcesPage'
import AdminWorkTypesPage from './pages/admin/AdminWorkTypesPage'
import AdminSprintsPage from './pages/admin/AdminSprintsPage'
import AdminTasksPage from './pages/admin/AdminTasksPage'
import AdminAvailabilityPage from './pages/admin/AdminAvailabilityPage'
import AdminSettingsPage from './pages/admin/AdminSettingsPage'
import AdminUsersPage from './pages/admin/AdminUsersPage'

import SalesforceTasksReportPage from './pages/reports/SalesforceTasksReportPage'
import ProjectProgressPage from './pages/reports/ProjectProgressPage'
import OverdueTasksPage from './pages/reports/OverdueTasksPage'
import CustomerSummaryPage from './pages/reports/CustomerSummaryPage'
import TimeVariancePage from './pages/reports/TimeVariancePage'

const ADMIN_MANAGER = ['Admin', 'Manager']
const ADMIN_MANAGER_LEAD = ['Admin', 'Manager', 'Lead']
const NON_DEVELOPER = ['Admin', 'Manager', 'Lead']

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          {/* Available to all roles (Developer sees own data only) */}
          <Route path="/" element={<DashboardPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/utilization" element={<UtilizationPage />} />
          <Route path="/availability" element={<AvailabilityPage />} />

          {/* Not available to Developer role */}
          <Route element={<ProtectedRoute allowedRoles={NON_DEVELOPER} />}>
            <Route path="/sprint" element={<SprintPage />} />
            <Route path="/team" element={<TeamPage />} />
            <Route path="/timeline" element={<TimelinePage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={ADMIN_MANAGER} />}>
            <Route path="/admin/projects" element={<AdminProjectsPage />} />
            <Route path="/admin/modules" element={<AdminModulesPage />} />
            <Route path="/admin/resources" element={<AdminResourcesPage />} />
            <Route path="/admin/work-types" element={<AdminWorkTypesPage />} />
            <Route path="/admin/sprints" element={<AdminSprintsPage />} />
            <Route path="/admin/users" element={<AdminUsersPage />} />
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
