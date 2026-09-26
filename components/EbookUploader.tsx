'use client'

import React, { useRef, useState } from 'react'

interface EbookUploaderProps {
  onFileSelected: (file: File | null) => void
  onUrlEntered?: (url: string) => void
  currentValue?: string
  disabled?: boolean
}

export default function EbookUploader({
  onFileSelected,
  onUrlEntered,
  currentValue,
  disabled = false,
}: EbookUploaderProps) {
  const [mode, setMode] = useState<'upload' | 'url'>('upload')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = (file: File) => {
    setFileError(null)
    if (file.type !== 'application/pdf') {
      setFileError('Please select a valid PDF file.')
      return
    }
    // 50MB check
    if (file.size > 50 * 1024 * 1024) {
      setFileError(`File is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Max limit is 50 MB.`)
      return
    }

    setSelectedFile(file)
    onFileSelected(file)
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0])
    }
  }

  return (
    <div className="space-y-3">
      {/* Toggle between Direct Upload & External Link */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
          E-Book Digital File
        </span>
        <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-semibold dark:border-slate-700 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => {
              setMode('upload')
              setFileError(null)
            }}
            className={`rounded-md px-2.5 py-1 transition ${
              mode === 'upload'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
            }`}
          >
            Upload PDF
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('url')
              setFileError(null)
            }}
            className={`rounded-md px-2.5 py-1 transition ${
              mode === 'url'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
            }`}
          >
            External URL / Google Drive
          </button>
        </div>
      </div>

      {mode === 'upload' ? (
        <div>
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => !disabled && fileInputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition ${
              dragActive
                ? 'border-sky-500 bg-sky-50 dark:border-sky-400 dark:bg-sky-950/20'
                : 'border-slate-300 hover:border-slate-400 bg-slate-50/50 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40 dark:hover:bg-slate-900/60'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              disabled={disabled}
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFile(e.target.files[0])
                }
              }}
            />

            <svg
              className="h-9 w-9 text-slate-400 dark:text-slate-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="1.6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z"
              />
            </svg>

            {selectedFile ? (
              <div className="mt-3">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {selectedFile.name}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB &bull; Ready to upload
                </p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedFile(null)
                    onFileSelected(null)
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                  className="mt-2 text-xs font-semibold text-rose-500 hover:underline"
                >
                  Remove file
                </button>
              </div>
            ) : (
              <div className="mt-2">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Click to select or drag & drop PDF here
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Protected library storage &bull; Up to 50 MB
                </p>
                {currentValue && (
                  <p className="mt-2 text-[11px] text-slate-600 dark:text-slate-400 truncate max-w-xs">
                    Current: <span className="font-mono">{currentValue}</span>
                  </p>
                )}
              </div>
            )}
          </div>
          {fileError && (
            <p className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">{fileError}</p>
          )}
        </div>
      ) : (
        <div>
          <input
            type="url"
            value={currentValue ?? ''}
            onChange={(e) => onUrlEntered && onUrlEntered(e.target.value)}
            disabled={disabled}
            placeholder="https://drive.google.com/... or https://..."
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Paste a public PDF URL, Google Drive share link, or external academic repository link.
          </p>
        </div>
      )}
    </div>
  )
}
