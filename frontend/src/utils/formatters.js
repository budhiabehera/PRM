export const formatDate = (value) => {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export const formatShortDate = (value) => {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

export const formatNumber = (value, decimals = 0) => {
  if (value === null || value === undefined) return '0'
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: decimals, minimumFractionDigits: 0 })
}

export const formatPercent = (value) => `${formatNumber(value, 1)}%`

export const toDateInput = (value) => {
  if (!value) return ''
  return new Date(value).toISOString().slice(0, 10)
}
