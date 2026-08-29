import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Generic fetch hook. Pass an async fetcher function and a dependency array.
 * Returns { data, loading, error, reload }.
 *
 * Handles React StrictMode double-mount by aborting stale requests,
 * so only one network call actually completes per mount cycle.
 */
export default function useApi(fetcher, deps = []) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const activeRef = useRef(0)

  const load = useCallback(async () => {
    const id = ++activeRef.current
    setLoading(true)
    setError(null)
    try {
      const result = await fetcher()
      // Only apply result if this is still the latest call
      if (id === activeRef.current) {
        setData(result)
      }
    } catch (err) {
      if (id === activeRef.current) {
        setError(err)
      }
    } finally {
      if (id === activeRef.current) {
        setLoading(false)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    load()
    return () => {
      // Invalidate any in-flight request when deps change or component unmounts
      activeRef.current++
    }
  }, [load])

  return { data, loading, error, reload: load }
}
