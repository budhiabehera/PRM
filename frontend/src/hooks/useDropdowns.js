import { useEffect, useMemo } from 'react'
import useAppStore from '../store/useAppStore'
import useAuthStore from '../store/useAuthStore'

/** Ensures shared dropdown/reference data is loaded once, on first use.
 *  Filters projects, modules, sub-modules, and developers by user's project access (Admin sees all). */
export default function useDropdowns() {
  const { projects, mainModules, subModules, resources, workTypes, sprints, skills, taskStatuses, loadingDropdowns, loadDropdowns, refreshToken } = useAppStore()
  const user = useAuthStore((s) => s.user)

  useEffect(() => {
    loadDropdowns()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken])

  const isAdmin = !user || user.role === 'Admin'

  // Filter projects based on user's access (Admin sees all)
  const filteredProjects = useMemo(() => {
    if (isAdmin) return projects
    const userProjectIds = user.project_ids || []
    return projects.filter((p) => userProjectIds.includes(p.id))
  }, [projects, user, isAdmin])

  // Get module IDs linked to user's projects (Project.main_module_id)
  const allowedModuleIds = useMemo(() => {
    if (isAdmin) return null // null = no filter
    return filteredProjects
      .map((p) => p.main_module_id)
      .filter(Boolean)
  }, [filteredProjects, isAdmin])

  // Filter main modules — only those linked to user's projects
  const filteredMainModules = useMemo(() => {
    if (isAdmin || !allowedModuleIds) return mainModules
    return mainModules.filter((m) => allowedModuleIds.includes(m.id))
  }, [mainModules, allowedModuleIds, isAdmin])

  // Filter sub-modules — only those under allowed main modules
  const filteredSubModules = useMemo(() => {
    if (isAdmin || !allowedModuleIds) return subModules
    return subModules.filter((s) => allowedModuleIds.includes(s.main_module_id))
  }, [subModules, allowedModuleIds, isAdmin])

  // Developers: filter by project_ids (many-to-many on the developer record)
  const filteredResources = useMemo(() => {
    if (isAdmin) return resources
    const userProjectIds = (user?.project_ids || [])
    // Show developers assigned to any of the user's projects + those with no project (unassigned)
    return resources.filter((d) => {
      const devProjects = d.project_ids || []
      return devProjects.length === 0 || devProjects.some((pid) => userProjectIds.includes(pid))
    })
  }, [resources, user, isAdmin])

  return {
    projects: filteredProjects,
    mainModules: filteredMainModules,
    subModules: filteredSubModules,
    resources: filteredResources,
    workTypes,
    sprints,
    skills,
    taskStatuses,
    loadingDropdowns,
    // Unfiltered versions for special cases (Admin user management, etc.)
    allProjects: projects,
    allMainModules: mainModules,
    allSubModules: subModules,
    allResources: resources,
  }
}
