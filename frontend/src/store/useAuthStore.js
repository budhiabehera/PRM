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


export const isAdmin = (user) => user?.role === 'Admin'
// With dynamic roles from Role Capacity page, any non-basic role should be treated as elevated
// The backend enforces real permissions via page_access table
export const isManagerOrAbove = (user) => !!user && user.role !== 'Developer'
export const isLeadOrAbove = (user) => !!user && user.role !== 'Developer'
export const canEditTask = (user, task) => {
  if (!user) return false
  if (isLeadOrAbove(user)) return true
  return user.developer_id != null && task.developer_id === user.developer_id
}
export const canDeleteTask = (user) => isLeadOrAbove(user)
// Developers can create tasks (backend will force self-assignment)
export const canCreateTask = (user) => !!user
export const canManageAdminConfig = (user) => !!user && user.role !== 'Developer'

export default useAuthStore
