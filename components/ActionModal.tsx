'use client'

import { ReactNode } from 'react'
import BaseModal from './BaseModal'

type ActionModalProps = {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
  busy?: boolean
  onClose: () => void
  onConfirm: () => void
  children?: ReactNode
}

export default function ActionModal({ open, title, description, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'default', busy = false, onClose, onConfirm, children }: ActionModalProps) {
  return (
    <BaseModal open={open} title={title} description={description} onClose={busy ? () => undefined : onClose}>
      {children}
      <div className="mt-6 flex justify-end gap-3">
        <button type="button" onClick={onClose} disabled={busy} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">{cancelLabel}</button>
        <button type="button" onClick={onConfirm} disabled={busy} className={`rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${tone === 'danger' ? 'bg-rose-700 hover:bg-rose-600' : 'bg-slate-900 hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400'}`}>{busy ? 'Working...' : confirmLabel}</button>
      </div>
    </BaseModal>
  )
}
