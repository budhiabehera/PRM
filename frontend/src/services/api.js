import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

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
export const getKpis = () => api.get('/dashboard/kpis').then(r => r.data)
export const getStatusBreakdown = () => api.get('/dashboard/status-breakdown').then(r => r.data)
export const getProjectBreakdown = () => api.get('/dashboard/project-breakdown').then(r => r.data)
export const getWorkTypeBreakdown = () => api.get('/dashboard/work-type-breakdown').then(r => r.data)
export const getModuleBreakdown = () => api.get('/dashboard/module-breakdown').then(r => r.data)
export const getSubModuleBreakdown = () => api.get('/dashboard/sub-module-breakdown').then(r => r.data)
export const getMonthlyUtilization = () => api.get('/dashboard/monthly-utilization').then(r => r.data)

// ---------- Utilization ----------
export const getUtilizationGrid = () => api.get('/utilization/grid').then(r => r.data)

// ---------- Timeline ----------
export const getGanttData = (params) => api.get('/timeline/gantt', { params }).then(r => r.data)
export const getMonthlyAllocation = () => api.get('/timeline/monthly-allocation').then(r => r.data)

export default api
