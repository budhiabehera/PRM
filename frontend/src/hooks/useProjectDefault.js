import { useMemo } from 'react'
import useAuthStore from '../store/useAuthStore'
import useDropdowns from './useDropdowns'

/**
 * Returns project dropdown config based on user's assigned projects.
 * 
 * If user has exactly 1 project:
 *   - defaultProjectId: that project ID (auto-select)
 *   - showAllOption: false (no "All" in dropdown)
 *   - restrictedProjects: only that project
 * 
 * If user has multiple projects (but not all):
 *   - defaultProjectId: first assigned project
 *   - showAllOption: false
 *   - restrictedProjects: only assigned projects
 * 
 * If user is Admin or has no project restrictions:
 *   - defaultProjectId: '' (All)
 *   - showAllOption: true
 *   - restrictedProjects: all projects
 */
export default function useProjectDefault() {
  const user = useAuthStore((s) => s.user)
  const { projects } = useDropdowns()

  const userProjectIds = user?.project_ids || []

  // User is restricted if they have specific project assignments (not Admin with 0 = all access)
  const isProjectRestricted = useMemo(() => {
    if (!user) return false
    // Admin with no project_ids means full access
    if (user.role === 'Admin' && userProjectIds.length === 0) return false
    // Any user with specific project assignments is restricted to those
    return userProjectIds.length > 0
  }, [user, userProjectIds])

  // Default project ID — first assigned project (available immediately from auth store)
  const defaultProjectId = useMemo(() => {
    if (!isProjectRestricted) return ''
    if (userProjectIds.length === 0) return ''
    return String(userProjectIds[0])
  }, [isProjectRestricted, userProjectIds])

  // Filter projects to only assigned ones
  const restrictedProjects = useMemo(() => {
    if (!isProjectRestricted) return projects
    if (userProjectIds.length === 0) return projects
    return projects.filter((p) => userProjectIds.includes(p.id))
  }, [projects, userProjectIds, isProjectRestricted])

  // Show "All" only if user has access to multiple projects
  const showAllOption = useMemo(() => {
    if (!isProjectRestricted) return true
    // If only 1 project, no "All" option
    return userProjectIds.length > 1
  }, [isProjectRestricted, userProjectIds])

  return {
    defaultProjectId,
    showAllOption,
    restrictedProjects,
    isProjectRestricted,
  }
}
