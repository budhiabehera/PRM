import { useMemo, useState } from 'react'
import { PRIORITY_OPTIONS } from '../../utils/constants'
import { toDateInput } from '../../utils/formatters'
import { validateTaskForm } from '../../utils/validators'

export default function TaskForm({
  initial, projects = [], mainModules = [], subModules = [], resources = [], workTypes = [], sprints = [], taskStatuses = [],
  onSubmit, onCancel, lockDeveloper = false,
}) {
  const [form, setForm] = useState({
    case_ref: initial?.case_ref || '',
    property_client: initial?.property_client || '',
    subject: initial?.subject || '',
    point_of_contact: initial?.point_of_contact || '',
    description: initial?.description || '',
    project_id: initial?.project_id || '',
    main_module_id: initial?.main_module_id || '',
    sub_module_id: initial?.sub_module_id || '',
    developer_id: initial?.developer_id || '',
    work_type_id: initial?.work_type_id || '',
    priority: initial?.priority || '',
    status: initial?.status || 'Not Started',
    customer_committed: initial?.customer_committed ?? false,
    start_date: toDateInput(initial?.start_date) || '',
    end_date: toDateInput(initial?.end_date) || '',
    estimated_hours: initial?.estimated_hours ?? '',
    actual_hours: initial?.actual_hours ?? 0,
    sprint_id: initial?.sprint_id || '',
  })
  const [errors, setErrors] = useState({})

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const filteredSubModules = useMemo(
    () => subModules.filter((s) => !form.main_module_id || s.main_module_id === Number(form.main_module_id)),
    [subModules, form.main_module_id]
  )

  // Filter developers by selected project
  const filteredResources = useMemo(
    () => form.project_id
      ? resources.filter((d) => (d.project_ids || []).includes(Number(form.project_id)))
      : resources,
    [resources, form.project_id]
  )

  const handleSubmit = () => {
    const errs = validateTaskForm(form)
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    onSubmit({
      ...form,
      subject: form.subject,
      point_of_contact: form.point_of_contact,
      project_id: form.project_id ? Number(form.project_id) : null,
      main_module_id: form.main_module_id ? Number(form.main_module_id) : null,
      sub_module_id: form.sub_module_id ? Number(form.sub_module_id) : null,
      developer_id: form.developer_id ? Number(form.developer_id) : null,
      work_type_id: form.work_type_id ? Number(form.work_type_id) : null,
      sprint_id: form.sprint_id ? Number(form.sprint_id) : null,
      estimated_hours: Number(form.estimated_hours) || 0,
      actual_hours: Number(form.actual_hours) || 0,
    })
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1 col-span-2">
          <label className="form-label">Task Subject</label>
          <input className="form-input" placeholder="e.g., API Integration for Payment Module" value={form.subject}
            onChange={(e) => update('subject', e.target.value)} />
        </div>
        <div className="flex flex-col gap-1 col-span-2">
          <label className="form-label">Task Description *</label>
          <textarea className="form-textarea" placeholder="Describe the task in detail..." value={form.description}
            onChange={(e) => update('description', e.target.value)} />
          {errors.description && <span className="text-[11px] text-red-500">{errors.description}</span>}
        </div>
        <div className="flex flex-col gap-1">
          <label className="form-label">Point of Contact</label>
          <input className="form-input" placeholder="e.g., John Smith" value={form.point_of_contact}
            onChange={(e) => update('point_of_contact', e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="form-label">Case # / Reference</label>
          <input className="form-input" placeholder="e.g., 1290237 or Internal" value={form.case_ref}
            onChange={(e) => update('case_ref', e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="form-label">Property / Client</label>
          <input className="form-input" placeholder="e.g., Dragon Beach Hotel" value={form.property_client}
            onChange={(e) => update('property_client', e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="form-label">Project *</label>
          <select className="form-select" value={form.project_id} onChange={(e) => update('project_id', e.target.value)}>
            <option value="">Select Project...</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {errors.project_id && <span className="text-[11px] text-red-500">{errors.project_id}</span>}
        </div>
        <div className="flex flex-col gap-1">
          <label className="form-label">Main Module</label>
          <select className="form-select" value={form.main_module_id}
            onChange={(e) => { update('main_module_id', e.target.value); update('sub_module_id', '') }}>
            <option value="">Select Module...</option>
            {mainModules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="form-label">Sub Module</label>
          <select className="form-select" value={form.sub_module_id} onChange={(e) => update('sub_module_id', e.target.value)}>
            <option value="">Select Sub Module...</option>
            {filteredSubModules.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <span className="text-[10px] text-slate-400">Depends on Main Module selection</span>
        </div>
        <div className="flex flex-col gap-1">
          <label className="form-label">Resource *</label>
          <select className="form-select" value={form.developer_id} onChange={(e) => update('developer_id', e.target.value)} disabled={lockDeveloper}>
            <option value="">Select Developer...</option>
            {filteredResources.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.role}, {d.skill})</option>)}
          </select>
          {lockDeveloper && <span className="text-[10px] text-slate-400">Auto-assigned to you</span>}
          {errors.developer_id && <span className="text-[11px] text-red-500">{errors.developer_id}</span>}
        </div>
        <div className="flex flex-col gap-1">
          <label className="form-label">Work Type *</label>
          <select className="form-select" value={form.work_type_id} onChange={(e) => update('work_type_id', e.target.value)}>
            <option value="">Select Work Type...</option>
            {workTypes.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          {errors.work_type_id && <span className="text-[11px] text-red-500">{errors.work_type_id}</span>}
        </div>
        <div className="flex flex-col gap-1">
          <label className="form-label">Priority *</label>
          <select className="form-select" value={form.priority} onChange={(e) => update('priority', e.target.value)}>
            <option value="">Select Priority...</option>
            {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          {errors.priority && <span className="text-[11px] text-red-500">{errors.priority}</span>}
        </div>
        <div className="flex flex-col gap-1">
          <label className="form-label">Status</label>
          <select className="form-select" value={form.status} onChange={(e) => update('status', e.target.value)}>
            <option value="">Select Status...</option>
            {taskStatuses.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="form-label">Customer Committed?</label>
          <select className="form-select" value={form.customer_committed ? 'yes' : 'no'}
            onChange={(e) => update('customer_committed', e.target.value === 'yes')}>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="form-label">Start Date *</label>
          <input type="date" className="form-input" value={form.start_date} onChange={(e) => update('start_date', e.target.value)} />
          {errors.start_date && <span className="text-[11px] text-red-500">{errors.start_date}</span>}
        </div>
        <div className="flex flex-col gap-1">
          <label className="form-label">End Date *</label>
          <input type="date" className="form-input" value={form.end_date} onChange={(e) => update('end_date', e.target.value)} />
          {errors.end_date && <span className="text-[11px] text-red-500">{errors.end_date}</span>}
        </div>
        <div className="flex flex-col gap-1">
          <label className="form-label">Estimated Hours *</label>
          <input type="number" className="form-input" placeholder="e.g., 32" value={form.estimated_hours}
            onChange={(e) => update('estimated_hours', e.target.value)} />
          {errors.estimated_hours && <span className="text-[11px] text-red-500">{errors.estimated_hours}</span>}
        </div>
        <div className="flex flex-col gap-1">
          <label className="form-label">Actual Hours</label>
          <input type="number" className="form-input" value={form.actual_hours}
            onChange={(e) => update('actual_hours', e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="form-label">Sprint</label>
          <select className="form-select" value={form.sprint_id} onChange={(e) => update('sprint_id', e.target.value)}>
            <option value="">Select Sprint...</option>
            {sprints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>
      <div className="flex gap-2 mt-5">
        <button className="btn btn-primary" onClick={handleSubmit}>Save Task</button>
        <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
