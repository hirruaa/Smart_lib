'use client'

import BaseModal from './BaseModal'

type ResultModalProps = {
  open: boolean
  status: 'success' | 'error'
  message: string
  successTitle?: string
  onClose: () => void
}

export default function ResultModal({ open, status, message, successTitle = 'Action completed', onClose }: ResultModalProps) {
  const success = status === 'success'
  return (
    <BaseModal
      open={open}
      title={success ? successTitle : 'Action could not be completed'}
      eyebrow={success ? 'Success' : 'Something went wrong'}
      description={message}
      onClose={onClose}
      size="sm"
    >
      <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full text-2xl font-bold ${success ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'}`} aria-hidden="true">
        {success ? '✓' : '!'}
      </div>
      <button type="button" onClick={onClose} className="mt-6 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400">{success ? 'Done' : 'Close'}</button>
    </BaseModal>
  )
}
