import { create } from 'zustand'

const STORAGE_KEY = 'fx_auth'

const loadStored = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const stored = loadStored()

const useAuthStore = create((set, get) => ({
  token: stored?.token || null,
  user: stored?.user || null,
  dataScope: stored?.dataScope || null, // "self_only" | "team" | "full"

  setAuth: (token, user) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user, dataScope: get().dataScope }))
    set({ token, user })
  },

  setDataScope: (scope) => {
    const state = get()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: state.token, user: state.user, dataScope: scope }))
    set({ dataScope: scope })
  },

  logout: () => {
    localStorage.removeItem(STORAGE_KEY)
    set({ token: null, user: null, dataScope: null })
  },

  isAuthenticated: () => !!useAuthStore.getState().token,
}))


export const isAdmin = (user) => user?.role === 'Admin'

/**
 * Data scope helpers — driven by Admin-configured role data scopes.
 * dataScope values: "self_only" | "team" | "full"
 * Fallback (before config is loaded): Admin="full", others="self_only"
 */
export const getDataScope = () => {
  const { user, dataScope } = useAuthStore.getState()
  if (dataScope) return dataScope
  // Fallback before API loads
  return user?.role === 'Admin' ? 'full' : 'self_only'
}

export const isSelfOnly = () => getDataScope() === 'self_only'

// Legacy helpers — now driven by dataScope
export const isManagerOrAbove = (user) => {
  if (!user) return false
  const scope = getDataScope()
  return scope === 'team' || scope === 'full'
}

export const isLeadOrAbove = (user) => {
  if (!user) return false
  const scope = getDataScope()
  return scope === 'team' || scope === 'full'
}

export const isRestrictedRole = (user) => {
  if (!user) return false
  return getDataScope() === 'self_only'
}

export const canEditTask = (user, task) => {
  if (!user) return false
  if (isLeadOrAbove(user)) return true
  return user.developer_id != null && task.developer_id === user.developer_id
}

export const canDeleteTask = (user) => isLeadOrAbove(user)
export const canCreateTask = (user) => !!user
export const canManageAdminConfig = (user) => !!user && !isRestrictedRole(user)

export default useAuthStore
