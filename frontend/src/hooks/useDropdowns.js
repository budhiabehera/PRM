import { useEffect, useMemo } from 'react'
import useAppStore from '../store/useAppStore'
import useAuthStore from '../store/useAuthStore'

/** Helper: sort an array of objects alphabetically by the `name` property (case-insensitive). */
const sortByName = (arr) => [...arr].sort((a, b) => (a.name || '').trim().toLowerCase().localeCompare((b.name || '').trim().toLowerCase()))

/** Ensures shared dropdown/reference data is loaded once, on first use.
 *  Filters projects, modules, sub-modules, and developers by user's project access (Admin sees all).
 *  All returned lists are sorted alphabetically by name. */
export default function useDropdowns() {
  const { projects, mainModules, subModules, resources, workTypes, sprints, skills, taskStatuses, loadingDropdowns, loadDropdowns, refreshToken } = useAppStore()
  const user = useAuthStore((s) => s.user)

  useEffect(() => {
    loadDropdowns(refreshToken > 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken])

  const isAdmin = !user || user.role === 'Admin'

  // Filter projects based on user's access (Admin sees all)
  const filteredProjects = useMemo(() => {
    if (isAdmin) return sortByName(projects)
    const userProjectIds = user.project_ids || []
    return sortByName(projects.filter((p) => userProjectIds.includes(p.id)))
  }, [projects, user, isAdmin])

  // Get project IDs the user has access to
  const userProjectIds = useMemo(() => {
    if (isAdmin) return null // null = no filter (Admin sees all)
    return filteredProjects.map((p) => p.id)
  }, [filteredProjects, isAdmin])

  // Filter main modules — only those belonging to user's projects (by module.project_id)
  const filteredMainModules = useMemo(() => {
    if (isAdmin || !userProjectIds) return sortByName(mainModules)
    return sortByName(mainModules.filter((m) => !m.project_id || userProjectIds.includes(m.project_id)))
  }, [mainModules, userProjectIds, isAdmin])

  // Filter sub-modules — only those under allowed main modules
  const filteredSubModules = useMemo(() => {
    if (isAdmin || !userProjectIds) return sortByName(subModules)
    const allowedMainModuleIds = filteredMainModules.map((m) => m.id)
    return sortByName(subModules.filter((s) => allowedMainModuleIds.includes(s.main_module_id)))
  }, [subModules, filteredMainModules, userProjectIds, isAdmin])

  // Developers: filter by project_ids (many-to-many on the developer record)
  const filteredResources = useMemo(() => {
    if (isAdmin) return sortByName(resources)
    const userProjectIds = (user?.project_ids || [])
    // Show developers assigned to any of the user's projects + those with no project (unassigned)
    return sortByName(resources.filter((d) => {
      const devProjects = d.project_ids || []
      return devProjects.length === 0 || devProjects.some((pid) => userProjectIds.includes(pid))
    }))
  }, [resources, user, isAdmin])

  // Sort workTypes, sprints, skills, and taskStatuses alphabetically by name as well
  const sortedWorkTypes = useMemo(() => sortByName(workTypes), [workTypes])
  const sortedSprints = useMemo(() => sortByName(sprints), [sprints])
  const sortedSkills = useMemo(() => sortByName(skills), [skills])
  const sortedTaskStatuses = useMemo(() => sortByName(taskStatuses), [taskStatuses])

  return {
    projects: filteredProjects,
    mainModules: filteredMainModules,
    subModules: filteredSubModules,
    resources: filteredResources,
    workTypes: sortedWorkTypes,
    sprints: sortedSprints,
    skills: sortedSkills,
    taskStatuses: sortedTaskStatuses,
    loadingDropdowns,
    // Unfiltered versions for special cases (Admin user management, etc.)
    allProjects: sortByName(projects),
    allMainModules: sortByName(mainModules),
    allSubModules: sortByName(subModules),
    allResources: sortByName(resources),
  }
}
