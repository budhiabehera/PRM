import axios from 'axios'
import useAuthStore from '../store/useAuthStore'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout()
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

// ---------- Auth ----------
export const login = (username, password) => api.post('/auth/login', { username, password }).then(r => r.data)
export const getMe = () => api.get('/auth/me').then(r => r.data)
export const getUsers = () => api.get('/auth/users').then(r => r.data)
export const createUser = (data) => api.post('/auth/users', data).then(r => r.data)
export const deleteUser = (id) => api.delete(`/auth/users/${id}`)
export const updateUser = (id, data) => api.put(`/auth/users/${id}`, data).then(r => r.data)

// ---------- Projects ----------
export const getProjects = () => api.get('/projects').then(r => r.data)
export const getProjectStats = () => api.get('/projects/stats').then(r => r.data)
export const createProject = (data) => api.post('/projects', data).then(r => r.data)
export const updateProject = (id, data) => api.put(`/projects/${id}`, data).then(r => r.data)
export const deleteProject = (id) => api.delete(`/projects/${id}`)

// ---------- Modules ----------
export const getMainModules = () => api.get('/modules').then(r => r.data)
export const getModuleTree = () => api.get('/modules/tree').then(r => r.data)
export const createMainModule = (data) => api.post('/modules', data).then(r => r.data)
export const updateMainModule = (id, data) => api.put(`/modules/${id}`, data).then(r => r.data)
export const deleteMainModule = (id) => api.delete(`/modules/${id}`)

export const getSubModules = (mainModuleId) =>
  api.get('/sub-modules', { params: { main_module_id: mainModuleId } }).then(r => r.data)
export const createSubModule = (data) => api.post('/sub-modules', data).then(r => r.data)
export const updateSubModule = (id, data) => api.put(`/sub-modules/${id}`, data).then(r => r.data)
export const deleteSubModule = (id) => api.delete(`/sub-modules/${id}`)

// ---------- Resources ----------
export const getResources = (params) => api.get('/resources', { params }).then(r => r.data)
export const getResourceStats = () => api.get('/resources/stats').then(r => r.data)
export const createResource = (data) => api.post('/resources', data).then(r => r.data)
export const updateResource = (id, data) => api.put(`/resources/${id}`, data).then(r => r.data)
export const deleteResource = (id) => api.delete(`/resources/${id}`)

// ---------- Work Types ----------
export const getWorkTypes = () => api.get('/work-types').then(r => r.data)
export const createWorkType = (data) => api.post('/work-types', data).then(r => r.data)
export const updateWorkType = (id, data) => api.put(`/work-types/${id}`, data).then(r => r.data)
export const deleteWorkType = (id) => api.delete(`/work-types/${id}`)

// ---------- Sprints ----------
export const getSprints = () => api.get('/sprints').then(r => r.data)
export const createSprint = (data) => api.post('/sprints', data).then(r => r.data)
export const updateSprint = (id, data) => api.put(`/sprints/${id}`, data).then(r => r.data)
export const deleteSprint = (id) => api.delete(`/sprints/${id}`)

// ---------- Tasks ----------
export const getTasks = (params) => api.get('/tasks', { params }).then(r => r.data)
export const createTask = (data) => api.post('/tasks', data).then(r => r.data)
export const updateTask = (id, data) => api.put(`/tasks/${id}`, data).then(r => r.data)
export const deleteTask = (id) => api.delete(`/tasks/${id}`)

// ---------- Availability ----------
export const getAvailability = (params) => api.get('/availability', { params }).then(r => r.data)
export const upsertAvailability = (data) => api.post('/availability', data).then(r => r.data)
export const deleteAvailability = (id) => api.delete(`/availability/${id}`)

// ---------- Dashboard ----------
export const getKpis = (params) => api.get('/dashboard/kpis', { params }).then(r => r.data)
export const getStatusBreakdown = (params) => api.get('/dashboard/status-breakdown', { params }).then(r => r.data)
export const getProjectBreakdown = (params) => api.get('/dashboard/project-breakdown', { params }).then(r => r.data)
export const getWorkTypeBreakdown = (params) => api.get('/dashboard/work-type-breakdown', { params }).then(r => r.data)
export const getModuleBreakdown = (params) => api.get('/dashboard/module-breakdown', { params }).then(r => r.data)
export const getSubModuleBreakdown = (params) => api.get('/dashboard/sub-module-breakdown', { params }).then(r => r.data)
export const getMonthlyUtilization = (params) => api.get('/dashboard/monthly-utilization', { params }).then(r => r.data)

// ---------- Utilization ----------
export const getUtilizationGrid = (params) => api.get('/utilization/grid', { params }).then(r => r.data)

// ---------- Timeline ----------
export const getGanttData = (params) => api.get('/timeline/gantt', { params }).then(r => r.data)
export const getMonthlyAllocation = () => api.get('/timeline/monthly-allocation').then(r => r.data)

// ---------- Integrations (MS Teams / Salesforce) ----------
export const getIntegrationSettings = () => api.get('/integrations/settings').then(r => r.data)
export const updateIntegrationSettings = (data) => api.put('/integrations/settings', data).then(r => r.data)
export const testTeamsIntegration = () => api.post('/integrations/teams/test').then(r => r.data)
export const testSalesforceIntegration = () => api.post('/integrations/salesforce/test').then(r => r.data)
export const notifyTeamsForTask = (taskId) => api.post(`/integrations/tasks/${taskId}/notify-teams`).then(r => r.data)
export const syncTaskToSalesforce = (taskId) => api.post(`/integrations/tasks/${taskId}/sync-salesforce`).then(r => r.data)

// ---------- Reports (Salesforce Tasks) ----------
export const getSalesforceTasksReport = (params) => api.get('/reports/salesforce-tasks', { params }).then(r => r.data)
export const getReportCustomers = () => api.get('/reports/customers').then(r => r.data)
export const getDailyCreatedCounts = (days = 14) => api.get('/reports/daily-created-counts', { params: { days } }).then(r => r.data)
export const getProjectProgressReport = () => api.get('/reports/project-progress').then(r => r.data)
export const getOverdueTasksReport = (params) => api.get('/reports/overdue-tasks', { params }).then(r => r.data)
export const getCustomerSummaryReport = () => api.get('/reports/customer-summary').then(r => r.data)
export const getTimeVarianceReport = (params) => api.get('/reports/time-variance', { params }).then(r => r.data)

export default api
