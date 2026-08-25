import { useState, useEffect, useRef } from 'react'
import { Bell, CheckCircle, AlertCircle, UserPlus, RefreshCw, X } from 'lucide-react'
import { getNotifications, getUnreadCount, markNotificationRead, markAllNotificationsRead } from '../services/api'

const NOTIFICATION_ICONS = {
  task_assigned: <UserPlus size={14} className="text-blue-500" />,
  status_changed: <RefreshCw size={14} className="text-amber-500" />,
  deadline_approaching: <AlertCircle size={14} className="text-red-500" />,
  comment_added: <CheckCircle size={14} className="text-green-500" />,
}

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const now = new Date()
  const date = new Date(dateStr)
  const diff = Math.floor((now - date) / 1000) // seconds

  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return date.toLocaleDateString()
}

export default function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifications, setNotifications] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const panelRef = useRef(null)

  // Poll unread count every 30 seconds
  useEffect(() => {
    const fetchCount = () => {
      getUnreadCount()
        .then((data) => setUnreadCount(data.count))
        .catch(() => {})
    }
    fetchCount()
    const interval = setInterval(fetchCount, 30000)
    return () => clearInterval(interval)
  }, [])

  // Fetch notifications when dropdown opens
  useEffect(() => {
    if (open) {
      setLoading(true)
      getNotifications()
        .then((data) => setNotifications(data))
        .catch(() => {})
        .finally(() => setLoading(false))
    }
  }, [open])

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const handleMarkRead = async (id) => {
    await markNotificationRead(id)
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    )
    setUnreadCount((c) => Math.max(0, c - 1))
  }

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead()
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    setUnreadCount(0)
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell Button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative flex items-center justify-center w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        title="Notifications"
      >
        <Bell size={16} className="text-white" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold text-white bg-red-500 rounded-full px-1 shadow-lg">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {open && (
        <div className="absolute right-0 top-10 w-80 max-h-[420px] bg-white rounded-xl shadow-2xl border border-slate-200 z-[100] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">Notifications</h3>
            <button
              onClick={() => setOpen(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X size={16} />
            </button>
          </div>

          {/* Notification List */}
          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center py-8 text-slate-400 text-sm">
                Loading...
              </div>
            )}
            {!loading && notifications.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                <Bell size={24} className="mb-2 opacity-40" />
                <span className="text-sm">No notifications yet</span>
              </div>
            )}
            {!loading &&
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => !n.is_read && handleMarkRead(n.id)}
                  className={`flex items-start gap-3 px-4 py-3 border-b border-slate-50 cursor-pointer transition-colors ${
                    n.is_read
                      ? 'bg-white hover:bg-slate-50'
                      : 'bg-blue-50/60 hover:bg-blue-50'
                  }`}
                >
                  <div className="mt-0.5 flex-shrink-0">
                    {NOTIFICATION_ICONS[n.type] || <Bell size={14} className="text-slate-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs leading-tight ${n.is_read ? 'text-slate-600' : 'text-slate-800 font-medium'}`}>
                      {n.title}
                    </p>
                    {n.message && (
                      <p className="text-[11px] text-slate-400 mt-0.5 truncate">{n.message}</p>
                    )}
                    <p className="text-[10px] text-slate-400 mt-1">{timeAgo(n.created_at)}</p>
                  </div>
                  {!n.is_read && (
                    <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                  )}
                </div>
              ))}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-slate-100 px-4 py-2.5">
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium w-full text-center"
              >
                Mark all as read
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
