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
import AdminSalesforceTasksPage from './pages/admin/AdminSalesforceTasksPage'
import AdminAvailabilityPage from './pages/admin/AdminAvailabilityPage'
import AdminSettingsPage from './pages/admin/AdminSettingsPage'
import AdminUsersPage from './pages/admin/AdminUsersPage'

const ADMIN_MANAGER = ['Admin', 'Manager']

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/sprint" element={<SprintPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/team" element={<TeamPage />} />
          <Route path="/utilization" element={<UtilizationPage />} />
          <Route path="/availability" element={<AvailabilityPage />} />
          <Route path="/timeline" element={<TimelinePage />} />

          <Route element={<ProtectedRoute allowedRoles={ADMIN_MANAGER} />}>
            <Route path="/admin/projects" element={<AdminProjectsPage />} />
            <Route path="/admin/modules" element={<AdminModulesPage />} />
            <Route path="/admin/resources" element={<AdminResourcesPage />} />
            <Route path="/admin/work-types" element={<AdminWorkTypesPage />} />
            <Route path="/admin/sprints" element={<AdminSprintsPage />} />
            <Route path="/admin/users" element={<AdminUsersPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['Admin', 'Manager', 'Lead']} />}>
            <Route path="/admin/assignments" element={<AdminTasksPage />} />
            <Route path="/admin/salesforce-tasks" element={<AdminSalesforceTasksPage />} />
          </Route>

          <Route path="/admin/availability" element={<AdminAvailabilityPage />} />
          <Route path="/admin/settings" element={<AdminSettingsPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
