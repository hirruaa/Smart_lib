'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/utils/supabase/client'

type PublicLibraryPolicy = {
  fine_grace_days: number
  late_fee_per_day: number
  late_fee_cap: number
  lost_after_days: number
  faculty_lesson_reward_points: number
  policy_notice: string
}

export default function LibraryPolicyNotice() {
  const [policy, setPolicy] = useState<PublicLibraryPolicy | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const loadPolicy = async () => {
      try {
        const { data, error: queryError } = await getSupabase()
          .from('library_policy_settings')
          .select('fine_grace_days,late_fee_per_day,late_fee_cap,lost_after_days,faculty_lesson_reward_points,policy_notice')
          .eq('id', 1)
          .single()
        if (!active) return
        if (queryError) {
          setError(`Current library policy is unavailable: ${queryError.message}`)
          return
        }
        if (!data) {
          setError('Current library policy is unavailable because no policy settings are published.')
          return
        }
        setPolicy(data as PublicLibraryPolicy)
      } catch (cause) {
        if (active) setError(cause instanceof Error ? `Current library policy is unavailable: ${cause.message}` : 'Current library policy is unavailable.')
      }
    }
    void loadPolicy()
    return () => { active = false }
  }, [])

  return (
    <section>
      <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">General-circulation physical books</h2>
      {error ? <p role="status" className="mt-2">{error}</p> : null}
      {policy ? <>
        <p className="mt-2">Each physical title lists its available lending periods and checkout fee. A {policy.fine_grace_days}-day grace period applies. After that, a late fine of PHP {Number(policy.late_fee_per_day).toFixed(2)} per chargeable day is assessed retroactively. Sundays and public holidays recorded by the library are not chargeable days. The fine is capped at PHP {Number(policy.late_fee_cap).toFixed(2)} per item. A book that remains overdue for {policy.lost_after_days} consecutive days is classified as lost; late-fine accrual then stops. Any replacement charge is handled by the institution outside Mary the Queen College.</p>
        <p className="mt-2">Students and faculty can top up points with the librarian: 200 points for PHP 10, 500 for PHP 22, or 1,000 for PHP 40 (maximum 1,000 points per sale). Students earn points through these cash top-ups. Faculty may also earn {policy.faculty_lesson_reward_points} points by default when an administrator approves a lesson submission. Only administrators add books to the catalog. Librarians can invite students and faculty after checking a school ID in person; ID images are not retained.</p>
        <p className="mt-2 whitespace-pre-wrap">{policy.policy_notice}</p>
      </> : !error ? <p role="status" className="mt-2">Loading the current policy…</p> : null}
      <p className="mt-2">An overdue or lost physical item prevents new physical checkout requests and availability-queue entries. Unpaid physical fines totaling PHP 100 or more suspend borrowing privileges. New digital checkouts are also restricted while a physical item is overdue or lost, or while any physical fine is unpaid. Digital access expires at the displayed end date and does not accrue overdue fines. Settle physical fines with the library cashier; contact library staff about lost-item records.</p>
      <p className="mt-2">This policy applies to general-circulation physical books only. Reserve/course-reserve materials, audiovisual items, and equipment are not covered by this initial Mary the Queen College policy.</p>
    </section>
  )
}
