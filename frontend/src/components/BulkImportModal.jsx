import { useState, useRef, useCallback } from 'react'
import Modal from './common/Modal'
import { bulkImportPreview, bulkImportExecute, downloadImportTemplate } from '../services/api'
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertTriangle, Download, Loader2 } from 'lucide-react'

const STEPS = ['upload', 'preview', 'result']

export default function BulkImportModal({ open, onClose, onImportComplete }) {
  const [step, setStep] = useState('upload')
  const [file, setFile] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [previewData, setPreviewData] = useState(null)
  const [importResult, setImportResult] = useState(null)
  const fileInputRef = useRef(null)

  const reset = useCallback(() => {
    setStep('upload')
    setFile(null)
    setDragOver(false)
    setLoading(false)
    setError('')
    setPreviewData(null)
    setImportResult(null)
  }, [])

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleFileSelect = (f) => {
    if (!f) return
    if (!f.name.toLowerCase().endsWith('.xlsx')) {
      setError('Please select a .xlsx file')
      return
    }
    if (f.size > 10 * 1024 * 1024) {
      setError('File is too large. Maximum size is 10 MB.')
      return
    }
    setFile(f)
    setError('')
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    handleFileSelect(f)
  }

  const handleUpload = async () => {
    if (!file) return
    setLoading(true)
    setError('')
    try {
      const data = await bulkImportPreview(file)
      setPreviewData(data)
      setStep('preview')
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to parse the file. Please check the format.')
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadTemplate = async () => {
    try {
      const blob = await downloadImportTemplate()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'PRM_Task_Import_Template.xlsx'
      a.click()
      window.URL.revokeObjectURL(url)
    } catch {
      setError('Failed to download template')
    }
  }

  const handleImport = async () => {
    if (!file) return
    setLoading(true)
    setError('')
    try {
      const validRows = previewData.preview
        .filter((r) => r.valid)
        .map((r) => r.row)
      const data = await bulkImportExecute(file, validRows.join(','))
      setImportResult(data)
      setStep('result')
    } catch (err) {
      setError(err.response?.data?.detail || 'Import failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleFinish = () => {
    handleClose()
    if (importResult?.imported > 0 && onImportComplete) {
      onImportComplete()
    }
  }

  const title = step === 'upload' ? 'Import Tasks from Excel'
    : step === 'preview' ? 'Preview & Validate'
    : 'Import Complete'

  return (
    <Modal open={open} title={title} onClose={handleClose} width="max-w-4xl">
      <div className="min-h-[300px]">
        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-5">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                step === s ? 'bg-indigo-600 text-white'
                  : STEPS.indexOf(step) > i ? 'bg-green-100 text-green-700'
                  : 'bg-slate-100 text-slate-400'
              }`}>
                {STEPS.indexOf(step) > i ? '✓' : i + 1}
              </div>
              <span className={`text-xs font-medium ${step === s ? 'text-indigo-700' : 'text-slate-400'}`}>
                {s === 'upload' ? 'Upload' : s === 'preview' ? 'Preview' : 'Done'}
              </span>
              {i < STEPS.length - 1 && <div className="w-12 h-px bg-slate-200 mx-1" />}
            </div>
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
            <AlertTriangle size={14} />
            {error}
          </div>
        )}

        {/* Step 1: Upload */}
        {step === 'upload' && (
          <div>
            <div
              className={`relative border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${
                dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-slate-300 hover:border-indigo-300 hover:bg-slate-50'
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files?.[0])}
              />
              <Upload className="mx-auto mb-3 text-slate-400" size={36} />
              <p className="text-sm font-medium text-slate-700">
                {file ? file.name : 'Drop your Excel file here or click to browse'}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                .xlsx files only, up to 10 MB
              </p>
              {file && (
                <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-medium">
                  <FileSpreadsheet size={14} />
                  {file.name} ({(file.size / 1024).toFixed(1)} KB)
                </div>
              )}
            </div>

            <div className="flex items-center justify-between mt-5">
              <button
                onClick={handleDownloadTemplate}
                className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                <Download size={14} />
                Download Template
              </button>

              <div className="flex gap-2">
                <button className="btn btn-secondary" onClick={handleClose}>Cancel</button>
                <button
                  className="btn btn-primary"
                  onClick={handleUpload}
                  disabled={!file || loading}
                >
                  {loading ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 size={14} className="animate-spin" /> Parsing...
                    </span>
                  ) : (
                    'Upload & Validate'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Preview */}
        {step === 'preview' && previewData && (
          <div>
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-center">
                <div className="text-lg font-bold text-slate-800">{previewData.total_rows}</div>
                <div className="text-xs text-slate-500">Total Rows</div>
              </div>
              <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-center">
                <div className="text-lg font-bold text-green-700">{previewData.valid_rows}</div>
                <div className="text-xs text-green-600">Valid</div>
              </div>
              <div className={`p-3 rounded-lg text-center ${previewData.invalid_rows > 0 ? 'bg-red-50 border border-red-200' : 'bg-slate-50 border border-slate-200'}`}>
                <div className={`text-lg font-bold ${previewData.invalid_rows > 0 ? 'text-red-700' : 'text-slate-800'}`}>{previewData.invalid_rows}</div>
                <div className={`text-xs ${previewData.invalid_rows > 0 ? 'text-red-600' : 'text-slate-500'}`}>Invalid</div>
              </div>
            </div>

            {/* Preview table */}
            <div className="max-h-[350px] overflow-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Row</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Description</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Project</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Developer</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Priority</th>
                    <th className="px-3 py-2 text-center font-semibold text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {previewData.preview.map((item) => (
                    <tr
                      key={item.row}
                      className={item.valid ? 'hover:bg-slate-50' : 'bg-red-50/60'}
                    >
                      <td className="px-3 py-2 font-medium text-slate-700">{item.row}</td>
                      <td className="px-3 py-2 text-slate-700 max-w-[200px] truncate" title={item.data.description}>
                        {item.data.description || '—'}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{item.data.project || '—'}</td>
                      <td className="px-3 py-2 text-slate-600">{item.data.developer || '—'}</td>
                      <td className="px-3 py-2 text-slate-600">{item.data.priority || '—'}</td>
                      <td className="px-3 py-2 text-center">
                        {item.valid ? (
                          <CheckCircle2 size={16} className="text-green-500 mx-auto" />
                        ) : (
                          <div className="flex flex-col items-center gap-1">
                            <XCircle size={16} className="text-red-500" />
                            <div className="text-[10px] text-red-600 text-left">
                              {item.errors.map((e, i) => (
                                <div key={i}>• {e}</div>
                              ))}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between mt-5">
              <button className="btn btn-secondary" onClick={reset}>
                ← Back
              </button>
              <div className="flex gap-2">
                <button className="btn btn-secondary" onClick={handleClose}>Cancel</button>
                <button
                  className="btn btn-primary"
                  onClick={handleImport}
                  disabled={loading || previewData.valid_rows === 0}
                >
                  {loading ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 size={14} className="animate-spin" /> Importing...
                    </span>
                  ) : (
                    `Import ${previewData.valid_rows} Valid Row${previewData.valid_rows !== 1 ? 's' : ''}`
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Result */}
        {step === 'result' && importResult && (
          <div className="text-center py-6">
            {importResult.imported > 0 ? (
              <>
                <CheckCircle2 size={48} className="text-green-500 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-slate-800 mb-1">
                  {importResult.imported} task{importResult.imported !== 1 ? 's' : ''} imported successfully!
                </h3>
              </>
            ) : (
              <>
                <XCircle size={48} className="text-red-500 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-slate-800 mb-1">No tasks were imported</h3>
              </>
            )}

            {importResult.failed > 0 && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-left max-h-[150px] overflow-auto">
                <div className="text-xs font-semibold text-red-700 mb-1">
                  {importResult.failed} row{importResult.failed !== 1 ? 's' : ''} failed:
                </div>
                {importResult.errors.map((e, i) => (
                  <div key={i} className="text-xs text-red-600">
                    Row {e.row}: {e.errors.join(', ')}
                  </div>
                ))}
              </div>
            )}

            <button className="btn btn-primary mt-6" onClick={handleFinish}>
              Close
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}
