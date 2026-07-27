import { create } from 'zustand'
import {
  getProjects, getMainModules, getSubModules, getResources,
  getWorkTypes, getSprints,
} from '../services/api'

/**
 * Central Zustand store. Holds shared dropdown/reference data so pages don't
 * each re-fetch the same lists, plus a global "refresh" counter admin pages
 * bump after a mutation so dependent views (dashboard, tasks) can refetch.
 */
const useAppStore = create((set, get) => ({
  projects: [],
  mainModules: [],
  subModules: [],
  resources: [],
  workTypes: [],
  sprints: [],
  loadingDropdowns: false,
  refreshToken: 0,

  bumpRefresh: () => set(state => ({ refreshToken: state.refreshToken + 1 })),

  loadDropdowns: async () => {
    set({ loadingDropdowns: true })
    try {
      const [projects, mainModules, subModules, resources, workTypes, sprints] = await Promise.all([
        getProjects(), getMainModules(), getSubModules(), getResources(), getWorkTypes(), getSprints(),
      ])
      set({ projects, mainModules, subModules, resources, workTypes, sprints })
    } finally {
      set({ loadingDropdowns: false })
    }
  },
}))

export default useAppStore
