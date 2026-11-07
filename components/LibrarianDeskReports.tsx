'use client'

import { useMemo, useState } from 'react'

export type DeskLoan = {
  id: number
  student_id: string
  book_id: number
  status: string
  payment_status: string
  payment_method: string
  requested_at: string
  due_date: string | null
  incident_type: 'lost' | 'damage' | null
  incident_status: 'open' | 'resolved' | 'withdrawn' | null
}

export type DeskMember = {
  id: string
  full_name: string | null
  email: string
  institutional_id?: string | null
}

type DeskFine = {
  id: number
  amount: number
  status: string
  paid_at?: string | null
  waived_at?: string | null
  refunded_at?: string | null
  fine_type: string
}

type DeskHistory = {
  id: number
  student_id: string
  book_id: number
  copy_id: number
  checked_out_at: string
  fee_amount: number
  payment_status: string
  payment_method: string
}

type DeskRenewal = { id: number; created_at: string; amount_received: number }
type DeskPrintPayment = { id: number; created_at: string; amount: number }
type QueueFilter = 'all' | 'payments' | 'overdue'
type DailyHistory = {
  id: number
  student_id: string
  book_id: number
  checked_out_at: string
  due_date: string
  returned_at: string | null
  status: string
  fee_amount: number
  payment_status: string
  payment_method: string
}
type DailyFine = { amount: number; status: string; paid_at?: string | null; refunded_at?: string | null }
type DailyRenewal = { created_at: string; amount_received: number }
type DailyPrintPayment = { created_at: string; amount: number }
type QueueItem = {
  id: string
  requestId: number
  loan: DeskLoan
  kind: 'payment' | 'request' | 'incident' | 'overdue' | 'due'
  priority: number
  date: string
  label: string
  action: string
}

const localDateKey = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function LibrarianWorkQueue({
  loans,
  members,
  bookName,
  onOpenRequest,
  onOpenReturn,
  onReviewIncident,
}: {
  loans: DeskLoan[]
  members: DeskMember[]
  bookName: (bookId: number) => string
  onOpenRequest: (requestId: number) => void
  onOpenReturn: (requestId: number) => void
  onReviewIncident: (requestId: number) => void
}) {
  const [filter, setFilter] = useState<QueueFilter>('all')
  const queue = useMemo(() => {
    const today = localDateKey(new Date())
    const items = loans.flatMap<QueueItem>((loan) => {
      if (loan.status === 'pending') {
        const legacyOnlinePayment = loan.payment_method !== 'cash'
        return [{
          id: `request-${loan.id}`,
          requestId: loan.id,
          loan,
          kind: legacyOnlinePayment ? 'payment' as const : 'request' as const,
          priority: legacyOnlinePayment ? 1 : 5,
          date: loan.requested_at,
          label: legacyOnlinePayment ? 'Legacy request · resubmit as cash' : 'Cash checkout request',
          action: legacyOnlinePayment ? 'Resolve request' : 'Process checkout',
        }]
      }

      const itemsForLoan: QueueItem[] = []
      if (loan.incident_type && (loan.incident_status === 'open' || (loan.incident_status === null && loan.status === 'lost'))) {
        itemsForLoan.push({
          id: `incident-${loan.id}`,
          requestId: loan.id,
          loan,
          kind: 'incident' as const,
          priority: 2,
          date: loan.due_date ?? loan.requested_at,
          label: `${loan.incident_type === 'lost' ? 'Lost item' : 'Damaged item'} case`,
          action: 'Review case',
        })
      }

      if ((loan.status === 'checked_out' || loan.status === 'return_pending') && loan.due_date) {
        const dueDate = loan.due_date.slice(0, 10)
        if (dueDate < today || dueDate === today) {
          const overdue = dueDate < today
          itemsForLoan.push({
            id: `due-${loan.id}`,
            requestId: loan.id,
            loan,
            kind: overdue ? 'overdue' as const : 'due' as const,
            priority: overdue ? 3 : 4,
            date: loan.due_date,
            label: overdue ? 'Overdue return' : 'Due today',
            action: 'Verify ID & return',
          })
        }
      }
      return itemsForLoan
    })

    return items.sort((left, right) =>
      left.priority - right.priority
      || new Date(left.date).getTime() - new Date(right.date).getTime()
      || left.requestId - right.requestId,
    )
  }, [loans])

  const visibleItems = queue.filter((item) =>
    filter === 'all'
    || (filter === 'payments' && item.kind === 'payment')
    || (filter === 'overdue' && (item.kind === 'overdue' || item.kind === 'due')),
  )

  return <section className="rounded-3xl border border-sky-200 bg-white p-5 shadow-sm dark:border-sky-900 dark:bg-slate-900" aria-labelledby="librarian-work-queue-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300">Librarian work queue</p>
        <h2 id="librarian-work-queue-title" className="mt-1 text-xl font-semibold">Today at the desk</h2>
        <p className="mt-1 text-sm text-slate-500">Prioritized requests, returns, and open cases. Student ID is shown for desk lookup.</p>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter desk queue">
        {([
          ['all', 'All urgent'],
          ['payments', 'Legacy requests'],
          ['overdue', 'Due today or overdue'],
        ] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${filter === value ? 'border-sky-700 bg-sky-700 text-white dark:border-sky-400 dark:bg-sky-400 dark:text-slate-950' : 'border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-200'}`}>{label}</button>)}
      </div>
    </div>
    <p className="mt-4 text-xs text-slate-500" aria-live="polite">{visibleItems.length} {visibleItems.length === 1 ? 'item' : 'items'} · sorted by urgency</p>
    <div className="mt-3 space-y-3">
      {visibleItems.map((item) => {
        const member = members.find((candidate) => candidate.id === item.loan.student_id)
        const badgeClass = item.kind === 'overdue' || item.kind === 'incident'
          ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200'
          : item.kind === 'payment'
            ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
            : item.kind === 'due'
              ? 'bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200'
              : 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200'
        const onAction = item.kind === 'incident'
          ? () => onReviewIncident(item.requestId)
          : item.kind === 'overdue' || item.kind === 'due'
            ? () => onOpenReturn(item.requestId)
            : () => onOpenRequest(item.requestId)

        return <article key={item.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${badgeClass}`}>{item.label}</span>
              <span className="text-xs text-slate-500">Request #{item.requestId}</span>
            </div>
            <p className="mt-2 font-semibold">{bookName(item.loan.book_id)}</p>
            <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{member?.full_name || member?.email || 'Unknown member'}</p>
            <p className="mt-0.5 text-xs text-slate-500">Student ID: {member?.institutional_id || 'Not recorded'}</p>
            {item.loan.due_date && (item.kind === 'overdue' || item.kind === 'due') ? <p className="mt-1 text-xs text-slate-500">Due {new Date(`${item.loan.due_date.slice(0, 10)}T00:00:00`).toLocaleDateString()}</p> : null}
          </div>
          <button type="button" onClick={onAction} className="shrink-0 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-emerald-600">{item.action}</button>
        </article>
      })}
      {visibleItems.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">No items in this queue filter.</p> : null}
    </div>
  </section>
}

export function LibrarianShiftCloseout({
  history,
  fines,
  renewals,
  printPayments,
}: {
  history: DeskHistory[]
  fines: DeskFine[]
  renewals: DeskRenewal[]
  printPayments: DeskPrintPayment[]
}) {
  const [date, setDate] = useState(() => localDateKey(new Date()))
  const report = useMemo(() => {
    const isDate = (timestamp: string | null | undefined) => Boolean(timestamp && localDateKey(new Date(timestamp)) === date)
    const paidFines = fines.filter((fine) => fine.status === 'paid' && isDate(fine.paid_at))
    const waivedFines = fines.filter((fine) => fine.status === 'waived' && isDate(fine.waived_at))
    const refundedFines = fines.filter((fine) => fine.status === 'refunded' && isDate(fine.refunded_at))
    const paidCheckouts = history.filter((loan) => loan.payment_status === 'paid' && isDate(loan.checked_out_at))
    const cash = paidCheckouts.filter((loan) => loan.payment_method === 'cash').reduce((total, loan) => total + Number(loan.fee_amount), 0)
    const legacyOnline = paidCheckouts.filter((loan) => loan.payment_method !== 'cash').reduce((total, loan) => total + Number(loan.fee_amount), 0)
    const unclassified = paidFines.reduce((total, fine) => total + Number(fine.amount), 0)
      + renewals.filter((entry) => isDate(entry.created_at)).reduce((total, entry) => total + Number(entry.amount_received), 0)
      + printPayments.filter((entry) => isDate(entry.created_at)).reduce((total, entry) => total + Number(entry.amount), 0)

    return {
      cash,
      legacyOnline,
      unclassified,
      fines: paidFines.reduce((total, fine) => total + Number(fine.amount), 0),
      waivers: waivedFines.reduce((total, fine) => total + Number(fine.amount), 0),
      refunds: refundedFines.reduce((total, fine) => total + Number(fine.amount), 0),
      fineCount: paidFines.length,
      waiverCount: waivedFines.length,
      refundCount: refundedFines.length,
    }
  }, [date, history, fines, renewals, printPayments])

  const money = (amount: number) => `PHP ${amount.toFixed(2)}`

  return <section className="librarian-shift-closeout rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900" aria-labelledby="librarian-shift-closeout-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Daily close-out</p>
        <h2 id="librarian-shift-closeout-title" className="mt-1 text-xl font-semibold">Shift reconciliation</h2>
        <p className="mt-1 text-sm text-slate-500">Review recorded collections, waivers, and refunds before printing the close-out.</p>
      </div>
      <label className="text-sm font-medium">Business date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="ml-2 rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950" /></label>
    </div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Summary label="Recorded cash · checkouts" value={money(report.cash)} />
      <Summary label="Legacy online · historical only" value={money(report.legacyOnline)} />
      <Summary label="Fine collections · channel not recorded" value={money(report.fines)} detail={`${report.fineCount} fine payments`} />
      <Summary label="Waivers issued" value={money(report.waivers)} detail={`${report.waiverCount} waived fines`} />
      <Summary label="Refunds recorded" value={money(report.refunds)} detail={`${report.refundCount} refunds`} />
      <Summary label="Other receipts · channel not recorded" value={money(report.unclassified - report.fines)} detail="Renewals and print receipts" />
    </div>
    <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
      New physical-book payments are cash-only at checkout. Historical online collections remain separated from cash; fine, renewal, and print-payment records do not store payment channel and are shown separately.
    </p>
    <button type="button" onClick={() => window.print()} className="mt-4 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white print:hidden dark:bg-emerald-600">Print shift summary</button>
  </section>
}

export function LibrarianDailyRecord({
  history,
  fines,
  renewals,
  printPayments,
  bookName,
  memberName,
}: {
  history: DailyHistory[]
  fines: DailyFine[]
  renewals: DailyRenewal[]
  printPayments: DailyPrintPayment[]
  bookName: (bookId: number) => string
  memberName: (memberId: string) => string
}) {
  const [date, setDate] = useState(() => localDateKey(new Date()))
  const report = useMemo(() => {
    const isDate = (timestamp: string | null | undefined) => Boolean(timestamp && localDateKey(new Date(timestamp)) === date)
    const checkedOutToday = history
      .filter((loan) => isDate(loan.checked_out_at))
      .sort((left, right) => new Date(right.checked_out_at).getTime() - new Date(left.checked_out_at).getTime())
    const checkoutCash = checkedOutToday
      .filter((loan) => loan.payment_status === 'paid' && loan.payment_method === 'cash')
      .reduce((total, loan) => total + Number(loan.fee_amount), 0)
    const fineReceipts = fines
      .filter((fine) => fine.status === 'paid' && isDate(fine.paid_at))
      .reduce((total, fine) => total + Number(fine.amount), 0)
    const refunds = fines
      .filter((fine) => fine.status === 'refunded' && isDate(fine.refunded_at))
      .reduce((total, fine) => total + Number(fine.amount), 0)
    const renewalReceipts = renewals
      .filter((renewal) => isDate(renewal.created_at))
      .reduce((total, renewal) => total + Number(renewal.amount_received), 0)
    const printReceipts = printPayments
      .filter((payment) => isDate(payment.created_at))
      .reduce((total, payment) => total + Number(payment.amount), 0)

    return {
      checkedOutToday,
      checkoutCash,
      otherReceipts: fineReceipts + renewalReceipts + printReceipts,
      refunds,
    }
  }, [date, history, fines, renewals, printPayments])

  return <section className="librarian-daily-record rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900" aria-labelledby="librarian-daily-record-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Daily desk record</p>
        <h2 id="librarian-daily-record-title" className="mt-1 text-xl font-semibold">Sales &amp; borrowing history</h2>
        <p className="mt-1 text-sm text-slate-500">Review cash checkout fees, other recorded receipts, refunds, and checked-out books. Payment channels for other receipts are not recorded.</p>
      </div>
      <label className="text-sm font-medium">Record date<input aria-label="Daily record date" type="date" value={date} onChange={(event) => setDate(event.target.value)} className="ml-2 rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950" /></label>
    </div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cash · checkout fees</p>
        <strong className="mt-2 block text-2xl">PHP {report.checkoutCash.toFixed(2)}</strong>
        <p className="mt-1 text-xs text-slate-500">Cash channel recorded at checkout.</p>
      </div>
      <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Other receipts</p>
        <strong className="mt-2 block text-2xl">PHP {report.otherReceipts.toFixed(2)}</strong>
        <p className="mt-1 text-xs text-slate-500">Fines, renewals, and print fees · channel not recorded.</p>
      </div>
      <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Refunds recorded</p>
        <strong className="mt-2 block text-2xl">PHP {report.refunds.toFixed(2)}</strong>
        <p className="mt-1 text-xs text-slate-500">Shown separately; payment channel is not recorded.</p>
      </div>
      <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Books borrowed</p>
        <strong className="mt-2 block text-2xl">{report.checkedOutToday.length}</strong>
        <p className="mt-1 text-xs text-slate-500">Physical checkouts recorded on this date.</p>
      </div>
    </div>
    <div className="mt-5">
      <h3 className="font-semibold">Books borrowed on this date</h3>
      <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800">
            <tr><th className="px-3 py-3">Book</th><th className="px-3 py-3">Borrower</th><th className="px-3 py-3">Checked out</th><th className="px-3 py-3">Status</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {report.checkedOutToday.map((loan) => <tr key={loan.id}>
              <td className="px-3 py-3 font-medium">{bookName(loan.book_id)}</td>
              <td className="px-3 py-3">{memberName(loan.student_id)}</td>
              <td className="whitespace-nowrap px-3 py-3">{new Date(loan.checked_out_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</td>
              <td className="px-3 py-3 capitalize">{loan.status.replace(/_/g, ' ')}</td>
            </tr>)}
            {report.checkedOutToday.length === 0 ? <tr><td colSpan={4} className="px-3 py-8 text-center text-sm text-slate-500">No books were checked out on this date.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  </section>
}

function Summary({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    <strong className="mt-2 block text-xl">{value}</strong>
    {detail ? <p className="mt-1 text-xs text-slate-500">{detail}</p> : null}
  </div>
}
