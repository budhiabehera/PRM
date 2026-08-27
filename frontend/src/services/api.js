import axios from 'axios'

import useAuthStore from '../store/useAuthStore'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
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
export const changePassword = (data) => api.post('/auth/change-password', data).then(r => r.data)

// ---------- Projects ----------
export const getProjects = () => api.get('/projects').then(r => r.data)
export const getProjectStats = () => api.get('/projects/stats').then(r => r.data)
export const createProject = (data) => api.post('/projects', data).then(r => r.data)
export const updateProject = (id, data) => api.put(`/projects/${id}`, data).then(r => r.data)
export const deleteProject = (id) => api.delete(`/projects/${id}`)

// ---------- Modules ----------
export const getMainModules = () => api.get('/modules').then(r => r.data)
export const getModuleTree = () => api.get('/modules/tree').then(r => r.data)
export const createMainModule = (data, projectId) => api.post('/modules', data, { params: projectId ? { project_id: projectId } : undefined }).then(r => r.data)
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

// ---------- Task Dependencies ----------
export const getTaskDependencies = (taskId) => api.get(`/tasks/${taskId}/dependencies`).then(r => r.data)
export const addTaskDependency = (taskId, dependsOnId) => api.post(`/tasks/${taskId}/dependencies`, { depends_on_id: dependsOnId }).then(r => r.data)
export const removeTaskDependency = (taskId, depId) => api.delete(`/tasks/${taskId}/dependencies/${depId}`)

// ---------- Availability ----------
export const getAvailability = (params) => api.get('/availability', { params }).then(r => r.data)
export const upsertAvailability = (data) => api.post('/availability', data).then(r => r.data)
export const deleteAvailability = (id) => api.delete(`/availability/${id}`)

// ---------- Task Activities ----------
export const getTaskActivities = (taskId) => api.get(`/task-activities/${taskId}`).then(r => r.data)
export const createTaskActivity = (data) => api.post('/task-activities', data).then(r => r.data)
export const updateTaskActivity = (id, data) => api.put(`/task-activities/${id}`, data).then(r => r.data)
export const deleteTaskActivity = (id) => api.delete(`/task-activities/${id}`)

// ---------- User Settings & Filter Presets ----------
export const getUserSettings = () => api.get('/user-settings').then(r => r.data)
export const updateUserSetting = (key, value) => api.put(`/user-settings/${key}`, { value }).then(r => r.data)
export const getFilterPresets = (page) => api.get('/filter-presets', { params: page ? { page } : {} }).then(r => r.data)
export const createFilterPreset = (data) => api.post('/filter-presets', data).then(r => r.data)
export const updateFilterPreset = (id, data) => api.put(`/filter-presets/${id}`, data).then(r => r.data)
export const deleteFilterPreset = (id) => api.delete(`/filter-presets/${id}`)
export const setDefaultPreset = (id) => api.put(`/filter-presets/${id}/set-default`).then(r => r.data)

// ---------- Task Attachments ----------
export const getTaskAttachments = (taskId) => api.get(`/task-attachments/${taskId}`).then(r => r.data)
export const uploadTaskAttachment = (taskId, file) => {
  const formData = new FormData()
  formData.append('file', file)
  return api.post(`/task-attachments/${taskId}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)
}
export const updateTaskAttachment = (attachmentId, data) => {
  const formData = new FormData()
  if (data.file_name) formData.append('file_name', data.file_name)
  if (data.file) formData.append('file', data.file)
  return api.put(`/task-attachments/${attachmentId}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)
}
export const deleteTaskAttachment = (id) => api.delete(`/task-attachments/${id}`)
export const getAttachmentDownloadUrl = (attachmentId) => `${import.meta.env.VITE_API_BASE_URL || '/api'}/task-attachments/download/${attachmentId}`

// ---------- Holidays ----------
export const getHolidays = (params) => api.get('/holidays', { params }).then(r => r.data)
export const createHoliday = (data) => api.post('/holidays', data).then(r => r.data)
export const updateHoliday = (id, data) => api.put(`/holidays/${id}`, data).then(r => r.data)
export const deleteHoliday = (id) => api.delete(`/holidays/${id}`)

// ---------- Role Capacities ----------
export const getRoleCapacities = () => api.get('/role-capacities').then(r => r.data)
export const getCapacityByRole = (role) => api.get(`/role-capacities/by-role/${encodeURIComponent(role)}`).then(r => r.data)
export const createRoleCapacity = (data) => api.post('/role-capacities', data).then(r => r.data)
export const updateRoleCapacity = (id, data) => api.put(`/role-capacities/${id}`, data).then(r => r.data)
export const deleteRoleCapacity = (id) => api.delete(`/role-capacities/${id}`)

// ---------- Task Statuses ----------
export const getTaskStatuses = () => api.get('/task-statuses').then(r => r.data)
export const createTaskStatus = (data) => api.post('/task-statuses', data).then(r => r.data)
export const updateTaskStatus = (id, data) => api.put(`/task-statuses/${id}`, data).then(r => r.data)
export const deleteTaskStatus = (id) => api.delete(`/task-statuses/${id}`)

// ---------- Page Access ----------
export const getPageAccess = () => api.get('/page-access').then(r => r.data)
export const getPagesForRole = (role) => api.get(`/page-access/for-role/${encodeURIComponent(role)}`).then(r => r.data)
export const bulkSavePageAccess = (data) => api.post('/page-access/bulk', data).then(r => r.data)
export const upsertPageAccess = (data) => api.post('/page-access', data).then(r => r.data)

// ---------- Resource Calendar ----------
export const getResourceCalendar = (params) => api.get('/resource-calendar', { params }).then(r => r.data)

// ---------- User Setup (unified Developer + Login) ----------

// ---------- Skills ----------
export const getSkills = () => api.get('/skills').then(r => r.data)
export const createSkill = (data) => api.post('/skills', data).then(r => r.data)
export const updateSkill = (id, data) => api.put(`/skills/${id}`, data).then(r => r.data)
export const deleteSkill = (id) => api.delete(`/skills/${id}`)

export const getUserSetupList = () => api.get('/user-setup').then(r => r.data)
export const getNextResourceCode = () => api.get('/user-setup/next-code').then(r => r.data)
export const createUserSetup = (data) => api.post('/user-setup', data).then(r => r.data)
export const updateUserSetup = (id, data) => api.put(`/user-setup/${id}`, data).then(r => r.data)
export const deleteUserSetup = (id) => api.delete(`/user-setup/${id}`)
export const resendWelcomeEmail = (devId) => api.post(`/user-setup/${devId}/resend-welcome`).then(r => r.data)

// ---------- Dashboard ----------
export const getKpis = (params) => api.get('/dashboard/kpis', { params }).then(r => r.data)
export const getStatusBreakdown = (params) => api.get('/dashboard/status-breakdown', { params }).then(r => r.data)
export const getProjectBreakdown = (params) => api.get('/dashboard/project-breakdown', { params }).then(r => r.data)
export const getWorkTypeBreakdown = (params) => api.get('/dashboard/work-type-breakdown', { params }).then(r => r.data)
export const getModuleBreakdown = (params) => api.get('/dashboard/module-breakdown', { params }).then(r => r.data)
export const getSubModuleBreakdown = (params) => api.get('/dashboard/sub-module-breakdown', { params }).then(r => r.data)
export const getMonthlyUtilization = (params) => api.get('/dashboard/monthly-utilization', { params }).then(r => r.data)
export const getMyDashboardSummary = () => api.get('/dashboard/my-summary').then(r => r.data)

// ---------- Utilization ----------
export const getUtilizationGrid = (params) => api.get('/utilization/grid', { params }).then(r => {
  const data = r.data
  if (data && data.rows) {
    data.rows.sort((a, b) => (a.developer_name || '').localeCompare(b.developer_name || '', undefined, { sensitivity: 'base' }))
  }
  return data
})

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

// ---------- Time Logs ----------
export const getTimeLogs = (params) => api.get('/time-logs', { params }).then(r => r.data)
export const createTimeLog = (data) => api.post('/time-logs', data).then(r => r.data)
export const updateTimeLog = (id, data) => api.put(`/time-logs/${id}`, data).then(r => r.data)
export const deleteTimeLog = (id) => api.delete(`/time-logs/${id}`)
export const getTimeLogSummary = (params) => api.get('/time-logs/summary', { params }).then(r => r.data)

// ---------- Notifications ----------
export const getNotifications = (params) => api.get('/notifications', { params }).then(r => r.data)
export const getUnreadCount = () => api.get('/notifications/unread-count').then(r => r.data)
export const markNotificationRead = (id) => api.put(`/notifications/${id}/read`).then(r => r.data)
export const markAllNotificationsRead = () => api.put('/notifications/read-all').then(r => r.data)

// ---------- Knowledge Base ----------
export const getKBArticles = (params) => api.get('/knowledge-base', { params }).then(r => r.data)
export const getKBArticle = (id) => api.get(`/knowledge-base/${id}`).then(r => r.data)
export const createKBArticle = (data) => api.post('/knowledge-base', data).then(r => r.data)
export const updateKBArticle = (id, data) => api.put(`/knowledge-base/${id}`, data).then(r => r.data)
export const deleteKBArticle = (id) => api.delete(`/knowledge-base/${id}`)
export const uploadKBAttachment = (articleId, file) => {
  const formData = new FormData()
  formData.append('file', file)
  return api.post(`/knowledge-base/${articleId}/attachments`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data)
}
export const deleteKBAttachment = (articleId, attachmentId) => api.delete(`/knowledge-base/${articleId}/attachments/${attachmentId}`)
export const getKBCategories = () => api.get('/knowledge-base/categories').then(r => r.data)

// ---------- Standup ----------
export const getMyStandup = (activityDate) => api.get('/standup/my-summary', { params: activityDate ? { activity_date: activityDate } : {} }).then(r => r.data)
export const getTeamStandup = (activityDate) => api.get('/standup/team-summary', { params: activityDate ? { activity_date: activityDate } : {} }).then(r => r.data)
export const getStandupText = (developerId) => api.get('/standup/generate-text', { params: developerId ? { developer_id: developerId } : {} }).then(r => r.data)

// ---------- Audit Log ----------
export const getAuditLogs = (params) => api.get('/audit-logs', { params }).then(r => r.data)
export const getAuditEntityTypes = () => api.get('/audit-logs/entity-types').then(r => r.data)

export default api
