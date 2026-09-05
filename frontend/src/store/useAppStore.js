import { create } from 'zustand'
import { getDropdowns } from '../services/api'

/**
 * Central Zustand store. Holds shared dropdown/reference data so pages don't
 * each re-fetch the same lists, plus a global "refresh" counter admin pages
 * bump after a mutation so dependent views (dashboard, tasks) can refetch.
 *
 * Dropdowns are fetched in a SINGLE API call via GET /api/dropdowns
 * instead of 8 separate requests.
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
      try {
        const data = await getDropdowns()
        set({
          projects: data.projects || [],
          mainModules: data.main_modules || [],
          subModules: data.sub_modules || [],
          resources: data.resources || [],
          workTypes: data.work_types || [],
          sprints: data.sprints || [],
          skills: data.skills || [],
          taskStatuses: data.task_statuses || [],
          _dropdownsLoaded: true,
          loadingDropdowns: false,
          _dropdownsPromise: null,
        })
      } catch (err) {
        set({ loadingDropdowns: false, _dropdownsPromise: null })
      }
    })()

    set({ _dropdownsPromise: promise })
    return promise
  },
}))

export default useAppStore
