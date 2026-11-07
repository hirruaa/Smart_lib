'use client'

import { useState } from 'react'
import BaseModal from '@/components/BaseModal'
import { getSupabase } from '@/utils/supabase/client'

type TopUpReceipt = {
  id: number
  bundle_points: number
  amount_paid: number
  receipt_number: string
  created_at: string
}

const bundles = [
  { points: 200, price: 10 },
  { points: 500, price: 22 },
  { points: 1000, price: 40 },
] as const

export default function StaffCashPointTopUpModal({
  member,
  open,
  onClose,
  onCompleted,
}: {
  member: { id: string; full_name?: string | null; email: string; role: string } | null
  open: boolean
  onClose: () => void
  onCompleted: () => void
}) {
  const [bundlePoints, setBundlePoints] = useState<number>(200)
  const [cashReceived, setCashReceived] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState<TopUpReceipt | null>(null)

  const close = () => {
    if (saving) return
    setBundlePoints(200)
    setCashReceived(false)
    setError('')
    setReceipt(null)
    onClose()
  }

  const recordTopUp = async () => {
    if (!member || !cashReceived) return
    setSaving(true)
    setError('')
    const { data, error: topUpError } = await getSupabase().rpc('staff_record_cash_point_topup', {
      p_member_id: member.id,
      p_bundle_points: bundlePoints,
    })
    if (topUpError) {
      setError(topUpError.message)
      setSaving(false)
      return
    }
    if (!data || typeof data !== 'object' || !('receipt_number' in data)) {
      setError('Top-up was recorded, but the receipt details could not be read. Ask an administrator to verify the transaction ledger.')
      setSaving(false)
      return
    }
    setReceipt(data as TopUpReceipt)
    onCompleted()
    setSaving(false)
  }

  const selectedBundle = bundles.find((bundle) => bundle.points === bundlePoints) ?? bundles[0]
  return <BaseModal
    open={open && member !== null}
    title={receipt ? 'Cash top-up receipt' : 'Record cash point top-up'}
    eyebrow="Member points"
    description={receipt ? undefined : 'Select a published bundle and record it only after receiving the cash.'}
    onClose={close}
    size="md"
    layer="foreground"
  >
    {member ? receipt ? <div className="space-y-4">
      <div className="physical-finance-receipt rounded-xl border border-dashed border-slate-300 p-4 dark:border-slate-700">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Smart Lib · Official receipt</p>
        <p className="mt-3 border-y border-dashed border-slate-300 py-3 font-mono text-sm dark:border-slate-700">{receipt.receipt_number}</p>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-slate-500">Member</dt><dd className="font-medium">{member.full_name || member.email}</dd></div>
          <div><dt className="text-xs text-slate-500">Member type</dt><dd className="capitalize">{member.role}</dd></div>
          <div><dt className="text-xs text-slate-500">Points added</dt><dd className="font-semibold">+{receipt.bundle_points.toLocaleString()}</dd></div>
          <div><dt className="text-xs text-slate-500">Cash received</dt><dd className="font-semibold">PHP {Number(receipt.amount_paid).toFixed(2)}</dd></div>
          <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Recorded</dt><dd>{new Date(receipt.created_at).toLocaleString()}</dd></div>
        </dl>
      </div>
      <p className="text-xs text-slate-500">The points balance and transaction ledger have been updated. Keep or print this receipt for the member.</p>
      <div data-print-hide className="flex justify-end gap-2">
        <button type="button" onClick={() => window.print()} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold dark:border-slate-700">Print receipt</button>
        <button type="button" onClick={close} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-emerald-700">Done</button>
      </div>
    </div> : <div className="space-y-4">
      {error ? <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/30 dark:text-rose-200">{error}</p> : null}
      <p className="text-sm"><strong>{member.full_name || member.email}</strong> · <span className="capitalize">{member.role}</span></p>
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-semibold">Choose a point bundle</legend>
        {bundles.map((bundle) => <label key={bundle.points} className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 ${bundlePoints === bundle.points ? 'border-emerald-600 bg-emerald-50 dark:border-emerald-400 dark:bg-emerald-950/30' : 'border-slate-200 dark:border-slate-700'}`}>
          <span className="flex items-center gap-3"><input type="radio" name="point-bundle" value={bundle.points} checked={bundlePoints === bundle.points} onChange={() => setBundlePoints(bundle.points)} /><strong>{bundle.points.toLocaleString()} points</strong></span>
          <span className="font-semibold">PHP {bundle.price.toFixed(2)}</span>
        </label>)}
      </fieldset>
      <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
        <input type="checkbox" checked={cashReceived} onChange={(event) => setCashReceived(event.target.checked)} className="mt-0.5" />
        <span>I received PHP {selectedBundle.price.toFixed(2)} in cash from this member. This records a completed sale and issues a receipt.</span>
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" disabled={saving} onClick={close} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold dark:border-slate-700">Cancel</button>
        <button type="button" disabled={saving || !cashReceived} onClick={() => void recordTopUp()} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-emerald-700">{saving ? 'Recording…' : 'Record sale & issue receipt'}</button>
      </div>
    </div> : null}
  </BaseModal>
}
