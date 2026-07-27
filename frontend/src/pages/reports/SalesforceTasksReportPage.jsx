import { useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import useApi from '../../hooks/useApi'
import useDropdowns from '../../hooks/useDropdowns'
import { getSalesforceTasksReport, getReportCustomers, getDailyCreatedCounts, syncTaskToSalesforce } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import KPICard from '../../components/common/KPICard'
import StatusBadge from '../../components/common/StatusBadge'
import PriorityBadge from '../../components/common/PriorityBadge'
import FilterSelect from '../../components/common/FilterSelect'
import { formatNumber, formatDate } from '../../utils/formatters'
import { STATUS_OPTIONS, PRIORITY_OPTIONS } from '../../utils/constants'

const SYNC_OPTIONS = [
  { value: 'true', label: 'Synced to Salesforce' },
  { value: 'false', label: 'Not yet synced' },
]

export default function SalesforceTasksReportPage() {
  const { projects, resources, workTypes } = useDropdowns()
  const { data: customers, loading: l1 } = useApi(getReportCustomers, [])
  const { data: trend, loading: l2 } = useApi(() => getDailyCreatedCounts(14), [])
  const [filters, setFilters] = useState({})
  const [toast, setToast] = useState(null)

  const params = useMemo(() => {
    const p = {}
    Object.entries(filters).forEach(([k, v]) => { if (v !== undefined && v !== '') p[k] = v })
    return p
  }, [filters])

  const { data: report, loading: l3, reload } = useApi(() => getSalesforceTasksReport(params), [JSON.stringify(params)])

  const setFilter = (key) => (value) => setFilters((f) => ({ ...f, [key]: value }))

  const showToast = (type, text) => {
    setToast({ type, text })
    setTimeout(() => setToast(null), 4000)
  }

  const handleSync = async (task) => {
    try {
      const res = await syncTaskToSalesforce(task.id)
      showToast('success', `Case created: ${res.salesforce_case_id}`)
      reload()
    } catch (err) {
      showToast('error', err.response?.data?.detail || 'Sync failed.')
    }
  }

  const loading = l1 || l2 || l3

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900">Salesforce Tasks</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Every task created in PRM, day by day — filter by date, customer, product, and Salesforce sync status
        </p>
      </div>

      {loading ? <LoadingSpinner label="Loading report..." /> : (
        <>
          <div className="grid grid-cols-4 gap-3.5 mb-6">
            <KPICard label="Tasks Matching Filters" value={report.summary.total_tasks} />
            <KPICard label="Total Est. Hours" value={formatNumber(report.summary.total_estimated_hours)} />
            <KPICard label="Synced to Salesforce" value={report.summary.synced_to_salesforce} />
            <KPICard label="Not Yet Synced" value={report.summary.not_synced} />
          </div>

          <div className="card">
            <div className="text-[15px] font-semibold mb-3.5">Tasks Created — Last 14 Days</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" name="Tasks Created" fill="#4f46e5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {toast && (
            <div className={`text-xs rounded-lg px-3.5 py-2.5 mb-4 ${toast.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
              {toast.text}
            </div>
          )}

          <div className="flex flex-wrap gap-3 mb-5 p-3.5 bg-white border border-slate-200 rounded-xl items-end">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-slate-400 font-medium">Created On</span>
              <input type="date" className="form-input" style={{ minWidth: 150 }}
                onChange={(e) => setFilter('created_date')(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-slate-400 font-medium">Created From</span>
              <input type="date" className="form-input" style={{ minWidth: 150 }}
                onChange={(e) => setFilter('created_from')(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-slate-400 font-medium">Created To</span>
              <input type="date" className="form-input" style={{ minWidth: 150 }}
                onChange={(e) => setFilter('created_to')(e.target.value)} />
            </div>
            <FilterSelect label="Customer" allLabel="All Customers" onChange={setFilter('customer')}
              options={customers.map((c) => ({ value: c, label: c }))} />
            <FilterSelect label="Product" allLabel="All Products" onChange={setFilter('product_id')}
              options={projects.map((p) => ({ value: p.id, label: p.name }))} />
            <FilterSelect label="Developer" allLabel="All Developers" onChange={setFilter('developer_id')}
              options={resources.map((d) => ({ value: d.id, label: d.name }))} />
            <FilterSelect label="Work Type" allLabel="All Work Types" onChange={setFilter('work_type_id')}
              options={workTypes.map((w) => ({ value: w.id, label: w.name }))} />
            <FilterSelect label="Status" allLabel="All Statuses" onChange={setFilter('status')} options={STATUS_OPTIONS} />
            <FilterSelect label="Priority" allLabel="All Priorities" onChange={setFilter('priority')} options={PRIORITY_OPTIONS} />
            <FilterSelect label="Salesforce" allLabel="All Tasks" onChange={setFilter('synced')} options={SYNC_OPTIONS} />
          </div>

          <div className="card overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Created</th><th>Task</th><th>Customer</th><th>Product</th><th>Developer</th>
                  <th>Work Type</th><th>Priority</th><th>Status</th><th>Est Hrs</th><th>Salesforce</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {report.tasks.map((t) => (
                  <tr key={t.id}>
                    <td>{formatDate(t.created_at)}</td>
                    <td className="font-medium max-w-[220px] truncate">{t.task_code} — {t.description}</td>
                    <td>{t.customer || '—'}</td>
                    <td>{t.product || '—'}</td>
                    <td>{t.developer || '—'}</td>
                    <td>{t.work_type || '—'}</td>
                    <td><PriorityBadge priority={t.priority} /></td>
                    <td><StatusBadge status={t.status} /></td>
                    <td>{t.estimated_hours}</td>
                    <td>
                      {t.synced_to_salesforce ? (
                        <span className="badge bg-green-100 text-green-700">☁️ {t.salesforce_case_id}</span>
                      ) : (
                        <span className="badge bg-slate-100 text-slate-500">Not synced</span>
                      )}
                    </td>
                    <td>
                      {!t.synced_to_salesforce && (
                        <button className="btn btn-secondary btn-sm" onClick={() => handleSync(t)}>Sync</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {report.tasks.length === 0 && (
              <div className="text-center py-10 text-sm text-slate-400">No tasks match the current filters.</div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
