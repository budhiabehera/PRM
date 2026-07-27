import Modal from './Modal'

export default function ConfirmDialog({ open, title = 'Are you sure?', message, onConfirm, onCancel }) {
  return (
    <Modal open={open} title={title} onClose={onCancel} width="max-w-sm">
      <p className="text-sm text-slate-600 mb-6">{message}</p>
      <div className="flex justify-end gap-2">
        <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn btn-danger" onClick={onConfirm}>Delete</button>
      </div>
    </Modal>
  )
}
