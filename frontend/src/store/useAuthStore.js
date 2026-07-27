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

const useAuthStore = create((set) => ({
  token: stored?.token || null,
  user: stored?.user || null,

  setAuth: (token, user) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }))
    set({ token, user })
  },

  logout: () => {
    localStorage.removeItem(STORAGE_KEY)
    set({ token: null, user: null })
  },

  isAuthenticated: () => !!useAuthStore.getState().token,
}))

// Role helpers — used throughout the UI to show/hide admin actions.
export const isAdmin = (user) => user?.role === 'Admin'
export const isManagerOrAbove = (user) => ['Admin', 'Manager'].includes(user?.role)
export const isLeadOrAbove = (user) => ['Admin', 'Manager', 'Lead'].includes(user?.role)
export const canEditTask = (user, task) => {
  if (!user) return false
  if (isLeadOrAbove(user)) return true
  return user.role === 'Developer' && user.developer_id != null && task.developer_id === user.developer_id
}
export const canDeleteTask = (user) => isLeadOrAbove(user)
export const canCreateTask = (user) => isLeadOrAbove(user)
export const canManageAdminConfig = (user) => isManagerOrAbove(user)

export default useAuthStore
