export const isRequired = (value) => value !== undefined && value !== null && String(value).trim() !== ''

// Statuses that represent future/planning tasks — relaxed validation
const PLANNING_STATUSES = ['backlog', 'new', 'unassigned']

export const isPlanningStatus = (status) =>
  PLANNING_STATUSES.includes((status || '').toLowerCase().trim())

export const validateTaskForm = (form) => {
  const errors = {}
  const planning = isPlanningStatus(form.status)

  // Always required
  if (!isRequired(form.description)) errors.description = 'Task description is required'
  if (!isRequired(form.project_id)) errors.project_id = 'Project is required'

  // Only required for active/in-progress statuses
  if (!planning) {
    if (!isRequired(form.developer_id)) errors.developer_id = 'Developer is required'
    if (!isRequired(form.work_type_id)) errors.work_type_id = 'Work type is required'
    if (!isRequired(form.start_date)) errors.start_date = 'Start date is required'
    if (!isRequired(form.end_date)) errors.end_date = 'End date is required'
    if (!form.estimated_hours || Number(form.estimated_hours) <= 0) errors.estimated_hours = 'Estimated hours must be greater than 0'
  }

  // Priority always required
  if (!isRequired(form.priority)) errors.priority = 'Priority is required'

  return errors
}

export const validateProjectForm = (form) => {
  const errors = {}
  if (!isRequired(form.name)) errors.name = 'Project name is required'
  if (!isRequired(form.code)) errors.code = 'Project code is required'
  return errors
}

export const validateResourceForm = (form) => {
  const errors = {}
  if (!isRequired(form.dev_code)) errors.dev_code = 'Developer ID is required'
  if (!isRequired(form.name)) errors.name = 'Name is required'
  if (!isRequired(form.skill)) errors.skill = 'Skill is required'
  return errors
}
