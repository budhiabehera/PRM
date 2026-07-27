import { useEffect } from 'react'
import useAppStore from '../store/useAppStore'

/** Ensures shared dropdown/reference data is loaded once, on first use. */
export default function useDropdowns() {
  const { projects, mainModules, subModules, resources, workTypes, sprints, loadingDropdowns, loadDropdowns, refreshToken } = useAppStore()

  useEffect(() => {
    loadDropdowns()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken])

  return { projects, mainModules, subModules, resources, workTypes, sprints, loadingDropdowns }
}
