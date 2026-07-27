export default function EmptyState({ message = 'No data available.' }) {
  return (
    <div className="text-center py-10 text-sm text-slate-400">
      {message}
    </div>
  )
}
