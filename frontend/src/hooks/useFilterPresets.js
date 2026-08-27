import { useState, useEffect, useCallback } from 'react'
import { getFilterPresets, createFilterPreset, updateFilterPreset, deleteFilterPreset, setDefaultPreset } from '../services/api'

/**
 * Hook for managing named filter presets on a page.
 *
 * Usage:
 *   const { presets, defaultPreset, savePreset, removePreset, applyPreset, setAsDefault, loading } = useFilterPresets('tasks')
 *
 * On mount, loads presets for the given page. Call applyPreset(preset) to get the filters object.
 * Call savePreset(name, filtersObj, isDefault) to persist current filters.
 */
export default function useFilterPresets(page) {
  const [presets, setPresets] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const data = await getFilterPresets(page)
      setPresets(data)
    } catch { /* ignore */ }
    setLoading(false)
  }, [page])

  useEffect(() => { load() }, [load])

  const defaultPreset = presets.find((p) => p.is_default) || null

  const savePreset = async (name, filters, isDefault = false) => {
    const filtersJson = typeof filters === 'string' ? filters : JSON.stringify(filters)
    const result = await createFilterPreset({ name, page, filters: filtersJson, is_default: isDefault })
    await load()
    return result
  }

  const editPreset = async (id, updates) => {
    if (updates.filters && typeof updates.filters !== 'string') {
      updates.filters = JSON.stringify(updates.filters)
    }
    const result = await updateFilterPreset(id, updates)
    await load()
    return result
  }

  const removePreset = async (id) => {
    await deleteFilterPreset(id)
    await load()
  }

  const setAsDefault = async (id) => {
    await setDefaultPreset(id)
    await load()
  }

  const parseFilters = (preset) => {
    if (!preset) return null
    try {
      return JSON.parse(preset.filters)
    } catch {
      return null
    }
  }

  return {
    presets,
    defaultPreset,
    defaultFilters: parseFilters(defaultPreset),
    savePreset,
    editPreset,
    removePreset,
    setAsDefault,
    parseFilters,
    loading,
    reload: load,
  }
}
