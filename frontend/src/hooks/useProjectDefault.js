import { useMemo } from 'react'
import useAuthStore from '../store/useAuthStore'
import useDropdowns from './useDropdowns'

/**
 * Returns project dropdown config based on user role.
 * For Development Manager / Product Manager:
 *   - defaultProjectId: first assigned project ID (auto-select, available immediately)
 *   - showAllOption: false (remove "All" from dropdown)
 *   - restrictedProjects: only user's assigned projects
 * For Admin and other roles:
 *   - defaultProjectId: '' (All)
 *   - showAllOption: true
 *   - restrictedProjects: all projects
 */
export default function useProjectDefault() {
  const user = useAuthStore((s) => s.user)
  const { projects } = useDropdowns()

  const isProjectRestricted = useMemo(() => {
    if (!user) return false
    const role = (user.role || '').toLowerCase()
    return role === 'development manager' || role === 'product manager'
  }, [user])

  // Default project ID — derived directly from user.project_ids (available immediately from auth store)
  // This does NOT depend on the async projects list loading
  const defaultProjectId = useMemo(() => {
    if (!isProjectRestricted) return ''
    const userProjectIds = user?.project_ids || []
    if (userProjectIds.length === 0) return ''
    return String(userProjectIds[0])
  }, [isProjectRestricted, user])

  const restrictedProjects = useMemo(() => {
    if (!isProjectRestricted) return projects
    const userProjectIds = user?.project_ids || []
    if (userProjectIds.length === 0) return projects
    return projects.filter((p) => userProjectIds.includes(p.id))
  }, [projects, user, isProjectRestricted])

  return {
    defaultProjectId,
    showAllOption: !isProjectRestricted,
    restrictedProjects,
    isProjectRestricted,
  }
}
