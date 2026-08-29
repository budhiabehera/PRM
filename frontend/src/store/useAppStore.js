import { create } from 'zustand'
import {
  getProjects, getMainModules, getSubModules, getResources,
  getWorkTypes, getSprints, getSkills, getTaskStatuses,
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
  skills: [],
  taskStatuses: [],
  loadingDropdowns: false,
  refreshToken: 0,
  _dropdownsLoaded: false,
  _dropdownsPromise: null,

  bumpRefresh: () => set(state => ({ refreshToken: state.refreshToken + 1 })),

  loadDropdowns: async (force = false) => {
    const state = get()
    // Skip if already loaded (unless forced by bumpRefresh)
    if (state._dropdownsLoaded && !force) return
    // Deduplicate concurrent calls — reuse in-flight promise
    if (state._dropdownsPromise && !force) return state._dropdownsPromise

    const promise = (async () => {
      set({ loadingDropdowns: true })
      const [projects, mainModules, subModules, resources, workTypes, sprints, skills, taskStatuses] = await Promise.all([
        getProjects(), getMainModules(), getSubModules(), getResources(), getWorkTypes(), getSprints(), getSkills(), getTaskStatuses(),
      ])
      set({ projects, mainModules, subModules, resources, workTypes, sprints, skills, taskStatuses, _dropdownsLoaded: true })
      set({ loadingDropdowns: false, _dropdownsPromise: null })
    })()

    set({ _dropdownsPromise: promise })
    return promise
  },
}))

export default useAppStore
