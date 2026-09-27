'use client'

import BaseModal from './BaseModal'

type WalletModalProps = {
  open: boolean
  balance: number
  onClose: () => void
  onOpenDetails: () => void
}

export default function WalletModal({ open, balance, onClose, onOpenDetails }: WalletModalProps) {
  return (
    <BaseModal open={open} onClose={onClose} title="Points wallet" eyebrow="Your balance" description="Use points to unlock selected resources and see how your academic contributions are recognized.">
      <div className="rounded-2xl bg-forest-900 p-5 text-paper-100 dark:bg-forest-800">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-paper-100/70">Available points</p>
        <strong className="mt-2 block text-4xl">{balance}</strong>
        <p className="mt-2 text-sm text-paper-100/75">Points available for future library access.</p>
      </div>
      <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" onClick={onClose} className="secondary-action rounded-xl border px-4 py-3 text-sm font-semibold">Close</button>
        <button type="button" onClick={onOpenDetails} className="pine-action rounded-xl px-4 py-3 text-sm font-semibold">View wallet details</button>
      </div>
    </BaseModal>
  )
}
